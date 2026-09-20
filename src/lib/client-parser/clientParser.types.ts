export const CLIENT_PARSER_SCHEMA_VERSION = 1 as const;
export const CLIENT_PARSER_MANIFEST_VERSION = 1 as const;
export const CLIENT_PARSER_CONTRACT_VERSION = 1 as const;
export const CLIENT_PARSER_CATALOG_VERSION = 2 as const;
export const CLIENT_PARSER_NAME = "demoparser2" as const;
export const CLIENT_PARSER_VERSION = "0.42.0" as const;
export const CLIENT_PARSER_RUNTIME = "wasm-browser-worker" as const;
export const CLIENT_PARSER_BUILD_IDENTITY = "source-build:demoparser2@0.42.0-unverified" as const;

export const CLIENT_EVENT_SAMPLE_LIMIT = 1_000;
export const CLIENT_TICK_PROBE_LIMIT = 4_096;
export const CLIENT_PLAYER_LIMIT = 128;
export const CLIENT_EVENT_INVENTORY_LIMIT = 1_024;
export const CLIENT_RESULT_MAX_BYTES = 2 * 1024 * 1024;
/** Conservative POC ceiling; this is not a production or 400 MB support claim. */
export const CLIENT_DEMO_MAX_BYTES = 128 * 1024 * 1024;

export const CLIENT_CAPABILITY_CLASSIFICATIONS = [
  "CANONICAL",
  "DERIVED",
  "RAW_ONLY",
  "NOT_PRESENT",
  "UNAVAILABLE",
  "PARSE_FAILED",
] as const;
export type ClientCapabilityClassification = (typeof CLIENT_CAPABILITY_CLASSIFICATIONS)[number];

export interface ClientCapability {
  id: string;
  classification: ClientCapabilityClassification;
  available: boolean;
  nullOnly: boolean;
  reason: string;
  source: "demoparser2-wasm";
  parserName: typeof CLIENT_PARSER_NAME;
  parserVersion: typeof CLIENT_PARSER_VERSION;
}

export interface ClientEventSample {
  eventName: string;
  tick: number | null;
  fields: Record<string, unknown>;
}

export type ClientObservationStatus = "AVAILABLE" | "UNAVAILABLE" | "NOT_PRESENT" | "PARSE_FAILED";

export interface ClientPlayerInventory {
  status: Exclude<ClientObservationStatus, "NOT_PRESENT">;
  count: number | null;
  players: Array<{ steamId: string | null; name: string | null; teamNumber: number | null }>;
}

export interface ClientRuntimeSurface {
  observedExports: string[];
  minimumReady: boolean;
  runtimeSurfaceDigest: string;
}

export interface ClientParserArtifactProvenance {
  status: "VERIFIED" | "UNAVAILABLE";
  sourceRepository: string | null;
  sourceCommit: string | null;
  sourceTag: string | null;
  buildTool: string | null;
  buildCommand: string | null;
  bindingUrl: string | null;
  wasmUrl: string | null;
  wasmBindingSha256: string | null;
  wasmBinarySha256: string | null;
  reason: string | null;
}

export interface ClientParseResult {
  schemaVersion: typeof CLIENT_PARSER_SCHEMA_VERSION;
  parser: {
    name: typeof CLIENT_PARSER_NAME;
    version: typeof CLIENT_PARSER_VERSION;
    runtime: typeof CLIENT_PARSER_RUNTIME;
    buildIdentity: typeof CLIENT_PARSER_BUILD_IDENTITY;
    runtimeSurface: ClientRuntimeSurface;
    artifact: ClientParserArtifactProvenance;
  };
  demo: { sha256: string; sizeBytes: number; name: string; lastModified: number };
  header: Record<string, unknown>;
  playerInventory: ClientPlayerInventory;
  eventDiscovery: { status: "AVAILABLE" | "PARSE_FAILED"; count: number; names: string[] };
  parsedEventInventory: Array<{
    name: string;
    status: ClientObservationStatus;
    count: number | null;
    fields: string[];
  }>;
  selectedEventSamples: ClientEventSample[];
  roundSummary: { status: "DERIVED" | "UNAVAILABLE"; count: number | null };
  tickProbe: {
    status: "AVAILABLE" | "UNAVAILABLE" | "PARSE_FAILED";
    requestedTickCount: number;
    returnedTickCount: number;
    propertiesRequested: string[];
    firstTick: number | null;
    lastTick: number | null;
    duplicates: number;
    missingWithinProbe: number;
  };
  coverage: {
    fullTickDomain: false;
    authoritativeTickDomain: false;
    fullRawEvents: false;
    sampledEvents: boolean;
  };
  capabilities: ClientCapability[];
  semanticStatus: "PARTIAL" | "BLOCKED";
  performance: {
    fileSizeBytes: number;
    hashDurationMs: number;
    parseDurationMs: number;
    totalDurationMs: number;
    resultBytes: number;
    workerStartupMs: number;
    wasmLoadMs: number;
    memory: { status: "OBSERVED" | "UNAVAILABLE"; usedBytes: number | null };
  };
  resultDigest: string;
}

export interface ClientParserManifest {
  manifestVersion: typeof CLIENT_PARSER_MANIFEST_VERSION;
  demoSha256: string;
  demoSizeBytes: number;
  demoName: string;
  demoLastModified: number;
  parserName: typeof CLIENT_PARSER_NAME;
  parserVersion: typeof CLIENT_PARSER_VERSION;
  parserRuntime: typeof CLIENT_PARSER_RUNTIME;
  parserBuildIdentity: typeof CLIENT_PARSER_BUILD_IDENTITY;
  runtimeSurfaceDigest: string;
  observedExports: string[];
  artifactProvenance: ClientParserArtifactProvenance;
  contractVersion: typeof CLIENT_PARSER_CONTRACT_VERSION;
  catalogVersion: typeof CLIENT_PARSER_CATALOG_VERSION;
  catalogDigest: string;
  capabilityDigest: string;
  capabilityClassifications: ClientCapabilityClassification[];
  coverage: ClientParseResult["coverage"];
  semanticStatus: ClientParseResult["semanticStatus"];
  resultDigest: string;
  manifestDigest: string;
  generatedAt: string;
  performance: ClientParseResult["performance"];
}

export interface ClientParserEnvelope {
  result: ClientParseResult;
  manifest: ClientParserManifest;
}

export type ClientParserErrorCode =
  | "CLIENT_PARSER_UNAVAILABLE"
  | "CLIENT_WASM_LOAD_FAILED"
  | "CLIENT_WASM_INTEGRITY_MISMATCH"
  | "CLIENT_WASM_EXPORTS_MISSING"
  | "CLIENT_WORKER_FAILED"
  | "CLIENT_DEMO_INVALID"
  | "CLIENT_DEMO_TOO_LARGE"
  | "CLIENT_HASH_FAILED"
  | "CLIENT_PARSE_FAILED"
  | "CLIENT_RESULT_INVALID"
  | "CLIENT_RESULT_TOO_LARGE"
  | "CLIENT_CONTRACT_MISMATCH"
  | "CLIENT_PARSER_IDENTITY_MISMATCH"
  | "CLIENT_RESULT_DIGEST_MISMATCH"
  | "CLIENT_CANCELLED";
