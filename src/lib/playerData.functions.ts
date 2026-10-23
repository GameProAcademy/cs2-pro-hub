/**
 * Real player data for the Dashboard, match history, Player DNA and AI Coach.
 *
 * Reads only with the signed-in player's own Supabase session, so every row
 * is filtered by RLS (`demo_jobs_select_own`, `uploads_select_own`,
 * `match_metrics_select_own`, `matches_select_own`). The service role is never
 * used here. A failed query is an error, never an empty result.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildOverview,
  type OverviewJobRow,
  type OverviewMatchRow,
  type OverviewMetricRow,
  type PlayerOverview,
} from "@/lib/playerOverview";
import { buildPlayerDna, type DnaFeatureRow, type RealPlayerDna } from "@/lib/playerDna";

const JOB_COLUMNS =
  "id, upload_id, status, queued_at, finished_at, error_code, attachment_state, attachment_confirmation_status, match_id, admission_verdict, admission_limitations";
const METRIC_COLUMNS =
  "match_id, kills, deaths, assists, adr, kast, hs_percent, rating, rounds_played, first_kills, first_deaths, trade_kills, flash_assists";
const MATCH_COLUMNS =
  "id, map, played_at, match_date, created_at, result, score_player, score_opponent, data_source";
const MAX_JOBS = 50;
const MAX_MATCHES = 100;

export const getPlayerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlayerOverview> => {
    const supabase = context.supabase;
    const userId = context.userId;

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

    // RLS also lets staff read other players' rows; the overview is always the
    // caller's own, so it is scoped to the caller's player profiles explicitly.
    const { data: players, error: playersError } = await supabase
      .from("player_profiles")
      .select("id")
      .eq("user_id", userId);
    if (playersError)
      throw new Error(`PLAYER_OVERVIEW_PLAYERS_FAILED:${playersError.code ?? "unknown"}`);
    const playerIds = (players ?? []).map((player) => player.id);

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

    const matchIds = [...new Set((metrics ?? []).map((row) => row.match_id))];
    const { data: matches, error: matchesError } = matchIds.length
      ? await supabase.from("matches").select(MATCH_COLUMNS).in("id", matchIds)
      : { data: [], error: null };
    if (matchesError)
      throw new Error(`PLAYER_OVERVIEW_MATCHES_FAILED:${matchesError.code ?? "unknown"}`);

    return buildOverview({
      jobs: (jobs ?? []) as OverviewJobRow[],
      fileNames: new Map((uploads ?? []).map((upload) => [upload.id, upload.file_name])),
      metrics: (metrics ?? []) as OverviewMetricRow[],
      matches: (matches ?? []) as OverviewMatchRow[],
      now: new Date(),
    });
  });

/**
 * Real Player DNA: the caller's own `match_features` rows (RLS
 * `match_features_select_own`, scoped to the caller's player profiles exactly
 * like the overview), aggregated by `buildPlayerDna`. No reference population,
 * no score: observed signals only.
 */
export const getRealPlayerDna = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RealPlayerDna> => {
    const supabase = context.supabase;
    const { data: players, error: playersError } = await supabase
      .from("player_profiles")
      .select("id")
      .eq("user_id", context.userId);
    if (playersError)
      throw new Error(`PLAYER_DNA_PLAYERS_FAILED:${playersError.code ?? "unknown"}`);
    const playerIds = (players ?? []).map((player) => player.id);
    const { data: rows, error } = playerIds.length
      ? await supabase
          .from("match_features")
          .select("match_id, partial_parse, sample_rounds, features")
          .in("player_id", playerIds)
          .order("created_at", { ascending: false })
          .limit(MAX_MATCHES)
      : { data: [], error: null };
    if (error) throw new Error(`PLAYER_DNA_FEATURES_FAILED:${error.code ?? "unknown"}`);
    return buildPlayerDna((rows ?? []) as DnaFeatureRow[]);
  });
