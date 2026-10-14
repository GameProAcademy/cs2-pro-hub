/**
 * Real player overview: pure shaping and state derivation (no I/O).
 *
 * Every number here comes from rows the signed-in player can read under RLS
 * (`demo_jobs`, `uploads`, `match_metrics`, `matches`). Nothing is estimated,
 * interpolated or filled with demonstration values: a metric that has no
 * source row is `null`, and a page with no source rows renders an honest
 * state (EMPTY, PROCESSING, IDENTITY_PENDING, BLOCKED, FAILED, ERROR).
 */

export type OverviewState =
  "EMPTY" | "PROCESSING" | "IDENTITY_PENDING" | "BLOCKED" | "FAILED" | "READY";

export type JobStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed"
  | "cancel_requested"
  | "cancelled"
  | "blocked_raw_audit";

export type JobIdentity = "CONFIRMED" | "PENDING" | "UNATTACHED" | "CONFLICT" | "NOT_APPLICABLE";

export interface OverviewJobRow {
  id: string;
  upload_id: string;
  status: string;
  queued_at: string;
  finished_at: string | null;
  error_code: string | null;
  attachment_state: string | null;
  attachment_confirmation_status: string | null;
}

export interface OverviewJob {
  jobId: string;
  uploadId: string;
  fileName: string | null;
  status: JobStatus;
  queuedAt: string;
  finishedAt: string | null;
  errorCode: string | null;
  identity: JobIdentity;
}

export interface OverviewMetricRow {
  match_id: string;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  adr: number | string | null;
  kast: number | string | null;
  hs_percent: number | string | null;
  rating: number | string | null;
  rounds_played: number | null;
}

export interface OverviewMatchRow {
  id: string;
  map: string | null;
  played_at: string | null;
  match_date: string | null;
  created_at: string;
  result: "win" | "loss" | "draw" | null;
  score_player: number | null;
  score_opponent: number | null;
  data_source: string | null;
}

export interface OverviewMatch {
  matchId: string;
  map: string | null;
  playedAt: string;
  result: "win" | "loss" | "draw" | null;
  scorePlayer: number | null;
  scoreOpponent: number | null;
  source: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  adr: number | null;
  kast: number | null;
  hsPercent: number | null;
  rating: number | null;
}

export interface OverviewAggregates {
  matches: number;
  /** Matches that carry each value; an average never includes a missing value. */
  kd: number | null;
  adr: number | null;
  kast: number | null;
  hsPercent: number | null;
  rating: number | null;
  wins: number;
  decided: number;
}

export interface PlayerOverview {
  state: OverviewState;
  generatedAt: string;
  counts: Record<
    "total" | "inFlight" | "processed" | "failed" | "blocked" | "cancelled" | "identityPending",
    number
  >;
  latestJobs: OverviewJob[];
  matches: OverviewMatch[];
  aggregates: OverviewAggregates | null;
}

const JOB_STATUSES: readonly JobStatus[] = [
  "pending",
  "processing",
  "processed",
  "failed",
  "cancel_requested",
  "cancelled",
  "blocked_raw_audit",
];

const CONFIRMED = new Set(["user_confirmed", "manual_selected"]);

export function jobStatus(value: string): JobStatus | null {
  return (JOB_STATUSES as readonly string[]).includes(value) ? (value as JobStatus) : null;
}

