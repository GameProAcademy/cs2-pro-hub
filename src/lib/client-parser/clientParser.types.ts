export const CLIENT_PARSER_SCHEMA_VERSION = 2 as const;
export const CLIENT_PARSER_MANIFEST_VERSION = 2 as const;
export const CLIENT_PARSER_CONTRACT_VERSION = 4 as const;
export const CLIENT_PARSER_CATALOG_VERSION = 5 as const;
export const CLIENT_PARSER_NAME = "demoparser2" as const;
export const CLIENT_PARSER_VERSION = "0.42.0" as const;
export const CLIENT_PARSER_RUNTIME = "wasm-browser-worker" as const;
export const CLIENT_PARSER_BUILD_IDENTITY =
  "upstream-source-artifact:demoparser2@0.42.0:d3767705dc5846d73ed29db50eaeda58778dc934" as const;

export const CLIENT_EVENT_SAMPLE_LIMIT = 1_000;
export const CLIENT_GRENADE_SAMPLE_LIMIT = 256;
export const CLIENT_TICK_PROBE_LIMIT = 4_096;
export const CLIENT_PLAYER_LIMIT = 128;
export const CLIENT_EVENT_INVENTORY_LIMIT = 1_024;
export const CLIENT_RESULT_MAX_BYTES = 2 * 1024 * 1024;
/** Conservative POC ceiling; this is not a production or 400 MB support claim. */
export const CLIENT_DEMO_MAX_BYTES = 128 * 1024 * 1024;
/** Terminal ceiling for an unresponsive browser Worker; not a performance claim. */
export const CLIENT_PARSE_TIMEOUT_MS = 5 * 60 * 1_000;

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
export type ClientParsedEventStatus =
  "PRESENT_AND_PARSED" | "PRESENT_BUT_FAILED" | "NOT_PRESENT" | "UNAVAILABLE";

export interface ClientPlayerInventory {
  status: Exclude<ClientObservationStatus, "NOT_PRESENT">;
  count: number | null;
  players: Array<{
    steamId: string | null;
    name: string | null;
    internalSlot: number | null;
    userId: number | null;
    participantId: string | null;
    teamNumber: number | null;
  }>;
}

export interface ClientRuntimeSurface {
  observedExports: string[];
  minimumReady: boolean;
  runtimeSurfaceDigest: string;
}

export type ClientApiCallStatus =
  "EXPORT_PRESENT" | "CALL_ATTEMPTED" | "CALL_SUCCEEDED" | "CALL_FAILED";

export interface ClientApiCallEvidence {
  api: string;
  exportPresent: boolean;
  callAttempted: boolean;
  callSucceeded: boolean;
  status: ClientApiCallStatus;
  errorType: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  resultBytes: number | null;
  normalizedDigest: string | null;
  eventName: string | null;
  requestedPlayerFields: string[];
  requestedOtherFields: string[];
  actualReturnedFields: string[];
  missingRequestedFields: string[];
  unexpectedReturnedFields: string[];
  inputDigest: string | null;
  outputDigest: string | null;
  evidenceRef: string | null;
  requestCatalogVersion: number;
  requestCatalogDigest: string;
  eventCatalogDigest: string;
  parserVersion: string;
  parserRevision: string;
  demoSha256: string;
}

export interface ClientDemoAuthorization {
  authorizedDemo: true;
  provenance: "LOCAL_USER_SELECTION";
  filename: string;
  sha256: string;
  sizeBytes: number;
  source: "LOCAL_FILE";
  authorizationRef: string;
  receivedAt: string;
}

export type ClientFieldAuditStatus =
  | "PASS"
  | "FAIL"
  | "NOT_RUN"
  | "NOT_PRESENT"
  | "UNAVAILABLE"
  | "PARSE_FAILED"
  | "TYPE_MISMATCH"
  | "VALUE_MISMATCH"
  | "NULL_MATCH"
  | "ZERO_MATCH"
  | "FALSE_MATCH"
  | "EMPTY_STRING_MATCH"
  | "TOLERANCE_MATCH"
  | "SEMANTIC_MISMATCH"
  | "NOT_AVAILABLE_ON_WASM"
  | "NOT_AVAILABLE_ON_PYTHON"
  | "NORMALIZATION_REQUIRED"
  | "BLOCKED";

