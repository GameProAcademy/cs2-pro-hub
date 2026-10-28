/**
 * Persists the Player DNA snapshot for ONE player (service role; server only).
 *
 * Called by the demo pipeline right after a match's metrics and features are
 * persisted, and by the authenticated Player DNA read for the caller's own
 * player (so a profile that predates this code is snapshotted on first view).
 * The player id always comes from trusted server state (the job's attached
 * player, or the caller's own player_profiles row), never from client input.
 *
 * Idempotent by construction: the snapshot carries the digest of its inputs and
 * (player_id, input_digest) is unique, so repeating the generation with the
 * same match_features never adds a row, while a new or reprocessed match does.
 * Matches in the Canonical quarantine registry are never aggregated.
 */
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { buildPlayerDna } from "@/lib/playerDna";
import {
  snapshotDigestInput,
  snapshotRow,
  type DnaSnapshotFeatureRow,
} from "@/lib/playerDnaSnapshot";

const MAX_MATCHES = 100;

export interface DnaSnapshotResult {
  status: "created" | "unchanged" | "empty";
  createdAt: string | null;
  dnaVersion: string | null;
  inputDigest: string | null;
  matchCount: number;
}

export async function refreshPlayerDnaSnapshot(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<DnaSnapshotResult> {
  const { data, error } = await db
    .from("match_features")
    .select(
      "match_id, partial_parse, sample_rounds, features, schema_version, analysis_version, created_at",
    )
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(MAX_MATCHES);
  if (error) throw new Error(`DNA_SNAPSHOT_FEATURES_FAILED:${error.code ?? "unknown"}`);
  let rows = (data ?? []) as DnaSnapshotFeatureRow[];

  if (rows.length) {
    const { data: quarantined, error: qError } = await db
      .from("canonical_match_quarantine" as never)
      .select("match_id")
      .in("match_id" as never, rows.map((r) => r.match_id) as never);
    if (qError) throw new Error(`DNA_SNAPSHOT_QUARANTINE_FAILED:${qError.code ?? "unknown"}`);
    const excluded = new Set(
      ((quarantined ?? []) as { match_id: string }[]).map((q) => q.match_id),
    );
    rows = rows.filter((r) => !excluded.has(r.match_id));
  }

  const dna = buildPlayerDna(rows);
  const digest = createHash("sha256").update(snapshotDigestInput(rows)).digest("hex");
  const row = snapshotRow(playerId, dna, rows, digest);
  if (!row) {
    return { status: "empty", createdAt: null, dnaVersion: null, inputDigest: null, matchCount: 0 };
  }

  const existing = await db
    .from("player_dna_snapshots")
    .select("created_at")
    .eq("player_id", playerId)
    .eq("input_digest" as never, digest as never)
    .maybeSingle();
  if (existing.error)
    throw new Error(`DNA_SNAPSHOT_READ_FAILED:${existing.error.code ?? "unknown"}`);
  if (existing.data) {
    return {
      status: "unchanged",
      createdAt: (existing.data as { created_at: string }).created_at,
      dnaVersion: row.dna_version,
      inputDigest: digest,
      matchCount: row.match_count,
    };
  }

  const inserted = await db
    .from("player_dna_snapshots")
    .upsert(row as never, { onConflict: "player_id,input_digest", ignoreDuplicates: true })
    .select("created_at");
  if (inserted.error)
    throw new Error(`DNA_SNAPSHOT_WRITE_FAILED:${inserted.error.code ?? "unknown"}`);
  const createdAt = ((inserted.data ?? []) as { created_at: string }[])[0]?.created_at ?? null;
  return {
    status: "created",
    createdAt,
    dnaVersion: row.dna_version,
    inputDigest: digest,
    matchCount: row.match_count,
  };
}

/**
 * Snapshot for the caller's own player. `playerId` must come from the caller's
 * RLS-scoped `player_profiles` read (see `getRealPlayerDna`); the service role is
 * used only to write the snapshot row, which RLS reserves for the server.
 */
export async function refreshOwnPlayerDnaSnapshot(playerId: string): Promise<DnaSnapshotResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return refreshPlayerDnaSnapshot(supabaseAdmin, playerId);
}
