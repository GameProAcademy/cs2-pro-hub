import { stableClientJson } from "./clientParser.hash";
import {
  CLIENT_PARITY_DIMENSIONS,
  type ClientParityDimension,
  type ClientParityStatus,
} from "./clientParser.audit";
import type { ClientParseResult } from "./clientParser.types";

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
  | ClientParityStatus
  | "NOT_AVAILABLE_ON_PYTHON"
  | "PARSE_FAILED";

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
    return value.map(normalizeForParity).sort((left, right) =>
      stableClientJson(left).localeCompare(stableClientJson(right)),
    );
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