export interface ClientFieldAuditRow {
  category: string;
  eventOrEntity: string;
  field: string;
  upstreamSupported: boolean | null;
  projectCatalogued: true;
  runtimeExportAvailable: boolean | null;
  requestable: boolean;
  pythonRequested: boolean;
  wasmRequested: boolean;
  pythonAvailable: boolean | null;
  wasmExportAvailable: boolean | null;
  pythonParsed: boolean;
  wasmParsed: boolean;
  pythonSemanticStatus: "PASS" | "FAIL" | "NOT_RUN";
  wasmSemanticStatus: "PASS" | "FAIL" | "NOT_RUN";
  pythonValueType: string | null;
  wasmValueType: string | null;
  pythonNull: boolean | null;
  wasmNull: boolean | null;
  pythonSample: unknown;
  wasmSample: unknown;
  normalizedPython: unknown;
  normalizedWasm: unknown;
  pythonEvidenceRef: string | null;
  wasmEvidenceRef: string | null;
  equal: boolean | null;
  status: ClientFieldAuditStatus;
  classification: string;
  canonicalEligible: false;
  reason: string;
  evidenceRef: string | null;
}

export interface ClientDeterminismReport {
  demoSha256: string | null;
  runs: ClientParserRunEvidence[];
  pythonDeterministic: boolean | null;
  wasmDeterministic: boolean | null;
  status: "PASS" | "FAIL" | "NOT_RUN";
  reason: string;
}

export interface ClientParserRunEvidence {
  runId: string;
  runtime: "PYTHON" | "WASM";
  demoSha256: string;
  parserIdentity: string;
  parserVersion: string;
  parserRevision: string;
  artifactIdentity: string | null;
  catalogVersion: number;
  catalogDigest: string;
  contractVersion: number;
  contractDigest: string;
  normalizedDigest: string;
  startedAt: string;
  durationMs: number;
  status: "SUCCEEDED" | "FAILED";
}

export interface ClientGrenadeEvidence {
  status: "AVAILABLE" | "UNAVAILABLE" | "PARSE_FAILED";
  count: number | null;
  samples: Array<Record<string, unknown>>;
  normalizedSamples: Array<Record<string, unknown>>;
  normalization: "RAW_ONLY" | "STRUCTURAL_KEYS_ONLY";
  lifecycleStatus: "RAW_ONLY" | "UNRESOLVED";
  normalizedDigest: string | null;
  rawFieldInventory: string[];
  semanticStatus: "NOT_RUN" | "PASS" | "FAIL";
  evidenceRef: string | null;
}

export interface ClientRoundEvidence {
  derivedRoundIndex: number;
  observedRoundNumber: number | null;
  startTick: number;
  endTick: number | null;
  duration: number | null;
  winnerSlot: number | null;
  winnerSide: string | null;
  reason: string | null;
  eventsCount: number;
  completeness: "COMPLETE" | "MISSING_END" | "AMBIGUOUS";
  source: "round_start+round_end";
  evidenceScope: "BOUNDED_REFERENCE";
  sampleLimit: typeof CLIENT_EVENT_SAMPLE_LIMIT;
  sampled: true;
  complete: false;
  evidenceRef: string;
}

export interface ClientTickDomainEvidence {
  source: "header_probe";
  provenance: "demoparser2.parseHeader+parseTicks";
  firstTick: number | null;
  lastTick: number | null;
  tickCount: number | null;
  probeTicks: number[];
  probeType: "FIRST_MIDDLE_LAST";
  headerPlaybackTicks: number | null;
  authoritativeDomain: false;
  domainEvidenceRef: string | null;
  coverageStatus: "PROBE_ONLY" | "UNAVAILABLE" | "PARSE_FAILED";
  authoritative: false;
  evidenceRef: string | null;
}

export interface ClientFieldMatrixSummary {
  total: number;
  upstreamIdentified: number;
  projectCatalogued: number;
  runtimeExportAvailable: number;
  requestable: number;
  requested: number;
  parsed: number;
  semanticallyValidated: number;
  parityPass: number;
  unavailable: number;
  parseFailed: number;
  notRun: number;
  valueMismatch: number;
  typeMismatch: number;
  blocked: number;
}

export interface ClientEventDiscoveryEvidence {
  status: "AVAILABLE" | "PARSE_FAILED";
  discoveredEventsRaw: string[];
  discoveredEventCount: number;
  discoveredEventNamesInOrder: string[];
  duplicateEventCount: number;
  uniqueEventNames: string[];
  normalizedEventInventory: string[];
}

