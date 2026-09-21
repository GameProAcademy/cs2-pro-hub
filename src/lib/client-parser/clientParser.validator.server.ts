import {
  CLIENT_EVENT_INVENTORY_LIMIT,
  CLIENT_EVENT_SAMPLE_LIMIT,
  CLIENT_GRENADE_SAMPLE_LIMIT,
  CLIENT_PARSER_BUILD_IDENTITY,
  CLIENT_PARSER_CATALOG_VERSION,
  CLIENT_PARSER_CONTRACT_VERSION,
  CLIENT_PARSER_MANIFEST_VERSION,
  CLIENT_PARSER_NAME,
  CLIENT_PARSER_RUNTIME,
  CLIENT_PARSER_SCHEMA_VERSION,
  CLIENT_PARSER_VERSION,
  CLIENT_PLAYER_LIMIT,
  CLIENT_RESULT_MAX_BYTES,
  CLIENT_TICK_PROBE_LIMIT,
  CLIENT_CAPABILITY_CLASSIFICATIONS,
  type ClientParserEnvelope,
  type ClientParserErrorCode,
} from "./clientParser.types";
import {
  CLIENT_PARSER_CAPABILITY_DIGEST,
  CLIENT_PARSER_CATALOG_DIGEST,
} from "./clientParser.capabilities";
import { computeClientResultDigest } from "./clientParser.hash";
import { computeClientManifestDigest } from "./clientParser.manifest";
import { CLIENT_PARSER_CONTRACT_DIGEST } from "./clientParser.audit";
import {
  CLIENT_PARSER_ARTIFACT_PROVENANCE,
  CLIENT_REQUIRED_RUNTIME_EXPORTS,
  inspectRuntimeSurface,
} from "./clientParser.runtime";

const HEX_64 = /^[0-9a-f]{64}$/;
const FORBIDDEN_KEYS = new Set([
  "demoBytes",
  "demo_bytes",
  "arrayBuffer",
  "array_buffer",
  "tickSamples",
  "tick_samples",
  "rawArtifact",
  "raw_artifact",
  "rawEvents",
  "raw_events",
  "fullTicks",
  "full_ticks",
  "rawPayload",
  "raw_payload",
  "rawRows",
  "raw_rows",
  "binary",
  "buffer",
  "buffers",
]);
const MAX_DEPTH = 12;
const MAX_OBJECT_KEYS = 256;
const MAX_NODES = 20_000;

export interface ClientParserValidationDecision {
  accepted: boolean;
  trustLevel?: "UNTRUSTED_CLIENT_RESULT_VALIDATED";
  canonicalAdmission: "BLOCKED";
  persisted: false;
  reasonCode?: ClientParserErrorCode;
}

function inspectShape(value: unknown): ClientParserErrorCode | null {
  const pending: Array<{ value: unknown; depth: number; leaving?: boolean }> = [
    { value, depth: 0 },
  ];
  const activePath = new WeakSet<object>();
  let nodes = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > MAX_NODES) return "CLIENT_RESULT_TOO_LARGE";
    if (current.depth > MAX_DEPTH) return "CLIENT_RESULT_INVALID";
    if (typeof current.value === "function") return "CLIENT_RESULT_INVALID";
    if (!current.value || typeof current.value !== "object") continue;
    if (current.leaving) {
      activePath.delete(current.value);
      continue;
    }
    if (
      current.value instanceof ArrayBuffer ||
      ArrayBuffer.isView(current.value) ||
      (typeof Blob !== "undefined" && current.value instanceof Blob)
    )
      return "CLIENT_RESULT_INVALID";
    if (activePath.has(current.value)) return "CLIENT_RESULT_INVALID";
    activePath.add(current.value);
    pending.push({ value: current.value, depth: current.depth, leaving: true });
    if (Array.isArray(current.value)) {
      if (current.value.length > Math.max(CLIENT_EVENT_INVENTORY_LIMIT, CLIENT_EVENT_SAMPLE_LIMIT))
        return "CLIENT_RESULT_TOO_LARGE";
      for (const item of current.value) pending.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    const prototype = Object.getPrototypeOf(current.value);
    if (prototype !== Object.prototype && prototype !== null) return "CLIENT_RESULT_INVALID";
    const entries = Object.entries(current.value as Record<string, unknown>);
    if (entries.length > MAX_OBJECT_KEYS) return "CLIENT_RESULT_TOO_LARGE";
    for (const [key, item] of entries) {
      if (FORBIDDEN_KEYS.has(key)) return "CLIENT_RESULT_INVALID";
      pending.push({ value: item, depth: current.depth + 1 });
    }
  }
  return null;
}

function fail(reasonCode: ClientParserErrorCode): ClientParserValidationDecision {
  return { accepted: false, canonicalAdmission: "BLOCKED", persisted: false, reasonCode };
}

