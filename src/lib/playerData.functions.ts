/**
 * Real player data for the Dashboard, match history, Player DNA and AI Coach.
 *
 * Reads only with the signed-in player's own Supabase session, so every row
 * is filtered by RLS (`demo_jobs_select_own`, `uploads_select_own`,
 * `match_metrics_select_own`, `matches_select_own`). A failed query is an error,
 * never an empty result.
 *
 * The service role is used for exactly one thing, in a server-only module
 * (`quarantineRead.server`): asking which of the caller's own match ids are in the
 * Canonical quarantine registry (client roles cannot read it), so quarantined matches are
 * left out of every aggregate the player sees, exactly as they are left out of the
 * persisted DNA snapshot. It fails closed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import type { Database } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type FlashAssistMethodView,
  buildOverview,
  type OverviewJobRow,
  type OverviewMatchRow,
  type OverviewMetricRow,
  type PlayerOverview,
} from "@/lib/playerOverview";
import {
  buildPlayerDna,
  publishableDna,
  type DnaFeatureRow,
  type RealPlayerDna,
} from "@/lib/playerDna";
import type { DnaSnapshotFeatureRow } from "@/lib/playerDnaSnapshot";

const JOB_COLUMNS =
  "id, upload_id, status, queued_at, finished_at, error_code, attachment_state, attachment_confirmation_status, match_id, admission_verdict, admission_limitations";
const METRIC_COLUMNS =
  "match_id, kills, deaths, assists, adr, kast, hs_percent, rating, rounds_played, first_kills, first_deaths, trade_kills, flash_assists, utility_damage, clutch_attempts, clutch_wins, ct_rating, t_rating";
const MATCH_COLUMNS =
  "id, map, played_at, match_date, created_at, result, score_player, score_opponent, data_source";
const MAX_JOBS = 50;
const MAX_MATCHES = 100;

export const getPlayerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlayerOverview> =>
    loadPlayerOverview(context.supabase, context.userId),
  );

/**
 * The caller's own Player DNA, plus the persisted snapshot of exactly these inputs, if any.
 *
 * READ ONLY (Fundação 4.2): it never writes. The snapshot is looked up by the digest of the
 * rows the caller sees; when none exists yet (`snapshot: null` on a non-empty profile — a
 * profile that predates snapshotting, or a new DNA version), the page calls the explicit,
 * idempotent `refreshOwnDnaSnapshot` (POST). The pipeline persists the snapshot after every
 * processed match, so that call is the exception.
 */
export const getRealPlayerDna = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RealPlayerDna> => {
    const {
      dna: computed,
      playerIds,
      rows,
    } = await loadPlayerDna(context.supabase, context.userId);
    // Provisional dimension values never leave the server (Fase 2.1, publishableDna).
    const dna = publishableDna(computed);
    if (dna.state === "EMPTY" || playerIds.length !== 1) return { ...dna, snapshot: null };
    try {
      const { dnaInputDigest } = await import("@/lib/playerDnaSnapshot.server");
      const digest = dnaInputDigest(rows);
      // Own snapshot rows only (RLS `dna_snapshots_select_own`); columns added by a manual
      // migration are not in the generated types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (context.supabase as unknown as SupabaseClient<any>)
        .from("player_dna_snapshots")
        .select("created_at, dna_version, match_count")
        .eq("player_id", playerIds[0]!)
        .eq("input_digest", digest)
        .maybeSingle();
      if (error) throw new Error(`PLAYER_DNA_SNAPSHOT_READ_FAILED:${error.code ?? "unknown"}`);
      return {
        ...dna,
        snapshot: data
          ? {
              createdAt: (data.created_at as string | null) ?? null,
              dnaVersion: (data.dna_version as string | null) ?? null,
              matchCount: Number(data.match_count ?? dna.matches),
            }
          : null,
      };
    } catch (error) {
      console.error("[player-dna] snapshot read failed", {
        code: error instanceof Error ? error.message.split(":")[0] : "unknown",
      });
      return { ...dna, snapshot: null };
    }
  });

/**
 * Persists (idempotently, by input digest) the caller's own DNA snapshot. Explicit write:
 * POST, authenticated, no input. The player id comes from the caller's own RLS-filtered
 * `player_profiles` row, never from the client; the service role is used only inside the
 * server-only module to write the row RLS reserves for the server.
 */
export const refreshOwnDnaSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ status: "created" | "unchanged" | "empty" | "unavailable" }> => {
      const playerIds = await ownPlayerIds(context.supabase, context.userId, "PLAYER_DNA");
      if (playerIds.length !== 1) return { status: "unavailable" };
      try {
        const { refreshOwnPlayerDnaSnapshot } = await import("@/lib/playerDnaSnapshot.server");
        const snap = await refreshOwnPlayerDnaSnapshot(playerIds[0]!);
        return { status: snap.status };
      } catch (error) {
        console.error("[player-dna] snapshot refresh failed", {
          code: error instanceof Error ? error.message.split(":")[0] : "unknown",
        });
        return { status: "unavailable" };
      }
    },
  );

/**
 * Shared loaders (RLS-scoped to the caller). Exported for the AI Coach, which
 * must read exactly the same rows the Dashboard and Player DNA show.
 */
