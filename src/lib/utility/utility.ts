/**
 * PM3 — Fase 4.2.6, módulo D: `cs2.utility.v1` (grenades of one player in one match, demo only).
 *
 * Pure. Input: one match, the caller's participant key, rounds, round sides, the caller's grenade
 * events (detonations, blinds caused, utility damage/kills, grenade throws), every kill and plant
 * of the match (round phases) and three telemetry flags. Output: metric envelopes
 * (`metric-contract-v1.1`) and one row per flash with evidence refs. Nothing is guessed: what the
 * match did not record is NOT_OBSERVED (never zero), small samples are INSUFFICIENT_SAMPLE.
 *
 * Definitions, v1:
 *   - throw: the caller's weapon_fire with a grenade (R5.8.30+; older matches: NOT_OBSERVED);
 *   - detonation: flashbang/hegrenade/smokegrenade detonate events and inferno_startburn (fire,
 *     R5.8.30+) owned by the caller (the game's own thrower id);
 *   - flash effect: the game's player_blind rows whose attacker is the caller, tied to the caller's
 *     flash detonation on the SAME tick (108/108 in the corpus). Each blinded player is an enemy,
 *     a teammate or the caller (side of that round). A flash with no enemy blinded is "no measured
 *     effect": the game recorded no enemy blind for it (it may still have forced a reposition, which
 *     the demo does not show). Matches processed without blind rows: flash effect NOT_OBSERVED;
 *   - HE/fire damage: the caller's damage rows with hegrenade / inferno|molotov|incgrenade, split
 *     by the victim's side; utility kills likewise;
 *   - flash assists: the per-match count and method already persisted (game flag OBSERVED, timed
 *     attribution INFERRED, otherwise NOT_MEASURED);
 *   - round phase of each detonation: before the round's first kill, after it and before the
 *     plant, or after the plant. A round with no tick evidence leaves the detonation unphased.
 */
import type { RoundPlayerRow, RoundRow, Side } from "@/lib/diagnosis/deathContext";
import { envelope, type EvidenceRef, type MetricEnvelope } from "@/lib/metrics/metricContract";
import type { FlashAssistMethodView } from "@/lib/playerOverview";

export const UTILITY_VERSION = "cs2.utility.v1";

export const GRENADES = ["flash", "he", "smoke", "fire", "decoy"] as const;
export type Grenade = (typeof GRENADES)[number];
export const PHASES = ["before_first_kill", "after_first_kill", "after_plant"] as const;
export type Phase = (typeof PHASES)[number];

export const MIN_SAMPLE = { flashes: 5, grenades: 5, blinds: 5 } as const;

/** weapon_fire names of a throw. */
const THROW: Record<string, Grenade> = {
  flashbang: "flash",
  hegrenade: "he",
  smokegrenade: "smoke",
  molotov: "fire",
  incgrenade: "fire",
  decoy: "decoy",
};
/** Damage/kill weapons by grenade. Flash/smoke impact damage is not utility effect. */
const HE_WEAPONS = new Set(["hegrenade"]);
const FIRE_WEAPONS = new Set(["inferno", "molotov", "incgrenade"]);
/** Detonation event types (round_events.event_type) by grenade. */
const DETONATION: Record<string, Grenade> = {
  flash: "flash",
  he: "he",
  smoke: "smoke",
  incendiary: "fire",
  molotov: "fire",
};

export interface UtilityEventRow {
  id: string;
  type:
    | "flash"
    | "he"
    | "smoke"
    | "incendiary"
    | "molotov"
    | "damage"
    | "kill"
    | "weapon_fire"
    | "bomb_plant";
  roundNumber: number | null;
  tick: number | null;
  actor: string | null;
  victim: string | null;
  weapon: string | null;
  damage: number | null;
  flashDuration: number | null;
}

export interface UtilityInput {
  matchId: string;
  rounds: RoundRow[];
  roundPlayers: RoundPlayerRow[];
  events: UtilityEventRow[];
  /** The match records who threw each grenade (weapon_fire with actor, R5.8.30+). */
  throwsAttributed: boolean;
  /** The match records player_blind rows (who was blinded, by whom, for how long). */
  blindsRecorded: boolean;
  /** The match's grenade detonations carry their thrower (false: detonations NOT_OBSERVED). */
  detonationsAttributed: boolean;
  /** The match records fire starts (inferno_startburn, R5.8.30+). */
  fireRecorded: boolean;
  flashAssists: number | null;
  flashAssistMethod: FlashAssistMethodView | null;
}

export interface FlashRow {
  id: string;
  round: number;
  tick: number;
  phase: Phase | null;
  enemies: number;
  teammates: number;
  self: boolean;
  enemyBlindSeconds: number;
}

