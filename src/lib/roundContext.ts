/**
 * Marco 1 — competitive context per round (`round-context-v1`). Pure and deterministic.
 *
 * Sources, all already persisted by the canonical pipeline and read under RLS:
 *  - side of each participant in each round: `round_players.side` (CT | T);
 *  - side that won each round: `match_rounds.winner_side`, which the parser records only when two
 *    independent observations agree (services/cs2-demo-parser/parser.py, round winner);
 *  - kills, deaths and damage: `round_events` (`kill`, `damage`) by `actor_steam_id` /
 *    `victim_steam_id`, the same attribution `src/lib/pipeline/metrics.ts` uses for the match
 *    totals, so the CT + T split adds up to the match totals.
 *
 * Never inferred: a round without a recorded winner is `UNKNOWN`, never a win or a loss; a round
 * without the player's side is `UNKNOWN` side. Nothing is derived from kills or deaths.
 * Team identity across halves is only CHECKED (two groups that always face each other); the match
 * result, the score and team names stay out (admission limitation L04).
 */

export const ROUND_CONTEXT_VERSION = "round-context-v1";
/**
 * Rounds on a side below which per-side RATES (round win rate, kills and damage per round) are
 * withheld as INSUFFICIENT_SAMPLE; counts are always shown. Same convention as the DNA event
 * minimum (`DNA_MIN_EVENT_SAMPLE`): a declared heuristic, not a fitted threshold.
 */
export const SIDE_MIN_ROUNDS = 10;

export type Side = "CT" | "T";
export type SideState = Side | "UNKNOWN";
export type RoundOutcome = "WON" | "LOST" | "UNKNOWN";

export interface RoundRow {
  round_number: number;
  winner_side: string | null;
}
export interface RoundPlayerRow {
  round_number: number;
  participant_key: string;
  side: string | null;
}
export interface RoundEventRow {
  id?: string;
  round_number: number | null;
  event_type: string;
  actor_steam_id: string | null;
  victim_steam_id: string | null;
  damage: number | null;
}
export interface MatchRoundInput {
  matchId: string;
  /** The caller's own participant in this match. */
  participantKey: string;
  rounds: RoundRow[];
  roundPlayers: RoundPlayerRow[];
  events: RoundEventRow[];
}

export interface PlayerRound {
  round: number;
  side: SideState;
  outcome: RoundOutcome;
  kills: number;
  deaths: number;
  damage: number;
}

/** Whether the participants split into exactly two groups that face each other every round. */
export type TeamCheck = "CONSISTENT" | "INCONSISTENT" | "UNAVAILABLE";

export interface MatchRoundContext {
  matchId: string;
  rounds: PlayerRound[];
  teamCheck: TeamCheck;
}

export type RateStatus = "DERIVED" | "INSUFFICIENT_SAMPLE";

export interface SideSummary {
  side: Side;
  /** OBSERVED counts. */
  rounds: number;
  roundsWon: number;
  roundsLost: number;
  roundsOutcomeUnknown: number;
  kills: number;
  deaths: number;
  damage: number;
  /** DERIVED rates; null below SIDE_MIN_ROUNDS (status INSUFFICIENT_SAMPLE). */
  rateStatus: RateStatus;
  /** won / (won + lost), percent with one decimal. */
  roundWinRate: number | null;
  killsPerRound: number | null;
  damagePerRound: number | null;
}

export interface RoundContextSummary {
  version: typeof ROUND_CONTEXT_VERSION;
  status: "EMPTY" | "OBSERVED";
  matches: number;
  rounds: number;
  roundsSideUnknown: number;
  ct: SideSummary;
  t: SideSummary;
  teamCheck: { consistent: number; inconsistent: number; unavailable: number };
  minRoundsForRates: number;
}

const asSide = (v: string | null | undefined): SideState =>
  v === "CT" || v === "T" ? v : "UNKNOWN";

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Pure: the caller's rounds in one match, with side, outcome and own kills/deaths/damage. */
export function buildMatchRounds(input: MatchRoundInput): MatchRoundContext {
  const me = input.participantKey;
  const winner = new Map<number, SideState>();
  for (const r of input.rounds) winner.set(r.round_number, asSide(r.winner_side));

  const mySide = new Map<number, SideState>();
  for (const rp of input.roundPlayers) {
    if (rp.participant_key !== me) continue;
    // Two rows for the same player and round with different sides: the side is not known.
    const prev = mySide.get(rp.round_number);
    const side = asSide(rp.side);
    mySide.set(rp.round_number, prev === undefined || prev === side ? side : "UNKNOWN");
  }

  const roundNumbers = [...new Set([...mySide.keys()])].sort((a, b) => a - b);
  const seen = new Set<string>();
  const tally = new Map<number, { kills: number; deaths: number; damage: number }>();
  for (const e of input.events) {
    if (e.round_number == null) continue;
    if (e.id) {
      if (seen.has(e.id)) continue; // the same persisted event read twice counts once
      seen.add(e.id);
    }
    const t = tally.get(e.round_number) ?? { kills: 0, deaths: 0, damage: 0 };
    if (e.event_type === "kill") {
      if (e.actor_steam_id === me) t.kills++;
      if (e.victim_steam_id === me) t.deaths++;
    } else if (e.event_type === "damage" && e.actor_steam_id === me) {
      t.damage += e.damage ?? 0;
    }
    tally.set(e.round_number, t);
  }

  const rounds: PlayerRound[] = roundNumbers.map((n) => {
    const side = mySide.get(n) ?? "UNKNOWN";
    const won = winner.get(n) ?? "UNKNOWN";
    const outcome: RoundOutcome =
      side === "UNKNOWN" || won === "UNKNOWN" ? "UNKNOWN" : won === side ? "WON" : "LOST";
    const t = tally.get(n) ?? { kills: 0, deaths: 0, damage: 0 };
    return { round: n, side, outcome, ...t };
  });

  return { matchId: input.matchId, rounds, teamCheck: checkTeams(input.roundPlayers) };
}

