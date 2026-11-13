/**
 * Raio-X and Player DNA history reads (Fase 2).
 *
 * Read-only and RLS-scoped: every query runs with the signed-in player's own Supabase
 * session (`requireSupabaseAuth`) and is narrowed to the caller's own player profiles
 * (`ownPlayerIds`). Policies: `match_participants` / `round_players` need
 * `owns_canonical_match`, `player_dna_snapshots` needs `owns_player`. The service role is
 * never used here and nothing is written (the DNA snapshot refresh stays in
 * `getRealPlayerDna`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { buildXRay, type SideRounds, type XRayDiagnosis } from "@/lib/diagnostics/xray";
import { loadPlayerDna, loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";
import { DNA_MIN_MATCHES } from "@/lib/playerDna";
import {
  buildMatchRounds,
  summarizeRoundContext,
  type MatchRoundContext,
  type RoundContextSummary,
} from "@/lib/roundContext";
import type { DnaDimension } from "@/types";

export const getXRay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<XRayDiagnosis> => {
    const [overview, { dna, playerIds }] = await Promise.all([
      loadPlayerOverview(context.supabase, context.userId),
      loadPlayerDna(context.supabase, context.userId),
    ]);
    const matchIds = overview.matches.map((m) => m.matchId);
    const [sides, roundContext] = await Promise.all([
      loadSideRounds(context.supabase, playerIds, matchIds),
      loadRoundContext(context.supabase, playerIds, matchIds),
    ]);
    return buildXRay({ overview, dna, sides, roundContext });
  });

/**
 * Marco 1 — the caller's own participant in each match (one per match; two own participants in
 * the same match is ambiguous and the match is left out). RLS: `owns_canonical_match`.
 */
export async function ownParticipantKeys(
  supabase: SupabaseClient<Database>,
  playerIds: string[],
  matchIds: string[],
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("match_participants")
    .select("match_id, participant_key")
    .in("match_id", matchIds)
    .in("internal_player_id", playerIds);
  if (error) throw new Error(`XRAY_PARTICIPANTS_FAILED:${error.code ?? "unknown"}`);
  const keyByMatch = new Map<string, string>();
  for (const p of data ?? []) {
    if (keyByMatch.has(p.match_id)) keyByMatch.set(p.match_id, "");
    else keyByMatch.set(p.match_id, p.participant_key);
  }
  // Ambiguous matches ("") and keys that are not SteamID64 digits are left out; only digit keys
  // are ever interpolated into a PostgREST filter.
  return new Map([...keyByMatch].filter(([, key]) => /^\d{1,20}$/.test(key)));
}

/**
 * Marco 1 — `round-context-v1` for the caller (side and outcome of each own round, own kills,
 * deaths and damage per side). Read-only under the caller's session: `round_players`,
 * `match_rounds` and `round_events` are all gated by `owns_canonical_match`; the service role is
 * never used. Events are read per match and only the caller's own (actor or victim), so a match
 * never hits the API row limit. Returns null when the caller has no own participant.
 */
export async function loadRoundContext(
  supabase: SupabaseClient<Database>,
  playerIds: string[],
  matchIds: string[],
): Promise<RoundContextSummary | null> {
  if (!playerIds.length || !matchIds.length) return null;
  const keys = await ownParticipantKeys(supabase, playerIds, matchIds);
  if (!keys.size) return null;
  const contexts: MatchRoundContext[] = await Promise.all(
    [...keys].map(async ([matchId, participantKey]) => {
      const [rounds, roundPlayers, events] = await Promise.all([
        supabase.from("match_rounds").select("round_number, winner_side").eq("match_id", matchId),
        supabase
          .from("round_players")
          .select("round_number, participant_key, side")
          .eq("match_id", matchId),
        supabase
          .from("round_events")
          .select("id, round_number, event_type, actor_steam_id, victim_steam_id, damage")
          .eq("match_id", matchId)
          .in("event_type", ["kill", "damage"])
          .or(`actor_steam_id.eq.${participantKey},victim_steam_id.eq.${participantKey}`),
      ]);
      const failed = rounds.error ?? roundPlayers.error ?? events.error;
      if (failed) throw new Error(`XRAY_ROUND_CONTEXT_FAILED:${failed.code ?? "unknown"}`);
      return buildMatchRounds({
        matchId,
        participantKey,
        rounds: rounds.data ?? [],
        roundPlayers: roundPlayers.data ?? [],
        events: events.data ?? [],
      });
    }),
  );
  return summarizeRoundContext(contexts);
}