export interface GrenadeSummary {
  grenade: Grenade;
  /** null = the match did not record it (NOT_OBSERVED), never 0. */
  throws: number | null;
  detonations: number | null;
  phases: Record<Phase, number> & { unphased: number };
}

export interface UtilityReport {
  version: typeof UTILITY_VERSION;
  matchId: string;
  grenades: GrenadeSummary[];
  flashes: FlashRow[];
  /** Blind rows of the caller tied to no flash detonation of the same tick. */
  unmatchedBlinds: number | null;
  metrics: Record<string, MetricEnvelope>;
  damage: {
    he: { enemy: number; team: number; hits: number };
    fire: { enemy: number; team: number; hits: number };
    utilityKills: number;
  };
}

const isNum = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);
const round4 = (v: number) => Math.round(v * 10000) / 10000;

function valued(
  key: string,
  value: number,
  unit: string,
  status: "OBSERVED" | "DERIVED" | "INFERRED",
  method: string,
  n: number | null,
  sampleUnit: string,
  refs: EvidenceRef[] = [],
): MetricEnvelope {
  return envelope({
    metric_key: key,
    value,
    unit,
    status,
    provenance_method: method,
    sample_size: n === null ? null : { n, unit: sampleUnit },
    coverage: null,
    evidence_refs: refs.slice(0, 20),
  });
}

function empty(
  key: string,
  unit: string,
  status: "NOT_OBSERVED" | "NOT_MEASURED" | "INSUFFICIENT_SAMPLE",
  method: string,
  n: number | null = null,
  sampleUnit = "",
): MetricEnvelope {
  return envelope({
    metric_key: key,
    value: null,
    unit,
    status,
    provenance_method: method,
    sample_size: n === null ? null : { n, unit: sampleUnit },
    coverage: null,
    evidence_refs: [],
  });
}

/** A per-flash ratio/mean: needs blind rows and MIN_SAMPLE.flashes flashes. */
function perFlash(
  key: string,
  unit: string,
  num: number,
  den: number,
  blinds: boolean,
  method: string,
  refs: EvidenceRef[],
): MetricEnvelope {
  if (!blinds) return empty(key, unit, "NOT_OBSERVED", method);
  if (den < MIN_SAMPLE.flashes)
    return empty(key, unit, "INSUFFICIENT_SAMPLE", method, den, "flashes");
  return valued(key, round4(num / den), unit, "DERIVED", method, den, "flashes", refs);
}

