import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { digest, sha, locks, validateDemo, validateManifests, sanitizeReport } from "./contracts.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const sample = (value, limit = 1000) => {
  if (Array.isArray(value)) return value.slice(0, limit).map((v) => sample(v, limit));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,sample(v,limit)]));
  return value;
};
export function loadPinnedParser(surface, manifest) {
  validateManifests(surface, manifest);
  const directory = resolve(root, "public/client-parser/demoparser2/0.42.0");
  const binding = readFileSync(resolve(directory, "demoparser2.js"));
  const wasm = readFileSync(resolve(directory, "demoparser2_bg.wasm"));
  if (sha(binding) !== manifest.binding.sha256 || binding.length !== manifest.binding.bytes ||
      sha(wasm) !== manifest.wasm.sha256 || wasm.length !== manifest.wasm.bytes)
    throw new Error("WASM_ARTIFACT_IDENTITY_MISMATCH");
  // Run the exact no-modules binding without rewriting it or importing browser code.
  const context = vm.createContext({ WebAssembly, TextDecoder, TextEncoder, URL, console,
    Uint8Array, Uint32Array, DataView, ArrayBuffer });
  vm.runInContext(`${binding.toString()}\n globalThis.a91Parser = wasm_bindgen;`, context);
  const parser = context.a91Parser;
  parser.initSync(wasm);
  for (const name of manifest.declaredExports) if (typeof parser[name] !== "function") throw new Error("UNSUPPORTED_WASM_API");
  return parser;
}
export function runWasm(path, authorization) {
  const started = performance.now();
  const bytes = validateDemo(path, authorization);
  const structural = spawnSync("python3", [resolve(root,"scripts/a91/validate_structure.py"), path], { encoding: "utf8" });
  if (structural.status !== 0) throw new Error("A91_DEM_STRUCTURE_INVALID");
  const surface = json(resolve(root,"docs/client-parser/upstream-surface-manifest.json"));
  const manifest = json(resolve(root,"public/client-parser/demoparser2/0.42.0/artifact-manifest.json"));
  const parser = loadPinnedParser(surface,manifest);
  const calls = [];
  const call = (api, args, request = {}) => {
    try {
      const result = parser[api](bytes,...args);
      const outputDigest = digest(result);
      calls.push({ api, status: "SUCCEEDED", ...request, outputDigest,
        count: Array.isArray(result) ? result.length : null,
        returnedFields: Array.isArray(result) ? [...new Set(result.flatMap((r) => r && typeof r === "object" ? Object.keys(r) : []))].sort() : Object.keys(result ?? {}) });
      return result;
    } catch {
      calls.push({ api, status: "PARSE_FAILED", ...request });
      return null;
    }
  };
  const header = call("parseHeader",[]);
  const inventory = call("listGameEvents",[]);
  const fields = call("listUpdatedFields",[]);
  const events = [];
  for (const event of surface.events) {
    const requestedPlayerFields = event.playerFields.filter((f) => f.requestAllowed).map((f) => f.field);
    const requestedOtherFields = event.otherFields.filter((f) => f.requestAllowed).map((f) => f.field);
    const value = call("parseEvent",[event.eventName,requestedPlayerFields,requestedOtherFields],
      { eventName: event.eventName, requestedPlayerFields, requestedOtherFields,
        requestEvidence: [...event.playerFields,...event.otherFields].filter((f) => f.requestAllowed) });
    const evidence = calls.at(-1);
    const returned = evidence.returnedFields ?? [];
    evidence.unavailableFields = [...requestedPlayerFields,...requestedOtherFields].filter((f) => !returned.includes(f));
    events.push({ eventName: event.eventName, status: evidence.status, count: Array.isArray(value) ? value.length : null,
      fullDigest: value === null ? null : digest(value), samples: sample(value) });
  }
  const grenades = call("parseGrenades",[]);
  const ticks = Number(header?.playback_ticks);
  const wantedTicks = Number.isSafeInteger(ticks) && ticks > 0 ? [0,Math.floor(ticks/2),ticks-1] : [];
  const requestedFields = surface.fields.filter((f) => f.sourceApi === "parseTicks" && f.runtimeRequestable).map((f) => f.propertyName).slice(0,32);
  const tickValues = wantedTicks.length ? call("parseTicks",[requestedFields,wantedTicks,[],false],{ requestedFields,wantedTicks,authoritativeDomain:false }) : null;
  // Keep identity absence explicit; never infer players from events or ticks.
  calls.push({ api:"parsePlayerInfo",status:"NOT_AVAILABLE_ON_WASM" });
  const normalizedResult = { header,events,grenades:sample(grenades,256),ticks:sample(tickValues), playerIdentity:{ status:"NOT_AVAILABLE_ON_WASM" } };
  const normalizedResultDigest = digest(normalizedResult);
  const failed = calls.some((c) => c.status === "PARSE_FAILED") || wantedTicks.length === 0;
  const byName = (predicate) => events.filter((e) => predicate(e.eventName));
  const artifact = { artifactVersion:2, runtime:"WASM", runId:`wasm:${randomUUID()}`,
    executionKind:"REAL_DEM_FULL_FILE", test_fixture_only:false, status:failed ? "FAILED" : "SUCCEEDED",
    reason:failed ? "WASM_RUN_FAILED" : null, demoSha256:sha(bytes), demoSizeBytes:bytes.length,
    parserVersion:"0.42.0",parserRevision:manifest.sourceCommit,catalogVersion:surface.catalogVersion,
    catalogDigest:surface.catalogDigest,contractVersion:surface.contractVersion,contractDigest:surface.contractDigest,
    artifactIdentity:digest({bindingSha256:manifest.binding.sha256,wasmSha256:manifest.wasm.sha256,sourceCommit:manifest.sourceCommit,sourceTag:manifest.sourceTag,parserVersion:"0.42.0"}),
    wasmArtifact:{bindingSha256:sha(readFileSync(resolve(root,"public/client-parser/demoparser2/0.42.0/demoparser2.js"))),wasmSha256:manifest.wasm.sha256},
    apiCalls:calls,fieldInventory:sample(fields),eventInventory:sample(inventory,1024),eventInventoryDigest:digest(inventory),
    headerEvidence:header,mapEvidence:{map:header?.map_name ?? null},timingEvidence:{header},
    playerInventory:{status:"NOT_AVAILABLE_ON_WASM"},domainAvailability:{players:"NOT_AVAILABLE_ON_WASM",player_identity:"NOT_AVAILABLE_ON_WASM"},
    eventEvidence:events,roundEvidence:byName((n) => n.startsWith("round_")),grenadeEvidence:sample(grenades,256),
    bombEvidence:byName((n) => n.startsWith("bomb_")),deathEvidence:byName((n) => n === "player_death"),
    damageEvidence:byName((n) => n === "player_hurt"),weaponEvidence:byName((n) => n.startsWith("weapon_") || n.startsWith("item_")),
    economyEvidence:{status:"BOUNDED_TICK_PROBE",value:sample(tickValues)},tickDomainEvidence:{requestedFields,wantedTicks,authoritativeDomain:false,value:sample(tickValues)},
    normalizedResult,normalizedResultDigest,resultDigest:normalizedResultDigest,
    rawDigest:digest(calls.filter((c) => c.outputDigest).map((c) => ({api:c.api,eventName:c.eventName ?? null,digest:c.outputDigest}))),
    eventDigest:digest(events),tickDigest:digest(tickValues),roundDigest:digest(byName((n) => n.startsWith("round_"))),playerDigest:digest({status:"NOT_AVAILABLE_ON_WASM"}),
    durationMs:performance.now()-started,...locks,persisted:false };
  sanitizeReport(artifact);
  return artifact;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = (name) => process.argv[process.argv.indexOf(name)+1];
  const output = arg("--output");
  try {
    const result = runWasm(arg("--demo"),json(arg("--authorization")));
    writeFileSync(output,sanitizeReport(result));
    process.exitCode = result.status === "SUCCEEDED" ? 0 : 1;
  } catch (error) {
    const reason = error instanceof RangeError ? "A91_RUNTIME_RESOURCE_FAILURE" :
      ["A91_DEM_SIZE_MISMATCH","A91_DEM_SHA256_MISMATCH","AUTHORIZATION_MISMATCH","MISSING_DEM","WRONG_DEM_EXTENSION","A91_DEM_STRUCTURE_INVALID","WASM_ARTIFACT_IDENTITY_MISMATCH","UNSUPPORTED_WASM_API","CATALOG_MISMATCH","CONTRACT_MISMATCH","A91_RUNTIME_RESOURCE_FAILURE"].includes(error?.message) ? error.message : "WASM_RUN_FAILED";
    if(output) writeFileSync(output,JSON.stringify({status:"FAIL",reason,...locks}));
    console.error(reason);process.exitCode=1;
  }
}