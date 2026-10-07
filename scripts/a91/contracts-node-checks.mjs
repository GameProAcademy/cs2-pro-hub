import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FIXTURE,
  decide,
  digest,
  locks,
  validateUrl,
  validateMetadata,
  validateDemo,
  validateManifests,
  sanitizeReport,
} from "./contracts.mjs";
import { loadPinnedParser } from "./run_wasm_reference.mjs";
import { DOMAINS, parityReport, compareDomains, validParityComparisons } from "./parity.mjs";

const surface = JSON.parse(
  readFileSync("docs/client-parser/upstream-surface-manifest.json", "utf8"),
);
const manifest = JSON.parse(
  readFileSync("public/client-parser/demoparser2/0.42.0/artifact-manifest.json", "utf8"),
);
const identity = digest({
  bindingSha256: manifest.binding.sha256,
  wasmSha256: manifest.wasm.sha256,
  sourceCommit: manifest.sourceCommit,
  sourceTag: manifest.sourceTag,
  parserVersion: "0.42.0",
});
function setup() {
  const normalizedResult = { header: { map: "test" }, value: [null, 0, false] };
  const runs = ["PYTHON", "PYTHON", "WASM", "WASM"].map((runtime, i) => ({
    ...locks,
    runtime,
    runId: `test-${i}`,
    status: "SUCCEEDED",
    executionKind: "REAL_DEM_FULL_FILE",
    test_fixture_only: true,
    demoSha256: FIXTURE.sha256,
    demoSizeBytes: FIXTURE.sizeBytes,
    parserVersion: "0.42.0",
    parserRevision: surface.provenance.commit,
    catalogVersion: surface.catalogVersion,
    catalogDigest: surface.catalogDigest,
    contractVersion: surface.contractVersion,
    contractDigest: surface.contractDigest,
    artifactIdentity: runtime === "WASM" ? identity : null,
    normalizedResult,
    normalizedResultDigest: digest(normalizedResult),
    resultDigest: digest(normalizedResult),
  }));
  for (const run of runs) {
    for (const key of [
      "headerEvidence",
      "mapEvidence",
      "timingEvidence",
      "playerInventory",
      "eventEvidence",
      "roundEvidence",
      "grenadeEvidence",
      "bombEvidence",
      "damageEvidence",
      "deathEvidence",
      "weaponEvidence",
      "economyEvidence",
      "tickDomainEvidence",
    ])
      run[key] = { value: [null, 0, false] };
  }
  runs[2].domainAvailability = { player_identity: "NOT_AVAILABLE_ON_WASM" };
  runs[3].domainAvailability = { player_identity: "NOT_AVAILABLE_ON_WASM" };
  const comparisons = ["PYTHON", "WASM"].map((runtime) => ({
    field: "normalizedResultDigest",
    runtime,
    equal: true,
  }));
  return {
    runs,
    parity: parityReport(runs[0], runs[2], FIXTURE.sha256),
    determinism: {
      status: "PASS",
      demo_sha256: FIXTURE.sha256,
      runs: runs.map((r) => ({ runId: r.runId, runtime: r.runtime })),
      comparisons,
      determinism_digest: digest(comparisons),
    },
  };
}
test("URL and authorization are strict and errors do not echo the URL", () => {
  assert.throws(() => validateUrl(""), /NO_DEM_URL/);
  for (const url of ["http://example.invalid/demo", "https://user:pass@example.invalid/a", "bad"])
    assert.throws(() => validateUrl(url), /INVALID_DEM_URL/);
  validateUrl("https://example.invalid/demo?signature=private");
  assert.throws(
    () =>
      validateMetadata("other.dem", FIXTURE.sizeBytes, FIXTURE.sha256, FIXTURE.authorizationRef),
    /AUTHORIZATION_MISMATCH/,
  );
  assert.throws(() => validateDemo("/tmp/a91-no-file.dem", {}), /MISSING_DEM/);
  assert.throws(() => validateDemo("wrong.txt", {}), /WRONG_DEM_EXTENSION/);
});
test("pinned WASM initializes and exports are verified without any DEM parse", () => {
  const parser = loadPinnedParser(surface, manifest);
  for (const api of manifest.declaredExports) assert.equal(typeof parser[api], "function");
  assert.equal(parser.parsePlayerInfo, undefined);
  assert.throws(
    () =>
      loadPinnedParser(surface, {
        ...manifest,
        binding: { ...manifest.binding, sha256: "0".repeat(64) },
      }),
    /WASM_ARTIFACT_IDENTITY_MISMATCH/,
  );
  assert.throws(
    () => loadPinnedParser(surface, { ...manifest, declaredExports: ["unsupported"] }),
    /UNSUPPORTED_WASM_API/,
  );
});
test("catalog and contract cannot be substituted", () => {
  validateManifests(surface, manifest);
  assert.throws(
    () => validateManifests({ ...surface, catalogDigest: "wrong" }, manifest),
    /CATALOG_MISMATCH/,
  );
  assert.throws(
    () => validateManifests({ ...surface, contractDigest: "wrong" }, manifest),
    /CONTRACT_MISMATCH/,
  );
});
test("synthetic fixture can never establish real A9.1 PASS", () => {
  const s = setup();
  const r = decide(s.runs, s.parity, s.determinism, surface, manifest);
  assert.equal(r.status, "FAIL");
  assert.equal(r.test_fixture_only, true);
  assert.equal(r.reason, "REAL_EXECUTION_NOT_PROVEN");
  assert.equal(r.canonicalEligible, false);
  assert.equal(r.productionAuthorization, false);
  assert.equal(r.attempt9Authorization, false);
});
test("counts and duplicate identities fail before decision", () => {
  const s = setup();
  assert.equal(
    decide(s.runs.slice(1), s.parity, s.determinism, surface, manifest).reason,
    "PYTHON_COUNT_INVALID",
  );
  assert.equal(
    decide(s.runs.slice(0, 3), s.parity, s.determinism, surface, manifest).reason,
    "WASM_COUNT_INVALID",
  );
  s.runs[3].runId = s.runs[0].runId;
  assert.equal(
    decide(s.runs, s.parity, s.determinism, surface, manifest).reason,
    "RUN_IDENTITY_MISMATCH",
  );
});
test("altered evidence is fail closed for every identity and missing artifact", () => {
  const cases = {
    parserVersion: "RUN_IDENTITY_MISMATCH",
    parserRevision: "RUN_IDENTITY_MISMATCH",
    catalogVersion: "CATALOG_MISMATCH",
    catalogDigest: "CATALOG_MISMATCH",
    contractVersion: "CONTRACT_MISMATCH",
    contractDigest: "CONTRACT_MISMATCH",
    artifactIdentity: "WASM_ARTIFACT_IDENTITY_MISMATCH",
    demoSha256: "REAL_EXECUTION_NOT_PROVEN",
    normalizedResultDigest: "RESULT_DIGEST_INVALID",
  };
  for (const [key, reason] of Object.entries(cases)) {
    const s = setup();
    s.runs.forEach((r) => (r.test_fixture_only = false));
    s.runs[3][key] = "wrong";
    const report = decide(s.runs, s.parity, s.determinism, surface, manifest);
    assert.equal(report.status, "FAIL");
    assert.equal(report.reason, reason);
  }
  const s = setup();
  s.runs.forEach((r) => (r.test_fixture_only = false));
  delete s.runs[3].artifactIdentity;
  assert.equal(
    decide(s.runs, s.parity, s.determinism, surface, manifest).reason,
    "WASM_ARTIFACT_IDENTITY_MISMATCH",
  );
});
test("changed normalized output breaks within-runtime determinism", () => {
  for (const [index, reason] of [
    [1, "PYTHON_DETERMINISM_FAIL"],
    [3, "WASM_DETERMINISM_FAIL"],
  ]) {
    const s = setup();
    s.runs.forEach((r) => (r.test_fixture_only = false));
    s.runs[index].normalizedResult = { changed: true };
    s.runs[index].normalizedResultDigest = digest(s.runs[index].normalizedResult);
    s.runs[index].resultDigest = s.runs[index].normalizedResultDigest;
    assert.equal(decide(s.runs, s.parity, s.determinism, surface, manifest).reason, reason);
  }
});
test("absence, raw secrets and URLs cannot become uploadable evidence", () => {
  assert.notEqual(digest({ v: null }), digest({}));
  assert.notEqual(digest([0]), digest([null]));
  assert.notEqual(digest([false]), digest([null]));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
  assert.notEqual(digest([1, 1]), digest([1]));
  assert.doesNotThrow(() =>
    sanitizeReport({
      authorization: { authorizationRef: "A9.1-M1-CACHE-REAL-DEM" },
      source: "https://example.com/public-evidence",
    }),
  );
  for (const value of [
    { url: "https://example.invalid/private?signature=x" },
    { token: "Bearer private-token-value" },
    { v: NaN },
  ])
    assert.throws(() => sanitizeReport(value));
});

