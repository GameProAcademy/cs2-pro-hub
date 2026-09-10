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

import { classifyWorkerFailure } from "./parserEndpoint";

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
 * FASE 2.7.1 — EXPECTED PARSER IDENTITY IS CONFIGURATION, NOT A CONSTANT.
 *
 * The pinned values in `src/config/pipeline.ts` are the defaults. The expectation
 * remains settable per deployment WITHOUT a code change:
 *   DEMO_PARSER_EXPECTED_NAME
 *   DEMO_PARSER_EXPECTED_VERSION
 *   DEMO_PARSER_EXPECTED_REVISION  (optional; when set, the worker must match it)
 * Read inside the function: env injection happens at call time, never at import.
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
    revision: env?.["DEMO_PARSER_EXPECTED_REVISION"] || null,
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
  const expected = expectedParserIdentity();
  // An incompatible worker is rejected explicitly instead of being accepted
  // silently. NOTE: major/minor compatibility does NOT guarantee CS2 demo
  // compatibility — only the FASE 2.7.2 compatibility matrix can establish that.
  if (raw.parser.name !== expected.name) {
    throw new PipelineError("UNSUPPORTED_DEMO", `parser name mismatch: ${raw.parser.name}`);
  }
  if (majorMinor(raw.parser.version) !== majorMinor(expected.version)) {
    throw new PipelineError(
      "PARSER_ERROR",
      `parser version mismatch: got ${raw.parser.version}, expected ${expected.version}`,
    );
  }
  if (expected.revision != null && (raw.parser.revision ?? null) !== expected.revision) {
    throw new PipelineError(
      "PARSER_ERROR",
      `parser revision mismatch: got ${String(raw.parser.revision)}, expected ${expected.revision}`,
    );
  }
  if (!raw.header || typeof raw.header !== "object") {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "missing header");
  }
  if (!Array.isArray(raw.players) || !Array.isArray(raw.rounds) || !Array.isArray(raw.events)) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "missing players/rounds/events");
  }
  if (raw.warnings != null && !Array.isArray(raw.warnings)) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "warnings must be an array when present");
  }
  return raw as RawParserOutput;
}

/** `0.42.0` -> `0.42`: patch releases of the pinned parser stay compatible. */
function majorMinor(version: string): string {
  return version.split(".").slice(0, 2).join(".");
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
