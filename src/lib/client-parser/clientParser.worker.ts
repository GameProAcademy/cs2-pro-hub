/// <reference lib="webworker" />
import {
  capabilitiesForSurface,
  CLIENT_PARSER_ARTIFACT_PROVENANCE,
  inspectRuntimeSurface,
  playerInventoryFromRuntime,
  trustedRuntimeUrl,
} from "./clientParser.runtime";
import { sha256Hex, sha256Text, computeClientResultDigest } from "./clientParser.hash";
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
import {
  CLIENT_PRIORITY_EVENTS,
  CLIENT_TICK_PROPERTIES,
  headerEvidence,
} from "./clientParser.audit";

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
  parsePlayerInfo?: (file: Uint8Array) => unknown;
};
type WasmInit = ((input?: string | ArrayBuffer | Uint8Array) => Promise<unknown>) &
  Partial<WasmApi>;
type WorkerScope = typeof globalThis & {
  importScripts: (...urls: string[]) => void;
  wasm_bindgen?: WasmInit;
};

const scope = globalThis as WorkerScope;
let api: WasmInit | null = null;
let wasmLoadMs = 0;
let runtimeSurface: ReturnType<typeof inspectRuntimeSurface> | null = null;
let artifact = CLIENT_PARSER_ARTIFACT_PROVENANCE;
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
    message === "CLIENT_RESULT_TOO_LARGE" ||
    message === "CLIENT_WASM_LOAD_FAILED" ||
    message === "CLIENT_WASM_INTEGRITY_MISMATCH" ||
    message === "CLIENT_WASM_EXPORTS_MISSING" ||
    message === "CLIENT_WASM_INIT_FAILED"
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
function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function initialize(command: Extract<ClientParserCommand, { type: "INIT" }>) {
  const started = performance.now();
  progress(command.requestId, "LOADING_WASM", 0, started);
  const baseUrl = scope.location.href;
  const scriptUrl = trustedRuntimeUrl(command.scriptUrl, baseUrl);
  const wasmUrl = trustedRuntimeUrl(command.wasmUrl, baseUrl);
  if (!scriptUrl || !wasmUrl) throw new Error("CLIENT_PARSER_UNAVAILABLE");
  if (!/^[0-9a-f]{64}$/.test(command.expectedBindingSha256 ?? ""))
    throw new Error("CLIENT_WASM_INTEGRITY_MISMATCH");
  if (!/^[0-9a-f]{64}$/.test(command.expectedWasmSha256 ?? ""))
    throw new Error("CLIENT_WASM_INTEGRITY_MISMATCH");
  const [bindingResponse, wasmResponse] = await Promise.all([fetch(scriptUrl), fetch(wasmUrl)]);
  if (!bindingResponse.ok || !wasmResponse.ok) throw new Error("CLIENT_WASM_LOAD_FAILED");
  const [bindingText, wasmBytes] = await Promise.all([
    bindingResponse.text(),
    wasmResponse.arrayBuffer(),
  ]);
  const bindingSha256 = sha256Text(bindingText);
  const wasmBinarySha256 = sha256Hex(new Uint8Array(wasmBytes));
  if (
    bindingSha256 !== command.expectedBindingSha256 ||
    wasmBinarySha256 !== command.expectedWasmSha256
  )
    throw new Error("CLIENT_WASM_INTEGRITY_MISMATCH");
  const bindingBlobUrl = URL.createObjectURL(
    new Blob([bindingText], { type: "text/javascript;charset=utf-8" }),
  );
  try {
    scope.importScripts(bindingBlobUrl);
  } finally {
    URL.revokeObjectURL(bindingBlobUrl);
  }
  const candidate = scope.wasm_bindgen;
  if (typeof candidate !== "function") throw new Error("CLIENT_WASM_LOAD_FAILED");
  try {
    await candidate(wasmBytes);
  } catch {
    throw new Error("CLIENT_WASM_INIT_FAILED");
  }
  runtimeSurface = inspectRuntimeSurface(candidate as unknown as Record<string, unknown>);
  if (!runtimeSurface.minimumReady) throw new Error("CLIENT_WASM_EXPORTS_MISSING");
  artifact = {
    ...CLIENT_PARSER_ARTIFACT_PROVENANCE,
    bindingUrl: scriptUrl,
    wasmUrl,
    wasmBindingSha256: bindingSha256,
    wasmBinarySha256,
    artifactSize: wasmBytes.byteLength,
    status: "VERIFIED",
    reason: null,
  };
  api = candidate;
  wasmLoadMs = performance.now() - started;
  emit({ type: "READY", requestId: command.requestId, wasmLoadMs });
}

