import { CLIENT_DEMO_MAX_BYTES, CLIENT_PARSER_BUILD_IDENTITY } from "./clientParser.types";
import type { DemoParserCapability } from "./clientParser.input";

export const LARGE_DEM_FEASIBILITY_STATES = [
  "NOT_RUN",
  "BLOCKED_BY_SIZE",
  "BLOCKED_BY_MEMORY",
  "UNAVAILABLE",
  "SUPPORTED_BY_MEASUREMENT",
  "SUPPORTED_WITH_LIMITS",
  "FAILED",
] as const;
export type LargeDemFeasibilityState = (typeof LARGE_DEM_FEASIBILITY_STATES)[number];

export const LARGE_DEM_EXPERIMENTAL_ENABLED =
  import.meta.env["VITE_CLIENT_DEM_LARGE_FILE_EXPERIMENTAL"] === "true";
export const LARGE_DEM_HASH_CHUNK_BYTES = 8 * 1024 * 1024;

export const LARGE_DEM_READINESS_STATES = [
  "SAFE",
  "CAUTION",
  "BLOCKED",
  "NOT_SUPPORTED",
  "NOT_RUN",
] as const;
export type LargeDemReadinessState = (typeof LARGE_DEM_READINESS_STATES)[number];

export interface LargeDemMemoryEstimate {
  evidenceClass: "HEURISTIC";
  fileSizeBytes: number;
  contiguousBufferBytes: number | null;
  wasmOverheadBytes: null;
  parserOverheadBytes: null;
  resultOverheadBytes: number;
  estimatedPeakBytes: number | null;
  confidence: "LOW";
}

export interface LargeDemReadiness {
  state: LargeDemReadinessState;
  reason:
    | "REAL_PARSER_DISABLED"
    | "EXPERIMENT_NOT_ENABLED"
    | "WORKER_OR_WASM_UNAVAILABLE"
    | "PARSER_CAPABILITY_UNKNOWN"
    | "PARSER_STREAMING_NOT_SUPPORTED"
    | "ABOVE_SAFE_INPUT_LIMIT"
    | "INVALID_FILE_SIZE"
    | "WITHIN_CONSERVATIVE_LIMIT";
  parserCapability: DemoParserCapability;
  memory: LargeDemMemoryEstimate;
  canHashChunked: boolean;
  canParse: boolean;
  evidenceClass: "CAPABILITY_HINT";
}

export function estimateLargeDemMemory(
  fileSizeBytes: number,
  capability: DemoParserCapability,
): LargeDemMemoryEstimate {
  const contiguousBufferBytes = capability.requiresContiguousBuffer ? fileSizeBytes : null;
  return {
    evidenceClass: "HEURISTIC",
    fileSizeBytes,
    contiguousBufferBytes,
    wasmOverheadBytes: null,
    parserOverheadBytes: null,
    resultOverheadBytes: 2 * 1024 * 1024,
    estimatedPeakBytes: null,
    confidence: "LOW",
  };
}

