import { stableClientJson } from "./clientParser.hash";
import {
  CLIENT_PARITY_DIMENSIONS,
  type ClientParityDimension,
  type ClientParityStatus,
} from "./clientParser.audit";
import type { ClientParseResult } from "./clientParser.types";
import type {
  ClientDeterminismReport,
  ClientFieldAuditRow,
  ClientFieldAuditStatus,
  ClientFieldMatrixSummary,
} from "./clientParser.types";
import {
  CLIENT_AUDIT_CATALOG_DIGEST,
  CLIENT_FIELD_AUDIT_CATALOG,
  CLIENT_PARSER_CONTRACT_DIGEST,
} from "./clientParser.audit";
import {
  CLIENT_PARSER_CATALOG_VERSION,
  CLIENT_PARSER_CONTRACT_VERSION,
} from "./clientParser.types";

export interface ClientFieldTolerance {
  fieldName: string;
  absoluteTolerance: number;
  relativeTolerance: number;
  reason: string;
  source: string;
  contractVersion: number;
}

export const CLIENT_FIELD_TOLERANCES: Readonly<Record<string, ClientFieldTolerance>> = {};

export interface ClientParserParityMismatch {
  path: string;
  client: unknown;
  reference: unknown;
  severity: "INFO" | "BLOCKING";
}

const PATHS = [
  "header",
  "playerInventory",
  "eventDiscovery",
  "parsedEventInventory",
  "selectedEventSamples",
  "tickProbe",
  "capabilities",
  "coverage",
] as const;

export function compareClientVsServerReference(
  client: ClientParseResult,
  reference: Pick<ClientParseResult, (typeof PATHS)[number]>,
): { equal: boolean; mismatches: ClientParserParityMismatch[] } {
  const mismatches = PATHS.flatMap((path) => {
    const left = client[path];
    const right = reference[path];
    if (stableClientJson(left) === stableClientJson(right)) return [];
    return [{ path, client: left, reference: right, severity: "BLOCKING" as const }];
  });
  return { equal: mismatches.length === 0, mismatches };
}

export interface ClientFieldParityResult {
  dimension: ClientParityDimension;
  field: string;
  python: unknown;
  wasm: unknown;
  status: ClientParityStatus;
  reason: string;
}

export type ClientFieldParityStatus =
  ClientParityStatus | "NOT_AVAILABLE_ON_PYTHON" | "PARSE_FAILED";

export interface ClientFieldParityMatrixRow {
  category: string;
  field: string;
  pythonStatus: "AVAILABLE" | "NOT_AVAILABLE" | "PARSE_FAILED" | "NOT_RUN";
  wasmStatus: "AVAILABLE" | "NOT_AVAILABLE" | "PARSE_FAILED" | "NOT_RUN";
  pythonSample: unknown;
  wasmSample: unknown;
  pythonCount: number | null;
  wasmCount: number | null;
  pythonNullRate: number | null;
  wasmNullRate: number | null;
  parity: ClientFieldParityStatus;
  tolerance: "EXACT" | "DOCUMENTED_NUMERIC" | "NONE";
  reason: string;
  canonicalEligibility: "BLOCKED";
}

export function normalizeForParity(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForParity);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForParity(item)]),
    );
  }
  return value;
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function buildNotRunFieldMatrix(): ClientFieldAuditRow[] {
  return CLIENT_FIELD_AUDIT_CATALOG.map((entry) => ({
    category: entry.category,
    eventOrEntity: entry.eventOrEntity,
    field: entry.field,
    upstreamSupported: null,
    projectCatalogued: true,
    runtimeExportAvailable: null,
    requestable: entry.requestable,
    pythonRequested: false,
    wasmRequested: false,
    pythonAvailable: null,
    wasmExportAvailable: null,
    pythonParsed: false,
    wasmParsed: false,
    pythonSemanticStatus: "NOT_RUN",
    wasmSemanticStatus: "NOT_RUN",
    pythonValueType: null,
    wasmValueType: null,
    pythonNull: null,
    wasmNull: null,
    pythonSample: null,
    wasmSample: null,
    normalizedPython: null,
    normalizedWasm: null,
    pythonEvidenceRef: null,
    wasmEvidenceRef: null,
    equal: null,
    status: "NOT_RUN",
    classification: "NO_AUTHORIZED_REAL_DEM_FIXTURE",
    canonicalEligible: false,
    reason: "runtime_evidence_not_executed",
    evidenceRef: null,
  }));
}

