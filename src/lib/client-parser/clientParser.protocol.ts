import type {
  ClientDemoAuthorization,
  ClientParserEnvelope,
  ClientParserErrorCode,
} from "./clientParser.types";
import type { DemoParserCapability } from "./clientParser.input";

export const CLIENT_PARSER_STAGES = [
  "INIT",
  "LOADING_WASM",
  "WASM_READY",
  "READING_FILE",
  "HASHING",
  "PARSING_HEADER",
  "DISCOVERING_EVENTS",
  "PARSING_EVENTS",
  "PARSING_TICKS",
  "BUILDING_RESULT",
  "BUILDING_MANIFEST",
  "COMPLETE",
  "ERROR",
  "CANCELLED",
] as const;
export type ClientParserStage = (typeof CLIENT_PARSER_STAGES)[number];

export type ClientParserCommand =
  | {
      type: "INIT";
      requestId: string;
      scriptUrl?: string;
      wasmUrl?: string;
      expectedBindingSha256?: string;
      expectedWasmSha256?: string;
    }
  | {
      type: "PARSE";
      requestId: string;
      file: File;
      capability: DemoParserCapability;
      hashDurationMs: number;
      authorization: ClientDemoAuthorization;
    }
  | { type: "CANCEL"; requestId: string };

export type ClientParserWorkerEvent =
  | {
      type: "PROGRESS";
      requestId: string;
      stage: ClientParserStage;
      progress: number;
      elapsedMs: number;
    }
  | { type: "READY"; requestId: string; wasmLoadMs: number }
  | { type: "COMPLETE"; requestId: string; envelope: ClientParserEnvelope }
  | { type: "ERROR"; requestId: string; code: ClientParserErrorCode }
  | { type: "CANCELLED"; requestId: string };

export function isClientParserWorkerEvent(value: unknown): value is ClientParserWorkerEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (typeof event["requestId"] !== "string" || typeof event["type"] !== "string") return false;
  if (event["type"] === "PROGRESS")
    return (
      typeof event["stage"] === "string" &&
      CLIENT_PARSER_STAGES.includes(event["stage"] as ClientParserStage) &&
      typeof event["progress"] === "number" &&
      Number.isFinite(event["progress"]) &&
      typeof event["elapsedMs"] === "number" &&
      Number.isFinite(event["elapsedMs"])
    );
  if (event["type"] === "READY")
    return typeof event["wasmLoadMs"] === "number" && Number.isFinite(event["wasmLoadMs"]);
  if (event["type"] === "COMPLETE")
    return Boolean(
      event["envelope"] && typeof event["envelope"] === "object" &&
      !Array.isArray(event["envelope"]) &&
      "result" in event["envelope"] && "manifest" in event["envelope"] &&
      event["envelope"].result && typeof event["envelope"].result === "object" &&
      !Array.isArray(event["envelope"].result) &&
      event["envelope"].manifest && typeof event["envelope"].manifest === "object" &&
      !Array.isArray(event["envelope"].manifest),
    );
  if (event["type"] === "ERROR") return (
    typeof event["code"] === "string" && CLIENT_WORKER_ERROR_CODES.has(event["code"])
  );
  return event["type"] === "CANCELLED";
}

// Never forward arbitrary worker strings (which could contain private diagnostics).
const CLIENT_WORKER_ERROR_CODES: ReadonlySet<string> = new Set<ClientParserErrorCode>([
  "CLIENT_PARSER_UNAVAILABLE", "CLIENT_WASM_ARTIFACT_UNAVAILABLE", "CLIENT_WASM_ARTIFACT_INVALID",
  "CLIENT_WASM_LOAD_FAILED", "CLIENT_WASM_INTEGRITY_MISMATCH", "CLIENT_WASM_EXPORTS_MISSING",
  "CLIENT_WASM_INIT_FAILED", "CLIENT_WASM_RUNTIME_ERROR", "CLIENT_WASM_RUNTIME_TRAP",
  "CLIENT_WASM_MEMORY_FAILURE", "CLIENT_WORKER_FAILED", "CLIENT_DEMO_INVALID",
  "CLIENT_DEMO_TOO_LARGE", "CLIENT_HASH_FAILED", "CLIENT_PARSE_FAILED", "CLIENT_DEMO_PARSE_FAILED",
  "CLIENT_DEMO_UNSUPPORTED", "CLIENT_DEMO_CORRUPTED", "CLIENT_PAYLOAD_TOO_LARGE",
  "CLIENT_PARITY_MISMATCH", "CLIENT_PARITY_NOT_AVAILABLE", "CLIENT_RESULT_INVALID",
  "CLIENT_RESULT_TOO_LARGE", "CLIENT_PARSE_TIMEOUT", "CLIENT_CONTRACT_MISMATCH",
  "CLIENT_PARSER_IDENTITY_MISMATCH", "CLIENT_RESULT_DIGEST_MISMATCH", "CLIENT_CANCELLED",
  "CLIENT_STALE_RESULT",
]);
