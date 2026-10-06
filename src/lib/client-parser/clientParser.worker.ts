/// <reference lib="webworker" />
import {
  capabilitiesForSurface,
  CLIENT_PARSER_ARTIFACT_PROVENANCE,
  inspectRuntimeSurface,
  playerInventoryFromRuntime,
  trustedRuntimeUrl,
} from "./clientParser.runtime";
import {
  sha256Hex,
  sha256Text,
  computeClientResultDigest,
  stableClientJson,
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
  CLIENT_GRENADE_SAMPLE_LIMIT,
  CLIENT_PARSER_BUILD_IDENTITY,
  CLIENT_PARSER_NAME,
  CLIENT_PARSER_RUNTIME,
  CLIENT_PARSER_SCHEMA_VERSION,
  CLIENT_PARSER_CATALOG_VERSION,
  CLIENT_PARSER_VERSION,
  CLIENT_RESULT_MAX_BYTES,
  CLIENT_TICK_PROBE_LIMIT,
  type ClientEventSample,
  type ClientApiCallEvidence,
  type ClientParseResult,
  type ClientParserErrorCode,
} from "./clientParser.types";
import { readContiguousDemoInput } from "./clientParser.input";
import {
  CLIENT_AUDIT_CATALOG_DIGEST,
  CLIENT_PARSER_CONTRACT_DIGEST,
  CLIENT_PRIORITY_EVENTS,
  CLIENT_TICK_PROPERTIES,
  eventFieldRequest,
  headerEvidence,
} from "./clientParser.audit";

function roundEvidenceFromSamples(
  samples: ClientEventSample[],
): ClientParseResult["roundEvidence"] {
  const starts = samples.filter(
    (sample): sample is ClientEventSample & { tick: number } =>
      sample.eventName === "round_start" && sample.tick !== null,
  );
  const ends = samples.filter(
    (sample): sample is ClientEventSample & { tick: number } =>
      sample.eventName === "round_end" && sample.tick !== null,
  );
  return starts.map((start, index) => {
    const nextStartTick = starts[index + 1]?.tick ?? null;
    const end = ends.find(
      (candidate) =>
        candidate.tick >= start.tick && (nextStartTick === null || candidate.tick < nextStartTick),
    );
    const startTick = start.tick;
    const endTick = end?.tick ?? null;
    const winnerSlot = safeNumber(end?.fields["winner"] ?? end?.fields["winner_slot"]);
    const winnerSideValue = end?.fields["winner_side"] ?? end?.fields["winner_team"];
    return {
      derivedRoundIndex: index + 1,
      observedRoundNumber: safeNumber(
        start.fields["round"] ?? start.fields["round_number"] ?? start.fields["round_number_real"],
      ),
      startTick,
      endTick,
      duration: endTick === null ? null : endTick - startTick,
      winnerSlot,
      winnerSide: typeof winnerSideValue === "string" ? winnerSideValue : null,
      reason: typeof end?.fields["reason"] === "string" ? end.fields["reason"] : null,
      eventsCount: samples.filter(
        (sample) =>
          sample.tick !== null &&
          sample.tick >= startTick &&
          (endTick === null || sample.tick <= endTick),
      ).length,
      completeness:
        endTick === null
          ? "MISSING_END"
          : ends.filter((item) => item.tick === endTick).length > 1
            ? "AMBIGUOUS"
            : "COMPLETE",
      source: "round_start+round_end",
      evidenceScope: "BOUNDED_REFERENCE",
      sampleLimit: CLIENT_EVENT_SAMPLE_LIMIT,
      sampled: true,
      complete: false,
      evidenceRef: `round:${index + 1}:${startTick}:${endTick ?? "missing"}`,
    };
  });
}

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
  parseTicks: (file: Uint8Array, props?: unknown[], ticks?: Int32Array, wantedPlayers?: unknown[], structOfArrays?: boolean) => unknown;
  parseGrenades?: (file: Uint8Array) => unknown;
  parsePlayerInfo?: (file: Uint8Array) => unknown;
};
type WasmInit = ((input?: string | ArrayBuffer | Uint8Array) => Promise<unknown>) &
  Partial<WasmApi>;
