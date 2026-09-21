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
} from "./clientParser.types";
import { CLIENT_FIELD_AUDIT_CATALOG } from "./clientParser.audit";

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
    return value
      .map(normalizeForParity)
      .sort((left, right) => stableClientJson(left).localeCompare(stableClientJson(right)));
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
    pythonAvailable: null,
    wasmExportAvailable: null,
    pythonParsed: false,
    wasmParsed: false,
    pythonValueType: null,
    wasmValueType: null,
    pythonNull: null,
    wasmNull: null,
    pythonSample: null,
    wasmSample: null,
    normalizedPython: null,
    normalizedWasm: null,
    equal: null,
    status: "NOT_RUN",
    classification: "NO_AUTHORIZED_REAL_DEM_FIXTURE",
    canonicalEligible: false,
    reason: "runtime_evidence_not_executed",
    evidenceRef: null,
  }));
}

export function compareFieldObservation(input: {
  category: string;
  eventOrEntity: string;
  field: string;
  pythonAvailable: boolean;
  wasmExportAvailable: boolean;
  pythonParsed: boolean;
  wasmParsed: boolean;
  pythonValue: unknown;
  wasmValue: unknown;
  evidenceRef: string;
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
  } else if (stableClientJson(normalizedPython) !== stableClientJson(normalizedWasm)) {
    status = "VALUE_MISMATCH";
    reason = "normalized_values_differ";
  } else {
    status = "PASS";
    reason = "normalized_values_equal";
  }
  return {
    category: input.category,
    eventOrEntity: input.eventOrEntity,
    field: input.field,
    pythonAvailable: input.pythonAvailable,
    wasmExportAvailable: input.wasmExportAvailable,
    pythonParsed: input.pythonParsed,
    wasmParsed: input.wasmParsed,
    pythonValueType: input.pythonParsed ? valueType(input.pythonValue) : null,
    wasmValueType: input.wasmParsed ? valueType(input.wasmValue) : null,
    pythonNull: input.pythonParsed ? input.pythonValue === null : null,
    wasmNull: input.wasmParsed ? input.wasmValue === null : null,
    pythonSample: input.pythonValue,
    wasmSample: input.wasmValue,
    normalizedPython,
    normalizedWasm,
    equal: status === "PASS" ? true : status === "TYPE_MISMATCH" || status === "VALUE_MISMATCH" ? false : null,
    status,
    classification: status === "PASS" ? "CANONICAL_CANDIDATE" : "BLOCKED",
    canonicalEligible: false,
    reason,
    evidenceRef: input.evidenceRef,
  };
}

export function evaluateDeterminism(input: {
  demoSha256: string | null;
  pythonRunDigests: string[];
  wasmRunDigests: string[];
}): ClientDeterminismReport {
  if (!input.demoSha256 || input.pythonRunDigests.length < 2 || input.wasmRunDigests.length < 2) {
    return { ...input, pythonDeterministic: null, wasmDeterministic: null, status: "NOT_RUN", reason: "NO_AUTHORIZED_REAL_DEM_FIXTURE" };
  }
  const pythonDeterministic = new Set(input.pythonRunDigests).size === 1;
  const wasmDeterministic = new Set(input.wasmRunDigests).size === 1;
  return {
    ...input,
    pythonDeterministic,
    wasmDeterministic,
    status: pythonDeterministic && wasmDeterministic ? "PASS" : "FAIL",
    reason: pythonDeterministic && wasmDeterministic ? "repeated_normalized_digests_equal" : "DETERMINISM_FAIL",
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