/**
 * Rounds per side of the caller's own participant in each match (round_players.side).
 * A match whose rounds do not all carry a side is left out: a partial count would be a
 * wrong denominator.
 */
export async function loadSideRounds(
  supabase: SupabaseClient<Database>,
  playerIds: string[],
  matchIds: string[],
): Promise<SideRounds[]> {
  if (!playerIds.length || !matchIds.length) return [];
  const { data: participants, error } = await supabase
    .from("match_participants")
    .select("match_id, participant_key")
    .in("match_id", matchIds)
    .in("internal_player_id", playerIds);
  if (error) throw new Error(`XRAY_PARTICIPANTS_FAILED:${error.code ?? "unknown"}`);
  const keyByMatch = new Map<string, string>();
  for (const p of participants ?? []) {
    // Two own participants in one match is ambiguous: leave the match out.
    if (keyByMatch.has(p.match_id)) keyByMatch.set(p.match_id, "");
    else keyByMatch.set(p.match_id, p.participant_key);
  }
  const ids = [...keyByMatch].filter(([, key]) => key).map(([id]) => id);
  if (!ids.length) return [];
  const { data: rows, error: roundsError } = await supabase
    .from("round_players")
    .select("match_id, participant_key, side")
    .in("match_id", ids);
  if (roundsError) throw new Error(`XRAY_ROUNDS_FAILED:${roundsError.code ?? "unknown"}`);
  return sideRoundsFrom(rows ?? [], keyByMatch);
}

/** Pure: per-match CT/T round counts for the given participant of each match. */
export function sideRoundsFrom(
  rows: Array<{ match_id: string; participant_key: string; side: string | null }>,
  keyByMatch: Map<string, string>,
): SideRounds[] {
  const acc = new Map<string, { ct: number; t: number; unknown: number }>();
  for (const row of rows) {
    if (!keyByMatch.get(row.match_id) || keyByMatch.get(row.match_id) !== row.participant_key)
      continue;
    const a = acc.get(row.match_id) ?? { ct: 0, t: 0, unknown: 0 };
    if (row.side === "CT") a.ct++;
    else if (row.side === "T") a.t++;
    else a.unknown++;
    acc.set(row.match_id, a);
  }
  return [...acc]
    .filter(([, a]) => a.unknown === 0 && a.ct + a.t > 0)
    .map(([matchId, a]) => ({ matchId, ct: a.ct, t: a.t }));
}

export interface DnaHistoryEntry {
  createdAt: string;
  dnaVersion: string | null;
  state: string | null;
  matchCount: number | null;
  roundCount: number | null;
  /** Dimension indexes 0–100 as persisted; null = not observed in that snapshot. */
  dimensions: Partial<Record<DnaDimension, number | null>>;
}

const DNA_DIMENSION_COLUMNS: DnaDimension[] = [
  "aim",
  "dueling",
  "survivability",
  "positioning",
  "utility",
  "decision_making",
  "teamplay",
  "economy",
  "clutch",
  "consistency",
];

