/**
 * PM3 — Fase 4.2.5, módulo C: `cs2.duels.v1` (duels, aim and shooting, from the demo only).
 *
 * Pure. Input: one match, the caller's participant key, rounds, round sides, every kill, and the
 * damage/shot rows where the caller is actor or victim. Output: duel units with evidence refs and
 * metric envelopes (`metric-contract-v1.1`). Nothing here guesses: a metric whose telemetry is
 * absent is NOT_MEASURED, a metric under its minimum sample is INSUFFICIENT_SAMPLE, null is never 0.
 *
 * Duel (engagement) — reproducible definition, v1:
 *   - population: damage/kill events between the caller (P) and one opponent (O): actor and victim
 *     present, P ≠ O, both sides known in that round and opposite, weapon not utility/world;
 *   - one duel = the P↔O events of one round in tick order, split when two consecutive events are
 *     more than DUEL_GAP_SECONDS apart, and closed by a kill between them;
 *   - outcome for P: WON (P killed O), LOST (O killed P), UNRESOLVED (no kill between them: someone
 *     disengaged, or a third player ended it). A multi-player fight is one duel per pair;
 *   - opening duel: a duel closed by the round's first kill between opponents.
 * Shooting (needs R5.8.30 telemetry: weapon_fire with its shooter):
 *   - shot: P's weapon_fire with a firearm; a shot HITS when P damaged an opponent with a bullet
 *     weapon on the same tick (shooter + tick: 100% of bullet hits matched a shot in the corpus);
 *   - burst: P's consecutive shots with the same weapon, ≤ BURST_GAP_SECONDS apart, same round;
 *   - hit groups: where P's bullet hits on opponents landed (player_hurt hitgroup).
 * Never measured here (no telemetry persisted): crosshair placement (needs view angles + enemy
 * position + line of sight), counter-strafe (needs velocity at the shot), recoil control (needs
 * aim punch / recoil per bullet).
 */
import type { RoundPlayerRow, RoundRow, Side } from "@/lib/diagnosis/deathContext";
import { envelope, type EvidenceRef, type MetricEnvelope } from "@/lib/metrics/metricContract";
import {
  isAutomatic,
  isFirearm,
  UTILITY_WEAPONS,
  weaponClass,
  WORLD_WEAPONS,
  type WeaponClass,
} from "@/lib/combat/weapons";

export const DUELS_VERSION = "cs2.duels.v1";
export const DUEL_GAP_SECONDS = 3;
export const BURST_GAP_SECONDS = 0.5;
/** Nominal CS2 tick rate, used only when the match does not prove its own (and said so). */
export const NOMINAL_TICKS_PER_SECOND = 64;

export const MIN_SAMPLE = {
  resolvedDuels: 10,
  openingDuels: 5,
  classDuels: 5,
  distanceBand: 5,
  kills: 5,
  shots: 50,
  bursts: 20,
  sprayBucketShots: 20,
  hits: 20,
} as const;

/** Distance bands in meters (player_death.distance is meters: 39.37 units/m, median of the corpus). */
export const DISTANCE_BANDS = [
  { key: "close", min: 0, max: 5 },
  { key: "medium", min: 5, max: 15 },
  { key: "long", min: 15, max: 30 },
  { key: "very_long", min: 30, max: Infinity },
] as const;
export type DistanceBand = (typeof DISTANCE_BANDS)[number]["key"];

/** Position of a shot inside its burst, for the spray profile. */
export const SPRAY_BUCKETS = [
  { key: "1", min: 1, max: 1 },
  { key: "2-3", min: 2, max: 3 },
  { key: "4-6", min: 4, max: 6 },
  { key: "7-10", min: 7, max: 10 },
  { key: "11+", min: 11, max: Infinity },
] as const;

export const HITGROUPS = ["head", "neck", "chest", "stomach", "arms", "legs", "generic"] as const;
export type HitGroup = (typeof HITGROUPS)[number];
function hitGroupOf(raw: string | null): HitGroup | null {
  if (!raw) return null;
  if (raw === "left_arm" || raw === "right_arm") return "arms";
  if (raw === "left_leg" || raw === "right_leg") return "legs";
  return (HITGROUPS as readonly string[]).includes(raw) ? (raw as HitGroup) : null;
}

