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

export interface ParseRequest {
  /** Storage path of the demo inside the private demos bucket. */
  storagePath: string;
  /** Short-lived signed URL the parser worker can download from. */
  signedUrl: string;
  uploadId: string;
  fileSize: number;
  demoSha256: string | null;
}

export interface DemoParserAdapter {
  readonly id: string;
  /** True when the adapter can actually run in the current deployment. */
  isAvailable(): boolean;
  parseDemo(request: ParseRequest): Promise<RawParserOutput>;
}

/** Validates the worker response against the raw contract before normalising. */
export function assertRawParserOutput(value: unknown): RawParserOutput {
  if (!value || typeof value !== "object")
    throw new PipelineError("PARSER_ERROR", "empty response");
  const raw = value as Partial<RawParserOutput>;

  if (raw.contract_version !== PARSER_CONTRACT_VERSION) {
    throw new PipelineError("PARSER_ERROR", `contract mismatch: ${String(raw.contract_version)}`);
  }
  if (!raw.parser?.name || !raw.parser?.version) {
    throw new PipelineError("PARSER_ERROR", "missing parser identity");
  }
  // The parser identity is pinned in configuration. An incompatible worker is
  // rejected explicitly instead of being accepted silently; the version is only
  // bumped deliberately in `src/config/pipeline.ts`.
  if (raw.parser.name !== PARSER_NAME) {
    throw new PipelineError("UNSUPPORTED_DEMO", `parser name mismatch: ${raw.parser.name}`);
  }
  if (majorMinor(raw.parser.version) !== majorMinor(PARSER_VERSION)) {
    throw new PipelineError(
      "PARSER_ERROR",
      `parser version mismatch: got ${raw.parser.version}, expected ${PARSER_VERSION}`,
    );
  }
  if (!Array.isArray(raw.players) || !Array.isArray(raw.rounds) || !Array.isArray(raw.events)) {
    throw new PipelineError("PARSER_ERROR", "missing players/rounds/events");
  }
  return raw as RawParserOutput;
}

/** `0.31.4` -> `0.31`: patch releases of the pinned parser stay compatible. */
function majorMinor(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

/**
 * Maps a parser-worker error identifier onto the pipeline error taxonomy.
 * Unknown identifiers are treated as (transient) parser errors.
 */
export function mapParserErrorCode(code: unknown): PipelineError {
  switch (String(code)) {
    case "CORRUPTED_DEMO":
      return new PipelineError("CORRUPTED_DEMO");
    case "INVALID_DEMO_FORMAT":
      return new PipelineError("INVALID_DEMO_FORMAT");
    case "UNSUPPORTED_DEMO":
      return new PipelineError("UNSUPPORTED_DEMO");
    case "TIMEOUT":
      return new PipelineError("PARSER_TIMEOUT");
    default:
      return new PipelineError("PARSER_ERROR", String(code));
  }
}
