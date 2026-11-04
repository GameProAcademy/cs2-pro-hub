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
import type { DnaDimension } from "@/types";

export const getXRay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<XRayDiagnosis> => {
    const [overview, { dna, playerIds }] = await Promise.all([
      loadPlayerOverview(context.supabase, context.userId),
      loadPlayerDna(context.supabase, context.userId),
    ]);
    const sides = await loadSideRounds(
      context.supabase,
      playerIds,
      overview.matches.map((m) => m.matchId),
    );
    return buildXRay({ overview, dna, sides });
  });

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