export function buildUtilityReport(input: UtilityInput, me: string): UtilityReport {
  const sideOf = new Map<string, Side | null>();
  for (const rp of input.roundPlayers)
    sideOf.set(`${rp.roundNumber}:${rp.participantKey}`, rp.side);
  const side = (round: number, key: string) => sideOf.get(`${round}:${key}`) ?? null;

  const valid = input.events.filter(
    (e): e is UtilityEventRow & { roundNumber: number; tick: number } =>
      isNum(e.roundNumber) && isNum(e.tick),
  );
  const ref = (e: { roundNumber: number; tick: number }): EvidenceRef => ({
    matchId: input.matchId,
    round: e.roundNumber,
    tick: e.tick,
  });

  // Round phases: first kill between any two players of opposite sides, then the plant.
  const firstKill = new Map<number, number>();
  const plant = new Map<number, number>();
  for (const e of [...valid].sort((a, b) => a.tick - b.tick)) {
    if (
      e.type === "kill" &&
      !firstKill.has(e.roundNumber) &&
      e.actor &&
      e.victim &&
      e.actor !== e.victim
    ) {
      const sa = side(e.roundNumber, e.actor);
      const sv = side(e.roundNumber, e.victim);
      if (sa && sv && sa !== sv) firstKill.set(e.roundNumber, e.tick);
    }
    if (e.type === "bomb_plant" && !plant.has(e.roundNumber)) plant.set(e.roundNumber, e.tick);
  }
  const knownRounds = new Set(input.rounds.map((r) => r.roundNumber));
  const phaseOf = (round: number, tick: number): Phase | null => {
    if (!knownRounds.has(round)) return null;
    const p = plant.get(round);
    if (p !== undefined && tick >= p) return "after_plant";
    const k = firstKill.get(round);
    if (k !== undefined && tick > k) return "after_first_kill";
    return "before_first_kill";
  };

  // Detonations and throws by grenade.
  const mine = valid.filter((e) => e.actor === me);
  const detonations = new Map<
    Grenade,
    (UtilityEventRow & { roundNumber: number; tick: number })[]
  >();
  for (const e of mine) {
    const g = DETONATION[e.type];
    // A flash row with a victim is a blind, not a detonation.
    if (!g || (e.type === "flash" && e.victim)) continue;
    detonations.set(g, [...(detonations.get(g) ?? []), e]);
  }
  const throws = new Map<Grenade, number>();
  for (const e of mine)
    if (e.type === "weapon_fire" && e.weapon && THROW[e.weapon])
      throws.set(THROW[e.weapon]!, (throws.get(THROW[e.weapon]!) ?? 0) + 1);

  const grenades: GrenadeSummary[] = GRENADES.map((g) => {
    // Decoy detonations are not persisted; fire starts only from R5.8.30.
    const detonationRecorded =
      g === "decoy" ? false : g === "fire" ? input.fireRecorded : input.detonationsAttributed;
    const dets = detonations.get(g) ?? [];
    const phases = { before_first_kill: 0, after_first_kill: 0, after_plant: 0, unphased: 0 };
    for (const d of dets) {
      const p = phaseOf(d.roundNumber, d.tick);
      if (p) phases[p] += 1;
      else phases.unphased += 1;
    }
    return {
      grenade: g,
      throws: input.throwsAttributed ? (throws.get(g) ?? 0) : null,
      detonations: detonationRecorded ? dets.length : null,
      phases,
    };
  });

  // Flash effect: blinds caused by me tied to my flash detonation on the same tick.
  const myFlashes = (detonations.get("flash") ?? []).sort((a, b) => a.tick - b.tick);
  const blindsByTick = new Map<
    string,
    (UtilityEventRow & { roundNumber: number; tick: number })[]
  >();
  const myBlinds = mine.filter((e) => e.type === "flash" && e.victim);
  for (const b of myBlinds) {
    const k = `${b.roundNumber}:${b.tick}`;
    blindsByTick.set(k, [...(blindsByTick.get(k) ?? []), b]);
  }
  const used = new Set<string>();
  const flashes: FlashRow[] = myFlashes.map((f) => {
    const k = `${f.roundNumber}:${f.tick}`;
    const blinds = used.has(k) ? [] : (blindsByTick.get(k) ?? []);
    used.add(k);
    let enemies = 0;
    let teammates = 0;
    let self = false;
    let enemyBlindSeconds = 0;
    const mySide = side(f.roundNumber, me);
    for (const b of blinds) {
      if (b.victim === me) {
        self = true;
        continue;
      }
      const vs = side(f.roundNumber, b.victim!);
      if (!mySide || !vs) continue;
      if (vs === mySide) teammates += 1;
      else {
        enemies += 1;
        if (isNum(b.flashDuration)) enemyBlindSeconds += b.flashDuration;
      }
    }
    return {
      id: f.id,
      round: f.roundNumber,
      tick: f.tick,
      phase: phaseOf(f.roundNumber, f.tick),
      enemies,
      teammates,
      self,
      enemyBlindSeconds: round4(enemyBlindSeconds),
    };
  });
  const unmatchedBlinds =
    input.blindsRecorded && input.detonationsAttributed
      ? myBlinds.filter((b) => !used.has(`${b.roundNumber}:${b.tick}`)).length
      : null;

  // Utility damage and kills, by the victim's side.
  const dmg = (weapons: Set<string>) => {
    const out = { enemy: 0, team: 0, hits: 0 };
    for (const e of mine) {
      if (
        e.type !== "damage" ||
        !e.weapon ||
        !weapons.has(e.weapon) ||
        !e.victim ||
        e.victim === me
      )
        continue;
      const a = side(e.roundNumber, me);
      const v = side(e.roundNumber, e.victim);
      if (!a || !v || !isNum(e.damage)) continue;
      if (a === v) out.team += e.damage;
      else {
        out.enemy += e.damage;
        out.hits += 1;
      }
    }
    return out;
  };
  const he = dmg(HE_WEAPONS);
  const fire = dmg(FIRE_WEAPONS);
  const utilityKills = mine.filter(
    (e) =>
      e.type === "kill" &&
      e.weapon &&
      (HE_WEAPONS.has(e.weapon) || FIRE_WEAPONS.has(e.weapon)) &&
      e.victim &&
      side(e.roundNumber, e.victim) !== null &&
      side(e.roundNumber, e.victim) !== side(e.roundNumber, me),
  ).length;

  // Metrics.
  const nFlash = flashes.length;
  const enemiesBlinded = flashes.reduce((s, f) => s + f.enemies, 0);
  const effective = flashes.filter((f) => f.enemies > 0);
  const flashRefs = effective.map((f) => ({
    matchId: input.matchId,
    round: f.round,
    tick: f.tick,
  }));
  const blindSeconds = flashes.reduce((s, f) => s + f.enemyBlindSeconds, 0);
  const B = input.blindsRecorded && input.detonationsAttributed;
  const D = input.detonationsAttributed;
  const heDets = detonations.get("he")?.length ?? 0;
  const fireDets = detonations.get("fire")?.length ?? 0;
  const metrics: Record<string, MetricEnvelope> = {
    "utility.flashes_detonated": D
      ? valued(
          "utility.flashes_detonated",
          nFlash,
          "count",
          "OBSERVED",
          "flashbang_detonate owned by you",
          null,
          "",
          myFlashes.slice(0, 20).map(ref),
        )
      : empty(
          "utility.flashes_detonated",
          "count",
          "NOT_OBSERVED",
          "grenade throwers not recorded for this match",
        ),
    "utility.flash_effective_rate": perFlash(
      "utility.flash_effective_rate",
      "ratio",
      effective.length,
      nFlash,
      B,
      "flashes that blinded at least one enemy ÷ your flashes",
      flashRefs,
    ),
    "utility.enemies_blinded_per_flash": perFlash(
      "utility.enemies_blinded_per_flash",
      "players",
      enemiesBlinded,
      nFlash,
      B,
      "enemies blinded (player_blind on the detonation tick) ÷ your flashes",
      flashRefs,
    ),
    "utility.enemy_blind_seconds_per_flash": perFlash(
      "utility.enemy_blind_seconds_per_flash",
      "seconds",
      blindSeconds,
      nFlash,
      B,
      "sum of enemy blind durations recorded by the game ÷ your flashes",
      flashRefs,
    ),
    "utility.teammates_blinded": B
      ? valued(
          "utility.teammates_blinded",
          flashes.reduce((s, f) => s + f.teammates, 0),
          "players",
          "OBSERVED",
          "teammates in player_blind on your detonation tick",
          nFlash,
          "flashes",
        )
      : empty(
          "utility.teammates_blinded",
          "players",
          "NOT_OBSERVED",
          "player_blind not recorded for this match",
        ),
    "utility.self_blinded": B
      ? valued(
          "utility.self_blinded",
          flashes.filter((f) => f.self).length,
          "flashes",
          "OBSERVED",
          "your flashes that blinded you",
          nFlash,
          "flashes",
        )
      : empty(
          "utility.self_blinded",
          "flashes",
          "NOT_OBSERVED",
          "player_blind not recorded for this match",
        ),
    "utility.flash_assist": flashAssist(input),
    "utility.he_damage_per_grenade": !D
      ? empty(
          "utility.he_damage_per_grenade",
          "hp",
          "NOT_OBSERVED",
          "grenade throwers not recorded for this match",
        )
      : heDets < MIN_SAMPLE.grenades
        ? empty(
            "utility.he_damage_per_grenade",
            "hp",
            "INSUFFICIENT_SAMPLE",
            "HE damage to enemies ÷ your HE detonations",
            heDets,
            "grenades",
          )
        : valued(
            "utility.he_damage_per_grenade",
            round4(he.enemy / heDets),
            "hp",
            "DERIVED",
            "HE damage to enemies ÷ your HE detonations",
            heDets,
            "grenades",
          ),
    "utility.fire_damage_per_grenade": !input.fireRecorded
      ? empty(
          "utility.fire_damage_per_grenade",
          "hp",
          "NOT_OBSERVED",
          "fire starts not recorded for this match",
        )
      : fireDets < MIN_SAMPLE.grenades
        ? empty(
            "utility.fire_damage_per_grenade",
            "hp",
            "INSUFFICIENT_SAMPLE",
            "fire damage to enemies ÷ your fires",
            fireDets,
            "grenades",
          )
        : valued(
            "utility.fire_damage_per_grenade",
            round4(fire.enemy / fireDets),
            "hp",
            "DERIVED",
            "fire damage to enemies ÷ your fires",
            fireDets,
            "grenades",
          ),
    "utility.team_damage": valued(
      "utility.team_damage",
      he.team + fire.team,
      "hp",
      "OBSERVED",
      "HE and fire damage you dealt to teammates",
      null,
      "",
    ),
    "utility.kills": valued(
      "utility.kills",
      utilityKills,
      "count",
      "OBSERVED",
      "enemies you killed with HE or fire",
      null,
      "",
    ),
  };

  return {
    version: UTILITY_VERSION,
    matchId: input.matchId,
    grenades,
    flashes,
    unmatchedBlinds,
    metrics,
    damage: { he, fire, utilityKills },
  };
}

function flashAssist(input: UtilityInput): MetricEnvelope {
  const key = "utility.flash_assist";
  const m = input.flashAssistMethod;
  if (input.flashAssists === null || !m || m === "NOT_MEASURED" || m === "NOT_RECORDED")
    return empty(key, "count", "NOT_MEASURED", "flash assist method not recorded for this match");
  const status = m === "GAME_FLAG" ? "OBSERVED" : "INFERRED";
  const method =
    m === "GAME_FLAG"
      ? "game flash-assist flag on the kill"
      : "game flag where present, else a teammate's kill within 3 s of an enemy you blinded";
  return valued(key, input.flashAssists, "count", status, method, null, "");
}
