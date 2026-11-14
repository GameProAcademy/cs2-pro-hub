/**
 * PM2 Fase 4.2.3 — `cs2.death-context.v1`: the context of each death of one player, built only
 * from persisted canonical data (round_events, round_players, match_rounds, match integrity).
 *
 * Every field carries its provenance:
 *  - OBSERVED      read directly from the demo-derived event (weapon, headshot, tick, position);
 *  - DERIVED       deterministic computation over observed data (alive counts, trade, opening);
 *  - NOT_MEASURED  the data needed is absent for this event (never zero, never guessed);
 *  - NOT_SUPPORTED the product does not persist the data this would need (e.g. trajectories).
 *
 * Time base: `round_events.time_seconds`, derived by the pipeline from the declared tickrate
 * (Δtick/Δtime = 64.000 on all 641 consecutive kill pairs in production, 2026-11-14). The trade
 * window reuses the pipeline's documented rule (TRADE_WINDOW_SECONDS, src/config/pipeline.ts), so
 * the review and round_players.traded never disagree on what a trade is. Events of another round
 * are never associated, whatever their tick.
 */
import { TRADE_WINDOW_SECONDS } from "@/config/pipeline";

export const DEATH_CONTEXT_CONTRACT = {
  id: "cs2.death-context.v1",
  tradeWindowSeconds: TRADE_WINDOW_SECONDS,
  timeBase: "round_events.time_seconds (declared tickrate)",
} as const;

export type Provenance = "OBSERVED" | "DERIVED" | "NOT_MEASURED" | "NOT_SUPPORTED";
export type Side = "T" | "CT";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One kill row (round_events.event_type = 'kill'), already owner-filtered by the caller. */
export interface KillEventRow {
  id: string;
  roundNumber: number | null;
  tick: number | null;
  timeSeconds: number | null;
  actor: string | null;
  victim: string | null;
  weapon: string | null;
  headshot: boolean | null;
  distance: number | null;
  attackerPosition: Vec3 | null;
  victimPosition: Vec3 | null;
  blind: boolean | null;
  wallbang: boolean | null;
}

export interface ObjectiveEventRow {
  roundNumber: number | null;
  tick: number | null;
  type: "bomb_plant" | "bomb_defuse" | "bomb_explode";
}

export interface RoundRow {
  roundNumber: number;
  startTick: number | null;
  endTick: number | null;
  winnerSide: Side | null;
  winReason: string | null;
}

export interface RoundPlayerRow {
  roundNumber: number;
  participantKey: string;
  side: Side | null;
}

export interface MatchIntegrityRef {
  status: string;
  eligible: boolean;
  endedBy: "NORMAL" | "SURRENDER" | null;
  validRounds: number;
}

export interface DeathContextInput {
  matchId: string;
  map: string | null;
  /** From src/lib/spatial/maps.ts: only VALIDATED maps may draw positions. */
  mapValidation: "VALIDATED" | "NOT_VALIDATED" | "UNKNOWN_MAP";
  /** demo_jobs.match_integrity; null = match processed before cs2.match-integrity.v1. */
  integrity: MatchIntegrityRef | null;
  rounds: RoundRow[];
  roundPlayers: RoundPlayerRow[];
  kills: KillEventRow[];
  objectives: ObjectiveEventRow[];
}

export interface Field<T> {
  value: T | null;
  provenance: Provenance;
}

/**
 * UNCLASSIFIED: attacker known but a side is missing from the round roster, so enemy vs team kill
 * cannot be told apart. It is never assumed to be an enemy kill.
 */
export type DeathKind =
  "ENEMY_KILL" | "TEAM_KILL" | "SELF_KILL" | "WORLD_KILL" | "UNKNOWN_ATTACKER" | "UNCLASSIFIED";

