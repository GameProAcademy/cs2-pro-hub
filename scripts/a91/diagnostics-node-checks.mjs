import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizePublicReport,
  sanitizePrivateRuntimeEvidence,
  MAX_PRIVATE_RUNTIME_EVIDENCE_BYTES,
  digest,
} from "./contracts.mjs";
import { classifyWasmError, createTelemetry, failureEvidence } from "./diagnostics.mjs";

test("private evidence over 8 MiB succeeds while public evidence remains bounded", () => {
  const evidence = { value: "x".repeat(9 * 1024 * 1024) };
  assert.throws(() => sanitizePublicReport(evidence), /A91_RUNTIME_RESOURCE_FAILURE/);
  assert.doesNotThrow(() => sanitizePrivateRuntimeEvidence(evidence));
});
test("private evidence overflow has its own normalized reason", () => {
  assert.throws(
    () => sanitizePrivateRuntimeEvidence({ value: "x".repeat(MAX_PRIVATE_RUNTIME_EVIDENCE_BYTES) }),
    /WASM_PRIVATE_EVIDENCE_TOO_LARGE/,
  );
});
test("both envelopes keep secret scanning without blocking public credential-free URLs", () => {
  for (const sanitize of [sanitizePublicReport, sanitizePrivateRuntimeEvidence]) {
    assert.doesNotThrow(() => sanitize({ source: "https://github.com/example/public" }));
    for (const value of [
      "Bearer private-token-value",
      "A91_DEMO_URL",
      "Authorization: redacted",
      "https://user:pass@example.org/a",
      "https://example.org/a?sig=secret",
      "cookie=secret",
      "password=secret",
    ])
      assert.throws(() => sanitize({ value }), /ARTIFACT_SECURITY_FAILURE/);
    for (const key of ["Authorization", "access_token", "refresh_token", "signature", "cookie"])
      assert.throws(() => sanitize({ [key]: "secret" }), /ARTIFACT_SECURITY_FAILURE/);
    assert.throws(
      () =>
        sanitize(
          { source: "https://private.example.org/other" },
          "https://private.example.org/demo",
        ),
      /ARTIFACT_SECURITY_FAILURE/,
    );
  }
});
test("runtime failures are classified without exposing error text", () => {
  for (const [error, expected] of [
    [new RangeError("overflow"), "WASM_RUNTIME_RESOURCE_FAILURE"],
    [new RangeError("WebAssembly memory allocation failure"), "WASM_MEMORY_ALLOCATION_FAILURE"],
    [new WebAssembly.RuntimeError("unreachable"), "WASM_RUNTIME_TRAP"],
    [new Error("parser rejected input"), "WASM_PARSE_FAILURE"],
  ])
    assert.equal(classifyWasmError(error, true), expected);
  const failure = failureEvidence(new Error("private raw diagnostic"));
  assert.match(failure.errorDigest, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(failure).includes("private raw diagnostic"), false);
});
test("last completed stage and failing stage survive independently of semantic digest", () => {
  const telemetry = createTelemetry();
  const semantic = { header: { map: "cache" }, values: [null, false, 0] };
  const before = digest(semantic);
  telemetry.step("parse_header", () => semantic.header);
  try {
    telemetry.step(
      "parse_grenades",
      () => {
        throw new WebAssembly.RuntimeError("unreachable");
      },
      true,
    );
    assert.fail("must throw");
  } catch (error) {
    const failure = failureEvidence(error);
    assert.equal(failure.stage, "after_parse_header");
    assert.equal(failure.failedStage, "parse_grenades");
    assert.equal(failure.reason, "WASM_RUNTIME_TRAP");
    assert.ok(failure.memoryPeaks.peakRss > 0);
    assert.ok(failure.executionTimeline.every((entry) => typeof entry.memory.rss === "number"));
  }
  assert.equal(digest(semantic), before);
});
