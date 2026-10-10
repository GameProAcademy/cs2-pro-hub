import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID, webcrypto } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import {
  digest,
  sha,
  locks,
  validateDemo,
  fixtureProfile,
  validateManifests,
  sanitizePrivateRuntimeEvidence,
} from "./contracts.mjs";

import { createTelemetry, failureEvidence } from "./diagnostics.mjs";
import {
  CANONICAL_CONTRACT_DIGEST,
  CANONICAL_CONTRACT_VERSION,
  CONTRACT,
  TableAccumulator,
  summarizeColumns,
  summarizeRows,
} from "./canonical_schema.mjs";

export const WASM_PAGE_BYTES = 64 * 1024;
/**
 * Explicit per-call ceiling for WASM linear memory. wasm32 cannot address
 * more than 4 GiB (65,536 pages); a call that needs more than this budget is
 * reported as WASM_MEMORY_BUDGET_EXCEEDED instead of being left to trap at
 * the hard limit. Measured need for the 474 MB reference shape with
 * column-major output is about 1.4 GiB.
 */
export const WASM_MEMORY_BUDGET_BYTES = 3 * 1024 * 1024 * 1024;

/** Decode the Uint32Array returned by the artifact's a91MemoryProbe export. */
export function decodeMemoryProbe(values) {
  if (!values || values.length < 7) return null;
  const pages = (index) => (values[index] ? values[index] * WASM_PAGE_BYTES : null);
  return {
    lastStage:
      {
        0: "not_entered",
        1: "entered_input_copied",
        2: "parsed_columns_built",
        4: "rows_materialized",
        5: "serialized_to_js",
      }[values[0]] ?? "unknown",
    rows: values[1],
    bytesNow: pages(2),
    bytesAfterInputCopy: pages(3),
    bytesAfterParse: pages(4),
    bytesAfterRowMaterialization: pages(5),
    bytesAfterSerialization: pages(6),
  };
}

const entriesOf = (row) =>
  Object.prototype.toString.call(row) === "[object Map]"
    ? row.entries()
    : row && typeof row === "object" && !Array.isArray(row)
      ? Object.entries(row)
      : null;

/**
 * Streaming equivalent of normalizeWasmValue + normalizeEventRows +
 * summarizeRows for event tables: validates the event_name discriminator of
 * every row (contract rule R10) and feeds the accumulator without building a
 * second copy of the table.
 */
export function summarizeEventRows(tableName, rows, expectedEventName) {
  if (!Array.isArray(rows) || typeof expectedEventName !== "string" || !expectedEventName)
    throw new Error("A91_WASM_EVENT_SHAPE_INVALID");
  const discriminator = CONTRACT.eventRowDiscriminator;
  const accumulator = new TableAccumulator(tableName);
  for (const row of rows) {
    const entries = entriesOf(row);
    if (!entries) throw new Error("A91_WASM_EVENT_ROW_INVALID");
    const semantic = {};
    for (const [key, value] of entries) {
      if (key === discriminator) {
        if (value !== expectedEventName) throw new Error("A91_WASM_EVENT_NAME_MISMATCH");
        continue;
      }
      semantic[key] = value;
    }
    accumulator.addRow(semantic);
  }
  return accumulator.finish();
}

/** Column-major table (Map or object of field -> array) to a canonical summary. */
export function summarizeColumnTable(tableName, value) {
  const entries = entriesOf(value);
  if (!entries) throw new Error("A91_WASM_TABLE_SHAPE_INVALID");
  const columns = {};
  for (const [field, column] of entries) {
    if (typeof field !== "string" || !(Array.isArray(column) || ArrayBuffer.isView(column)))
      throw new Error("A91_WASM_TABLE_SHAPE_INVALID");
    columns[field] = column;
  }
  return summarizeColumns(tableName, columns);
}

/** Canonical table name for each table-producing API (contract v1). */
export function tableNameFor(api, request = {}) {
  if (api === "parseEvent") return `event:${request.eventName}`;
  if (api === "parseGrenades") return "grenades";
  if (api === "parseTicks") return "ticks";
  return null;
}