type WorkerScope = typeof globalThis & {
  importScripts: (...urls: string[]) => void;
  wasm_bindgen?: WasmInit;
  __gameproWasmBindgen?: WasmInit;
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
    message === "CLIENT_DEMO_PARSE_FAILED" ||
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

function apiEvidence(
  name: string,
  exportPresent: boolean,
  callAttempted: boolean,
  callSucceeded: boolean,
  error?: unknown,
  durationMs: number | null = null,
  result?: unknown,
  detail: Partial<ClientApiCallEvidence> = {},
  demoSha256 = "",
): ClientApiCallEvidence {
  const rawMessage = error instanceof Error ? error.message : null;
  return {
    api: name,
    exportPresent,
    callAttempted,
    callSucceeded,
    status: callSucceeded
      ? "CALL_SUCCEEDED"
      : callAttempted
        ? "CALL_FAILED"
        : exportPresent
          ? "EXPORT_PRESENT"
          : "CALL_FAILED",
    errorType: error instanceof Error ? error.name : error === undefined ? null : "UnknownError",
    errorMessage: rawMessage ? rawMessage.slice(0, 160) : null,
    durationMs,
    resultBytes: callSucceeded
      ? new TextEncoder().encode(stableClientJson(result ?? null)).byteLength
      : null,
    normalizedDigest: callSucceeded ? sha256Text(stableClientJson(result ?? null)) : null,
    eventName: null,
    requestedPlayerFields: [],
    requestedOtherFields: [],
    actualReturnedFields: [],
    missingRequestedFields: [],
    unexpectedReturnedFields: [],
    inputDigest: null,
    outputDigest: callSucceeded ? sha256Text(stableClientJson(result ?? null)) : null,
    evidenceRef: null,
    requestCatalogVersion: CLIENT_PARSER_CATALOG_VERSION,
    requestCatalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
    eventCatalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
    parserVersion: CLIENT_PARSER_VERSION,
    parserRevision: CLIENT_PARSER_ARTIFACT_PROVENANCE.sourceCommit ?? "",
    demoSha256,
    ...detail,
  };
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
    new Blob([`${bindingText}\n;globalThis.__gameproWasmBindgen=wasm_bindgen;`], {
      type: "text/javascript;charset=utf-8",
    }),
  );
  try {
    scope.importScripts(bindingBlobUrl);
  } finally {
    URL.revokeObjectURL(bindingBlobUrl);
  }
  const candidate = scope.__gameproWasmBindgen ?? scope.wasm_bindgen;
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
    reason: CLIENT_PARSER_ARTIFACT_PROVENANCE.reason,
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
    command.authorization.filename !== file.name
  )
    throw new Error("CLIENT_DEMO_INVALID");
  if (file.size > CLIENT_DEMO_MAX_BYTES) throw new Error("CLIENT_DEMO_TOO_LARGE");
  progress(command.requestId, "READING_FILE", 0.03, started);
  const { bytes } = await readContiguousDemoInput(file, command.capability);
  assertActive(command.requestId);

  const demoSha = command.authorization.sha256;
  if (
    command.authorization.authorizedDemo !== true ||
    command.authorization.provenance !== "LOCAL_USER_SELECTION" ||
    command.authorization.source !== "LOCAL_FILE" ||
    command.authorization.filename !== file.name ||
    command.authorization.sizeBytes !== file.size ||
    !/^[0-9a-f]{64}$/.test(demoSha) ||
    !command.authorization.authorizationRef ||
    !command.authorization.receivedAt ||
    !Number.isFinite(command.hashDurationMs) ||
    command.hashDurationMs < 0
  )
    throw new Error("CLIENT_DEMO_INVALID");
  const hashDurationMs = command.hashDurationMs;
  assertActive(command.requestId);

  const parseStarted = performance.now();
  const apiCalls: ClientApiCallEvidence[] = [];
  progress(command.requestId, "PARSING_HEADER", 0.25, started);
  let header: Record<string, unknown>;
  try {
    const callStarted = performance.now();
    header = object(parser.parseHeader(bytes));
    apiCalls.push(
      apiEvidence(
        "parseHeader",
        true,
        true,
        true,
        undefined,
        performance.now() - callStarted,
        header,
      ),
    );
  } catch (error) {
    apiCalls.push(apiEvidence("parseHeader", true, true, false, error));
    throw new Error("CLIENT_DEMO_PARSE_FAILED");
  }
  assertActive(command.requestId);

  progress(command.requestId, "DISCOVERING_EVENTS", 0.4, started);
  let discoveryStatus: ClientParseResult["eventDiscovery"]["status"] = "AVAILABLE";
  let discoveredEvents: unknown;
  try {
    const callStarted = performance.now();
    discoveredEvents = parser.listGameEvents(bytes);
    apiCalls.push(
      apiEvidence(
        "listGameEvents",
        true,
        true,
        true,
        undefined,
        performance.now() - callStarted,
        discoveredEvents,
      ),
    );
  } catch (error) {
    apiCalls.push(apiEvidence("listGameEvents", true, true, false, error));
    discoveryStatus = "PARSE_FAILED";
    discoveredEvents = [];
  }
  const discoveredEventsRaw = (Array.isArray(discoveredEvents) ? discoveredEvents : [])
    .filter((name): name is string => typeof name === "string")
    .slice(0, CLIENT_EVENT_INVENTORY_LIMIT);
  const names = [...discoveredEventsRaw];
  const uniqueEventNames = [...new Set(names)];
  const normalizedEventInventory = [...uniqueEventNames].sort();
  assertActive(command.requestId);

  progress(command.requestId, "PARSING_EVENTS", 0.55, started);
  const parsedEventInventory: ClientParseResult["parsedEventInventory"] = [];
  const selectedEventSamples: ClientEventSample[] = [];
  let parseEventSucceeded = false;
  let parseEventFailure: unknown;
  let parseEventAttempted = false;
  let parseEventDurationMs = 0;
  let parseEventResultBytes = 0;
  const parsedEventDigests: string[] = [];
  const eventsToAudit = [...new Set([...CLIENT_PRIORITY_EVENTS, ...uniqueEventNames])].slice(
    0,
    CLIENT_EVENT_INVENTORY_LIMIT,
  );
  for (const name of eventsToAudit) {
    assertActive(command.requestId);
    if (!names.includes(name)) {
      const request = eventFieldRequest(name);
      parsedEventInventory.push({
        name,
        status: "NOT_PRESENT",
        count: null,
        fields: [],
        requestedPlayerFields: [...request.playerFields],
        requestedOtherFields: [...request.otherFields],
        semanticStatus: "NOT_RUN",
      });
      continue;
    }
    const request = eventFieldRequest(name);
    let parsed: Array<Record<string, unknown>>;
    try {
      parseEventAttempted = true;
      const callStarted = performance.now();
      parsed = rows(
        parser.parseEvent(bytes, name, [...request.playerFields], [...request.otherFields]),
      );
      parseEventDurationMs += performance.now() - callStarted;
      const encoded = stableClientJson(parsed);
      parseEventResultBytes += new TextEncoder().encode(encoded).byteLength;
      parsedEventDigests.push(sha256Text(encoded));
      parseEventSucceeded = true;
      const actualReturnedFields = [...new Set(parsed.flatMap((row) => Object.keys(row)))].sort();
      const requestedFields = [...request.playerFields, ...request.otherFields];
      apiCalls.push(
        apiEvidence(
          "parseEvent",
          true,
          true,
          true,
          undefined,
          performance.now() - callStarted,
          parsed,
          {
            eventName: name,
            requestedPlayerFields: [...request.playerFields],
            requestedOtherFields: [...request.otherFields],
            actualReturnedFields,
            missingRequestedFields: requestedFields.filter(
              (field) => !actualReturnedFields.includes(field),
            ),
            unexpectedReturnedFields: actualReturnedFields.filter(
              (field) => !requestedFields.includes(field),
            ),
            inputDigest: sha256Text(stableClientJson({ demoSha, name, request })),
            outputDigest: sha256Text(encoded),
            evidenceRef: `parseEvent:${name}:${sha256Text(encoded)}`,
            requestCatalogVersion: CLIENT_PARSER_CATALOG_VERSION,
            requestCatalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
            eventCatalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
            parserVersion: CLIENT_PARSER_VERSION,
            parserRevision: CLIENT_PARSER_ARTIFACT_PROVENANCE.sourceCommit ?? "",
            demoSha256: demoSha,
          },
        ),
      );
    } catch (error) {
      parseEventFailure = error;
      apiCalls.push(
        apiEvidence("parseEvent", true, true, false, error, null, undefined, {
          eventName: name,
          requestedPlayerFields: [...request.playerFields],
          requestedOtherFields: [...request.otherFields],
          inputDigest: sha256Text(stableClientJson({ demoSha, name, request })),
          evidenceRef: `parseEvent:${name}:failed`,
          requestCatalogVersion: CLIENT_PARSER_CATALOG_VERSION,
          requestCatalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
          eventCatalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
          parserVersion: CLIENT_PARSER_VERSION,
          parserRevision: CLIENT_PARSER_ARTIFACT_PROVENANCE.sourceCommit ?? "",
          demoSha256: demoSha,
        }),
      );
      parsedEventInventory.push({
        name,
        status: "PRESENT_BUT_FAILED",
        count: null,
        fields: [],
        requestedPlayerFields: [...request.playerFields],
        requestedOtherFields: [...request.otherFields],
        semanticStatus: "FAIL",
      });
      continue;
    }
    const fields = [...new Set(parsed.flatMap((row) => Object.keys(row)))].sort().slice(0, 256);
    const requestedFields = [...request.playerFields, ...request.otherFields];
    const semanticStatus = requestedFields.every((field) => fields.includes(field))
      ? "PASS"
      : "FAIL";
    parsedEventInventory.push({
      name,
      status: "PRESENT_AND_PARSED",
      count: parsed.length,
      fields,
      requestedPlayerFields: [...request.playerFields],
      requestedOtherFields: [...request.otherFields],
      semanticStatus,
    });
    for (const row of parsed.slice(
      0,
      Math.max(0, CLIENT_EVENT_SAMPLE_LIMIT - selectedEventSamples.length),
    )) {
      selectedEventSamples.push({ eventName: name, tick: safeNumber(row["tick"]), fields: row });
    }
  }
  if (!parseEventAttempted) {
    try {
      parseEventAttempted = true;
      const callStarted = performance.now();
      const fallbackName = names[0] ?? "player_death";
      const request = eventFieldRequest(fallbackName);
      const fallbackResult = parser.parseEvent(
        bytes,
        fallbackName,
        [...request.playerFields],
        [...request.otherFields],
      );
      parseEventDurationMs += performance.now() - callStarted;
      const encoded = stableClientJson(fallbackResult ?? null);
      parseEventResultBytes += new TextEncoder().encode(encoded).byteLength;
      parsedEventDigests.push(sha256Text(encoded));
      parseEventSucceeded = true;
    } catch (error) {
      parseEventFailure = error;
    }
  }
  apiCalls.push({
    ...apiEvidence(
      "parseEvent",
      true,
      parseEventAttempted,
      parseEventSucceeded,
      parseEventFailure,
      parseEventAttempted ? parseEventDurationMs : null,
      parsedEventDigests,
    ),
    resultBytes: parseEventSucceeded ? parseEventResultBytes : null,
  });

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
      const callStarted = performance.now();
      tickRows = rows(parser.parseTicks(bytes, [...CLIENT_TICK_PROPERTIES], probeTicks, [], false));
      apiCalls.push(
        apiEvidence(
          "parseTicks",
          true,
          true,
          true,
          undefined,
          performance.now() - callStarted,
          tickRows,
        ),
      );
    } catch (error) {
      apiCalls.push(apiEvidence("parseTicks", true, true, false, error));
      tickStatus = "PARSE_FAILED";
    }
  } else {
    apiCalls.push(apiEvidence("parseTicks", true, false, false));
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
  apiCalls.push(
    apiEvidence(
      "parsePlayerInfo",
      runtimeSurface.observedExports.includes("parsePlayerInfo"),
      runtimeSurface.observedExports.includes("parsePlayerInfo"),
      playerInventory.status === "AVAILABLE",
      playerInventory.status === "PARSE_FAILED" ? new Error("parse_failed") : undefined,
    ),
  );
  let grenadeEvidence: ClientParseResult["grenadeEvidence"] = {
    status: "UNAVAILABLE",
    count: null,
    samples: [],
    normalizedSamples: [],
    normalization: "RAW_ONLY",
    lifecycleStatus: "RAW_ONLY",
    normalizedDigest: null,
    rawFieldInventory: [],
    semanticStatus: "NOT_RUN",
    evidenceRef: null,
  };
  if (typeof parser.parseGrenades === "function") {
    const callStarted = performance.now();
    try {
      const grenadeRows = rows(parser.parseGrenades(bytes));
      const rawFieldInventory = [...new Set(grenadeRows.flatMap((row) => Object.keys(row)))].sort();
      const samples = grenadeRows.slice(0, CLIENT_GRENADE_SAMPLE_LIMIT);
      const normalizedSamples = samples.map((row) => ({
        rawGrenadeName: row["name"] ?? null,
        rawGrenadeType: row["grenade_type"] ?? null,
        rawEntityId: row["entity_id"] ?? null,
        rawSteamId: row["steamid"] ?? null,
        rawTick: row["tick"] ?? null,
        rawX: row["x"] ?? null,
        rawY: row["y"] ?? null,
        rawZ: row["z"] ?? null,
        normalizedGrenadeType: null,
        normalizedGrenadeIdentity: null,
        normalizedPosition: null,
        lifecycle: "UNRESOLVED",
      }));
      const normalizedDigest = sha256Text(stableClientJson(normalizedSamples));
      grenadeEvidence = {
        status: "AVAILABLE",
        count: grenadeRows.length,
        samples,
        normalizedSamples,
        normalization: "RAW_ONLY",
        lifecycleStatus: "UNRESOLVED",
        normalizedDigest,
        rawFieldInventory,
        semanticStatus: [
          "entity_id",
          "grenade_type",
          "name",
          "steamid",
          "tick",
          "x",
          "y",
          "z",
        ].every((field) => rawFieldInventory.includes(field))
          ? "PASS"
          : "FAIL",
        evidenceRef: `grenades:${normalizedDigest}`,
      };
      apiCalls.push(
        apiEvidence("parseGrenades", true, true, true, undefined, performance.now() - callStarted, {
          count: grenadeRows.length,
          rawFieldInventory,
          normalizedDigest,
        }),
      );
    } catch (error) {
      grenadeEvidence = { ...grenadeEvidence, status: "PARSE_FAILED", semanticStatus: "FAIL" };
      apiCalls.push(
        apiEvidence("parseGrenades", true, true, false, error, performance.now() - callStarted),
      );
    }
  } else {
    apiCalls.push(apiEvidence("parseGrenades", false, false, false));
  }
  const capabilities = capabilitiesForSurface(runtimeSurface);
  const base: ClientParseResult = {
    schemaVersion: CLIENT_PARSER_SCHEMA_VERSION,
    parser: {
      name: CLIENT_PARSER_NAME,
      version: CLIENT_PARSER_VERSION,
      runtime: CLIENT_PARSER_RUNTIME,
      buildIdentity: CLIENT_PARSER_BUILD_IDENTITY,
      runtimeSurface,
      apiCalls,
      artifact,
    },
    demo: {
      sha256: demoSha,
      sizeBytes: file.size,
      name: file.name,
      lastModified: file.lastModified,
      authorization: command.authorization,
    },
    header: { values: header, evidence: headerEvidence(header) },
    playerInventory,
    eventDiscovery: {
      status: discoveryStatus,
      discoveredEventsRaw,
      discoveredEventCount: names.length,
      discoveredEventNamesInOrder: names,
      duplicateEventCount: names.length - uniqueEventNames.length,
      uniqueEventNames,
      normalizedEventInventory,
    },
    parsedEventInventory,
    selectedEventSamples,
    grenadeEvidence,
    roundEvidence: roundEvidenceFromSamples(selectedEventSamples),
    tickDomainEvidence: {
      source: "header_probe",
      provenance: "demoparser2.parseHeader+parseTicks",
      firstTick: observedTicks[0] ?? null,
      lastTick: observedTicks.at(-1) ?? null,
      tickCount: playbackTicks,
      probeTicks: [...probeTicks],
      probeType: "FIRST_MIDDLE_LAST",
      headerPlaybackTicks: playbackTicks,
      authoritativeDomain: false,
      domainEvidenceRef: tickRows.length
        ? `tick-probe:${sha256Text(stableClientJson(tickRows))}`
        : null,
      coverageStatus:
        tickStatus === "AVAILABLE"
          ? "PROBE_ONLY"
          : tickStatus === "PARSE_FAILED"
            ? "PARSE_FAILED"
            : "UNAVAILABLE",
      authoritative: false,
      evidenceRef: tickRows.length ? `tick-probe:${sha256Text(stableClientJson(tickRows))}` : null,
    },
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