export interface CombatEventRow {
  id: string;
  type: "kill" | "damage" | "weapon_fire";
  roundNumber: number | null;
  tick: number | null;
  timeSeconds: number | null;
  actor: string | null;
  victim: string | null;
  weapon: string | null;
  headshot: boolean | null;
  distance: number | null;
  damage: number | null;
  hitgroup: string | null;
}

export interface CombatInput {
  matchId: string;
  rounds: RoundRow[];
  roundPlayers: RoundPlayerRow[];
  /** Every kill of the match + damage/weapon_fire rows where the caller is actor or victim. */
  events: CombatEventRow[];
  /** The match has weapon_fire rows with a shooter (R5.8.30+). */
  shotsAttributed: boolean;
  /** The match has damage rows with a hit group (R5.8.30+). */
  hitGroupsRecorded: boolean;
}

export type DuelOutcome = "WON" | "LOST" | "UNRESOLVED";

export interface Duel {
  ref: EvidenceRef & { round: number; tick: number };
  endTick: number;
  outcome: DuelOutcome;
  opening: boolean;
  /** Weapon P used: the kill weapon when P won, else P's last damaging weapon in the duel. */
  weapon: string | null;
  weaponClass: WeaponClass | null;
  /** Kill distance in meters (only when the duel ended in a kill that carried it). */
  distanceMeters: number | null;
  damageDealt: number;
  damageTaken: number;
  hitsDealt: number;
  hitsTaken: number;
}

export interface CombatReport {
  version: typeof DUELS_VERSION;
  ticksPerSecond: { value: number; source: "MATCH" | "NOMINAL" };
  duels: Duel[];
  excluded: { unknownSide: number; utilityOrWorld: number };
  metrics: Record<string, MetricEnvelope>;
  byWeaponClass: Array<{
    cls: WeaponClass | "unknown";
    won: number;
    lost: number;
    metric: MetricEnvelope;
  }>;
  byDistance: Array<{ band: DistanceBand; kills: number; deaths: number; metric: MetricEnvelope }>;
  shooting: {
    status: "MEASURED" | "NOT_MEASURED";
    byWeapon: Array<{ weapon: string; shots: number; hits: number; metric: MetricEnvelope }>;
    spray: Array<{ bucket: string; shots: number; hits: number; metric: MetricEnvelope }>;
    hitGroups: Array<{ group: HitGroup; hits: number; metric: MetricEnvelope }>;
  };
  notMeasured: Array<{ metric_key: string; needs: string }>;
}

export const NOT_MEASURED_AIM = [
  {
    metric_key: "crosshair_placement",
    needs:
      "view angles (pitch/yaw) before contact, opponent position and line of sight, on the same ticks",
  },
  { metric_key: "counter_strafe", needs: "player velocity on the tick of each shot" },
  { metric_key: "recoil_control", needs: "aim punch / recoil angle per bullet" },
] as const;

const isNum = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);
const ratio = (num: number, den: number) => Math.round((num / den) * 10000) / 10000;

function rate(
  key: string,
  num: number,
  den: number,
  min: number,
  sampleUnit: string,
  method: string,
  refs: EvidenceRef[],
  status: "DERIVED" | "OBSERVED" = "DERIVED",
): MetricEnvelope {
  const enough = den >= min;
  return envelope({
    metric_key: key,
    value: enough ? ratio(num, den) : null,
    unit: "ratio",
    status: enough ? status : "INSUFFICIENT_SAMPLE",
    provenance_method: method,
    sample_size: { n: den, unit: sampleUnit },
    coverage: null,
    evidence_refs: refs.slice(0, 20),
  });
}

function notMeasured(key: string, method: string): MetricEnvelope {
  return envelope({
    metric_key: key,
    value: null,
    unit: "ratio",
    status: "NOT_MEASURED",
    provenance_method: method,
    sample_size: null,
    coverage: null,
    evidence_refs: [],
  });
}