/** Economy domain = the contract's economy columns of the tick table. */
export function economyProjection(table) {
  const fields = CONTRACT.economyFields.filter((field) => Object.hasOwn(table.columns, field));
  if (fields.length === 0) return { status: "FAILED", reason: "NO_ECONOMY_FIELDS" };
  return {
    status: "TICK_PROJECTION",
    canonicalContractVersion: table.canonicalContractVersion,
    rowCount: table.rowCount,
    fields,
    columns: Object.fromEntries(fields.map((field) => [field, table.columns[field]])),
  };
}

/**
 * Semantic evidence shared by every WASM artifact. python_reference.py's
 * build_semantic_evidence() must return the same keys with the same shapes
 * (contract rule R11); scripts/a91/cross_runtime.check.mjs enforces it.
 */
export function buildSemanticEvidence({
  header,
  events,
  grenades,
  ticks,
  tickProbe,
  requestedFields,
  wantedTicks,
}) {
  const byName = (predicate) => events.filter((event) => predicate(event.eventName));
  return {
    headerEvidence: header,
    mapEvidence: { map: header?.map_name ?? null },
    timingEvidence: { header, tickProbe },
    eventEvidence: events,
    roundEvidence: byName((name) => name.startsWith("round_")),
    grenadeEvidence: { table: grenades },
    bombEvidence: byName((name) => name.startsWith("bomb_")),
    deathEvidence: byName((name) => name === "player_death"),
    damageEvidence: byName((name) => name === "player_hurt"),
    weaponEvidence: byName((name) => name.startsWith("weapon_") || name.startsWith("item_")),
    economyEvidence: economyProjection(ticks),
    tickDomainEvidence: {
      tickProbeSource: tickProbe.source,
      maxFrameTick: tickProbe.maxFrameTick,
      requestedFields,
      wantedTicks,
      authoritativeDomain: false,
      table: ticks,
    },
  };
}

const root = resolve(new URL("../..", import.meta.url).pathname);
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const sample = (value, limit = 1000) => {
  if (Array.isArray(value)) return value.slice(0, limit).map((v) => sample(v, limit));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sample(v, limit)]));
  return value;
};

/**
 * serde-wasm-bindgen serializes Rust maps as JavaScript Map instances by
 * default. A9.1's canonical JSON digest and Python reference use object/dict
 * records; Object.entries(new Map(...)) is empty and silently discards every
 * parsed field. Normalize all WASM return values at the boundary before any
 * digest, sample, or domain projection is computed. The tag check is
 * cross-realm safe because parser instances run in a vm context.
 */
export function normalizeWasmValue(value) {
  // serde-wasm-bindgen defaults Option::None to undefined; the Python
  // reference normalizes missing cell values to JSON null.
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return value;
  // Rebuild arrays in this realm too: arrays returned from a VM context
  // retain foreign prototypes when Array.prototype.map is invoked on them.
  if (Array.isArray(value)) return Array.from(value, normalizeWasmValue);
  const tag = Object.prototype.toString.call(value);
  if (tag === "[object Map]") {
    const entries = Array.from(value.entries(), ([key, item]) => {
      if (typeof key !== "string") throw new Error("A91_WASM_MAP_KEY_INVALID");
      return [key, normalizeWasmValue(item)];
    });
    return Object.fromEntries(entries);
  }
  if (ArrayBuffer.isView(value)) return Array.from(value, normalizeWasmValue);
  if (tag === "[object Object]") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeWasmValue(item)]),
    );
  }
  return value;
}

/**
 * Python parse_event returns only requested fields; the WASM wrapper exposes
 * the same rows with a redundant event_name discriminator attached. Remove
 * that wrapper-only column only after validating every value against the
 * requested event, so a malformed or mixed-event result fails closed.
 */
