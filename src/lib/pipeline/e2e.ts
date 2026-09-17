/**
 * FASE 2.7.2 — GATE 02-B — REAL `.dem` END-TO-END VERDICT (pure logic).
 *
 * This module contains NO transport and NO database access: it only turns real,
 * already-collected observations into a verdict. Keeping it pure is what makes
 * the gate auditable — the rules cannot be softened by a mocked boundary.
 *
 * Verdict semantics (strict, never optimistic):
 *   BLOCKED — the run could not be trusted (worker down / identity mismatch).
 *             It is NOT a pass and NOT a failure of the pipeline logic.
 *   FAIL    — the run happened and the observed evidence contradicts the
 *             expectation.
 *   PASS    — the run happened and every required piece of real evidence exists.
 */
import { isPermanentError, PIPELINE_ERROR_CODES, type PipelineErrorCode } from "./errors";

export type E2EExpectation = "positive" | "negative";
export type E2EVerdict = "PASS" | "FAIL" | "BLOCKED";

/**
 * FASE 2.7.2A — the projection dimension of the verdict. The canonical match is
 * source-neutral, so a run without a proven Steam link is NOT a failure: it is a
 * canonical PASS with the projection reported as NOT_ATTACHED.
 */
export type E2EProjectionVerdict = "ATTACHED" | "NOT_ATTACHED";

/** Canonical + projection evidence read back from the database after a run. */
export interface E2EEvidence {
  /** Canonical match ids reached through `match_sources` for this demo. */
  matchIds: string[];
  matchSourceCount: number;
  sourceFingerprints: string[];
  sourceUploadIds: string[];
  participants: number;
  rounds: number;
  roundPlayers: number;
  events: number;
  metrics: number;
  features: number;
  metricIds: string[];
  featureIds: string[];
  projectedPlayerIds: string[];
}

export interface E2EJobState {
  status: "pending" | "processing" | "processed" | "failed";
  errorCode: string | null;
  matchId: string | null;
  roundsValid: number | null;
  playersDetected: number | null;
  parserName: string | null;
  parserVersion: string | null;
  parserRevision: string | null;
  /** Player-attachment state recorded by the job itself. */
  attachmentState?: "attached" | "unattached" | null | undefined;
  attachmentReason?: string | null | undefined;
}

export interface E2EEvaluation {
  verdict: E2EVerdict;
  reasons: string[];
  /** Present on a positive run: the projection dimension of the result. */
  projection?: E2EProjectionVerdict;
  projectionReason?: string | null;
}

export const EMPTY_EVIDENCE: E2EEvidence = {
  matchIds: [],
  matchSourceCount: 0,
  sourceFingerprints: [],
  sourceUploadIds: [],
  participants: 0,
  rounds: 0,
  roundPlayers: 0,
  events: 0,
  metrics: 0,
  features: 0,
  metricIds: [],
  featureIds: [],
  projectedPlayerIds: [],
};

function isPermanentCode(code: string | null): boolean {
  if (!code) return false;
  const candidate = code as PipelineErrorCode;
  return PIPELINE_ERROR_CODES.includes(candidate) && isPermanentError(candidate);
}

/** True when the demo produced no canonical fact at all. */
export function hasNoCanonicalWrite(evidence: E2EEvidence): boolean {
  return (
    evidence.matchIds.length === 0 &&
    evidence.matchSourceCount === 0 &&
    evidence.sourceFingerprints.length === 0 &&
    evidence.sourceUploadIds.length === 0 &&
    evidence.participants === 0 &&
    evidence.rounds === 0 &&
    evidence.roundPlayers === 0 &&
    evidence.events === 0 &&
    evidence.metrics === 0 &&
    evidence.features === 0 &&
    evidence.metricIds.length === 0 &&
    evidence.featureIds.length === 0 &&
    evidence.projectedPlayerIds.length === 0
  );
}

/**
 * Evaluates ONE real run.
 *
 * `workerReady` is the outcome of the same `/health` + `/version` identity
 * assertion the parse path enforces; when it is false nothing about the pipeline
 * has been proven, so the gate is BLOCKED rather than failed.
 */
