/// <reference lib="webworker" />
import {
  CLIENT_PARSER_CAPABILITY_DIGEST,
  CLIENT_PARSER_CATALOG_DIGEST,
  CLIENT_PARSER_CAPABILITY_CATALOG,
} from "./clientParser.capabilities";
import {
  sha256Hex,
  sha256Text,
  stableClientJson,
  computeClientResultDigest,
} from "./clientParser.hash";
import { buildClientParserManifest } from "./clientParser.manifest";
import type {
  ClientParserCommand,
  ClientParserWorkerEvent,
  ClientParserStage,
} from "./clientParser.protocol";
import {
  CLIENT_DEMO_MAX_BYTES,
  CLIENT_EVENT_INVENTORY_LIMIT,
  CLIENT_EVENT_SAMPLE_LIMIT,
  CLIENT_PARSER_BUILD_IDENTITY,
  CLIENT_PARSER_NAME,
  CLIENT_PARSER_RUNTIME,
  CLIENT_PARSER_SCHEMA_VERSION,
  CLIENT_PARSER_VERSION,
  CLIENT_RESULT_MAX_BYTES,
  CLIENT_TICK_PROBE_LIMIT,
  type ClientEventSample,
  type ClientParseResult,
  type ClientParserErrorCode,
} from "./clientParser.types";

type WasmApi = {
  parseHeader: (file: Uint8Array) => unknown;
  listGameEvents: (file: Uint8Array) => unknown;
  parseEvent: (file: Uint8Array, name?: string, player?: unknown[], other?: unknown[]) => unknown;
  parseEvents?: (
    file: Uint8Array,
    names?: unknown[],
    player?: unknown[],
    other?: unknown[],
  ) => unknown;
  parseTicks: (file: Uint8Array, props?: unknown[], ticks?: Int32Array, soa?: boolean) => unknown;
  parseGrenades?: (file: Uint8Array) => unknown;
};
type WasmInit = ((input?: string) => Promise<unknown>) & Partial<WasmApi>;
type WorkerScope = typeof globalThis & {
  importScripts: (...urls: string[]) => void;
  wasm_bindgen?: WasmInit;
};

const scope = globalThis as WorkerScope;
let api: WasmInit | null = null;
let wasmLoadMs = 0;
const cancelled = new Set<string>();

function emit(event: ClientParserWorkerEvent) {
  scope.postMessage(event);
}
function progress(requestId: string, stage: ClientParserStage, value: number, started: number) {
  emit({
    type: "PROGRESS",
    requestId,
    stage,
    progress: value,
    elapsedMs: performance.now() - started,
  });
}
function assertActive(requestId: string) {
  if (cancelled.has(requestId)) throw new Error("CLIENT_CANCELLED");
}
function errorCode(error: unknown): ClientParserErrorCode {
  const message = error instanceof Error ? error.message : "";
  if (message === "CLIENT_CANCELLED") return "CLIENT_CANCELLED";
  if (
    message === "CLIENT_DEMO_INVALID" ||
    message === "CLIENT_DEMO_TOO_LARGE" ||
    message === "CLIENT_RESULT_TOO_LARGE"
  )
    return message;
  return api ? "CLIENT_PARSE_FAILED" : "CLIENT_PARSER_UNAVAILABLE";
}
function rows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row),
  );
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function safeString(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}
function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function initialize(command: Extract<ClientParserCommand, { type: "INIT" }>) {
  const started = performance.now();
  progress(command.requestId, "LOADING_WASM", 0, started);
  if (!command.scriptUrl || !command.wasmUrl) throw new Error("CLIENT_PARSER_UNAVAILABLE");
  scope.importScripts(command.scriptUrl);
  const candidate = scope.wasm_bindgen;
  if (typeof candidate !== "function") throw new Error("CLIENT_WASM_LOAD_FAILED");
  await candidate(command.wasmUrl);
  if (
    ![
      candidate.parseHeader,
      candidate.listGameEvents,
      candidate.parseEvent,
      candidate.parseTicks,
    ].every((fn) => typeof fn === "function")
  ) {
    throw new Error("CLIENT_WASM_LOAD_FAILED");
  }
  api = candidate;
  wasmLoadMs = performance.now() - started;
  emit({ type: "READY", requestId: command.requestId, wasmLoadMs });
}