export function summarizeFieldMatrix(rows: ClientFieldAuditRow[]): ClientFieldMatrixSummary {
  const count = (predicate: (row: ClientFieldAuditRow) => boolean) => rows.filter(predicate).length;
  return {
    total: rows.length,
    upstreamIdentified: count((row) => row.upstreamSupported === true),
    projectCatalogued: count((row) => row.projectCatalogued),
    runtimeExportAvailable: count((row) => row.runtimeExportAvailable === true),
    requestable: count((row) => row.requestable),
    requested: count((row) => row.pythonRequested || row.wasmRequested),
    parsed: count((row) => row.pythonParsed || row.wasmParsed),
    semanticallyValidated: count(
      (row) => row.pythonSemanticStatus === "PASS" || row.wasmSemanticStatus === "PASS",
    ),
    parityPass: count((row) => row.status === "PASS"),
    unavailable: count((row) => row.status === "UNAVAILABLE"),
    parseFailed: count((row) => row.status === "PARSE_FAILED"),
    notRun: count((row) => row.status === "NOT_RUN"),
    valueMismatch: count((row) => row.status === "VALUE_MISMATCH"),
    typeMismatch: count((row) => row.status === "TYPE_MISMATCH"),
    blocked: count((row) => row.status !== "PASS" || !row.canonicalEligible),
  };
}

