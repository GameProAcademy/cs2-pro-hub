/**
 * Demo guidance — ONE classifier for what a player sees about a job and what to do next.
 *
 * Consumed by the upload modal, the history card and the problem report, so they can never
 * disagree. It reads only the job row the server returned (status, stage, error code, retry
 * budget, identity action) and the existing rules:
 *   - permanence of an error code: `isPermanentError` (errors.ts);
 *   - recovery action of an analysed job: `identityActionFor` (identityRecovery.ts);
 *   - retry availability: exactly the card's existing retry-button condition.
 * It never starts anything: actions are executed by the existing server functions, which
 * validate everything again.
 */
import {
  PIPELINE_ERROR_CODES,
  isPermanentError,
  type PipelineErrorCode,
} from "@/lib/pipeline/errors";
import { identityActionFor, type IdentityAction } from "@/lib/pipeline/identityRecovery";

export type GuidanceCategory =
  | "processing" // queued or running normally
  | "completed"
  | "partial" // completed with declared limitations
  | "identity_pending" // the match was read; the player must be confirmed/chosen
  | "invalid_file" // the file cannot be read (corrupted, empty, too small)
  | "incompatible_format" // not a .dem / outside accepted size
  | "insufficient_sample" // valid demo, too few usable rounds
  | "match_not_finished" // PM6 C: no verified official end (interrupted, truncated, inconsistent)
  | "match_insufficient_rounds" // PM6 C: fewer valid played rounds than the contract minimum
  | "match_player_coverage" // PM6 C: the demo does not identify the players well enough
  | "temporary_failure" // transient failure on our side; retry when allowed
  | "service_issue" // configuration/contract failure on our side: retrying cannot help
  | "raw_audit_review" // RAW evidence did not pass the audit gates
  | "canonical_review" // RAW→Canonical validation could not complete
  | "quarantined" // content belongs to a quarantined match
  | "older_parser" // analysed by an older parser: reprocess (existing action)
  | "file_expired" // stored file expired: upload again (existing action)
  | "cancelled"
  | "internal_error" // unexpected failure
  | "unknown"; // a status this client does not know: never success

export type GuidanceSeverity = "info" | "success" | "attention" | "review" | "error";

export type GuidanceAction =
  | "none"
  | "wait"
  | "retry"
  | "choose_another_demo"
  | "select_player"
  | "reprocess"
  | "reupload"
  | "report";

export interface DemoGuidance {
  category: GuidanceCategory;
  severity: GuidanceSeverity;
  /** The main thing to do now (one button). */
  recommendedAction: GuidanceAction;
  /** Retry is shown only when the existing server rule allows it for THIS job. */
  retryAllowed: boolean;
  /** The problem needs the team; the player can report it. */
  requiresSupport: boolean;
  /** The player must act for the analysis to finish. */
  requiresUserAction: boolean;
  /** Something can still lead to a finished analysis (by waiting, retrying or acting). */
  isRecoverable: boolean;
  /** Sending this same demo again would not help. */
  resendSameDemoUseless: boolean;
  /** Safe reference for support: error code and stage only, never a message from the DB. */
  technicalReference: { status: string; stage: string | null; errorCode: string | null };
}

export interface GuidanceJob {
  status: string;
  stage: string;
  errorCode: string | null;
  retryCount: number;
  maxRetries: number;
  matchId: string | null;
  demoAvailable: boolean;
  parserCurrent: boolean;
  supersededByJobId: string | null;
  partialParse?: boolean;
  attachmentState?: string;
  attachmentConfirmationStatus?: string | undefined;
  /** PM6 C: `demo_jobs.match_integrity.status` (a controlled code, never a DB message). */
  matchIntegrityStatus?: string | null | undefined;
}

const MATCH_NOT_FINISHED = new Set<string>([
  "MATCH_END_UNVERIFIED",
  "MATCH_FINAL_ROUND_INCOMPLETE",
  "MATCH_DEMO_TRUNCATED",
  "MATCH_LIFECYCLE_INCONSISTENT",
]);

