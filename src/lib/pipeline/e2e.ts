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

/** Canonical + projection evidence read back from the database after a run. */
export interface E2EEvidence {
  /** Canonical match ids reached through `match_sources` for this demo. */
  matchIds: string[];
  matchSourceCount: number;
  participants: number;
  rounds: number;
  roundPlayers: number;
  events: number;
  metrics: number;
  features: number;
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
}

export interface E2EEvaluation {
  verdict: E2EVerdict;
  reasons: string[];
}

export const EMPTY_EVIDENCE: E2EEvidence = {
  matchIds: [],
  matchSourceCount: 0,
  participants: 0,
  rounds: 0,
  roundPlayers: 0,
  events: 0,
  metrics: 0,
  features: 0,
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
    evidence.participants === 0 &&
    evidence.rounds === 0 &&
    evidence.roundPlayers === 0 &&
    evidence.events === 0 &&
    evidence.metrics === 0 &&
    evidence.features === 0
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
    return { verdict: "FAIL", reasons };
  }
  if (evidence.matchIds.length !== 1) {
    reasons.push(`expected exactly 1 canonical match, found ${evidence.matchIds.length}`);
  }
  if (!job.matchId) reasons.push("job carries no canonical match id");
  if (evidence.participants <= 0) reasons.push("no canonical participants persisted");
  if (evidence.rounds <= 0) reasons.push("no canonical rounds persisted");
  if (evidence.events <= 0) reasons.push("no canonical round events persisted");
  if (evidence.metrics !== 1) reasons.push(`expected 1 metrics row, found ${evidence.metrics}`);
  if (evidence.features !== 1) reasons.push(`expected 1 features row, found ${evidence.features}`);
  if (!job.parserRevision) reasons.push("job did not record the parser revision");

  return { verdict: reasons.length === 0 ? "PASS" : "FAIL", reasons };
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
