import {
  CLIENT_DEMO_MAX_BYTES,
  CLIENT_PARSER_NAME,
  CLIENT_PARSER_RUNTIME,
  CLIENT_PARSER_VERSION,
} from "./clientParser.types";

export const DEMO_PARSER_INPUT_CAPABILITIES = [
  "CONTIGUOUS_BUFFER",
  "CHUNKED_FILE",
  "STREAM",
  "REMOTE_STREAM",
  "UNKNOWN",
] as const;

export type DemoParserInputCapability = (typeof DEMO_PARSER_INPUT_CAPABILITIES)[number];

export interface DemoParserCapability {
  parserName: string;
  parserVersion: string;
  runtime: string;
  inputCapability: DemoParserInputCapability;
  maxSafeInputBytes?: number;
  wasmBased: boolean;
  requiresContiguousBuffer: boolean;
  streamingSupported: boolean;
}

export const CLIENT_DEMO_PARSER_CAPABILITY: DemoParserCapability = {
  parserName: CLIENT_PARSER_NAME,
  parserVersion: CLIENT_PARSER_VERSION,
  runtime: CLIENT_PARSER_RUNTIME,
  inputCapability: "CONTIGUOUS_BUFFER",
  maxSafeInputBytes: CLIENT_DEMO_MAX_BYTES,
  wasmBased: true,
  requiresContiguousBuffer: true,
  streamingSupported: false,
};

export function isValidDemoParserCapability(
  value: DemoParserCapability,
): value is DemoParserCapability {
  return (
    value.parserName === CLIENT_PARSER_NAME &&
    value.parserVersion === CLIENT_PARSER_VERSION &&
    value.runtime === CLIENT_PARSER_RUNTIME &&
    DEMO_PARSER_INPUT_CAPABILITIES.includes(value.inputCapability) &&
    value.inputCapability !== "UNKNOWN" &&
    value.maxSafeInputBytes === CLIENT_DEMO_MAX_BYTES &&
    value.wasmBased === true &&
    value.requiresContiguousBuffer === true &&
    value.streamingSupported === false
  );
}

/**
 * Sole whole-file materialization boundary for the current WASM parser.
 * This must run in the parser Worker, never in React or the main-thread service.
 */
export async function readContiguousDemoInput(
  file: File,
  capability: DemoParserCapability,
): Promise<{ buffer: ArrayBuffer; bytes: Uint8Array }> {
  if (!isValidDemoParserCapability(capability)) throw new Error("CLIENT_PARSER_UNAVAILABLE");
  if (capability.inputCapability !== "CONTIGUOUS_BUFFER" || !capability.requiresContiguousBuffer)
    throw new Error("CLIENT_PARSER_UNAVAILABLE");
  if (file.size < 1 || file.size > (capability.maxSafeInputBytes ?? 0))
    throw new Error(file.size < 1 ? "CLIENT_DEMO_INVALID" : "CLIENT_DEMO_TOO_LARGE");
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength !== file.size) throw new Error("CLIENT_DEMO_INVALID");
  return { buffer, bytes: new Uint8Array(buffer) };
}
