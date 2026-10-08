import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
  validateManifests,
  sanitizePrivateRuntimeEvidence,
} from "./contracts.mjs";

import { createTelemetry, failureEvidence } from "./diagnostics.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const sample = (value, limit = 1000) => {
  if (Array.isArray(value)) return value.slice(0, limit).map((v) => sample(v, limit));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sample(v, limit)]));
  return value;
};
export function loadPinnedParser(surface, manifest, directoryOverride = null) {
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
  // Run the exact no-modules binding without rewriting it or importing browser code.
  const context = vm.createContext({
    WebAssembly,
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
  vm.runInContext(`${binding.toString()}\n globalThis.a91Parser = wasm_bindgen;`, context);
  const parser = context.a91Parser;
  const wasmExports = parser.initSync(wasm);
  if (!(wasmExports?.memory instanceof WebAssembly.Memory))
    throw new Error("WASM_MEMORY_ALLOCATION_FAILURE");
  for (const name of manifest.declaredExports)
    if (typeof parser[name] !== "function") throw new Error("UNSUPPORTED_WASM_API");
  return { parser, wasmExports };
}
export function runWasm(path, authorization, options = {}) {
  const started = performance.now();
  const telemetry = createTelemetry();
  telemetry.snapshot("before_validate");
  const bytes = telemetry.step("validate", () => validateDemo(path, authorization));
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
  const loaded = telemetry.step("wasm_load", () => {
    surface = json(resolve(root, "docs/client-parser/upstream-surface-manifest.json"));
    const manifestPath = options.manifestPath
      ? resolve(options.manifestPath)
      : resolve(root, "public/client-parser/demoparser2/0.42.0/artifact-manifest.json");
    manifest = json(manifestPath);
    return loadPinnedParser(surface, manifest, options.artifactDir ?? null);
  });
  const parser = loaded.parser;
  const wasmExports = loaded.wasmExports;

  // Large real DEMs are passed through wasm-bindgen as one Uint8Array. The generated
  // binding first mallocs the entire input inside WASM linear memory. Pre-grow a bounded
  // envelope before the first parse call so the allocator does not have to satisfy a
  // ~474 MB contiguous request while simultaneously growing the heap. This is a runtime
  // safety/capability preparation only; it does not change the parser or DEM bytes.
  const WASM_PAGE_BYTES = 64 * 1024;
  const LARGE_DEM_MEMORY_FLOOR_BYTES = 768 * 1024 * 1024;
  const LARGE_DEM_MEMORY_HEADROOM_BYTES = 256 * 1024 * 1024;
  telemetry.step("wasm_memory_prepare", () => {
    if (!(wasmExports.memory instanceof WebAssembly.Memory))
      throw new Error("WASM_MEMORY_ALLOCATION_FAILURE");
    const targetBytes = Math.max(
      LARGE_DEM_MEMORY_FLOOR_BYTES,
      bytes.length + LARGE_DEM_MEMORY_HEADROOM_BYTES,
    );
    const targetPages = Math.ceil(targetBytes / WASM_PAGE_BYTES);
    const currentPages = wasmExports.memory.buffer.byteLength / WASM_PAGE_BYTES;
    if (currentPages < targetPages) wasmExports.memory.grow(targetPages - currentPages);
    const finalBytes = wasmExports.memory.buffer.byteLength;
    if (finalBytes < bytes.length) throw new Error("WASM_MEMORY_ALLOCATION_FAILURE");
  });

  const calls = [];
  const call = (api, args, request = {}) => {
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
        if (typeof parser[api] !== "function") throw new Error("UNSUPPORTED_WASM_API");
        const memoryBefore = wasmExports.memory?.buffer?.byteLength ?? null;
        try {
          const result = parser[api](bytes, ...args);
        const outputDigest = digest(result);
          calls.push({
            api,
            status: "SUCCEEDED",
          ...request,
          outputDigest,
          count: Array.isArray(result) ? result.length : null,
          returnedFields: Array.isArray(result)
            ? [
                ...new Set(
                  result.flatMap((r) => (r && typeof r === "object" ? Object.keys(r) : [])),
                ),
              ].sort()
            : Object.keys(result ?? {}),
        });
          return result;
        } catch (error) {
          error.wasmMemoryBytesBefore = memoryBefore;
          error.wasmMemoryBytesAfter = wasmExports.memory?.buffer?.byteLength ?? null;
          throw error;
        }
      },
      true,
    );
  };
  const header = call("parseHeader", []);
  const inventory = call("listGameEvents", []);
  const fields = call("listUpdatedFields", []);
  const events = [];
  for (const event of surface.events) {
    const requestedPlayerFields = event.playerFields
      .filter((f) => f.requestAllowed)
      .map((f) => f.field);
    const requestedOtherFields = event.otherFields
      .filter((f) => f.requestAllowed)
      .map((f) => f.field);
    const value = call(
      "parseEvent",
      [event.eventName, requestedPlayerFields, requestedOtherFields],
      {
        eventName: event.eventName,
        requestedPlayerFields,
        requestedOtherFields,
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
    events.push({
      eventName: event.eventName,
      status: evidence.status,
      count: Array.isArray(value) ? value.length : null,
      fullDigest: value === null ? null : digest(value),
      samples: sample(value),
    });
  }
  const grenades = call("parseGrenades", []);
  const ticks = Number(header?.playback_ticks);
  const wantedTicks =
    Number.isSafeInteger(ticks) && ticks > 0 ? [0, Math.floor(ticks / 2), ticks - 1] : [];
  if (wantedTicks.length === 0)
    telemetry.step(
      "parse_ticks",
      () => {
        throw new Error("WASM_PARSE_FAILURE");
      },
      true,
    );
  const requestedFields = surface.fields
    .filter((f) => f.sourceApi === "parseTicks" && f.runtimeRequestable)
    .map((f) => f.propertyName)
    .slice(0, 32);
  const tickValues = wantedTicks.length
    ? call("parseTicks", [requestedFields, new Int32Array(wantedTicks), [], false], {
        requestedFields,
        wantedTicks,
        authoritativeDomain: false,
      })
    : null;
  // Keep identity absence explicit; never infer players from events or ticks.
  calls.push({ api: "parsePlayerInfo", status: "NOT_AVAILABLE_ON_WASM" });
  telemetry.snapshot("before_normalization");
  const normalizedResult = {
    header,
    events,
    grenades: sample(grenades, 256),
    ticks: sample(tickValues),
    playerIdentity: { status: "NOT_AVAILABLE_ON_WASM" },
  };
  const normalizedResultDigest = telemetry.step("normalization", () => digest(normalizedResult));
  const failed = calls.some((c) => c.status === "PARSE_FAILED") || wantedTicks.length === 0;
  const byName = (predicate) => events.filter((e) => predicate(e.eventName));
  const artifact = {
    artifactVersion: 2,
    runtime: "WASM",
    runId: `wasm:${randomUUID()}`,
    executionKind: "REAL_DEM_FULL_FILE",
    test_fixture_only: false,
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
    headerEvidence: header,
    mapEvidence: { map: header?.map_name ?? null },
    timingEvidence: { header },
    playerInventory: { status: "NOT_AVAILABLE_ON_WASM" },
    domainAvailability: {
      players: "NOT_AVAILABLE_ON_WASM",
      player_identity: "NOT_AVAILABLE_ON_WASM",
    },
    eventEvidence: events,
    roundEvidence: byName((n) => n.startsWith("round_")),
    grenadeEvidence: sample(grenades, 256),
    bombEvidence: byName((n) => n.startsWith("bomb_")),
    deathEvidence: byName((n) => n === "player_death"),
    damageEvidence: byName((n) => n === "player_hurt"),
    weaponEvidence: byName((n) => n.startsWith("weapon_") || n.startsWith("item_")),
    economyEvidence: { status: "BOUNDED_TICK_PROBE", value: sample(tickValues) },
    tickDomainEvidence: {
      requestedFields,
      wantedTicks,
      authoritativeDomain: false,
      value: sample(tickValues),
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
    tickDigest: digest(tickValues),
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
