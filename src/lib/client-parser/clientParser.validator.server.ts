import {
  CLIENT_EVENT_INVENTORY_LIMIT,
  CLIENT_EVENT_SAMPLE_LIMIT,
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
]);
const FORBIDDEN_PAYLOAD_KEYS = new Set(FORBIDDEN_KEYS);
const MAX_DEPTH = 12;
const MAX_OBJECT_KEYS = 256;

export interface ClientParserValidationDecision {
  accepted: boolean;
  trustLevel?: "UNTRUSTED_CLIENT_RESULT_VALIDATED";
  canonicalAdmission: "BLOCKED";
  persisted: false;
  reasonCode?: ClientParserErrorCode;
}

function inspectShape(value: unknown, depth = 0): ClientParserErrorCode | null {
  if (depth > MAX_DEPTH) return "CLIENT_RESULT_INVALID";
  if (!value || typeof value !== "object") return null;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return "CLIENT_RESULT_INVALID";
  if (Array.isArray(value)) {
    if (value.length > Math.max(CLIENT_EVENT_INVENTORY_LIMIT, CLIENT_EVENT_SAMPLE_LIMIT))
      return "CLIENT_RESULT_TOO_LARGE";
    for (const item of value) {
      const reason = inspectShape(item, depth + 1);
      if (reason) return reason;
    }
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_OBJECT_KEYS) return "CLIENT_RESULT_TOO_LARGE";
  for (const [key, item] of entries) {
    if (FORBIDDEN_KEYS.has(key)) return "CLIENT_RESULT_INVALID";
    const reason = inspectShape(item, depth + 1);
    if (reason) return reason;
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
  if (Object.keys(value as Record<string, unknown>).some((key) => FORBIDDEN_PAYLOAD_KEYS.has(key)))
    return fail("CLIENT_RESULT_INVALID");
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
    !HEX_64.test(result.parser.runtimeDigest) ||
    result.parser.runtimeDigest !== manifest.parserRuntimeDigest ||
    manifest.catalogDigest !== CLIENT_PARSER_CATALOG_DIGEST ||
    manifest.capabilityDigest !== CLIENT_PARSER_CAPABILITY_DIGEST
  )
    return fail("CLIENT_CONTRACT_MISMATCH");
  if (
    !Array.isArray(result.playerInventory) ||
    result.playerInventory.length > CLIENT_PLAYER_LIMIT ||
    !Array.isArray(result.eventInventory) ||
    result.eventInventory.length > CLIENT_EVENT_INVENTORY_LIMIT ||
    !Array.isArray(result.selectedEventSamples) ||
    result.selectedEventSamples.length > CLIENT_EVENT_SAMPLE_LIMIT ||
    !Array.isArray(result.capabilities)
  )
    return fail("CLIENT_RESULT_TOO_LARGE");
  if (
    result.tickProbe.requestedTickCount > CLIENT_TICK_PROBE_LIMIT ||
    result.tickProbe.returnedTickCount > CLIENT_TICK_PROBE_LIMIT
  )
    return fail("CLIENT_RESULT_TOO_LARGE");
  if (
    result.coverage.fullTickDomain !== false ||
    result.coverage.fullRawEvents !== false ||
    result.semanticStatus !== "BLOCKED"
  )
    return fail("CLIENT_RESULT_INVALID");
  if (
    result.capabilities.some(
      (capability) => !CLIENT_CAPABILITY_CLASSIFICATIONS.includes(capability.classification),
    )
  )
    return fail("CLIENT_RESULT_INVALID");
  if (
    !HEX_64.test(result.resultDigest) ||
    computeClientResultDigest(result) !== result.resultDigest ||
    manifest.resultDigest !== result.resultDigest
  )
    return fail("CLIENT_RESULT_DIGEST_MISMATCH");
  return {
    accepted: true,
    trustLevel: "UNTRUSTED_CLIENT_RESULT_VALIDATED",
    canonicalAdmission: "BLOCKED",
    persisted: false,
  };
}