/** The caller's own persisted DNA snapshots, newest first (append-only by input digest). */
export const getDnaHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DnaHistoryEntry[]> => {
    const playerIds = await ownPlayerIds(context.supabase, context.userId, "DNA_HISTORY");
    if (playerIds.length !== 1) return [];
    // Columns added by a manual migration are not in the generated types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as unknown as SupabaseClient<any>;
    const { data, error } = await db
      .from("player_dna_snapshots")
      .select(
        `created_at, dna_version, state, match_count, round_count, ${DNA_DIMENSION_COLUMNS.join(", ")}`,
      )
      .eq("player_id", playerIds[0]!)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(`DNA_HISTORY_FAILED:${error.code ?? "unknown"}`);
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
      createdAt: String(row["created_at"]),
      dnaVersion: (row["dna_version"] as string | null) ?? null,
      state: (row["state"] as string | null) ?? null,
      matchCount: (row["match_count"] as number | null) ?? null,
      roundCount: (row["round_count"] as number | null) ?? null,
      dimensions: Object.fromEntries(
        DNA_DIMENSION_COLUMNS.map((d) => {
          const v = row[d];
          const n = v === null || v === undefined ? null : Number(v);
          return [d, n !== null && Number.isFinite(n) ? n : null];
        }),
      ),
    }));
  });

export interface DnaSummary {
  /**
   * READY / INSUFFICIENT_SAMPLE: state of the latest persisted snapshot. NO_SNAPSHOT: the
   * player has no snapshot yet (nothing is created here). NO_PLAYER: no own player profile.
   */
  state: "READY" | "INSUFFICIENT_SAMPLE" | "NO_SNAPSHOT" | "NO_PLAYER";
  matches: number | null;
  minimumMatches: number;
  /** Dimensions with a value in the snapshot (null columns are "not observed", never 0). */
  observedDimensions: number | null;
  createdAt: string | null;
}

/**
 * Dashboard DNA summary — READ ONLY (Fase 2.1). Reads the caller's latest persisted snapshot
 * (written by the pipeline after each processed match). It never computes, refreshes or
 * creates a snapshot: a missing snapshot is reported as NO_SNAPSHOT, a failed read throws.
 */
export const getDnaSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DnaSummary> =>
    loadDnaSummary(context.supabase, context.userId),
  );

/** Read-only loader behind `getDnaSummary` (exported for tests with a recording client). */
export async function loadDnaSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<DnaSummary> {
  const playerIds = await ownPlayerIds(supabase, userId, "DNA_SUMMARY");
  if (playerIds.length !== 1)
    return {
      state: "NO_PLAYER",
      matches: null,
      minimumMatches: DNA_MIN_MATCHES,
      observedDimensions: null,
      createdAt: null,
    };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as SupabaseClient<any>;
  const { data, error } = await db
    .from("player_dna_snapshots")
    .select(`created_at, state, match_count, ${DNA_DIMENSION_COLUMNS.join(", ")}`)
    .eq("player_id", playerIds[0]!)
    .order("created_at", { ascending: false })
    .limit(1);
  // A failed read is an error, never an empty summary and never a write fallback.
  if (error) throw new Error(`DNA_SUMMARY_FAILED:${error.code ?? "unknown"}`);
  return dnaSummaryFrom(((data ?? []) as unknown as Array<Record<string, unknown>>)[0]);
}

/** Pure: the Dashboard summary of one snapshot row (or none). */
export function dnaSummaryFrom(row: Record<string, unknown> | undefined): DnaSummary {
  const base = { minimumMatches: DNA_MIN_MATCHES };
  const state = row?.["state"];
  if (!row || (state !== "READY" && state !== "INSUFFICIENT_SAMPLE"))
    return {
      state: "NO_SNAPSHOT",
      matches: null,
      observedDimensions: null,
      createdAt: null,
      ...base,
    };
  const matches = row["match_count"];
  return {
    state,
    matches: typeof matches === "number" ? matches : null,
    observedDimensions: DNA_DIMENSION_COLUMNS.filter((d) => {
      const v = row[d];
      return v !== null && v !== undefined && Number.isFinite(Number(v));
    }).length,
    createdAt: typeof row["created_at"] === "string" ? row["created_at"] : null,
    ...base,
  };
}