export interface DeathContext {
  contract: typeof DEATH_CONTEXT_CONTRACT.id;
  ref: { matchId: string; roundNumber: number | null; tick: number | null; eventId: string };
  kind: DeathKind;
  map: string | null;
  facts: {
    weapon: Field<string>;
    headshot: Field<boolean>;
    distance: Field<number>;
    blind: Field<boolean>;
    wallbang: Field<boolean>;
  };
  positions: {
    victim: Field<Vec3>;
    attacker: Field<Vec3>;
    /** Positions are drawn only on a map whose world-to-radar transform is VALIDATED. */
    drawable: boolean;
  };
  round: {
    valid: boolean;
    victimSide: Field<Side>;
    won: Field<boolean>;
    winReason: Field<string>;
    bombPlantedBeforeDeath: Field<boolean>;
    openingDeath: Field<boolean>;
  };
  alive: { teammates: Field<number>; enemies: Field<number> };
  trade: {
    status: "TRADED" | "NOT_OBSERVED" | "NOT_APPLICABLE" | "NOT_MEASURED";
    windowSeconds: number;
    tradeTick: number | null;
  };
  /** Needs teammate positions and trajectories the product does not persist. */
  unsupported: readonly ("exposure" | "isolation" | "re_peek" | "rotation_timing")[];
  integrity: {
    status: string | null;
    eligible: boolean | null;
    endedBy: string | null;
    validRounds: number | null;
  };
  missing: string[];
}

const UNSUPPORTED = ["exposure", "isolation", "re_peek", "rotation_timing"] as const;
const finite = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);
const observed = <T>(value: T | null | undefined): Field<T> =>
  value === null || value === undefined
    ? { value: null, provenance: "NOT_MEASURED" }
    : { value, provenance: "OBSERVED" };
const derived = <T>(value: T): Field<T> => ({ value, provenance: "DERIVED" });
const notMeasured = <T>(): Field<T> => ({ value: null, provenance: "NOT_MEASURED" });

/**
 * Weapons recorded on kills without an attacker that come from the world, not a player. Measured
 * in production (2026-11-14): the 2 attacker-less kills are `planted_c4` (bomb explosion).
 */
export const WORLD_WEAPONS: ReadonlySet<string> = new Set([
  "world",
  "worldspawn",
  "planted_c4",
  "trigger_hurt",
]);

function kindOf(kill: KillEventRow, sides: Map<string, Side | null>): DeathKind {
  if (!kill.actor)
    return kill.weapon && WORLD_WEAPONS.has(kill.weapon) ? "WORLD_KILL" : "UNKNOWN_ATTACKER";
  if (kill.actor === kill.victim) return "SELF_KILL";
  const a = sides.get(kill.actor) ?? null;
  const v = kill.victim ? (sides.get(kill.victim) ?? null) : null;
  if (!a || !v) return "UNCLASSIFIED";
  return a === v ? "TEAM_KILL" : "ENEMY_KILL";
}

/**
 * Contexts of every death of `playerKey` in one match, ordered by round and tick.
 * Kills in rounds that are not in match_rounds (voided/unknown) keep `round.valid = false` and get
 * no derived context: a voided or unknown round is never treated as a normal round.
 */
