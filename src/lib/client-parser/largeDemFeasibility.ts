import { CLIENT_DEMO_MAX_BYTES, CLIENT_PARSER_BUILD_IDENTITY } from "./clientParser.types";

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
  const state: LargeDemFeasibilityState = !LARGE_DEM_EXPERIMENTAL_ENABLED
    ? "NOT_RUN"
    : !capabilities.workerAvailable || !capabilities.wasmAvailable
      ? "UNAVAILABLE"
      : metadata.sizeBytes > CLIENT_DEMO_MAX_BYTES
        ? "BLOCKED_BY_SIZE"
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