test("capability-aware parity retains all domains without treating absence as equality", () => {
  const s = setup();
  assert.equal(s.parity.status, "PASS");
  assert.equal(s.parity.comparisons.length, 16);
  assert.equal(s.parity.comparablePassCount, 15);
  assert.equal(s.parity.notComparableCount, 1);
  const identity = s.parity.comparisons.find((c) => c.field === "player_identity");
  assert.equal(identity.status, "NOT_COMPARABLE");
  assert.equal(identity.equal, null);
  assert.equal(identity.mismatch_reason, "NOT_AVAILABLE_ON_WASM");
  assert.notEqual(identity.status, "PASS");
  s.runs[2].headerEvidence = { different: true };
  assert.equal(parityReport(s.runs[0], s.runs[2], FIXTURE.sha256).status, "FAIL");
  delete s.runs[2].headerEvidence;
  assert.equal(parityReport(s.runs[0], s.runs[2], FIXTURE.sha256).status, "FAIL");
  delete s.runs[0].playerInventory;
  assert.equal(parityReport(s.runs[0], s.runs[2], FIXTURE.sha256).status, "FAIL");
});
test("rejects both-runtimes-unavailable and blocks contradictory capability waivers", () => {
  const s = setup();
  s.runs[0].domainAvailability = { player_identity: "NOT_AVAILABLE_ON_PYTHON" };
  s.runs[2].domainAvailability = { player_identity: "NOT_AVAILABLE_ON_WASM" };
  const report = parityReport(s.runs[0], s.runs[2], FIXTURE.sha256);
  const identity = report.comparisons.find((c) => c.field === "player_identity");
  assert.equal(identity.status, "BLOCKED");
  assert.equal(identity.mismatch_reason, "BOTH_RUNTIMES_UNAVAILABLE");
  assert.equal(report.status, "FAIL");

  const contradictory = structuredClone(s.runs[2]);
  contradictory.domainAvailability = { player_identity: "NOT_AVAILABLE_ON_WASM" };
  contradictory.playerInventory = { status: "AVAILABLE", players: [{ steamId: "1" }] };
  // An unavailable capability marker is only a waiver for the named runtime;
  // this test locks the rule that the other runtime cannot also be unavailable.
  const compared = compareDomains(s.runs[0], contradictory);
  const row = compared.find((c) => c.field === "player_identity");
  assert.equal(row.status, "BLOCKED");
  assert.equal(row.mismatch_reason, "BOTH_RUNTIMES_UNAVAILABLE");
});

