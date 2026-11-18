/**
 * PM4 — Coach integration of modules E/F (`cs2.rounds.v1` + `cs2.economy.v1`, most recent match)
 * and G (`cs2.evolution.v1`, last 10 eligible matches). Pure: it compacts the same reports the
 * /rounds and /evolution pages render (never recomputed differently) into what the model may
 * quote. Every rate keeps its numerator and denominator; an empty denominator is null, never 0.
 * No player identity, match id, round number or tick leaves this module.
 */
import type { EvolutionReport } from "@/lib/evolution/evolution";
import { roundHalfUp } from "@/lib/metrics/rounding";
import type { OverviewMatch } from "@/lib/playerOverview";
import { ECONOMY_VERSION } from "@/lib/rounds/economy";
import type { RoundsSummary, Rate } from "@/lib/rounds/roundImpact";

export const COACH_ROUNDS_EVOLUTION_VERSION = "coach-rounds-evolution-v1";

export interface CoachRate {
  n: number;
  of: number;
  /** Percentage, null when `of` is 0 (no eligible round). */
  percent: number | null;
}

const rate = (r: Rate): CoachRate => ({
  n: r.numerator,
  of: r.denominator,
  percent: r.denominator > 0 ? roundHalfUp((r.numerator / r.denominator) * 100, 1) : null,
});

export interface CoachLatestRounds {
  version: string;
  economyVersion: string;
  map: string | null;
  dateBasis: "played" | "processed";
  rounds: number;
  validRounds: number;
  disconnectRounds: number;
  /** false: the match predates per-player spend (parser R5.8.31): every buy is unknown. */
  spendRecorded: boolean;
  team: {
    byBuy: Record<string, CoachRate>;
    unknownBuyRounds: number;
    openingWon: CoachRate;
    openingLost: CoachRate;
    advantageHeld: CoachRate;
    fromDisadvantage: CoachRate;
    retakeCt: CoachRate;
    postPlantT: CoachRate;
  };
  me: {
    playedRounds: number;
    kills: number;
    deaths: number;
    assists: number;
    openingKills: number;
    openingDeaths: number;
    tradeKills: number;
    deathsTraded: CoachRate;
    survival: CoachRate;
    clutches: Record<string, CoachRate>;
    plants: number;
    defuses: number;
  };
}

export function compactRounds(
  match: OverviewMatch,
  s: RoundsSummary,
  spendRecorded: boolean,
): CoachLatestRounds {
  const map = <T>(o: Record<string, T>, f: (v: T) => CoachRate) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
  return {
    version: s.version,
    economyVersion: ECONOMY_VERSION,
    map: match.map,
    dateBasis: match.dateSource,
    rounds: s.rounds,
    validRounds: s.validRounds,
    disconnectRounds: s.disconnectRounds,
    spendRecorded,
    team: {
      byBuy: map(
        Object.fromEntries(Object.entries(s.team.byBuy).filter((e): e is [string, Rate] => !!e[1])),
        rate,
      ),
      unknownBuyRounds: s.team.unknownBuyRounds,
      openingWon: rate(s.team.openingWon),
      openingLost: rate(s.team.openingLost),
      advantageHeld: rate(s.team.advantageHeld),
      fromDisadvantage: rate(s.team.fromDisadvantage),
      retakeCt: rate(s.team.retakeCt),
      postPlantT: rate(s.team.postPlantT),
    },
    me: {
      playedRounds: s.me.playedRounds,
      kills: s.me.kills,
      deaths: s.me.deaths,
      assists: s.me.assists,
      openingKills: s.me.openingKills,
      openingDeaths: s.me.openingDeaths,
      tradeKills: s.me.tradeKills,
      deathsTraded: rate(s.me.deathsTraded),
      survival: rate(s.me.survival),
      clutches: map(s.me.clutches, rate),
      plants: s.me.plants,
      defuses: s.me.defuses,
    },
  };
}

export interface CoachEvolution {
  version: string;
  window: { requested: number; n: number; status: string };
  previousWindowMatches: number;
  metrics: Array<{
    metric: string;
    unit: string;
    aggregation: string;
    status: string;
    value: number | null;
    measuredIn: number;
    windowMatches: number;
    consistency: { median: number; q1: number; q3: number; sd: number; cv: number | null } | null;
    comparison: {
      status: string;
      previous: number | null;
      recent: number | null;
      delta: number | null;
      deltaPercent: number | null;
      previousMatches: number;
      recentMatches: number;
    };
  }>;
}

const r3 = (v: number | null) => (v === null ? null : roundHalfUp(v, 3));

export function compactEvolution(rep: EvolutionReport): CoachEvolution {
  return {
    version: rep.version,
    window: rep.window,
    previousWindowMatches: rep.previousWindow.n,
    metrics: rep.metrics.map((m) => ({
      metric: m.key,
      unit: m.definition.unit,
      aggregation: m.definition.aggregation,
      status: m.window.status,
      value: m.window.status === "OK" ? r3(m.window.value) : null,
      measuredIn: m.window.matches,
      windowMatches: m.window.windowMatches,
      consistency:
        m.consistency.status === "OK"
          ? {
              median: r3(m.consistency.median)!,
              q1: r3(m.consistency.q1)!,
              q3: r3(m.consistency.q3)!,
              sd: r3(m.consistency.sd)!,
              cv: r3(m.consistency.cv),
            }
          : null,
      comparison: {
        status: m.comparison.status,
        previous: m.comparison.status === "OK" ? r3(m.comparison.previous.value) : null,
        recent: m.comparison.status === "OK" ? r3(m.comparison.recent.value) : null,
        delta: r3(m.comparison.delta),
        deltaPercent:
          m.comparison.deltaPercent === null ? null : roundHalfUp(m.comparison.deltaPercent, 1),
        previousMatches: m.comparison.previous.matches,
        recentMatches: m.comparison.recent.matches,
      },
    })),
  };
}