export interface PythonReferenceArtifact {
  artifactVersion: number;
  runId: string;
  runtime: "PYTHON";
  demoSha256: string;
  demoSizeBytes: number;
  parserName: string;
  parserVersion: string;
  parserRevision: string;
  catalogVersion: number;
  contractVersion: number;
  catalogDigest: string;
  contractDigest: string;
  generatedAt: string;
  sections: string[];
  fieldEvidence: Array<Record<string, unknown>>;
  eventEvidence: Array<Record<string, unknown>>;
  roundEvidence: Array<Record<string, unknown>>;
  grenadeEvidence: Array<Record<string, unknown>>;
  tickEvidence: Record<string, unknown>;
  fieldInventory: string[];
  eventInventory: string[];
  playerInventory: Array<Record<string, unknown>>;
  roundInventory: Array<Record<string, unknown>>;
  grenadeInventory: Array<Record<string, unknown>>;
  tickDomainEvidence: Record<string, unknown>;
  headerEvidence: Record<string, unknown>;
  timingEvidence: Record<string, unknown>;
  mapEvidence: Record<string, unknown>;
  scoreEvidence: Record<string, unknown>;
  teamEvidence: Record<string, unknown>;
  bombEvidence: Record<string, unknown>;
  deathEvidence: Record<string, unknown>;
  damageEvidence: Record<string, unknown>;
  economyEvidence: Record<string, unknown>;
  weaponEvidence: Record<string, unknown>;
  positionEvidence: Record<string, unknown>;
  aimEvidence: Record<string, unknown>;
  normalizedResult: Record<string, unknown>;
  normalizedResultDigest: string;
  resultDigest: string;
  runIdentity: ClientParserRunEvidence;
  startedAt: string;
  durationMs: number;
  status: "SUCCEEDED";
  evidenceStatus: "BOUNDED_REFERENCE";
  canonicalEligible: false;
  persisted: false;
}

export interface ClientParserArtifactProvenance {
  status: "VERIFIED" | "UNAVAILABLE" | "INVALID" | "MISMATCH";
  sourceRepository: string | null;
  sourceCommit: string | null;
  sourceTag: string | null;
  buildTool: string | null;
  buildTarget: string | null;
  wasmBindgenTarget: string | null;
  buildToolchain: string | null;
  buildCommand: string | null;
  artifactSize: number | null;
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
    apiCalls: ClientApiCallEvidence[];
    artifact: ClientParserArtifactProvenance;
  };
  demo: {
    sha256: string;
    sizeBytes: number;
    name: string;
    lastModified: number;
    authorization: ClientDemoAuthorization;
  };
  header: Record<string, unknown>;
  playerInventory: ClientPlayerInventory;
  eventDiscovery: ClientEventDiscoveryEvidence;
  parsedEventInventory: Array<{
    name: string;
    status: ClientParsedEventStatus;
    count: number | null;
    fields: string[];
    requestedPlayerFields: string[];
    requestedOtherFields: string[];
    semanticStatus: "NOT_RUN" | "PASS" | "FAIL";
  }>;
  selectedEventSamples: ClientEventSample[];
  grenadeEvidence: ClientGrenadeEvidence;
  roundEvidence: ClientRoundEvidence[];
  tickDomainEvidence: ClientTickDomainEvidence;
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
    samples: Array<Record<string, unknown>>;
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
  contractDigest: string;
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
  | "CLIENT_WASM_ARTIFACT_UNAVAILABLE"
  | "CLIENT_WASM_ARTIFACT_INVALID"
  | "CLIENT_WASM_LOAD_FAILED"
  | "CLIENT_WASM_INTEGRITY_MISMATCH"
  | "CLIENT_WASM_EXPORTS_MISSING"
  | "CLIENT_WASM_INIT_FAILED"
  | "CLIENT_WASM_RUNTIME_ERROR"
  | "CLIENT_WORKER_FAILED"
  | "CLIENT_DEMO_INVALID"
  | "CLIENT_DEMO_TOO_LARGE"
  | "CLIENT_HASH_FAILED"
  | "CLIENT_PARSE_FAILED"
  | "CLIENT_DEMO_PARSE_FAILED"
  | "CLIENT_DEMO_UNSUPPORTED"
  | "CLIENT_DEMO_CORRUPTED"
  | "CLIENT_PAYLOAD_TOO_LARGE"
  | "CLIENT_PARITY_MISMATCH"
  | "CLIENT_PARITY_NOT_AVAILABLE"
  | "CLIENT_RESULT_INVALID"
  | "CLIENT_RESULT_TOO_LARGE"
  | "CLIENT_PARSE_TIMEOUT"
  | "CLIENT_CONTRACT_MISMATCH"
  | "CLIENT_PARSER_IDENTITY_MISMATCH"
  | "CLIENT_RESULT_DIGEST_MISMATCH"
  | "CLIENT_CANCELLED";
