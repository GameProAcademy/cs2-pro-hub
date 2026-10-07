import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { compareDomains, validParityComparisons } from "./parity.mjs";

export const FIXTURE = Object.freeze({
  filename: "furia-vs-gamerlegion-m1-cache.dem",
  sizeBytes: 473748061,
  sha256: "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
  authorizationRef: "A9.1-M1-CACHE-REAL-DEM",
});
export const MAX_DEMO_BYTES = 1500 * 1024 * 1024;
export const MAX_REPORT_BYTES = 8 * 1024 * 1024;
export const locks = {
  canonicalEligible: false,
  canonicalAuthorization: false,
  attempt9Authorization: false,
  productionAuthorization: false,
};
export function stable(value) {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("NON_FINITE_VALUE");
  if (value === undefined) throw new Error("MISSING_VALUE");
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
    .join(",")}}`;
}
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const digest = (value) => sha(stable(value));
export function validateUrl(value) {
  if (!value) throw new Error("NO_DEM_URL");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname)
      throw new Error();
  } catch {
    throw new Error("INVALID_DEM_URL");
  }
}
export function validateMetadata(filename, sizeBytes, expectedSha, authorizationRef) {
  if (
    filename !== FIXTURE.filename ||
    sizeBytes !== FIXTURE.sizeBytes ||
    expectedSha !== FIXTURE.sha256 ||
    authorizationRef !== FIXTURE.authorizationRef
  )
    throw new Error("AUTHORIZATION_MISMATCH");
}
export function validateDemo(path, authorization) {
  if (!path || !path.toLowerCase().endsWith(".dem")) throw new Error("WRONG_DEM_EXTENSION");
  let size;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error();
    size = stat.size;
  } catch {
    throw new Error("MISSING_DEM");
  }
  if (size < 1 || size > MAX_DEMO_BYTES || size !== authorization?.sizeBytes)
    throw new Error("A91_DEM_SIZE_MISMATCH");
  if (
    !authorization ||
    authorization.authorizedDemo !== true ||
    authorization.source !== "LOCAL_FILE" ||
    authorization.provenance !== "LOCAL_FILE" ||
    !authorization.receivedAt ||
    path.split(/[\/]/).at(-1) !== authorization.filename
  )
    throw new Error("AUTHORIZATION_MISMATCH");
  validateMetadata(
    authorization.filename,
    size,
    authorization.sha256,
    authorization.authorizationRef,
  );
  const bytes = readFileSync(path);
  if (sha(bytes) !== authorization.sha256) throw new Error("A91_DEM_SHA256_MISMATCH");
  return bytes;
}
export function validateManifests(surface, artifact) {
  if (surface.provenance.commit !== artifact.sourceCommit || artifact.sourceTag !== "v0.42.0")
    throw new Error("PARSER_IDENTITY_MISMATCH");
  if (
    digest({
      provenance: surface.provenance,
      apis: surface.apis,
      fields: surface.fields,
      events: surface.events,
    }) !== surface.catalogDigest
  )
    throw new Error("CATALOG_MISMATCH");
  if (
    digest({
      contractVersion: surface.contractVersion,
      catalogVersion: surface.catalogVersion,
      catalogDigest: surface.catalogDigest,
      limits: surface.limits,
      policies: surface.policies,
    }) !== surface.contractDigest
  )
    throw new Error("CONTRACT_MISMATCH");
}
function assertSafeEvidenceValues(value, privateUrl = "", privateHost = null) {
  if (typeof value === "string") {
    if (/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/i.test(value))
      throw new Error("ARTIFACT_SECURITY_FAILURE");
    if (value.trim() === "A91_DEMO_URL") throw new Error("ARTIFACT_SECURITY_FAILURE");
    if (privateUrl && value.includes(privateUrl)) throw new Error("ARTIFACT_SECURITY_FAILURE");
    if (/\b(?:password|cookie)\s*[:=]/i.test(value)) throw new Error("ARTIFACT_SECURITY_FAILURE");
    if (
      /(?:^|[?&])(?:signature|sig|token|access_token|refresh_token|X-Amz-[\w-]+)=/i.test(value)
    )
      throw new Error("ARTIFACT_SECURITY_FAILURE");
    if (value.includes("://")) {
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error("ARTIFACT_SECURITY_FAILURE");
      }
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        if (parsed.username || parsed.password) throw new Error("ARTIFACT_SECURITY_FAILURE");
        if (privateUrl && value === privateUrl) throw new Error("ARTIFACT_SECURITY_FAILURE");
        if (privateHost && parsed.hostname === privateHost)
          throw new Error("ARTIFACT_SECURITY_FAILURE");
        for (const [name] of parsed.searchParams) {
          if (/^(?:signature|sig|token|access_token|refresh_token|X-Amz-[\w-]+)$/i.test(name))
            throw new Error("ARTIFACT_SECURITY_FAILURE");
        }
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeEvidenceValues(item, privateUrl, privateHost));
    return;
  }
  if (value && typeof value === "object")
    Object.values(value).forEach((item) => assertSafeEvidenceValues(item, privateUrl, privateHost));
}

export function sanitizeReport(value, privateUrl = "") {
  const text = stable(value);
  assertSafeEvidenceValues(value, privateUrl, privateUrl ? new URL(privateUrl).hostname : null);
  if (Buffer.byteLength(text) > MAX_REPORT_BYTES) throw new Error("A91_RUNTIME_RESOURCE_FAILURE");
  return text;
}
export function decide(runs, parity, determinism, surface, artifact) {
  const base = {
    schema_version: 1,
    status: "FAIL",
    ...locks,
    test_fixture_only: runs.some((r) => r.test_fixture_only === true),
  };
  const fail = (reason) => ({ ...base, reason });
  const python = runs.filter((r) => r.runtime === "PYTHON");
  const wasm = runs.filter((r) => r.runtime === "WASM");
  if (python.length !== 2) return fail("PYTHON_COUNT_INVALID");
  if (wasm.length !== 2) return fail("WASM_COUNT_INVALID");
  if (
    new Set(runs.map((r) => r.runId)).size !== 4 ||
    runs.some((r) => !r.runId || r.status !== "SUCCEEDED")
  )
    return fail("RUN_IDENTITY_MISMATCH");
  if (
    base.test_fixture_only ||
    runs.some(
      (r) =>
        r.executionKind !== "REAL_DEM_FULL_FILE" ||
        r.demoSha256 !== FIXTURE.sha256 ||
        r.demoSizeBytes !== FIXTURE.sizeBytes,
    )
  )
    return fail("REAL_EXECUTION_NOT_PROVEN");
  const expected = {
    parserVersion: "0.42.0",
    parserRevision: surface.provenance.commit,
    catalogVersion: surface.catalogVersion,
    catalogDigest: surface.catalogDigest,
    contractVersion: surface.contractVersion,
    contractDigest: surface.contractDigest,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (runs.some((r) => r[key] !== value))
      return fail(
        key.startsWith("catalog")
          ? "CATALOG_MISMATCH"
          : key.startsWith("contract")
            ? "CONTRACT_MISMATCH"
            : "RUN_IDENTITY_MISMATCH",
      );
  }
  const artifactIdentity = digest({
    bindingSha256: artifact.binding.sha256,
    wasmSha256: artifact.wasm.sha256,
    sourceCommit: artifact.sourceCommit,
    sourceTag: artifact.sourceTag,
    parserVersion: "0.42.0",
  });
  if (wasm.some((r) => r.artifactIdentity !== artifactIdentity))
    return fail("WASM_ARTIFACT_IDENTITY_MISMATCH");
  if (
    runs.some(
      (r) =>
        !r.normalizedResult ||
        r.normalizedResultDigest !== digest(r.normalizedResult) ||
        r.resultDigest !== r.normalizedResultDigest,
    )
  )
    return fail("RESULT_DIGEST_INVALID");
  if (python[0].normalizedResultDigest !== python[1].normalizedResultDigest)
    return fail("PYTHON_DETERMINISM_FAIL");
  if (wasm[0].normalizedResultDigest !== wasm[1].normalizedResultDigest)
    return fail("WASM_DETERMINISM_FAIL");
  if (
    parity?.status !== "PASS" ||
    parity.demo_sha256 !== FIXTURE.sha256 ||
    !validParityComparisons(parity.comparisons) ||
    digest(parity.comparisons) !== digest(compareDomains(python[0], wasm[0])) ||
    parity.parity_digest !== digest(parity.comparisons)
  )
    return fail("PARITY_MISMATCH");
  if (
    determinism?.status !== "PASS" ||
    determinism.demo_sha256 !== FIXTURE.sha256 ||
    determinism.runs?.length !== 4 ||
    new Set(determinism.runs.map((r) => r.runId)).size !== 4 ||
    runs.some((r) => !determinism.runs.some((d) => d.runId === r.runId)) ||
    !determinism.comparisons?.length ||
    determinism.comparisons.some((c) => c.equal !== true) ||
    determinism.determinism_digest !== digest(determinism.comparisons)
  )
    return fail("DETERMINISM_NOT_PROVEN");
  return { ...base, status: "PASS", reason: null };
}