export function validateClientParserResult(value: unknown): ClientParserValidationDecision {
  let encoded: Uint8Array;
  try {
    encoded = new TextEncoder().encode(JSON.stringify(value));
  } catch {
    return fail("CLIENT_RESULT_INVALID");
  }
  if (encoded.byteLength > CLIENT_RESULT_MAX_BYTES) return fail("CLIENT_RESULT_TOO_LARGE");
  const shapeError = inspectShape(value);
  if (shapeError) return fail(shapeError);
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("CLIENT_RESULT_INVALID");
  const envelope = value as Partial<ClientParserEnvelope>;
  const result = envelope.result;
  const manifest = envelope.manifest;
  if (!result || !manifest) return fail("CLIENT_RESULT_INVALID");
  if (
    result.schemaVersion !== CLIENT_PARSER_SCHEMA_VERSION ||
    manifest.manifestVersion !== CLIENT_PARSER_MANIFEST_VERSION ||
    manifest.contractVersion !== CLIENT_PARSER_CONTRACT_VERSION ||
    manifest.catalogVersion !== CLIENT_PARSER_CATALOG_VERSION
  )
    return fail("CLIENT_CONTRACT_MISMATCH");
  if (
    result.parser?.name !== CLIENT_PARSER_NAME ||
    result.parser.version !== CLIENT_PARSER_VERSION ||
    result.parser.runtime !== CLIENT_PARSER_RUNTIME ||
    result.parser.buildIdentity !== CLIENT_PARSER_BUILD_IDENTITY ||
    manifest.parserName !== CLIENT_PARSER_NAME ||
    manifest.parserVersion !== CLIENT_PARSER_VERSION ||
    manifest.parserRuntime !== CLIENT_PARSER_RUNTIME ||
    manifest.parserBuildIdentity !== CLIENT_PARSER_BUILD_IDENTITY
  )
    return fail("CLIENT_PARSER_IDENTITY_MISMATCH");
  if (
    !HEX_64.test(result.demo?.sha256 ?? "") ||
    result.demo.sha256 !== manifest.demoSha256 ||
    result.demo.sizeBytes !== manifest.demoSizeBytes ||
    result.demo.sizeBytes < 1
  )
    return fail("CLIENT_DEMO_INVALID");
  if (
    !HEX_64.test(result.parser.runtimeSurface?.runtimeSurfaceDigest ?? "") ||
    result.parser.runtimeSurface.runtimeSurfaceDigest !== manifest.runtimeSurfaceDigest ||
    result.parser.runtimeSurface.minimumReady !== true ||
    !CLIENT_REQUIRED_RUNTIME_EXPORTS.every((name) =>
      result.parser.runtimeSurface.observedExports.includes(name),
    ) ||
    inspectRuntimeSurface(
      Object.fromEntries(
        result.parser.runtimeSurface.observedExports.map((name) => [name, () => {}]),
      ),
    ).runtimeSurfaceDigest !== result.parser.runtimeSurface.runtimeSurfaceDigest ||
    !Array.isArray(result.parser.apiCalls) ||
    result.parser.apiCalls.some(
      (call) =>
        typeof call.api !== "string" ||
        (call.durationMs !== null && (!Number.isFinite(call.durationMs) || call.durationMs < 0)) ||
        (call.resultBytes !== null &&
          (!Number.isSafeInteger(call.resultBytes) || call.resultBytes < 0)) ||
        (call.normalizedDigest !== null && !HEX_64.test(call.normalizedDigest)),
    ) ||
    !CLIENT_REQUIRED_RUNTIME_EXPORTS.every((name) =>
      result.parser.apiCalls.some(
        (call) =>
          call.api === name &&
          call.exportPresent === true &&
          call.callAttempted === true &&
          call.callSucceeded === true &&
          call.status === "CALL_SUCCEEDED" &&
          call.errorType === null &&
          call.errorMessage === null &&
          call.durationMs !== null &&
          call.resultBytes !== null &&
          call.normalizedDigest !== null,
      ),
    ) ||
    result.parser.artifact?.status !== "VERIFIED" ||
    result.parser.artifact.sourceCommit !== "d3767705dc5846d73ed29db50eaeda58778dc934" ||
    result.parser.artifact.sourceTag !== "v0.42.0" ||
    result.parser.artifact.artifactSize !== CLIENT_PARSER_ARTIFACT_PROVENANCE.artifactSize ||
    result.parser.artifact.wasmBinarySha256 !==
      CLIENT_PARSER_ARTIFACT_PROVENANCE.wasmBinarySha256 ||
    result.parser.artifact.wasmBindingSha256 !==
      CLIENT_PARSER_ARTIFACT_PROVENANCE.wasmBindingSha256 ||
    result.parser.artifact.wasmBinarySha256 !== manifest.artifactProvenance.wasmBinarySha256 ||
    result.parser.artifact.wasmBindingSha256 !== manifest.artifactProvenance.wasmBindingSha256 ||
    manifest.catalogDigest !== CLIENT_PARSER_CATALOG_DIGEST ||
    manifest.contractDigest !== CLIENT_PARSER_CONTRACT_DIGEST ||
    manifest.capabilityDigest !== CLIENT_PARSER_CAPABILITY_DIGEST
  )
    return fail("CLIENT_CONTRACT_MISMATCH");
  if (
    !Array.isArray(result.playerInventory?.players) ||
    result.playerInventory.players.length > CLIENT_PLAYER_LIMIT ||
    !Array.isArray(result.eventDiscovery?.discoveredEventsRaw) ||
    !Array.isArray(result.eventDiscovery?.discoveredEventNamesInOrder) ||
    !Array.isArray(result.eventDiscovery?.uniqueEventNames) ||
    !Array.isArray(result.eventDiscovery?.normalizedEventInventory) ||
    result.eventDiscovery.discoveredEventsRaw.length > CLIENT_EVENT_INVENTORY_LIMIT ||
    !Array.isArray(result.parsedEventInventory) ||
    result.parsedEventInventory.length > CLIENT_EVENT_INVENTORY_LIMIT ||
    !Array.isArray(result.selectedEventSamples) ||
    result.selectedEventSamples.length > CLIENT_EVENT_SAMPLE_LIMIT ||
    !Array.isArray(result.grenadeEvidence?.samples) ||
    result.grenadeEvidence.samples.length > CLIENT_GRENADE_SAMPLE_LIMIT ||
    !Array.isArray(result.grenadeEvidence?.rawFieldInventory) ||
    result.grenadeEvidence.rawFieldInventory.length > MAX_OBJECT_KEYS ||
    !Array.isArray(result.capabilities)
  )
    return fail("CLIENT_RESULT_TOO_LARGE");
  if (
    result.tickProbe.requestedTickCount > CLIENT_TICK_PROBE_LIMIT ||
    result.tickProbe.returnedTickCount > CLIENT_TICK_PROBE_LIMIT
  )
    return fail("CLIENT_RESULT_TOO_LARGE");
  if (!Array.isArray(result.tickProbe.samples)) return fail("CLIENT_RESULT_INVALID");
  if (result.tickProbe.samples.length > CLIENT_TICK_PROBE_LIMIT)
    return fail("CLIENT_RESULT_TOO_LARGE");
  if (
    result.playerInventory.count !== result.playerInventory.players.length ||
    result.eventDiscovery.discoveredEventCount !==
      result.eventDiscovery.discoveredEventsRaw.length ||
    result.eventDiscovery.discoveredEventCount !==
      result.eventDiscovery.discoveredEventNamesInOrder.length ||
    result.eventDiscovery.duplicateEventCount !==
      result.eventDiscovery.discoveredEventCount - result.eventDiscovery.uniqueEventNames.length ||
    new Set(result.eventDiscovery.uniqueEventNames).size !==
      result.eventDiscovery.uniqueEventNames.length ||
    result.eventDiscovery.normalizedEventInventory.join("\u0000") !==
      [...result.eventDiscovery.uniqueEventNames].sort().join("\u0000") ||
    (result.grenadeEvidence.status === "AVAILABLE" &&
      (result.grenadeEvidence.count === null ||
        result.grenadeEvidence.count < result.grenadeEvidence.samples.length ||
        !HEX_64.test(result.grenadeEvidence.normalizedDigest ?? ""))) ||
    (result.grenadeEvidence.status !== "AVAILABLE" && result.grenadeEvidence.count !== null) ||
    result.parsedEventInventory.some(
      (item) =>
        typeof item.name !== "string" ||
        !Array.isArray(item.fields) ||
        !Array.isArray(item.requestedPlayerFields) ||
        !Array.isArray(item.requestedOtherFields) ||
        item.requestedPlayerFields.length > MAX_OBJECT_KEYS ||
        item.requestedOtherFields.length > MAX_OBJECT_KEYS ||
        (item.status === "PRESENT_AND_PARSED" && (item.count === null || item.count < 0)) ||
        (item.status !== "PRESENT_AND_PARSED" && item.count !== null),
    )
  )
    return fail("CLIENT_RESULT_INVALID");
  if (
    result.coverage.fullTickDomain !== false ||
    result.coverage.authoritativeTickDomain !== false ||
    result.coverage.fullRawEvents !== false ||
    result.semanticStatus !== "BLOCKED"
  )
    return fail("CLIENT_RESULT_INVALID");
  if (
    Object.values(result.performance).some(
      (value) => typeof value === "number" && (!Number.isFinite(value) || value < 0),
    ) ||
    (result.performance.memory.usedBytes !== null &&
      (!Number.isFinite(result.performance.memory.usedBytes) ||
        result.performance.memory.usedBytes < 0))
  )
    return fail("CLIENT_RESULT_INVALID");
  if (
    result.capabilities.some(
      (capability) =>
        !CLIENT_CAPABILITY_CLASSIFICATIONS.some((value) => value === capability.classification),
    )
  )
    return fail("CLIENT_RESULT_INVALID");
  if (
    !HEX_64.test(result.resultDigest) ||
    computeClientResultDigest(result) !== result.resultDigest ||
    manifest.resultDigest !== result.resultDigest ||
    !HEX_64.test(manifest.manifestDigest) ||
    computeClientManifestDigest(manifest) !== manifest.manifestDigest
  )
    return fail("CLIENT_RESULT_DIGEST_MISMATCH");
  return {
    accepted: true,
    trustLevel: "UNTRUSTED_CLIENT_RESULT_VALIDATED",
    canonicalAdmission: "BLOCKED",
    persisted: false,
  };
}