async function parse(command: Extract<ClientParserCommand, { type: "PARSE" }>) {
  const started = performance.now();
  if (!api || !runtimeSurface) throw new Error("CLIENT_PARSER_UNAVAILABLE");
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
  let discoveryStatus: ClientParseResult["eventDiscovery"]["status"] = "AVAILABLE";
  let discoveredEvents: unknown;
  try {
    discoveredEvents = parser.listGameEvents(bytes);
  } catch {
    discoveryStatus = "PARSE_FAILED";
    discoveredEvents = [];
  }
  const names = (Array.isArray(discoveredEvents) ? discoveredEvents : [])
    .filter((name): name is string => typeof name === "string")
    .slice(0, CLIENT_EVENT_INVENTORY_LIMIT)
    .sort();
  assertActive(command.requestId);

  progress(command.requestId, "PARSING_EVENTS", 0.55, started);
  const parsedEventInventory: ClientParseResult["parsedEventInventory"] = [];
  const selectedEventSamples: ClientEventSample[] = [];
  for (const name of CLIENT_PRIORITY_EVENTS) {
    assertActive(command.requestId);
    if (!names.includes(name)) {
      parsedEventInventory.push({ name, status: "NOT_PRESENT", count: null, fields: [] });
      continue;
    }
    let parsed: Array<Record<string, unknown>>;
    try {
      parsed = rows(parser.parseEvent(bytes, name, [], []));
    } catch {
      parsedEventInventory.push({ name, status: "PRESENT_BUT_FAILED", count: null, fields: [] });
      continue;
    }
    const fields = [...new Set(parsed.flatMap((row) => Object.keys(row)))].sort().slice(0, 256);
    parsedEventInventory.push({ name, status: "PRESENT_AND_PARSED", count: parsed.length, fields });
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
      tickRows = rows(parser.parseTicks(bytes, [...CLIENT_TICK_PROPERTIES], probeTicks, false));
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
  const playerInventory = playerInventoryFromRuntime(
    parser as unknown as Record<string, unknown>,
    bytes,
  );
  const capabilities = capabilitiesForSurface(runtimeSurface);
  const base: ClientParseResult = {
    schemaVersion: CLIENT_PARSER_SCHEMA_VERSION,
    parser: {
      name: CLIENT_PARSER_NAME,
      version: CLIENT_PARSER_VERSION,
      runtime: CLIENT_PARSER_RUNTIME,
      buildIdentity: CLIENT_PARSER_BUILD_IDENTITY,
      runtimeSurface,
      artifact,
    },
    demo: {
      sha256: demoSha,
      sizeBytes: file.size,
      name: file.name,
      lastModified: file.lastModified,
    },
    header: { values: header, evidence: headerEvidence(header) },
    playerInventory,
    eventDiscovery: { status: discoveryStatus, count: names.length, names },
    parsedEventInventory,
    selectedEventSamples,
    roundSummary: {
      status: parsedEventInventory.some(
        (item) => item.name === "round_start" && item.status === "PRESENT_AND_PARSED",
      )
        ? "DERIVED"
        : "UNAVAILABLE",
      count:
        parsedEventInventory.find(
          (item) => item.name === "round_start" && item.status === "PRESENT_AND_PARSED",
        )?.count ?? null,
    },
    tickProbe: {
      status: tickStatus,
      requestedTickCount: probeTicks.length,
      returnedTickCount: tickRows.length,
      propertiesRequested: [...CLIENT_TICK_PROPERTIES],
      firstTick: observedTicks[0] ?? null,
      lastTick: observedTicks.at(-1) ?? null,
      duplicates: observedTicks.length - uniqueTicks.size,
      missingWithinProbe: Math.max(0, probeTicks.length - uniqueTicks.size),
      samples: tickRows,
    },
    coverage: {
      fullTickDomain: false,
      authoritativeTickDomain: false,
      fullRawEvents: false,
      sampledEvents: selectedEventSamples.length > 0,
    },
    capabilities,
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
  cancelled.delete(command.requestId);
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
    cancelled.delete(command.requestId);
  });
});