const INVALID_FILE = new Set<string>([
  "CORRUPTED_DEMO",
  "DEMO_EMPTY",
  "DEMO_TOO_SMALL",
  "UNSUPPORTED_DEMO",
]);
const INCOMPATIBLE = new Set<string>(["INVALID_DEMO_FORMAT", "DEMO_TOO_LARGE"]);
const SERVICE = new Set<string>([
  "PARSER_CONFIG_ERROR",
  "PARSER_UNAUTHORIZED",
  "PARSER_FORBIDDEN",
  "PARSER_CONTRACT_MISMATCH",
  "PARSER_INVALID_RESPONSE",
  "PARSER_HASH_MISMATCH",
  "PARSER_FILE_SIZE_MISMATCH",
  "PARSER_IDENTITY_MISMATCH",
  "PARSER_PAYLOAD_TOO_LARGE",
  "RESOURCE_LIMIT",
]);
const CANONICAL_REVIEW = new Set<string>([
  "CANONICAL_RESOLUTION_CONFLICT",
  "VALIDATION_ERROR",
  "PLAYER_IDENTITY_UNRESOLVED",
]);

function knownCode(code: string | null): PipelineErrorCode | null {
  return code && PIPELINE_ERROR_CODES.includes(code as PipelineErrorCode)
    ? (code as PipelineErrorCode)
    : null;
}

/** The card's existing retry-button rule (DemoIngestPanel), expressed once. */
export function retryAllowedFor(job: GuidanceJob, action: IdentityAction): boolean {
  const code = knownCode(job.errorCode);
  return (
    job.status === "failed" &&
    action !== "select_and_retry" &&
    job.parserCurrent !== false &&
    !(code !== null && isPermanentError(code)) &&
    job.retryCount < job.maxRetries
  );
}

const CONFIRMED = new Set(["user_confirmed", "manual_selected"]);

function build(
  job: GuidanceJob,
  category: GuidanceCategory,
  severity: GuidanceSeverity,
  recommendedAction: GuidanceAction,
  flags: Partial<
    Pick<
      DemoGuidance,
      | "retryAllowed"
      | "requiresSupport"
      | "requiresUserAction"
      | "isRecoverable"
      | "resendSameDemoUseless"
    >
  > = {},
): DemoGuidance {
  return {
    category,
    severity,
    recommendedAction,
    retryAllowed: flags.retryAllowed ?? false,
    requiresSupport: flags.requiresSupport ?? false,
    requiresUserAction: flags.requiresUserAction ?? false,
    isRecoverable: flags.isRecoverable ?? false,
    resendSameDemoUseless: flags.resendSameDemoUseless ?? false,
    technicalReference: {
      status: job.status,
      stage: job.stage || null,
      errorCode: job.errorCode,
    },
  };
}

/** PM6 C: a RAW-audit block decided by cs2.match-integrity.v1 gets its own, actionable copy. */
function integrityGuidance(job: GuidanceJob): DemoGuidance | null {
  const integrity = job.matchIntegrityStatus ?? null;
  if (!integrity) return null;
  if (MATCH_NOT_FINISHED.has(integrity))
    return build(job, "match_not_finished", "attention", "choose_another_demo", {
      resendSameDemoUseless: true,
    });
  if (integrity === "MATCH_INSUFFICIENT_ROUNDS")
    return build(job, "match_insufficient_rounds", "attention", "choose_another_demo", {
      resendSameDemoUseless: true,
    });
  if (integrity === "MATCH_PLAYER_COVERAGE_INSUFFICIENT")
    return build(job, "match_player_coverage", "attention", "choose_another_demo", {
      resendSameDemoUseless: true,
    });
  if (integrity === "MATCH_DEMO_CORRUPTED")
    return build(job, "invalid_file", "error", "choose_another_demo", {
      resendSameDemoUseless: true,
    });
  return null;
}