export async function loadPlayerOverview(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PlayerOverview> {
  // A replaced attempt is history of its replacement, not a separate outcome.
  const { data: jobs, error: jobsError } = await supabase
    .from("demo_jobs")
    .select(JOB_COLUMNS)
    .eq("user_id", userId)
    .is("superseded_by_job_id", null)
    .order("queued_at", { ascending: false })
    .limit(MAX_JOBS);
  if (jobsError) throw new Error(`PLAYER_OVERVIEW_JOBS_FAILED:${jobsError.code ?? "unknown"}`);

  const uploadIds = [...new Set((jobs ?? []).map((job) => job.upload_id))];
  const { data: uploads, error: uploadsError } = uploadIds.length
    ? await supabase.from("uploads").select("id, file_name").in("id", uploadIds)
    : { data: [], error: null };
  if (uploadsError)
    throw new Error(`PLAYER_OVERVIEW_UPLOADS_FAILED:${uploadsError.code ?? "unknown"}`);

  const playerIds = await ownPlayerIds(supabase, userId, "PLAYER_OVERVIEW");
  const { data: metrics, error: metricsError } = playerIds.length
    ? await supabase
        .from("match_metrics")
        .select(METRIC_COLUMNS)
        .in("player_id", playerIds)
        .order("created_at", { ascending: false })
        .limit(MAX_MATCHES)
    : { data: [], error: null };
  if (metricsError)
    throw new Error(`PLAYER_OVERVIEW_METRICS_FAILED:${metricsError.code ?? "unknown"}`);

  // Quarantined matches never reach an aggregate (same rule as the DNA snapshot).
  const quarantined = await quarantinedOwn((metrics ?? []).map((row) => row.match_id));
  const visibleMetrics = (metrics ?? []).filter((row) => !quarantined.has(row.match_id));
  const matchIds = [...new Set(visibleMetrics.map((row) => row.match_id))];
  const { data: matches, error: matchesError } = matchIds.length
    ? await supabase.from("matches").select(MATCH_COLUMNS).in("id", matchIds)
    : { data: [], error: null };
  if (matchesError)
    throw new Error(`PLAYER_OVERVIEW_MATCHES_FAILED:${matchesError.code ?? "unknown"}`);

  const overview = buildOverview({
    jobs: (jobs ?? []) as OverviewJobRow[],
    fileNames: new Map((uploads ?? []).map((upload) => [upload.id, upload.file_name])),
    metrics: visibleMetrics as OverviewMetricRow[],
    matches: (matches ?? []) as OverviewMatchRow[],
    now: new Date(),
  });
  // Fase 4.0.1 — flash-assist provenance, read defensively: a missing table or a failed read
  // only means "method not recorded"; it never hides or changes a metric.
  const methods = await loadFlashMethods(supabase, playerIds, matchIds);
  for (const m of overview.matches) m.flashAssistMethod = methods.get(m.matchId) ?? "NOT_RECORDED";
  return overview;
}

async function loadFlashMethods(
  supabase: SupabaseClient<Database>,
  playerIds: string[],
  matchIds: string[],
): Promise<Map<string, FlashAssistMethodView>> {
  if (!playerIds.length || !matchIds.length) return new Map();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as SupabaseClient<any>)
      .from("match_flash_assist_provenance")
      .select("match_id, method")
      .in("player_id", playerIds)
      .in("match_id", matchIds);
    if (error) return new Map();
    return new Map(
      (data ?? []).map((r: { match_id: string; method: FlashAssistMethodView }) => [
        r.match_id,
        r.method,
      ]),
    );
  } catch {
    return new Map();
  }
}

/**
 * Real Player DNA: the caller's own `match_features` rows (RLS
 * `match_features_select_own`), aggregated by `buildPlayerDna`. No reference
 * population, no score: observed signals only.
 */
export async function loadPlayerDna(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ dna: RealPlayerDna; playerIds: string[]; rows: DnaSnapshotFeatureRow[] }> {
  const playerIds = await ownPlayerIds(supabase, userId, "PLAYER_DNA");
  const { data, error } = playerIds.length
    ? await supabase
        .from("match_features")
        .select(
          "match_id, partial_parse, sample_rounds, sample_opening_duels, sample_clutches, features, schema_version, analysis_version, created_at",
        )
        .in("player_id", playerIds)
        .order("created_at", { ascending: false })
        .limit(MAX_MATCHES)
    : { data: [], error: null };
  if (error) throw new Error(`PLAYER_DNA_FEATURES_FAILED:${error.code ?? "unknown"}`);
  const all = (data ?? []) as DnaSnapshotFeatureRow[];
  // Same inputs as the persisted snapshot: quarantined matches are never aggregated.
  const quarantined = await quarantinedOwn(all.map((row) => row.match_id));
  const rows = all.filter((row) => !quarantined.has(row.match_id));
  return { dna: buildPlayerDna(rows as DnaFeatureRow[]), playerIds, rows };
}

/** Server-only lookup, loaded lazily so the service-role client never enters a client bundle. */
async function quarantinedOwn(matchIds: string[]): Promise<Set<string>> {
  if (!matchIds.length) return new Set();
  const { quarantinedAmong } = await import("@/lib/quarantineRead.server");
  return quarantinedAmong(matchIds);
}

// RLS also lets staff read other players' rows; every read here is the caller's
// own, so it is scoped to the caller's player profiles explicitly.
export async function ownPlayerIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  code: string,
): Promise<string[]> {
  const { data: players, error } = await supabase
    .from("player_profiles")
    .select("id")
    .eq("user_id", userId);
  if (error) throw new Error(`${code}_PLAYERS_FAILED:${error.code ?? "unknown"}`);
  return (players ?? []).map((player) => player.id);
}