/** Identity of the player in a processed demo; only processed jobs can have one. */
export function jobIdentity(
  row: Pick<OverviewJobRow, "status" | "attachment_state" | "attachment_confirmation_status">,
): JobIdentity {
  if (row.status !== "processed") return "NOT_APPLICABLE";
  if (row.attachment_state === "conflict") return "CONFLICT";
  if (row.attachment_state !== "attached") return "UNATTACHED";
  return CONFIRMED.has(row.attachment_confirmation_status ?? "") ? "CONFIRMED" : "PENDING";
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

export function aggregate(matches: OverviewMatch[]): OverviewAggregates | null {
  if (!matches.length) return null;
  const withKd = matches.filter((m) => m.kills !== null && m.deaths !== null);
  const kills = withKd.reduce((sum, m) => sum + (m.kills ?? 0), 0);
  const deaths = withKd.reduce((sum, m) => sum + (m.deaths ?? 0), 0);
  const decided = matches.filter((m) => m.result === "win" || m.result === "loss");
  return {
    matches: matches.length,
    kd: withKd.length && deaths > 0 ? kills / deaths : null,
    adr: mean(matches.map((m) => m.adr)),
    kast: mean(matches.map((m) => m.kast)),
    hsPercent: mean(matches.map((m) => m.hsPercent)),
    rating: mean(matches.map((m) => m.rating)),
    wins: matches.filter((m) => m.result === "win").length,
    decided: decided.length,
  };
}

/**
 * One real match per `match_metrics` row the player owns, joined with its
 * canonical match. A metric row whose match is not readable is dropped, never
 * shown with invented context.
 */
export function shapeMatches(
  metrics: OverviewMetricRow[],
  matches: OverviewMatchRow[],
): OverviewMatch[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  return metrics
    .flatMap((row) => {
      const match = byId.get(row.match_id);
      if (!match) return [];
      return [
        {
          matchId: match.id,
          map: match.map,
          playedAt: match.played_at ?? match.match_date ?? match.created_at,
          result: match.result,
          scorePlayer: match.score_player,
          scoreOpponent: match.score_opponent,
          source: match.data_source,
          kills: row.kills,
          deaths: row.deaths,
          assists: row.assists,
          adr: num(row.adr),
          kast: num(row.kast),
          hsPercent: num(row.hs_percent),
          rating: num(row.rating),
        },
      ];
    })
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

export function shapeJobs(rows: OverviewJobRow[], fileNames: Map<string, string>): OverviewJob[] {
  return rows.flatMap((row) => {
    const status = jobStatus(row.status);
    if (!status) return [];
    return [
      {
        jobId: row.id,
        uploadId: row.upload_id,
        fileName: fileNames.get(row.upload_id) ?? null,
        status,
        queuedAt: row.queued_at,
        finishedAt: row.finished_at,
        errorCode: row.error_code,
        identity: jobIdentity(row),
      },
    ];
  });
}

export function countJobs(jobs: OverviewJob[]): PlayerOverview["counts"] {
  const by = (predicate: (job: OverviewJob) => boolean) => jobs.filter(predicate).length;
  return {
    total: jobs.length,
    inFlight: by(
      (j) => j.status === "pending" || j.status === "processing" || j.status === "cancel_requested",
    ),
    processed: by((j) => j.status === "processed"),
    failed: by((j) => j.status === "failed"),
    blocked: by((j) => j.status === "blocked_raw_audit"),
    cancelled: by((j) => j.status === "cancelled"),
    identityPending: by(
      (j) => j.identity === "PENDING" || j.identity === "UNATTACHED" || j.identity === "CONFLICT",
    ),
  };
}

/**
 * READY needs at least one real match with the player's metrics. Otherwise the
 * most actionable truthful state wins: work in flight, then an identity the
 * player must confirm, then demos stopped by the RAW audit, then failures.
 */
export function deriveState(counts: PlayerOverview["counts"], matches: number): OverviewState {
  if (matches > 0) return "READY";
  if (counts.inFlight > 0) return "PROCESSING";
  if (counts.identityPending > 0) return "IDENTITY_PENDING";
  if (counts.blocked > 0) return "BLOCKED";
  if (counts.failed > 0) return "FAILED";
  return "EMPTY";
}

export function buildOverview(args: {
  jobs: OverviewJobRow[];
  fileNames: Map<string, string>;
  metrics: OverviewMetricRow[];
  matches: OverviewMatchRow[];
  now: Date;
}): PlayerOverview {
  const jobs = shapeJobs(args.jobs, args.fileNames);
  const matches = shapeMatches(args.metrics, args.matches);
  const counts = countJobs(jobs);
  return {
    state: deriveState(counts, matches.length),
    generatedAt: args.now.toISOString(),
    counts,
    latestJobs: jobs.slice(0, 10),
    matches,
    aggregates: aggregate(matches),
  };
}
