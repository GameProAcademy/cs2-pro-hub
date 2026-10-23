/**
 * Which identity action a demo job offers (shared by the panel and the server).
 *
 * Production defect (2026-10-21, Mirage job 921b55cf): the identity panel was rendered
 * only for `processed` jobs. A job that reached Canonical (match + detected players) and
 * then FAILED - here CANONICAL_PERSISTENCE_ERROR on the identity re-run, with its retry
 * budget spent - offered no way to select the player and try again, although the demo
 * file, the match and its players were all still there.
 *
 * D24 (2026-10-23, same job): a job analysed by an OLDER parser release can never be
 * re-run in place (its immutable RAW evidence pins the old parser). It is reprocessed as
 * a new attempt instead (`reprocess_current_parser`), or re-uploaded when its file expired.
 */
import {
  isPermanentError,
  PIPELINE_ERROR_CODES,
  type PipelineErrorCode,
} from "@/lib/pipeline/errors";

/** demo_jobs_retry_count_check: retry_count <= 10; an identity re-run needs one more. */
export const IDENTITY_RERUN_DISPATCH_BOUND = 10;

export type IdentityAction =
  /** Analysed: confirm or change the player (re-run only when a selection is made). */
  | "identity"
  /** Failed after analysis, demo file present: pick the player and start a new attempt. */
  | "select_and_retry"
  /** Analysed by an older parser, demo file present: start a new attempt with the current one. */
  | "reprocess_current_parser"
  /** Failed after analysis (or older parser), demo file expired: only a new upload helps. */
  | "reupload_required"
  | null;

export interface IdentityActionInput {
  status: string;
  errorCode: string | null;
  matchId: string | null;
  retryCount: number;
  demoAvailable: boolean;
  supersededByJobId?: string | null;
  /** False when the job's evidence comes from a parser other than the pinned one (D24). */
  parserCurrent?: boolean;
}

/**
 * Errors that are permanent for THIS attempt only because its RAW evidence pins an older
 * parser; a new attempt with the current parser is the remedy (D24).
 */
const PARSER_UPGRADE_RECOVERABLE = new Set<string>(["PARSER_INVALID_RESPONSE"]);

function permanent(code: string | null): boolean {
  if (!code) return false;
  return (
    PIPELINE_ERROR_CODES.includes(code as PipelineErrorCode) &&
    isPermanentError(code as PipelineErrorCode)
  );
}

export function identityActionFor(job: IdentityActionInput): IdentityAction {
  // A newer job already replaced this one; act there.
  if (job.supersededByJobId) return null;
  if (job.parserCurrent === false && (job.status === "processed" || job.status === "failed")) {
    if (job.status === "failed") {
      if (!job.matchId) return null;
      if (permanent(job.errorCode) && !PARSER_UPGRADE_RECOVERABLE.has(job.errorCode ?? "")) {
        return null;
      }
    }
    return job.demoAvailable ? "reprocess_current_parser" : "reupload_required";
  }
  if (job.status === "processed") return "identity";
  if (job.status !== "failed") return null;
  // No Canonical match: the parser never produced detected players to choose from.
  if (!job.matchId) return null;
  // A permanent refusal (e.g. quarantined content) fails again whatever player is chosen.
  if (permanent(job.errorCode)) return null;
  if (!job.demoAvailable) return "reupload_required";
  if (job.retryCount >= IDENTITY_RERUN_DISPATCH_BOUND) return null;
  return "select_and_retry";
}