export function normalizeEventRows(value, expectedEventName) {
  if (!Array.isArray(value) || typeof expectedEventName !== "string" || !expectedEventName)
    throw new Error("A91_WASM_EVENT_SHAPE_INVALID");
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error("A91_WASM_EVENT_ROW_INVALID");
    if (!Object.hasOwn(row, "event_name")) return row;
    if (row.event_name !== expectedEventName) throw new Error("A91_WASM_EVENT_NAME_MISMATCH");
    const semanticFields = { ...row };
    delete semanticFields.event_name;
    return semanticFields;
  });
}
export function getHeaderProbeBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 20)
    throw new Error("A91_HEADER_PREFIX_INVALID");
  const magic = [0x50, 0x42, 0x44, 0x45, 0x4d, 0x53, 0x32, 0x00]; // PBDEMS2\0
  if (magic.some((value, index) => bytes[index] !== value))
    throw new Error("A91_DEM_HEADER_MAGIC_INVALID");

  let offset = 16;
  const readVarint = (label) => {
    let value = 0;
    let shift = 0;
    for (let index = 0; index < 5; index += 1) {
      if (offset >= bytes.byteLength) throw new Error("A91_HEADER_PREFIX_TRUNCATED");
      const byte = bytes[offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value >>> 0;
      shift += 7;
    }
    throw new Error(`A91_HEADER_VARINT_INVALID:${label}`);
  };

  const command = readVarint("command");
  readVarint("tick");
  const frameBytes = readVarint("frame_size");
  // Upstream parse_header_only reads the first frame directly and does not
  // decompress it. DEM_FileHeader is command 1 and must be uncompressed.
  if ((command & 0x40) !== 0 || (command & ~0x40) !== 1)
    throw new Error("A91_HEADER_FRAME_UNSUPPORTED");
  if (frameBytes > 1024 * 1024) throw new Error("A91_HEADER_FRAME_TOO_LARGE");

  // Rust's slice_packet_bytes uses a strict >= end check, so include one
  // trailing byte beyond the frame payload as well as the complete header.
  const requiredLength = offset + frameBytes + 1;
  if (requiredLength > bytes.byteLength) throw new Error("A91_HEADER_PREFIX_TRUNCATED");
  return bytes.subarray(0, requiredLength);
}

export function deriveDemoTickProbe(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 19)
    throw new Error("A91_DEMO_FRAME_SCAN_INVALID");
  const magic = [0x50, 0x42, 0x44, 0x45, 0x4d, 0x53, 0x32, 0x00];
  if (magic.some((value, index) => bytes[index] !== value))
    throw new Error("A91_DEMO_FRAME_SCAN_INVALID");

  let offset = 16;
  let frameCount = 0;
  let maxFrameTick = null;
  const readVarint = (cleanEof = false) => {
    let value = 0;
    for (let index = 0; index < 5; index += 1) {
      if (offset >= bytes.byteLength) {
        if (cleanEof && index === 0) return null;
        throw new Error("A91_DEMO_FRAME_SCAN_INVALID");
      }
      const byte = bytes[offset++];
      value |= (byte & 0x7f) << (7 * index);
      if ((byte & 0x80) === 0) return value >>> 0;
    }
    throw new Error("A91_DEMO_FRAME_SCAN_INVALID");
  };

  while (offset < bytes.byteLength) {
    // Match the upstream frame-loop minimum-header guard. One or two trailing
    // bytes are not a complete frame and are ignored just as upstream does.
    if (bytes.byteLength - offset < 3) break;
    const command = readVarint(true);
    if (command === null) break;
    const tickRaw = readVarint();
    const frameSize = readVarint();
    if (frameSize > bytes.byteLength - offset) throw new Error("A91_DEMO_FRAME_SCAN_INVALID");

    // Upstream casts frame ticks to signed i32. DEM_STOP is a sentinel, not
    // a playable tick, so count its frame but exclude it from tick candidates.
    const frameTick = tickRaw <= 0x7fffffff ? tickRaw : tickRaw - 0x100000000;
    const commandType = (command & 0x40) === 0x40 ? command & ~0x40 : command;
    offset += frameSize;
    frameCount += 1;
    if (commandType === 0) break;
    if (frameTick >= 0 && (maxFrameTick === null || frameTick > maxFrameTick))
      maxFrameTick = frameTick;
  }

  if (frameCount === 0 || maxFrameTick === null || maxFrameTick < 2)
    throw new Error("A91_TICK_PROBE_RANGE_MISSING");

  const wantedTicks = [...new Set([0, Math.floor(maxFrameTick / 2), maxFrameTick - 1])];
  return {
    source: "DEM_FRAME_HEADER_SCAN",
    maxFrameTick,
    wantedTicks,
    frameCount,
    authoritativeDomain: false,
  };
}