export function buildDeathContexts(input: DeathContextInput, playerKey: string): DeathContext[] {
  const roundsByNumber = new Map(input.rounds.map((r) => [r.roundNumber, r]));
  const out: DeathContext[] = [];
  const deaths = input.kills
    .filter((k) => k.victim === playerKey)
    .sort(
      (a, b) =>
        (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
        (a.tick ?? 0) - (b.tick ?? 0) ||
        a.id.localeCompare(b.id),
    );

  for (const death of deaths) {
    const missing: string[] = [];
    const roundNumber = death.roundNumber;
    const round = roundNumber !== null ? roundsByNumber.get(roundNumber) : undefined;
    const valid = round !== undefined && finite(round.startTick) && finite(round.endTick);
    const roster = input.roundPlayers.filter((p) => p.roundNumber === roundNumber);
    const sides = new Map(roster.map((p) => [p.participantKey, p.side]));
    const kind = kindOf(death, sides);
    const victimSide = sides.get(playerKey) ?? null;
    const roundKills = input.kills
      .filter((k) => k.roundNumber === roundNumber)
      .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0) || a.id.localeCompare(b.id));
    // A kill without a tick in this round makes "before/after" unknowable for ordering-based fields.
    const orderKnown = roundKills.every((k) => finite(k.tick));

    // Alive counts just before the death: a complete roster for both sides, every earlier death
    // in this round with a known side. Deaths on the same tick are not "before" (no causal order).
    let teammates: Field<number> = notMeasured();
    let enemies: Field<number> = notMeasured();
    if (valid && victimSide && finite(death.tick) && orderKnown) {
      const own = roster.filter((p) => p.side === victimSide).length;
      const opp = roster.filter((p) => p.side && p.side !== victimSide).length;
      const earlier = roundKills.filter(
        (k) => finite(k.tick) && k.tick < (death.tick as number) && k.victim,
      );
      const unknownSide = earlier.some((k) => !sides.get(k.victim as string));
      if (own > 0 && opp > 0 && !unknownSide && roster.every((p) => p.side)) {
        const deadOwn = earlier.filter((k) => sides.get(k.victim as string) === victimSide).length;
        const deadOpp = earlier.length - deadOwn;
        teammates = derived(own - deadOwn);
        enemies = derived(opp - deadOpp);
      }
    }
    if (teammates.provenance === "NOT_MEASURED") missing.push("alive_counts");

    // Trade: a teammate of the victim kills the killer within the window, same round.
    let trade: DeathContext["trade"] = {
      status: "NOT_MEASURED",
      windowSeconds: TRADE_WINDOW_SECONDS,
      tradeTick: null,
    };
    if (kind !== "ENEMY_KILL") {
      trade = { status: "NOT_APPLICABLE", windowSeconds: TRADE_WINDOW_SECONDS, tradeTick: null };
    } else if (valid && finite(death.timeSeconds) && victimSide) {
      const avenge = roundKills.find(
        (k) =>
          k.victim === death.actor &&
          k.actor !== null &&
          sides.get(k.actor) === victimSide &&
          finite(k.timeSeconds) &&
          k.timeSeconds >= (death.timeSeconds as number) &&
          k.timeSeconds - (death.timeSeconds as number) <= TRADE_WINDOW_SECONDS,
      );
      trade = avenge
        ? { status: "TRADED", windowSeconds: TRADE_WINDOW_SECONDS, tradeTick: avenge.tick }
        : { status: "NOT_OBSERVED", windowSeconds: TRADE_WINDOW_SECONDS, tradeTick: null };
    }
    if (trade.status === "NOT_MEASURED") missing.push("trade");

    const firstKill = roundKills.find((k) => finite(k.tick));
    const openingDeath: Field<boolean> =
      valid && orderKnown && firstKill ? derived(firstKill.id === death.id) : notMeasured();
    const plants = input.objectives.filter(
      (o) => o.type === "bomb_plant" && o.roundNumber === roundNumber,
    );
    const bombPlantedBeforeDeath: Field<boolean> =
      valid && finite(death.tick) && plants.every((p) => finite(p.tick))
        ? derived(plants.some((p) => (p.tick as number) < (death.tick as number)))
        : notMeasured();
    const won: Field<boolean> =
      valid && round?.winnerSide && victimSide
        ? derived(round.winnerSide === victimSide)
        : notMeasured();

    const facts = {
      weapon: observed(death.weapon),
      headshot: observed(death.headshot),
      distance: observed(finite(death.distance) ? death.distance : null),
      blind: observed(death.blind),
      wallbang: observed(death.wallbang),
    };
    for (const [name, field] of Object.entries(facts))
      if (field.provenance === "NOT_MEASURED") missing.push(name);
    const victimPos = observed(death.victimPosition);
    const attackerPos = observed(death.attackerPosition);
    if (victimPos.provenance === "NOT_MEASURED") missing.push("victim_position");
    if (attackerPos.provenance === "NOT_MEASURED") missing.push("attacker_position");
    if (!valid) missing.push("round");

    out.push({
      contract: DEATH_CONTEXT_CONTRACT.id,
      ref: { matchId: input.matchId, roundNumber, tick: death.tick, eventId: death.id },
      kind,
      map: input.map,
      facts,
      positions: {
        victim: victimPos,
        attacker: attackerPos,
        drawable: input.mapValidation === "VALIDATED" && victimPos.value !== null,
      },
      round: {
        valid,
        victimSide: victimSide ? observed(victimSide) : notMeasured(),
        won,
        winReason: valid ? observed(round?.winReason ?? null) : notMeasured(),
        bombPlantedBeforeDeath,
        openingDeath,
      },
      alive: { teammates, enemies },
      trade,
      unsupported: UNSUPPORTED,
      integrity: input.integrity
        ? {
            status: input.integrity.status,
            eligible: input.integrity.eligible,
            endedBy: input.integrity.endedBy,
            validRounds: input.integrity.validRounds,
          }
        : { status: null, eligible: null, endedBy: null, validRounds: null },
      missing,
    });
  }
  return out;
}
