import type { ClientParserEnvelope, ClientParserErrorCode } from "./clientParser.types";

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
  | { type: "INIT"; requestId: string; scriptUrl?: string; wasmUrl?: string }
  | {
      type: "PARSE";
      requestId: string;
      file: { bytes: ArrayBuffer; name: string; size: number; lastModified: number };
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
  return (
    typeof event["requestId"] === "string" &&
    ["PROGRESS", "READY", "COMPLETE", "ERROR", "CANCELLED"].includes(String(event["type"]))
  );
}