async function parse(command: Extract<ClientParserCommand, { type: "PARSE" }>) {
  const started = performance.now();
  if (!api) throw new Error("CLIENT_PARSER_UNAVAILABLE");
  const parser = api as WasmInit &
    Required<Pick<WasmApi, "parseHeader" | "listGameEvents" | "parseEvent" | "parseTicks">>;
  const { file } = command;
  if (
    !file.name.toLowerCase().endsWith(".dem") ||
    file.size < 1 ||
    file.bytes.byteLength !== file.size
  )
    throw new Error("CLIENT_DEMO_INVALID");
  if (file.size > CLIENT_DEMO_MAX_BYTES) throw new Error("CLIENT_DEMO_TOO_LARGE");
  const bytes = new Uint8Array(file.bytes);
  progress(command.requestId, "READING_FILE", 0.03, started);
  assertActive(command.requestId);

  progress(command.requestId, "HASHING", 0.08, started);
  const hashStarted = performance.now();
  const demoSha = sha256Hex(bytes);
  const hashDurationMs = performance.now() - hashStarted;
  assertActive(command.requestId);

  const parseStarted = performance.now();
  progress(command.requestId, "PARSING_HEADER", 0.25, started);
  const header = object(parser.parseHeader(bytes));
  assertActive(command.requestId);

  progress(command.requestId, "DISCOVERING_EVENTS", 0.4, started);
  const discoveredEvents = parser.listGameEvents(bytes);
  const names = (Array.isArray(discoveredEvents) ? discoveredEvents : [])
    .filter((name): name is string => typeof name === "string")
    .slice(0, CLIENT_EVENT_INVENTORY_LIMIT)
    .sort();
  assertActive(command.requestId);

  progress(command.requestId, "PARSING_EVENTS", 0.55, started);
  const preferred = ["player_death", "round_end", "round_start"].filter((name) =>
    names.includes(name),
  );
  const eventInventory: ClientParseResult["eventInventory"] = [];
  const selectedEventSamples: ClientEventSample[] = [];
  for (const name of preferred) {
    assertActive(command.requestId);
    const parsed = rows(parser.parseEvent(bytes, name, [], []));
    const fields = [...new Set(parsed.flatMap((row) => Object.keys(row)))].sort();
    eventInventory.push({ name, count: parsed.length, fields });
    for (const row of parsed.slice(
      0,
      Math.max(0, CLIENT_EVENT_SAMPLE_LIMIT - selectedEventSamples.length),
    )) {
      selectedEventSamples.push({ eventName: name, tick: safeNumber(row["tick"]), fields: row });
    }
  }

  progress(command.requestId, "PARSING_TICKS", 0.72, started);
  const playbackTicks = safeNumber(header["playback_ticks"] ?? header["playbackTicks"]);
  const probeTicks =
    playbackTicks && playbackTicks > 1
      ? new Int32Array(
          [0, Math.floor(playbackTicks / 2), Math.floor(playbackTicks - 1)].slice(
            0,
            CLIENT_TICK_PROBE_LIMIT,
          ),
        )
      : new Int32Array();
  let tickStatus: ClientParseResult["tickProbe"]["status"] = probeTicks.length
    ? "AVAILABLE"
    : "UNAVAILABLE";
  let tickRows: Array<Record<string, unknown>> = [];
  if (probeTicks.length) {
    try {
      tickRows = rows(parser.parseTicks(bytes, ["tick"], probeTicks, false));
    } catch {
      tickStatus = "PARSE_FAILED";
    }
  }
  const observedTicks = tickRows
    .map((row) => safeNumber(row["tick"]))
    .filter((tick): tick is number => tick !== null);
  const uniqueTicks = new Set(observedTicks);
  const parseDurationMs = performance.now() - parseStarted;
  assertActive(command.requestId);

  progress(command.requestId, "BUILDING_RESULT", 0.88, started);
  const playerRows = rows(header["players"]);
  const runtimeDigest = sha256Text(
    stableClientJson({
      parser: CLIENT_PARSER_BUILD_IDENTITY,
      exports: [
        "listGameEvents",
        "parseEvent",
        "parseEvents",
        "parseGrenades",
        "parseHeader",
        "parseTicks",
      ],
    }),
  );
  const base: ClientParseResult = {
    schemaVersion: CLIENT_PARSER_SCHEMA_VERSION,
    parser: {
      name: CLIENT_PARSER_NAME,
      version: CLIENT_PARSER_VERSION,
      runtime: CLIENT_PARSER_RUNTIME,
      buildIdentity: CLIENT_PARSER_BUILD_IDENTITY,
      runtimeDigest,
    },
    demo: {
      sha256: demoSha,
      sizeBytes: file.size,
      name: file.name,
      lastModified: file.lastModified,
    },
    header,
    playerInventory: playerRows.slice(0, 128).map((row) => ({
      steamId: safeString(row["steamid"] ?? row["steam_id"]),
      name: safeString(row["name"] ?? row["player_name"]),
    })),
    eventInventory,
    selectedEventSamples,
    roundSummary: { status: "UNAVAILABLE", count: null },
    tickProbe: {
      status: tickStatus,
      requestedTickCount: probeTicks.length,
      returnedTickCount: tickRows.length,
      propertiesRequested: ["tick"],
      firstTick: observedTicks[0] ?? null,
      lastTick: observedTicks.at(-1) ?? null,
      duplicates: observedTicks.length - uniqueTicks.size,
      missingWithinProbe: Math.max(0, probeTicks.length - uniqueTicks.size),
    },
    coverage: {
      fullTickDomain: false,
      fullRawEvents: false,
      sampledEvents: selectedEventSamples.length > 0,
    },
    capabilities: CLIENT_PARSER_CAPABILITY_CATALOG,
    semanticStatus: "BLOCKED",
    performance: {
      fileSizeBytes: file.size,
      hashDurationMs,
      parseDurationMs,
      totalDurationMs: performance.now() - started,
      resultBytes: 0,
      workerStartupMs: 0,
      wasmLoadMs,
      memory: { status: "UNAVAILABLE", usedBytes: null },
    },
    resultDigest: "",
  };
  base.resultDigest = computeClientResultDigest(base);
  base.performance.resultBytes = new TextEncoder().encode(JSON.stringify(base)).byteLength;
  if (base.performance.resultBytes > CLIENT_RESULT_MAX_BYTES)
    throw new Error("CLIENT_RESULT_TOO_LARGE");
  progress(command.requestId, "BUILDING_MANIFEST", 0.96, started);
  const manifest = buildClientParserManifest(base);
  emit({ type: "COMPLETE", requestId: command.requestId, envelope: { result: base, manifest } });
}

scope.addEventListener("message", (event: MessageEvent<ClientParserCommand>) => {
  const command = event.data;
  if (!command || typeof command !== "object" || typeof command.requestId !== "string") return;
  if (command.type === "CANCEL") {
    cancelled.add(command.requestId);
    emit({ type: "CANCELLED", requestId: command.requestId });
    return;
  }
  const task =
    command.type === "INIT"
      ? initialize(command)
      : command.type === "PARSE"
        ? parse(command)
        : Promise.reject(new Error("CLIENT_WORKER_FAILED"));
  void task.catch((error: unknown) => {
    const code = errorCode(error);
    emit(
      code === "CLIENT_CANCELLED"
        ? { type: "CANCELLED", requestId: command.requestId }
        : { type: "ERROR", requestId: command.requestId, code },
    );
  });
});