export function classifyDemoJob(job: GuidanceJob): DemoGuidance {
  const action = identityActionFor({
    status: job.status,
    errorCode: job.errorCode,
    matchId: job.matchId,
    retryCount: job.retryCount,
    demoAvailable: job.demoAvailable,
    supersededByJobId: job.supersededByJobId,
    parserCurrent: job.parserCurrent,
  });

  switch (job.status) {
    case "pending":
    case "processing":
    case "cancel_requested":
      return build(job, "processing", "info", "wait", {
        isRecoverable: true,
        resendSameDemoUseless: true,
      });
    case "cancelled":
      return build(job, "cancelled", "info", "none");
    case "blocked_raw_audit":
      return (
        integrityGuidance(job) ??
        build(job, "raw_audit_review", "review", "report", {
          requiresSupport: true,
          resendSameDemoUseless: true,
        })
      );
    case "processed": {
      if (action === "reprocess_current_parser")
        return build(job, "older_parser", "attention", "reprocess", {
          requiresUserAction: true,
          isRecoverable: true,
        });
      if (action === "reupload_required")
        return build(job, "file_expired", "attention", "reupload", {
          requiresUserAction: true,
          isRecoverable: true,
        });
      const confirmed =
        job.attachmentState === "attached" && CONFIRMED.has(job.attachmentConfirmationStatus ?? "");
      if (!confirmed)
        return build(job, "identity_pending", "attention", "select_player", {
          requiresUserAction: true,
          isRecoverable: true,
          resendSameDemoUseless: true,
        });
      return job.partialParse
        ? build(job, "partial", "success", "none")
        : build(job, "completed", "success", "none");
    }
    case "failed":
      break;
    default:
      return build(job, "unknown", "attention", "none", { resendSameDemoUseless: true });
  }

  // failed
  if (action === "select_and_retry")
    return build(job, "identity_pending", "attention", "select_player", {
      requiresUserAction: true,
      isRecoverable: true,
      resendSameDemoUseless: true,
    });
  if (action === "reprocess_current_parser")
    return build(job, "older_parser", "attention", "reprocess", {
      requiresUserAction: true,
      isRecoverable: true,
    });
  if (action === "reupload_required")
    return build(job, "file_expired", "attention", "reupload", {
      requiresUserAction: true,
      isRecoverable: true,
    });

  const code = job.errorCode ?? "";
  const retryAllowed = retryAllowedFor(job, action);
  if (INVALID_FILE.has(code))
    return build(job, "invalid_file", "error", "choose_another_demo", {
      resendSameDemoUseless: true,
    });
  if (INCOMPATIBLE.has(code))
    return build(job, "incompatible_format", "error", "choose_another_demo", {
      resendSameDemoUseless: true,
    });
  if (code === "DEMO_INSUFFICIENT_SAMPLE")
    return build(job, "insufficient_sample", "attention", "choose_another_demo", {
      resendSameDemoUseless: true,
    });
  const integrityGuide = code === "RAW_AUDIT_BLOCKED" ? integrityGuidance(job) : null;
  if (integrityGuide) return integrityGuide;
  if (code === "RAW_AUDIT_BLOCKED")
    return build(job, "raw_audit_review", "review", "report", {
      requiresSupport: true,
      resendSameDemoUseless: true,
    });
  if (code === "CANONICAL_MATCH_QUARANTINED")
    return build(job, "quarantined", "review", "report", {
      requiresSupport: true,
      resendSameDemoUseless: true,
    });
  if (CANONICAL_REVIEW.has(code))
    return build(job, "canonical_review", "review", "report", {
      requiresSupport: true,
      resendSameDemoUseless: true,
    });
  if (SERVICE.has(code))
    return build(job, "service_issue", "error", "report", {
      requiresSupport: true,
      resendSameDemoUseless: true,
    });

  const known = knownCode(code || null);
  if (known && !isPermanentError(known) && code !== "PROCESSING_ERROR") {
    // Transient on our side: retry when the existing rule allows it; otherwise the team.
    return retryAllowed
      ? build(job, "temporary_failure", "attention", "retry", {
          retryAllowed: true,
          isRecoverable: true,
          resendSameDemoUseless: true,
        })
      : build(job, "temporary_failure", "error", "report", {
          requiresSupport: true,
          resendSameDemoUseless: true,
        });
  }
  return build(job, "internal_error", "error", "report", {
    retryAllowed,
    requiresSupport: true,
    resendSameDemoUseless: true,
  });
}

/** Translation keys for a category (title, what happened, what to do). */
export function guidanceCopyKeys(category: GuidanceCategory): {
  title: string;
  body: string;
  todo: string;
} {
  return {
    title: `guidance.${category}.title`,
    body: `guidance.${category}.body`,
    todo: `guidance.${category}.todo`,
  };
}

/** Categories that explain a stopped job (failure, review or unknown state). */
export const STOPPED_GUIDANCE: ReadonlySet<GuidanceCategory> = new Set<GuidanceCategory>([
  "invalid_file",
  "incompatible_format",
  "insufficient_sample",
  "match_not_finished",
  "match_insufficient_rounds",
  "match_player_coverage",
  "temporary_failure",
  "service_issue",
  "raw_audit_review",
  "canonical_review",
  "quarantined",
  "internal_error",
  "unknown",
]);

/**
 * PR5 — jobs that wait for the player to identify themselves. A pending selection never
 * disappears: it is listed until the backend records the choice. Replaced attempts and jobs
 * of an older parser (they are reprocessed, not identified) are not counted.
 */
export function pendingIdentityJobs<T extends GuidanceJob & { jobId: string }>(jobs: T[]): T[] {
  return jobs.filter(
    (job) =>
      !job.supersededByJobId &&
      job.parserCurrent !== false &&
      classifyDemoJob(job).category === "identity_pending",
  );
}