export function evaluateE2ERun(args: {
  expectation: E2EExpectation;
  workerReady: boolean;
  workerError: string | null;
  job: E2EJobState;
  evidence: E2EEvidence;
}): E2EEvaluation {
  const { expectation, workerReady, workerError, job, evidence } = args;
  const reasons: string[] = [];

  if (!workerReady) {
    reasons.push(`parser worker preflight failed: ${workerError ?? "unavailable"}`);
    return { verdict: "BLOCKED", reasons };
  }

  if (job.status === "pending" || job.status === "processing") {
    reasons.push(`job did not reach a terminal state (status=${job.status})`);
    return { verdict: "BLOCKED", reasons };
  }

  if (expectation === "negative") {
    if (job.status !== "failed") reasons.push("an invalid demo must fail the job");
    if (!isPermanentCode(job.errorCode)) {
      reasons.push(`error code must be permanent, got ${job.errorCode ?? "none"}`);
    }
    if (!hasNoCanonicalWrite(evidence)) {
      reasons.push("an invalid demo must not write any canonical or projection row");
    }
    return { verdict: reasons.length === 0 ? "PASS" : "FAIL", reasons };
  }

  if (job.status !== "processed") {
    reasons.push(`job failed with ${job.errorCode ?? "unknown error"}`);
    return { verdict: "FAIL", reasons, projection: "NOT_ATTACHED" };
  }

  // CANONICAL — mandatory for PASS, independent of any player link.
  if (evidence.matchIds.length !== 1) {
    reasons.push(`expected exactly 1 canonical match, found ${evidence.matchIds.length}`);
  }
  if (!job.matchId) reasons.push("job carries no canonical match id");
  if (evidence.participants <= 0) reasons.push("no canonical participants persisted");
  if (evidence.rounds <= 0) reasons.push("no canonical rounds persisted");
  if (evidence.roundPlayers <= 0) reasons.push("no canonical round players persisted");
  if (evidence.events <= 0) reasons.push("no canonical round events persisted");
  if (!job.parserRevision) reasons.push("job did not record the parser revision");

  // PLAYER PROJECTION — conditional. Required only when the executor's Steam ID
  // was proven inside the demo; otherwise its absence is the expected outcome.
  const attached = job.attachmentState === "attached";
  if (attached) {
    if (evidence.metrics !== 1) reasons.push(`expected 1 metrics row, found ${evidence.metrics}`);
    if (evidence.features !== 1) {
      reasons.push(`expected 1 features row, found ${evidence.features}`);
    }
  } else {
    if (evidence.metrics !== 0) {
      reasons.push(`unattached run must not write metrics, found ${evidence.metrics}`);
    }
    if (evidence.features !== 0) {
      reasons.push(`unattached run must not write features, found ${evidence.features}`);
    }
    if (!job.attachmentReason) {
      reasons.push("unattached run must record why the player was not attached");
    }
  }

  return {
    verdict: reasons.length === 0 ? "PASS" : "FAIL",
    reasons,
    projection: attached ? "ATTACHED" : "NOT_ATTACHED",
    projectionReason: attached ? null : (job.attachmentReason ?? null),
  };
}

/**
 * Idempotency: reprocessing the SAME bytes must converge on the same canonical
 * match and must not multiply any row. A second run is compared against the
 * first one's evidence.
 */
export function evaluateIdempotency(first: E2EEvidence, second: E2EEvidence): E2EEvaluation {
  const reasons: string[] = [];
  const sameMatches =
    first.matchIds.length === second.matchIds.length &&
    [...first.matchIds].sort().join(",") === [...second.matchIds].sort().join(",");

  if (!sameMatches) reasons.push("the second run resolved a different canonical match");
  const sameValues = (left: string[], right: string[]) =>
    [...left].sort().join(",") === [...right].sort().join(",");
  for (const [label, left, right] of [
    ["source fingerprints", first.sourceFingerprints, second.sourceFingerprints],
    ["source upload identities", first.sourceUploadIds, second.sourceUploadIds],
    ["metrics identities", first.metricIds, second.metricIds],
    ["features identities", first.featureIds, second.featureIds],
    ["projected player identities", first.projectedPlayerIds, second.projectedPlayerIds],
  ] as const) {
    if (!sameValues(left, right)) reasons.push(`${label} changed between runs`);
  }
  const keys: (keyof E2EEvidence)[] = [
    "matchSourceCount",
    "participants",
    "rounds",
    "roundPlayers",
    "events",
    "metrics",
    "features",
  ];
  for (const key of keys) {
    if (first[key] !== second[key]) {
      reasons.push(`${key} changed from ${String(first[key])} to ${String(second[key])}`);
    }
  }
  return { verdict: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}
