import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { DnaFeatureRowV3 } from "@/lib/playerDnaV3";

/**
 * dna-weighted-v3 (R-05): each match's kills (`match_metrics.kills`), the denominator of HS.
 * Read for the given own players only (RLS for the caller's client; the snapshot writer passes
 * the trusted player id). A match without a kills row keeps `sample_kills` null and its HS
 * falls back to the plain mean, never a guessed weight.
 */
export async function withKills<T extends DnaFeatureRowV3>(
  db: SupabaseClient<Database>,
  playerIds: string[],
  rows: T[],
): Promise<T[]> {
  if (!rows.length || !playerIds.length) return rows;
  const { data, error } = await db
    .from("match_metrics")
    .select("match_id, kills")
    .in("player_id", playerIds)
    .in(
      "match_id",
      rows.map((r) => r.match_id),
    );
  if (error) throw new Error(`PLAYER_DNA_KILLS_FAILED:${error.code ?? "unknown"}`);
  const kills = new Map<string, number | null>();
  for (const m of data ?? []) {
    // Two own rows in one match would be ambiguous: no weight then.
    kills.set(m.match_id, kills.has(m.match_id) ? null : (m.kills ?? null));
  }
  return rows.map((r) => ({ ...r, sample_kills: kills.get(r.match_id) ?? null }));
}