test("decision engine accepts an explicit capability exclusion only with both proven gates", () => {
  // Simulated envelopes exercise the decision predicate only, never real evidence.
  const s = setup();
  s.runs.forEach((r) => (r.test_fixture_only = false));
  let result = decide(s.runs, s.parity, s.determinism, surface, manifest);
  assert.equal(result.status, "PASS");
  for (const key of Object.keys(locks)) assert.equal(result[key], false);
  s.determinism.status = "FAIL";
  assert.equal(decide(s.runs, s.parity, s.determinism, surface, manifest).status, "FAIL");
  s.determinism.status = "PASS";
  s.parity.status = "FAIL";
  assert.equal(decide(s.runs, s.parity, s.determinism, surface, manifest).status, "FAIL");
  assert.equal(
    decide(s.runs.slice(0, 2), s.parity, s.determinism, surface, manifest).status,
    "FAIL",
  );
  assert.equal(decide(s.runs.slice(2), s.parity, s.determinism, surface, manifest).status, "FAIL");
});
test("parity proof cannot omit, duplicate, forge or relabel any dimension", () => {
  const s = setup();
  for (const status of ["FAIL", "NOT_RUN", "BLOCKED", "COMPARABLE"]) {
    const comparisons = structuredClone(s.parity.comparisons);
    comparisons[0].status = status;
    assert.equal(validParityComparisons(comparisons), false);
  }
  assert.equal(validParityComparisons(s.parity.comparisons.slice(1)), false);
  const duplicate = structuredClone(s.parity.comparisons);
  duplicate[0].field = duplicate[1].field;
  assert.equal(validParityComparisons(duplicate), false);
  const changed = structuredClone(s.parity.comparisons);
  changed[5].mismatch_reason = "";
  assert.equal(validParityComparisons(changed), false);
  assert.notEqual(digest(changed), s.parity.parity_digest);
  assert.deepEqual(
    s.parity.comparisons.map((c) => c.field),
    [...DOMAINS],
  );
  assert.deepEqual(compareDomains(s.runs[0], s.runs[2]), s.parity.comparisons);
});