/** Ticks per second proven by the match's own (tick, time) pairs, else the nominal 64 (declared). */
export function matchTickRate(events: CombatEventRow[]): CombatReport["ticksPerSecond"] {
  const pairs = events
    .filter((e) => isNum(e.tick) && isNum(e.timeSeconds))
    .sort((a, b) => a.tick! - b.tick!);
  const rates: number[] = [];
  for (let i = 1; i < pairs.length; i++) {
    const dt = pairs[i]!.timeSeconds! - pairs[i - 1]!.timeSeconds!;
    const dk = pairs[i]!.tick! - pairs[i - 1]!.tick!;
    if (dt > 0.5 && dk > 0) rates.push(dk / dt);
  }
  if (rates.length >= 3) {
    const sorted = [...rates].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    if (median > 10 && median < 200 && sorted.every((r) => Math.abs(r - median) / median <= 0.02))
      return { value: Math.round(median), source: "MATCH" };
  }
  return { value: NOMINAL_TICKS_PER_SECOND, source: "NOMINAL" };
}

export function buildCombatReport(input: CombatInput, me: string): CombatReport {
  const sideOf = new Map<string, Side | null>();
  for (const rp of input.roundPlayers)
    sideOf.set(`${rp.roundNumber}:${rp.participantKey}`, rp.side);
  const side = (round: number, key: string) => sideOf.get(`${round}:${key}`) ?? null;
  const opponents = (round: number, a: string, b: string) => {
    const sa = side(round, a);
    const sb = side(round, b);
    return sa !== null && sb !== null ? sa !== sb : null;
  };
  const tps = matchTickRate(input.events);
  const duelGap = DUEL_GAP_SECONDS * tps.value;
  const burstGap = BURST_GAP_SECONDS * tps.value;

  const valid = input.events.filter(
    (e): e is CombatEventRow & { roundNumber: number; tick: number } =>
      isNum(e.roundNumber) && isNum(e.tick),
  );
  const excluded = { unknownSide: 0, utilityOrWorld: 0 };

  // Round's first kill between opponents (the opening kill).
  const openingKill = new Map<number, string>();
  for (const k of [...valid.filter((e) => e.type === "kill")].sort((a, b) => a.tick - b.tick)) {
    if (openingKill.has(k.roundNumber) || !k.actor || !k.victim || k.actor === k.victim) continue;
    if (k.weapon && WORLD_WEAPONS.has(k.weapon)) continue;
    if (opponents(k.roundNumber, k.actor, k.victim) !== true) continue;
    openingKill.set(k.roundNumber, k.id);
  }

  // P↔O combat events (duel population).
  const pairEvents = valid.filter((e) => {
    if (e.type === "weapon_fire" || !e.actor || !e.victim || e.actor === e.victim) return false;
    if (e.actor !== me && e.victim !== me) return false;
    if (!e.weapon || UTILITY_WEAPONS.has(e.weapon) || WORLD_WEAPONS.has(e.weapon)) {
      excluded.utilityOrWorld += 1;
      return false;
    }
    const opp = opponents(e.roundNumber, e.actor, e.victim);
    if (opp === null) {
      excluded.unknownSide += 1;
      return false;
    }
    return opp;
  });
  const byPair = new Map<string, typeof pairEvents>();
  for (const e of pairEvents) {
    const other = e.actor === me ? e.victim! : e.actor!;
    const k = `${e.roundNumber}:${other}`;
    (byPair.get(k) ?? byPair.set(k, []).get(k)!).push(e);
  }
  const duels: Duel[] = [];
  for (const events of byPair.values()) {
    events.sort(
      (a, b) => a.tick - b.tick || (a.type === "kill" ? 1 : 0) - (b.type === "kill" ? 1 : 0),
    );
    let current: typeof events = [];
    const close = () => {
      if (!current.length) return;
      const kill = current.find((e) => e.type === "kill");
      const won = kill?.actor === me;
      const outcome: DuelOutcome = kill ? (won ? "WON" : "LOST") : "UNRESOLVED";
      const mine = current.filter((e) => e.actor === me);
      const weapon = won ? kill!.weapon : (mine.at(-1)?.weapon ?? null);
      const dmg = (list: typeof current) =>
        list
          .filter((e) => e.type === "damage")
          .reduce((s, e) => s + (isNum(e.damage) ? e.damage : 0), 0);
      const first = current[0]!;
      duels.push({
        ref: { matchId: input.matchId, round: first.roundNumber, tick: first.tick },
        endTick: current.at(-1)!.tick,
        outcome,
        opening: kill ? openingKill.get(kill.roundNumber) === kill.id : false,
        weapon,
        weaponClass: weaponClass(weapon),
        distanceMeters: kill && isNum(kill.distance) ? kill.distance : null,
        damageDealt: dmg(mine),
        damageTaken: dmg(current.filter((e) => e.actor !== me)),
        hitsDealt: mine.filter((e) => e.type === "damage").length,
        hitsTaken: current.filter((e) => e.actor !== me && e.type === "damage").length,
      });
      current = [];
    };
    for (const e of events) {
      if (current.length && e.tick - current.at(-1)!.tick > duelGap) close();
      current.push(e);
      if (e.type === "kill") close();
    }
    close();
  }
  duels.sort((a, b) => a.ref.round - b.ref.round || a.ref.tick - b.ref.tick);

  const refsOf = (list: Duel[]) => list.map((d) => d.ref);
  const won = duels.filter((d) => d.outcome === "WON");
  const lost = duels.filter((d) => d.outcome === "LOST");
  const opening = duels.filter((d) => d.opening);
  const openingWon = opening.filter((d) => d.outcome === "WON");
  const metrics: Record<string, MetricEnvelope> = {};
  metrics["duel_win_rate"] = rate(
    "duel_win_rate",
    won.length,
    won.length + lost.length,
    MIN_SAMPLE.resolvedDuels,
    "resolved duels",
    `${DUELS_VERSION}: won / (won + lost); unresolved duels excluded`,
    refsOf([...won, ...lost]),
  );
  metrics["opening_duel_win_rate"] = rate(
    "opening_duel_win_rate",
    openingWon.length,
    opening.length,
    MIN_SAMPLE.openingDuels,
    "opening duels",
    `${DUELS_VERSION}: opening duels won / opening duels (closed by the round's first kill)`,
    refsOf(opening),
  );
  const myKills = valid.filter(
    (e) =>
      e.type === "kill" &&
      e.actor === me &&
      e.victim &&
      e.victim !== me &&
      opponents(e.roundNumber, me, e.victim) === true,
  );
  const hsKnown = myKills.filter((k) => typeof k.headshot === "boolean");
  metrics["headshot_kill_rate"] = rate(
    "headshot_kill_rate",
    hsKnown.filter((k) => k.headshot).length,
    hsKnown.length,
    MIN_SAMPLE.kills,
    "kills with a headshot flag",
    `${DUELS_VERSION}: kills flagged headshot / kills on opponents with the flag`,
    hsKnown.map((k) => ({ matchId: input.matchId, round: k.roundNumber, tick: k.tick })),
    "OBSERVED",
  );

  const classes = new Map<
    WeaponClass | "unknown",
    { won: number; lost: number; refs: EvidenceRef[] }
  >();
  for (const d of [...won, ...lost]) {
    const cls = d.weaponClass ?? "unknown";
    const c = classes.get(cls) ?? { won: 0, lost: 0, refs: [] };
    if (d.outcome === "WON") c.won += 1;
    else c.lost += 1;
    c.refs.push(d.ref);
    classes.set(cls, c);
  }
  const byWeaponClass = [...classes.entries()]
    .map(([cls, c]) => ({
      cls,
      won: c.won,
      lost: c.lost,
      metric: rate(
        `duel_win_rate.class.${cls}`,
        c.won,
        c.won + c.lost,
        MIN_SAMPLE.classDuels,
        "resolved duels",
        `${DUELS_VERSION}: resolved duels by P's weapon class (kill weapon when won, last damaging weapon when lost)`,
        c.refs,
      ),
    }))
    .sort((a, b) => b.won + b.lost - (a.won + a.lost));

  // Distance: kills and deaths between opponents that carry the kill distance (meters).
  const myDeaths = valid.filter(
    (e) =>
      e.type === "kill" &&
      e.victim === me &&
      e.actor &&
      e.actor !== me &&
      opponents(e.roundNumber, me, e.actor) === true &&
      !(e.weapon && (UTILITY_WEAPONS.has(e.weapon) || WORLD_WEAPONS.has(e.weapon))),
  );
  const bulletKills = myKills.filter(
    (k) => !(k.weapon && (UTILITY_WEAPONS.has(k.weapon) || WORLD_WEAPONS.has(k.weapon))),
  );
  const byDistance = DISTANCE_BANDS.map((b) => {
    const inBand = (e: CombatEventRow) =>
      isNum(e.distance) && e.distance >= b.min && e.distance < b.max;
    const k = bulletKills.filter(inBand);
    const d = myDeaths.filter(inBand);
    return {
      band: b.key,
      kills: k.length,
      deaths: d.length,
      metric: rate(
        `kill_share.distance.${b.key}`,
        k.length,
        k.length + d.length,
        MIN_SAMPLE.distanceBand,
        "kills + deaths in the band",
        `${DUELS_VERSION}: kills / (kills + deaths) between opponents whose kill distance (m) is in [${b.min}, ${b.max === Infinity ? "∞" : b.max})`,
        [...k, ...d].map((e) => ({ matchId: input.matchId, round: e.roundNumber, tick: e.tick })),
      ),
    };
  });

  // Shooting (R5.8.30+): shots, hits by shooter + tick, bursts, hit groups.
  const shooting: CombatReport["shooting"] = {
    status: "NOT_MEASURED",
    byWeapon: [],
    spray: [],
    hitGroups: [],
  };
  const shotMethod = `${DUELS_VERSION}: a shot hits when P damaged an opponent with a bullet weapon on the same tick (shooter + tick)`;
  if (!input.shotsAttributed) {
    metrics["shot_hit_rate"] = notMeasured(
      "shot_hit_rate",
      "weapon_fire without shooter in this match (parser before R5.8.30)",
    );
    metrics["first_shot_hit_rate"] = notMeasured(
      "first_shot_hit_rate",
      "weapon_fire without shooter in this match (parser before R5.8.30)",
    );
  } else {
    shooting.status = "MEASURED";
    const shots = valid
      .filter((e) => e.type === "weapon_fire" && e.actor === me && isFirearm(e.weapon))
      .sort((a, b) => a.tick - b.tick);
    const hitTicks = new Set(
      valid
        .filter(
          (e) =>
            e.type === "damage" &&
            e.actor === me &&
            e.victim &&
            e.victim !== me &&
            !!e.weapon &&
            !UTILITY_WEAPONS.has(e.weapon) &&
            !WORLD_WEAPONS.has(e.weapon) &&
            opponents(e.roundNumber, me, e.victim) === true,
        )
        .map((e) => `${e.roundNumber}:${e.tick}`),
    );
    const isHit = (s: (typeof shots)[number]) => hitTicks.has(`${s.roundNumber}:${s.tick}`);
    const refOf = (s: (typeof shots)[number]) => ({
      matchId: input.matchId,
      round: s.roundNumber,
      tick: s.tick,
    });
    metrics["shot_hit_rate"] = rate(
      "shot_hit_rate",
      shots.filter(isHit).length,
      shots.length,
      MIN_SAMPLE.shots,
      "shots",
      `${shotMethod}; hits / shots with a firearm (knife, zeus and grenades excluded)`,
      shots.filter(isHit).map(refOf),
    );
    const weapons = new Map<string, typeof shots>();
    for (const s of shots)
      (weapons.get(s.weapon!) ?? weapons.set(s.weapon!, []).get(s.weapon!)!).push(s);
    shooting.byWeapon = [...weapons.entries()]
      .map(([weapon, list]) => ({
        weapon,
        shots: list.length,
        hits: list.filter(isHit).length,
        metric: rate(
          `shot_hit_rate.weapon.${weapon}`,
          list.filter(isHit).length,
          list.length,
          MIN_SAMPLE.shots,
          "shots",
          shotMethod,
          list.filter(isHit).map(refOf),
        ),
      }))
      .sort((a, b) => b.shots - a.shots);
    // Bursts: same weapon, same round, ≤ BURST_GAP apart.
    const bursts: Array<typeof shots> = [];
    for (const s of shots) {
      const last = bursts.at(-1)?.at(-1);
      if (
        last &&
        last.roundNumber === s.roundNumber &&
        last.weapon === s.weapon &&
        s.tick - last.tick <= burstGap
      )
        bursts.at(-1)!.push(s);
      else bursts.push([s]);
    }
    metrics["first_shot_hit_rate"] = rate(
      "first_shot_hit_rate",
      bursts.filter((b) => isHit(b[0]!)).length,
      bursts.length,
      MIN_SAMPLE.bursts,
      "bursts",
      `${shotMethod}; first shot of each burst (same weapon, ≤ ${BURST_GAP_SECONDS} s between shots) that hit / bursts`,
      bursts.filter((b) => isHit(b[0]!)).map((b) => refOf(b[0]!)),
    );
    shooting.spray = SPRAY_BUCKETS.map((bucket) => {
      const inBucket = bursts
        .filter((b) => isAutomatic(b[0]!.weapon))
        .flatMap((b) => b.filter((_, i) => i + 1 >= bucket.min && i + 1 <= bucket.max));
      const hits = inBucket.filter(isHit);
      return {
        bucket: bucket.key,
        shots: inBucket.length,
        hits: hits.length,
        metric: rate(
          `spray_hit_rate.bullet.${bucket.key}`,
          hits.length,
          inBucket.length,
          MIN_SAMPLE.sprayBucketShots,
          "shots",
          `${shotMethod}; automatic weapons only, by the shot's position in its burst. Hit rate only — not a recoil-control score`,
          hits.map(refOf),
        ),
      };
    });
  }
  if (!input.hitGroupsRecorded) {
    metrics["head_hit_share"] = notMeasured(
      "head_hit_share",
      "player_hurt without hit group in this match (parser before R5.8.30)",
    );
  } else {
    const hits = valid.filter(
      (e) =>
        e.type === "damage" &&
        e.actor === me &&
        e.victim &&
        e.victim !== me &&
        isFirearm(e.weapon) &&
        opponents(e.roundNumber, me, e.victim) === true,
    );
    const grouped = hits.map((e) => ({ e, g: hitGroupOf(e.hitgroup) })).filter((x) => x.g !== null);
    shooting.hitGroups = HITGROUPS.map((group) => {
      const inGroup = grouped.filter((x) => x.g === group);
      return {
        group,
        hits: inGroup.length,
        metric: rate(
          `hit_share.${group}`,
          inGroup.length,
          grouped.length,
          MIN_SAMPLE.hits,
          "bullet hits with a hit group",
          `${DUELS_VERSION}: bullet hits on opponents in the group / bullet hits with a hit group`,
          inGroup.map((x) => ({ matchId: input.matchId, round: x.e.roundNumber, tick: x.e.tick })),
          "OBSERVED",
        ),
      };
    });
    metrics["head_hit_share"] = shooting.hitGroups.find((h) => h.group === "head")!.metric;
  }
  for (const nm of NOT_MEASURED_AIM)
    metrics[nm.metric_key] = notMeasured(nm.metric_key, `not measurable: needs ${nm.needs}`);

  return {
    version: DUELS_VERSION,
    ticksPerSecond: tps,
    duels,
    excluded,
    metrics,
    byWeaponClass,
    byDistance,
    shooting,
    notMeasured: NOT_MEASURED_AIM.map((n) => ({ ...n })),
  };
}