/**
 * Pure: two participants are teammates when they share a side; a consistent match has every pair
 * either always together or always opposed across all rounds they both played, giving exactly two
 * groups. Any pair that is together in one round and opposed in another → INCONSISTENT.
 */
export function checkTeams(rows: RoundPlayerRow[]): TeamCheck {
  const byRound = new Map<number, Map<string, Side>>();
  for (const r of rows) {
    const side = asSide(r.side);
    if (side === "UNKNOWN") continue;
    const m = byRound.get(r.round_number) ?? new Map<string, Side>();
    m.set(r.participant_key, side);
    byRound.set(r.round_number, m);
  }
  if (!byRound.size) return "UNAVAILABLE";
  const relation = new Map<string, boolean>(); // "a|b" -> together?
  for (const sides of byRound.values()) {
    const entries = [...sides.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [ka, sa] = entries[i]!;
        const [kb, sb] = entries[j]!;
        const pair = `${ka}|${kb}`;
        const together = sa === sb;
        const prev = relation.get(pair);
        if (prev !== undefined && prev !== together) return "INCONSISTENT";
        relation.set(pair, together);
      }
    }
  }
  // Exactly two groups: build groups from the "together" relation.
  const players = [...new Set(rows.map((r) => r.participant_key))].sort();
  const group = new Map<string, number>();
  let groups = 0;
  for (const p of players) {
    if (group.has(p)) continue;
    group.set(p, groups);
    for (const q of players) {
      if (q === p || group.has(q)) continue;
      const pair = p < q ? `${p}|${q}` : `${q}|${p}`;
      if (relation.get(pair) === true) group.set(q, groups);
    }
    groups++;
  }
  return groups === 2 ? "CONSISTENT" : "INCONSISTENT";
}

function summarizeSide(side: Side, rounds: PlayerRound[]): SideSummary {
  const mine = rounds.filter((r) => r.side === side);
  const won = mine.filter((r) => r.outcome === "WON").length;
  const lost = mine.filter((r) => r.outcome === "LOST").length;
  const kills = mine.reduce((s, r) => s + r.kills, 0);
  const deaths = mine.reduce((s, r) => s + r.deaths, 0);
  const damage = mine.reduce((s, r) => s + r.damage, 0);
  const enough = mine.length >= SIDE_MIN_ROUNDS;
  return {
    side,
    rounds: mine.length,
    roundsWon: won,
    roundsLost: lost,
    roundsOutcomeUnknown: mine.length - won - lost,
    kills,
    deaths,
    damage,
    rateStatus: enough ? "DERIVED" : "INSUFFICIENT_SAMPLE",
    roundWinRate: enough && won + lost > 0 ? round1((won / (won + lost)) * 100) : null,
    killsPerRound: enough ? round2(kills / mine.length) : null,
    damagePerRound: enough ? round1(damage / mine.length) : null,
  };
}

/** Pure: per-side summary over the caller's matches (one context per match, deduplicated). */
export function summarizeRoundContext(matches: MatchRoundContext[]): RoundContextSummary {
  const unique = [...new Map(matches.map((m) => [m.matchId, m])).values()];
  const all = unique.flatMap((m) => m.rounds);
  const count = (c: TeamCheck) => unique.filter((m) => m.teamCheck === c).length;
  return {
    version: ROUND_CONTEXT_VERSION,
    status: all.length ? "OBSERVED" : "EMPTY",
    matches: unique.length,
    rounds: all.length,
    roundsSideUnknown: all.filter((r) => r.side === "UNKNOWN").length,
    ct: summarizeSide("CT", all),
    t: summarizeSide("T", all),
    teamCheck: {
      consistent: count("CONSISTENT"),
      inconsistent: count("INCONSISTENT"),
      unavailable: count("UNAVAILABLE"),
    },
    minRoundsForRates: SIDE_MIN_ROUNDS,
  };
}