export function evaluateLargeDemFeasibility(
  metadata: LargeDemMetadata,
  parserCapability: DemoParserCapability,
  options: {
    workerAvailable: boolean;
    wasmAvailable: boolean;
    experimentalEnabled: boolean;
    realParserEnabled: boolean;
  },
): LargeDemReadiness {
  const memory = estimateLargeDemMemory(metadata.sizeBytes, parserCapability);
  const result = (
    state: LargeDemReadinessState,
    reason: LargeDemReadiness["reason"],
    canParse = false,
  ): LargeDemReadiness => ({
    state,
    reason,
    parserCapability,
    memory,
    canHashChunked: options.workerAvailable,
    canParse,
    evidenceClass: "CAPABILITY_HINT",
  });

  if (!options.realParserEnabled) return result("NOT_RUN", "REAL_PARSER_DISABLED");
  if (!options.workerAvailable || !options.wasmAvailable)
    return result("NOT_SUPPORTED", "WORKER_OR_WASM_UNAVAILABLE");
  if (parserCapability.inputCapability === "UNKNOWN")
    return result("NOT_SUPPORTED", "PARSER_CAPABILITY_UNKNOWN");
  if (!Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes < 1)
    return result("BLOCKED", "INVALID_FILE_SIZE");
  if (metadata.sizeBytes > CLIENT_DEMO_MAX_BYTES) {
    if (!options.experimentalEnabled) return result("BLOCKED", "EXPERIMENT_NOT_ENABLED");
    return result(
      parserCapability.requiresContiguousBuffer ? "NOT_SUPPORTED" : "BLOCKED",
      parserCapability.requiresContiguousBuffer
        ? "PARSER_STREAMING_NOT_SUPPORTED"
        : "ABOVE_SAFE_INPUT_LIMIT",
    );
  }
  return result("SAFE", "WITHIN_CONSERVATIVE_LIMIT", true);
}

export interface LargeDemMetadata {
  sizeBytes: number;
  name: string;
}

export interface LargeDemCapabilityHint {
  state: LargeDemFeasibilityState;
  experimentalEnabled: boolean;
  workerAvailable: boolean;
  wasmAvailable: boolean;
  memoryMeasurement: "AVAILABLE" | "MEMORY_UNAVAILABLE";
  crossOriginIsolated: boolean;
  parserInputStrategy: "WASM_INPUT_REQUIRES_CONTIGUOUS_BUFFER";
  parserBuildIdentity: typeof CLIENT_PARSER_BUILD_IDENTITY;
  fileSizeBytes: number;
  parserCeilingBytes: number;
  evidenceClass: "CAPABILITY_HINT";
}

export function preflightLargeDem(
  metadata: LargeDemMetadata,
  capabilities: {
    workerAvailable: boolean;
    wasmAvailable: boolean;
    memoryMeasurementAvailable: boolean;
    crossOriginIsolated: boolean;
  },
): LargeDemCapabilityHint {
  // Size is a deterministic capability boundary, not an execution result.
  // Report it even while the experimental parser gate is OFF so the UI/docs
  // do not conflate "not executed" with "unsupported by the current input path".
  const state: LargeDemFeasibilityState =
    !capabilities.workerAvailable || !capabilities.wasmAvailable
      ? "UNAVAILABLE"
      : metadata.sizeBytes > CLIENT_DEMO_MAX_BYTES
        ? "BLOCKED_BY_SIZE"
        : !LARGE_DEM_EXPERIMENTAL_ENABLED
          ? "NOT_RUN"
          : "NOT_RUN";

  return {
    state,
    experimentalEnabled: LARGE_DEM_EXPERIMENTAL_ENABLED,
    workerAvailable: capabilities.workerAvailable,
    wasmAvailable: capabilities.wasmAvailable,
    memoryMeasurement: capabilities.memoryMeasurementAvailable ? "AVAILABLE" : "MEMORY_UNAVAILABLE",
    crossOriginIsolated: capabilities.crossOriginIsolated,
    parserInputStrategy: "WASM_INPUT_REQUIRES_CONTIGUOUS_BUFFER",
    parserBuildIdentity: CLIENT_PARSER_BUILD_IDENTITY,
    fileSizeBytes: metadata.sizeBytes,
    parserCeilingBytes: CLIENT_DEMO_MAX_BYTES,
    evidenceClass: "CAPABILITY_HINT",
  };
}

export function browserLargeDemPreflight(metadata: LargeDemMetadata): LargeDemCapabilityHint {
  const performanceWithMemory = performance as Performance & {
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
  };
  return preflightLargeDem(metadata, {
    workerAvailable: typeof Worker !== "undefined",
    wasmAvailable: typeof WebAssembly !== "undefined",
    memoryMeasurementAvailable:
      typeof performanceWithMemory.measureUserAgentSpecificMemory === "function",
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
  });
}