export function compareFieldObservation(input: {
  category: string;
  eventOrEntity: string;
  field: string;
  pythonAvailable: boolean;
  wasmExportAvailable: boolean;
  upstreamSupported?: boolean;
  requestable?: boolean;
  pythonRequested?: boolean;
  wasmRequested?: boolean;
  pythonParsed: boolean;
  wasmParsed: boolean;
  pythonSemanticStatus?: "PASS" | "FAIL" | "NOT_RUN";
  wasmSemanticStatus?: "PASS" | "FAIL" | "NOT_RUN";
  pythonValue: unknown;
  wasmValue: unknown;
  evidenceRef: string;
  pythonEvidenceRef?: string;
  wasmEvidenceRef?: string;
}): ClientFieldAuditRow {
  const normalizedPython = normalizeForParity(input.pythonValue);
  const normalizedWasm = normalizeForParity(input.wasmValue);
  let status: ClientFieldAuditStatus;
  let reason: string;
  if (!input.pythonAvailable || !input.wasmExportAvailable) {
    status = "UNAVAILABLE";
    reason = !input.pythonAvailable ? "python_field_unavailable" : "wasm_field_unavailable";
  } else if (!input.pythonParsed || !input.wasmParsed) {
    status = "PARSE_FAILED";
    reason = !input.pythonParsed ? "python_parse_failed" : "wasm_parse_failed";
  } else if (valueType(input.pythonValue) !== valueType(input.wasmValue)) {
    status = "TYPE_MISMATCH";
    reason = "runtime_value_types_differ";
  } else if (input.pythonValue === null && input.wasmValue === null) {
    status = "NULL_MATCH";
    reason = "null_values_equal";
  } else if (input.pythonValue === 0 && input.wasmValue === 0) {
    status = "ZERO_MATCH";
    reason = "zero_values_equal";
  } else if (input.pythonValue === false && input.wasmValue === false) {
    status = "FALSE_MATCH";
    reason = "false_values_equal";
  } else if (input.pythonValue === "" && input.wasmValue === "") {
    status = "EMPTY_STRING_MATCH";
    reason = "empty_string_values_equal";
  } else if (stableClientJson(normalizedPython) !== stableClientJson(normalizedWasm)) {
    status = "SEMANTIC_MISMATCH";
    reason = "normalized_values_differ";
  } else {
    status = "PASS";
    reason = "normalized_values_equal";
  }
  return {
    category: input.category,
    eventOrEntity: input.eventOrEntity,
    field: input.field,
    upstreamSupported: input.upstreamSupported ?? null,
    projectCatalogued: true,
    runtimeExportAvailable: input.wasmExportAvailable,
    requestable: input.requestable ?? true,
    pythonRequested: input.pythonRequested ?? input.pythonParsed,
    wasmRequested: input.wasmRequested ?? input.wasmParsed,
    pythonAvailable: input.pythonAvailable,
    wasmExportAvailable: input.wasmExportAvailable,
    pythonParsed: input.pythonParsed,
    wasmParsed: input.wasmParsed,
    pythonSemanticStatus: input.pythonSemanticStatus ?? (input.pythonParsed ? "PASS" : "NOT_RUN"),
    wasmSemanticStatus: input.wasmSemanticStatus ?? (input.wasmParsed ? "PASS" : "NOT_RUN"),
    pythonValueType: input.pythonParsed ? valueType(input.pythonValue) : null,
    wasmValueType: input.wasmParsed ? valueType(input.wasmValue) : null,
    pythonNull: input.pythonParsed ? input.pythonValue === null : null,
    wasmNull: input.wasmParsed ? input.wasmValue === null : null,
    pythonSample: input.pythonValue,
    wasmSample: input.wasmValue,
    normalizedPython,
    normalizedWasm,
    equal: [
      "PASS",
      "NULL_MATCH",
      "ZERO_MATCH",
      "FALSE_MATCH",
      "EMPTY_STRING_MATCH",
      "TOLERANCE_MATCH",
    ].includes(status)
      ? true
      : status === "TYPE_MISMATCH" || status === "VALUE_MISMATCH" || status === "SEMANTIC_MISMATCH"
        ? false
        : null,
    status,
    pythonEvidenceRef: input.pythonEvidenceRef ?? input.evidenceRef,
    wasmEvidenceRef: input.wasmEvidenceRef ?? input.evidenceRef,
    classification: status === "PASS" ? "PARITY_OBSERVED_CANONICAL_BLOCKED" : "BLOCKED",
    canonicalEligible: false,
    reason,
    evidenceRef: input.evidenceRef,
  };
}

