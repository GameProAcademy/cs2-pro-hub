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
    return Boolean(event["envelope"] && typeof event["envelope"] === "object");
  if (event["type"] === "ERROR") return typeof event["code"] === "string";
  return event["type"] === "CANCELLED";
}
