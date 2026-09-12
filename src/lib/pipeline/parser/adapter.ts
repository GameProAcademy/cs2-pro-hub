/**
 * Parser abstraction.
 *
 * NOTHING in the application calls demoparser2 (or any parser library)
 * directly. Everything goes through `DemoParserAdapter`, so the parser can be
 * replaced or upgraded without touching the normalizer, metrics, features,
 * persistence or UI layers.
 */
import { PARSER_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import type { RawParserOutput } from "@/lib/pipeline/types";
import { assertRawDemoEvidence } from "@/lib/pipeline/rawEvidence";

import {
  assertParserIdentity,
  classifyWorkerFailure,
  type ExpectedParserIdentity,
} from "./parserEndpoint";

export interface ParseRequest {
  /** Storage path of the demo inside the private demos bucket. */
  storagePath: string;
  /** Short-lived signed URL the parser worker can download from. */
  signedUrl: string;
  uploadId: string;
  fileSize: number;
  demoSha256: string | null;
  /**
   * FASE 2.7 — REAL DEADLINE. Absolute epoch-ms budget for the whole job. The
   * transport never waits past it, so a slow worker cannot hold the job (and the
   * concurrency slot) beyond the configured ceiling.
   */
  deadlineAt?: number;
}

export interface DemoParserAdapter {
  readonly id: string;
  /** True when the adapter can actually run in the current deployment. */
  isAvailable(): boolean;
  parseDemo(request: ParseRequest): Promise<RawParserOutput>;
}

/**
 * FASE 2.7.2 — DEPLOYED WORKER REVISION.
 *
 * This is deliberately an immutable code-level fallback for the production
 * lock. The Railway deployment currently serving the APP reports this exact
 * Git commit. An environment variable may override it when a new worker is
 * promoted, but an absent env can NEVER silently unpin production back to
 * "any 0.42.x" worker.
 */
export const DEPLOYED_WORKER_REVISION = "git:790eaed77eb8cbed8efaa98e1a4f5f0ac33a8bdd";

/**
 * Expected parser identity. Environment overrides remain supported for future
 * promotions, while the deployed revision above is the safe production default.
 */
export function expectedParserIdentity(): {
  name: string;
  version: string;
  revision: string | null;
} {
  const env = typeof process === "undefined" ? undefined : process.env;
  return {
    name: env?.["DEMO_PARSER_EXPECTED_NAME"] || PARSER_NAME,
    version: env?.["DEMO_PARSER_EXPECTED_VERSION"] || PARSER_VERSION,
    revision: env?.["DEMO_PARSER_EXPECTED_REVISION"] || DEPLOYED_WORKER_REVISION,
  };
}

/**
 * FASE 2.7.2 — GATE 1E.1 — IS THE REVISION LOCK MANDATORY?
 *
 * Production locks the exact worker build by default: without a pinned revision
 * a redeploy could silently change the parser under a player's analysis. A
 * development/test environment may run unpinned, and `DEMO_PARSER_REVISION_REQUIRED`
 * makes the decision explicit either way.
 */
export function isParserRevisionRequired(): boolean {
  const env = typeof process === "undefined" ? undefined : process.env;
  const explicit = (env?.["DEMO_PARSER_REVISION_REQUIRED"] ?? "").trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  return (env?.["NODE_ENV"] ?? "") === "production";
}

/** The full expectation used by the revision lock (identity + contract). */
export function expectedParserContract(): ExpectedParserIdentity {
  const identity = expectedParserIdentity();
  return {
    ...identity,
    revisionRequired: isParserRevisionRequired(),
    contractVersion: PARSER_CONTRACT_VERSION,
  };
}

/** Validates the worker response against the raw contract before normalising. */
export function assertRawParserOutput(value: unknown): RawParserOutput {
  if (!value || typeof value !== "object")
    throw new PipelineError("PARSER_INVALID_RESPONSE", "empty response");
  const raw = value as Partial<RawParserOutput>;

  // GATE 1E — APP CONTRACT VERSION == WORKER CONTRACT VERSION. No downgrade,
  // no fallback, no attempt to interpret an unknown payload.
  if (raw.contract_version !== PARSER_CONTRACT_VERSION) {
    throw new PipelineError(
      "PARSER_CONTRACT_MISMATCH",
      `expected ${PARSER_CONTRACT_VERSION}, got ${String(raw.contract_version)}`,
    );
  }
  if (!raw.parser?.name || !raw.parser?.version) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "missing parser identity");
  }
  // GATE 1E.1 — ONE exact revision lock for both /version and the parse
  // response. The APP never accepts a merely compatible major/minor version.
  assertParserIdentity(
    {
      name: raw.parser.name,
      version: raw.parser.version,
      revision:
        typeof raw.parser.revision === "string" && raw.parser.revision.trim().length > 0
          ? raw.parser.revision.trim()
          : null,
    },
    expectedParserContract(),
  );
  if (!raw.header || typeof raw.header !== "object") {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "missing header");
  }
  if (!Array.isArray(raw.players) || !Array.isArray(raw.rounds) || !Array.isArray(raw.events)) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "missing players/rounds/events");
  }
  if (raw.warnings != null && !Array.isArray(raw.warnings)) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "warnings must be an array when present");
  }
  // Contract v1 predates RAW-EVIDENCE-01, so synthetic/legacy callers may omit
  // the envelope. The real ingestion boundary below fails closed when it is
  // absent; when supplied here, it is always structurally validated.
  if (raw.raw_evidence) {
    try {
      assertRawDemoEvidence(raw.raw_evidence);
    } catch (error) {
      throw new PipelineError(
        "PARSER_INVALID_RESPONSE",
        error instanceof Error ? error.message : "invalid raw evidence",
      );
    }
  }
  return raw as RawParserOutput;
}

/**
 * Maps a parser-worker error identifier onto the pipeline error taxonomy.
 *
 * GATE 1E — ONE matrix only: this delegates to `classifyWorkerFailure`, which is
 * the single source of truth for status + `error_code` classification. Unknown
 * identifiers stay (transient) parser errors.
 */
export function mapParserErrorCode(code: unknown): PipelineError {
  return classifyWorkerFailure(500, { error_code: typeof code === "string" ? code : String(code) });
}