export function canonicalizeInventory(api, result) {
  if (api !== "listGameEvents" && api !== "listUpdatedFields") return result;
  if (!Array.isArray(result) || !result.every((value) => typeof value === "string"))
    throw new Error("WASM_INVENTORY_SHAPE_INVALID");
  // These APIs expose set-backed inventories upstream. Their order is not
  // semantic and can vary across fresh parser instances, so canonicalize before
  // digesting to avoid false determinism failures.
  return [...result].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

export function selectRuntimeTickFields(surface, limit = 32) {
  return surface.fields
    .filter(
      (field) =>
        field.sourceApi === "parseTicks" && field.runtimeRequestable && field.upstreamSupported,
    )
    .map((field) => field.propertyName)
    .slice(0, limit);
}

/**
 * Verify the pinned binding/binary against the manifest and compile the
 * module ONCE. Instances are created per call (instantiateParser) so that
 * WASM linear memory, which can only grow, never accumulates across calls.
 */
export function loadPinnedArtifact(surface, manifest, directoryOverride = null) {
  validateManifests(surface, manifest);
  const directory = directoryOverride
    ? resolve(directoryOverride)
    : resolve(root, "public/client-parser/demoparser2/0.42.0");
  const binding = readFileSync(resolve(directory, "demoparser2.js"));
  const wasm = readFileSync(resolve(directory, "demoparser2_bg.wasm"));
  if (
    sha(binding) !== manifest.binding.sha256 ||
    binding.length !== manifest.binding.bytes ||
    sha(wasm) !== manifest.wasm.sha256 ||
    wasm.length !== manifest.wasm.bytes
  )
    throw new Error("WASM_ARTIFACT_IDENTITY_MISMATCH");
  return {
    bindingSource: binding.toString(),
    module: new WebAssembly.Module(wasm),
    declaredExports: manifest.declaredExports,
  };
}

/** A fresh instance (fresh linear memory) of the verified artifact. */
export function instantiateParser(artifact) {
  // Run the exact no-modules binding without rewriting it or importing browser code.
  const context = vm.createContext({
    WebAssembly,
    crypto: webcrypto,
    TextDecoder,
    TextEncoder,
    URL,
    // Parser console output stays out of Actions logs; thrown errors are classified.
    console: { log() {}, warn() {}, error() {} },
    Uint8Array,
    Uint32Array,
    DataView,
    ArrayBuffer,
  });
  vm.runInContext(
    `${artifact.bindingSource}\n globalThis.a91Parser = wasm_bindgen;\n` +
      // The options object must be created inside this realm: wasm-bindgen
      // recognises it by comparing its prototype with this realm's Object.
      "globalThis.a91Init = (module) => wasm_bindgen.initSync({ module });",
    context,
  );
  const parser = context.a91Parser;
  const wasmExports = context.a91Init(artifact.module);
  if (!(wasmExports && wasmExports.memory instanceof WebAssembly.Memory))
    throw new Error("WASM_MEMORY_ALLOCATION_FAILURE");
  for (const name of artifact.declaredExports)
    if (typeof parser[name] !== "function") throw new Error("UNSUPPORTED_WASM_API");
  return { parser, wasmExports };
}

export function loadPinnedParser(surface, manifest, directoryOverride = null) {
  return instantiateParser(loadPinnedArtifact(surface, manifest, directoryOverride));
}
export function runWasm(path, authorization, options = {}) {
  const started = performance.now();
  const telemetry = createTelemetry();
  telemetry.snapshot("before_validate");
  const bytes = telemetry.step("validate", () => validateDemo(path, authorization));
  const profile = fixtureProfile(authorization.authorizationRef);
  telemetry.step("structure_validation", () => {
    const structural = spawnSync(
      "python3",
      [resolve(root, "scripts/a91/validate_structure.py"), path],
      { encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 1800000 },
    );
    if (structural.error || structural.signal) throw new Error("A91_RUNTIME_RESOURCE_FAILURE");
    if (structural.status !== 0) throw new Error("A91_DEM_STRUCTURE_INVALID");
  });
  let surface;
  let manifest;
  const artifactHandle = telemetry.step("wasm_load", () => {
    surface = json(resolve(root, "docs/client-parser/upstream-surface-manifest.json"));
    const manifestPath = options.manifestPath
      ? resolve(options.manifestPath)
      : resolve(root, "public/client-parser/demoparser2/0.42.0/artifact-manifest.json");
    manifest = json(manifestPath);
    return loadPinnedArtifact(surface, manifest, options.artifactDir ?? null);
  });

  const calls = [];
  const memoryCalls = [];
  const tableDiagnostics = {};
  const call = (api, args = [], request = {}, inputBytes = bytes) => {
    const stageName = {
      parseHeader: "parse_header",
      listGameEvents: "list_game_events",
      listUpdatedFields: "list_updated_fields",
      parseEvent: "parse_events",
      parseGrenades: "parse_grenades",
      parseTicks: "parse_ticks",
    }[api];
    return telemetry.step(
      stageName,
      () => {
        // One fresh instance per API call: linear memory starts at the module
        // minimum, so no call inherits another call's high-water mark and the
        // recorded figures are that call's own need.
        let instance = instantiateParser(artifactHandle);
        const { parser, wasmExports } = instance;
        // Grenades use the column-major export: same ParserInputs, same
        // columns, no per-row HashMap. See docs/A9_1_WASM_MEMORY.md.
        const exportName = api === "parseGrenades" ? "parseGrenadesColumns" : api;
        if (typeof parser[exportName] !== "function") throw new Error("UNSUPPORTED_WASM_API");
        const memoryBefore = wasmExports.memory.buffer.byteLength;
        const memory = { api, eventName: request.eventName ?? null, initialBytes: memoryBefore };
        const probe = () => {
          try {
            return typeof parser.a91MemoryProbe === "function"
              ? decodeMemoryProbe(parser.a91MemoryProbe())
              : null;
          } catch {
            return null;
          }
        };
        try {
          const rawResult = parser[exportName](inputBytes, ...args);
          memory.finalBytes = wasmExports.memory.buffer.byteLength;
          if (api === "parseGrenades") memory.probe = probe();
          if (memory.finalBytes > WASM_MEMORY_BUDGET_BYTES)
            throw new Error("WASM_MEMORY_BUDGET_EXCEEDED");
          const tableName = tableNameFor(api, request);
          if (tableName) {
            // Table APIs go through canonical contract v1 in ONE streaming
            // pass over what the wrapper returned: identifiers stay exact, the
            // digest covers every row, and only a bounded private sample is
            // retained. No normalized copy of the table is built.
            const table =
              api === "parseEvent"
                ? summarizeEventRows(tableName, rawResult, request.eventName)
                : api === "parseGrenades"
                  ? summarizeColumnTable(tableName, rawResult)
                  : summarizeRows(tableName, rawResult);
            tableDiagnostics[tableName] = table.diagnostics;
            calls.push({
              api,
              status: "SUCCEEDED",
              ...request,
              outputDigest: table.summary.tableDigest,
              count: table.summary.rowCount,
              returnedFields: table.summary.fields,
            });
            memoryCalls.push(memory);
            return table.summary;
          }
          const result = canonicalizeInventory(api, normalizeWasmValue(rawResult));
          const outputDigest = digest(result);
          calls.push({
            api,
            status: "SUCCEEDED",
            ...request,
            outputDigest,
            count: Array.isArray(result) ? result.length : null,
            returnedFields: Array.isArray(result) ? [] : Object.keys(result ?? {}),
          });
          memoryCalls.push(memory);
          return result;
        } catch (error) {
          error.wasmMemoryBytesBefore = memoryBefore;
          error.wasmMemoryBytesAfter = wasmExports.memory?.buffer?.byteLength ?? null;
          error.wasmProbe = probe();
          throw error;
        } finally {
          // Drop the instance so its linear memory can be reclaimed before the
          // next call allocates a new one.
          instance = null;
          if (typeof globalThis.gc === "function") globalThis.gc();
        }
      },
      true,
    );
  };
  // parse_header_only reads only the DEM header and first frame. Sending the
  // whole 474 MB file through wasm-bindgen needlessly allocates/copies all bytes
  // into WASM memory before this header-only operation.
  const headerProbe = getHeaderProbeBytes(bytes);
  const header = call("parseHeader", [], { inputByteLength: headerProbe.byteLength }, headerProbe);

  const inventory = call("listGameEvents", []);
  const fields = call("listUpdatedFields", []);
  const events = [];
  for (const event of surface.events) {
    // Contract rule R12: properties the Python reference can only deliver
    // rounded are not requested from either runtime; exclusions are reported.
    const lossy = CONTRACT.referenceLossyRequestFields.eventPlayer;
    const excludedRequestFields = event.playerFields
      .filter((f) => f.requestAllowed && lossy.includes(f.field))
      .map((f) => f.field);
    const requestedPlayerFields = event.playerFields
      .filter((f) => f.requestAllowed && !lossy.includes(f.field))
      .map((f) => f.field);
    const requestedOtherFields = event.otherFields
      .filter((f) => f.requestAllowed)
      .map((f) => f.field);
    const table = call(
      "parseEvent",
      [event.eventName, requestedPlayerFields, requestedOtherFields],
      {
        eventName: event.eventName,
        requestedPlayerFields,
        requestedOtherFields,
        excludedRequestFields,
        requestEvidence: [...event.playerFields, ...event.otherFields].filter(
          (f) => f.requestAllowed,
        ),
      },
    );
    const evidence = calls.at(-1);
    const returned = evidence.returnedFields ?? [];
    evidence.unavailableFields = [...requestedPlayerFields, ...requestedOtherFields].filter(
      (f) => !returned.includes(f),
    );
    // Semantic evidence only (contract rule R11): exactly the keys the
    // Python producer emits. Request/return lists stay in apiCalls.
    events.push({ eventName: event.eventName, status: evidence.status, table });
  }
  const grenades = call("parseGrenades", []);
  const tickProbe = telemetry.step("frame_tick_probe", () => deriveDemoTickProbe(bytes));
  const wantedTicks = tickProbe.wantedTicks;
  // Request only fields independently confirmed in the pinned upstream source.
  // Catalogued-but-unsupported project aliases (for example `tick`) can cause
  // an entire parseTicks call to fail; keep those aliases out of runtime requests.
  const requestedFields = selectRuntimeTickFields(surface);
  const tickValues = call("parseTicks", [requestedFields, new Int32Array(wantedTicks), [], false], {
    requestedFields,
    wantedTicks,
    tickProbeSource: tickProbe.source,
    maxFrameTick: tickProbe.maxFrameTick,
    authoritativeDomain: false,
  });
  if (!tickValues || tickValues.rowCount === 0) {
    telemetry.step(
      "parse_ticks_validation",
      () => {
        throw new Error("A91_TICK_PROBE_EMPTY");
      },
      true,
    );
  }
  // Keep identity absence explicit; never infer players from events or ticks.
  calls.push({ api: "parsePlayerInfo", status: "NOT_AVAILABLE_ON_WASM" });
  telemetry.snapshot("before_normalization");
  const normalizedResult = {
    header,
    events,
    grenades,
    ticks: tickValues,
    playerIdentity: { status: "NOT_AVAILABLE_ON_WASM" },
  };
  const normalizedResultDigest = telemetry.step("normalization", () => digest(normalizedResult));
  const failed = calls.some((c) => c.status === "PARSE_FAILED") || wantedTicks.length === 0;
  const byName = (predicate) => events.filter((e) => predicate(e.eventName));
  const artifact = {
    artifactVersion: 3,
    runtime: "WASM",
    runId: `wasm:${randomUUID()}`,
    executionKind: profile.executionKind,
    test_fixture_only: profile.testFixtureOnly,
    status: failed ? "FAILED" : "SUCCEEDED",
    reason: failed ? "WASM_RUN_FAILED" : null,
    demoSha256: sha(bytes),
    demoSizeBytes: bytes.length,
    parserVersion: "0.42.0",
    parserRevision: manifest.sourceCommit,
    catalogVersion: surface.catalogVersion,
    catalogDigest: surface.catalogDigest,
    contractVersion: surface.contractVersion,
    contractDigest: surface.contractDigest,
    canonicalContract: { version: CANONICAL_CONTRACT_VERSION, digest: CANONICAL_CONTRACT_DIGEST },
    artifactIdentity: digest({
      bindingSha256: manifest.binding.sha256,
      wasmSha256: manifest.wasm.sha256,
      sourceCommit: manifest.sourceCommit,
      sourceTag: manifest.sourceTag,
      parserVersion: "0.42.0",
    }),
    wasmArtifact: {
      bindingSha256: manifest.binding.sha256,
      wasmSha256: manifest.wasm.sha256,
    },
    environmentFingerprint: {
      nodeVersion: process.version,
      wasmBindingSha256: manifest.binding.sha256,
      wasmBinarySha256: manifest.wasm.sha256,
      artifactIdentity: digest({
        bindingSha256: manifest.binding.sha256,
        wasmSha256: manifest.wasm.sha256,
        sourceCommit: manifest.sourceCommit,
        sourceTag: manifest.sourceTag,
        parserVersion: "0.42.0",
      }),
    },
    apiCalls: calls,
    fieldInventory: sample(fields),
    eventInventory: sample(inventory, 1024),
    eventInventoryDigest: digest(inventory),
    ...buildSemanticEvidence({
      header,
      events,
      grenades,
      ticks: tickValues,
      tickProbe,
      requestedFields,
      wantedTicks,
    }),
    playerInventory: { status: "NOT_AVAILABLE_ON_WASM" },
    domainAvailability: {
      players: "NOT_AVAILABLE_ON_WASM",
      player_identity: "NOT_AVAILABLE_ON_WASM",
    },
    // Private, non-semantic diagnostics (block digests, bounded samples).
    // Used only to localize a divergence; never hashed into any gate digest.
    tableDiagnostics,
    // Operational evidence, never a semantic input: WASM linear memory per
    // call (each call runs in a fresh instance) and the explicit budget.
    wasmMemoryEvidence: {
      budgetBytes: WASM_MEMORY_BUDGET_BYTES,
      hardLimitBytes: 65536 * WASM_PAGE_BYTES,
      instancePerCall: true,
      grenadeOutput: "COLUMN_MAJOR",
      peakBytes: memoryCalls.reduce((peak, item) => Math.max(peak, item.finalBytes ?? 0), 0),
      calls: memoryCalls,
    },
    normalizedResult,
    normalizedResultDigest,
    resultDigest: normalizedResultDigest,
    rawDigest: digest(
      calls
        .filter((c) => c.outputDigest)
        .map((c) => ({ api: c.api, eventName: c.eventName ?? null, digest: c.outputDigest })),
    ),
    eventDigest: digest(events),
    tickDigest: tickValues.tableDigest,
    roundDigest: digest(byName((n) => n.startsWith("round_"))),
    playerDigest: digest({ status: "NOT_AVAILABLE_ON_WASM" }),
    durationMs: performance.now() - started,
    ...telemetry.evidence(),
    ...locks,
    persisted: false,
  };
  telemetry.snapshot("before_private_sanitize");
  telemetry.step("private_sanitize", () => sanitizePrivateRuntimeEvidence(artifact));
  Object.assign(artifact, telemetry.evidence());
  return artifact;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
  const output = arg("--output");
  try {
    const result = runWasm(arg("--demo"), json(arg("--authorization")), {
      artifactDir: process.argv.includes("--wasm-dir") ? arg("--wasm-dir") : null,
      manifestPath: process.argv.includes("--wasm-manifest") ? arg("--wasm-manifest") : null,
    });
    writeFileSync(output, sanitizePrivateRuntimeEvidence(result), { mode: 0o600 });
    process.exitCode = result.status === "SUCCEEDED" ? 0 : 1;
  } catch (error) {
    const failure = failureEvidence(error);
    if (output) writeFileSync(output, sanitizePrivateRuntimeEvidence(failure), { mode: 0o600 });
    console.error(failure.reason);
    process.exitCode = 1;
  }
}