export function evaluateDeterminism(input: {
  demoSha256: string | null;
  runs: import("./clientParser.types").ClientParserRunEvidence[];
}): ClientDeterminismReport {
  const pythonRuns = input.runs.filter((run) => run.runtime === "PYTHON");
  const wasmRuns = input.runs.filter((run) => run.runtime === "WASM");
  if (!input.demoSha256 || pythonRuns.length !== 2 || wasmRuns.length !== 2) {
    return {
      ...input,
      pythonDeterministic: null,
      wasmDeterministic: null,
      status: "NOT_RUN",
      reason: "NO_AUTHORIZED_REAL_DEM_FIXTURE",
    };
  }
  const uniqueRunIds = new Set(input.runs.map((run) => run.runId));
  if (uniqueRunIds.size !== input.runs.length) {
    return {
      ...input,
      pythonDeterministic: false,
      wasmDeterministic: false,
      status: "FAIL",
      reason: "DUPLICATE_RUN_IDENTITY",
    };
  }
  const catalogMismatch = input.runs.some(
    (run) =>
      run.catalogVersion !== CLIENT_PARSER_CATALOG_VERSION ||
      run.catalogDigest !== CLIENT_AUDIT_CATALOG_DIGEST,
  );
  if (catalogMismatch) {
    return {
      ...input,
      pythonDeterministic: false,
      wasmDeterministic: false,
      status: "FAIL",
      reason: "CATALOG_MISMATCH",
    };
  }
  const contractMismatch = input.runs.some(
    (run) =>
      run.contractVersion !== CLIENT_PARSER_CONTRACT_VERSION ||
      run.contractDigest !== CLIENT_PARSER_CONTRACT_DIGEST,
  );
  if (contractMismatch) {
    return {
      ...input,
      pythonDeterministic: false,
      wasmDeterministic: false,
      status: "FAIL",
      reason: "CONTRACT_MISMATCH",
    };
  }
  const runsValid = input.runs.every(
    (run) =>
      run.status === "SUCCEEDED" &&
      run.demoSha256 === input.demoSha256 &&
      /^[0-9a-f]{64}$/.test(run.demoSha256) &&
      /^[0-9a-f]{64}$/.test(run.normalizedDigest) &&
      run.parserIdentity.length > 0 &&
      run.parserVersion.length > 0 &&
      run.parserRevision.length > 0 &&
      Number.isFinite(run.durationMs) &&
      run.durationMs >= 0,
  );
  const pythonIdentity = new Set(
    pythonRuns.map((run) => `${run.parserIdentity}:${run.parserVersion}:${run.parserRevision}`),
  );
  const wasmIdentity = new Set(
    wasmRuns.map(
      (run) =>
        `${run.parserIdentity}:${run.parserVersion}:${run.parserRevision}:${run.artifactIdentity ?? ""}`,
    ),
  );
  const wasmArtifactsPresent = wasmRuns.every((run) => Boolean(run.artifactIdentity));
  if (!runsValid || pythonIdentity.size !== 1 || wasmIdentity.size !== 1 || !wasmArtifactsPresent) {
    return {
      ...input,
      pythonDeterministic: false,
      wasmDeterministic: false,
      status: "FAIL",
      reason: "RUN_IDENTITY_OR_DEMO_SHA_MISMATCH",
    };
  }
  const pythonDeterministic = new Set(pythonRuns.map((run) => run.normalizedDigest)).size === 1;
  const wasmDeterministic = new Set(wasmRuns.map((run) => run.normalizedDigest)).size === 1;
  return {
    ...input,
    pythonDeterministic,
    wasmDeterministic,
    status: pythonDeterministic && wasmDeterministic ? "PASS" : "FAIL",
    reason:
      pythonDeterministic && wasmDeterministic
        ? "repeated_normalized_digests_equal"
        : "DETERMINISM_FAIL",
  };
}

export interface ClientSemanticReference {
  dimensions: Partial<Record<ClientParityDimension, unknown>>;
}

export function compareClientVsPythonSemantic(
  wasm: Partial<Record<ClientParityDimension, unknown>>,
  python: ClientSemanticReference,
  wasmCapabilities: Partial<Record<ClientParityDimension, boolean>> = {},
): ClientFieldParityResult[] {
  return CLIENT_PARITY_DIMENSIONS.map((dimension) => {
    if (wasmCapabilities[dimension] === false) {
      return {
        dimension,
        field: dimension,
        python: python.dimensions[dimension] ?? null,
        wasm: null,
        status: "NOT_AVAILABLE_ON_WASM",
        reason: "runtime_does_not_expose_dimension",
      };
    }
    if (!(dimension in python.dimensions)) {
      return {
        dimension,
        field: dimension,
        python: null,
        wasm: wasm[dimension] ?? null,
        status: "BLOCKED",
        reason: "python_reference_missing",
      };
    }
    if (!(dimension in wasm)) {
      return {
        dimension,
        field: dimension,
        python: python.dimensions[dimension] ?? null,
        wasm: null,
        status: "NOT_RUN",
        reason: "wasm_observation_not_executed",
      };
    }
    const equal =
      stableClientJson(wasm[dimension]) === stableClientJson(python.dimensions[dimension]);
    return {
      dimension,
      field: dimension,
      python: python.dimensions[dimension] ?? null,
      wasm: wasm[dimension] ?? null,
      status: equal ? "PASS" : "FAIL",
      reason: equal ? "semantic_values_equal" : "semantic_mismatch_preserved",
    };
  });
}
