#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
    .join(",")}}`;
}
const digest = (value) => createHash("sha256").update(stable(value)).digest("hex");
const marker = process.argv.indexOf("--output");
const output = resolve(
  marker >= 0 && process.argv[marker + 1] ? process.argv[marker + 1] : "determinism_report.json",
);
const artifacts = process.argv.filter(
  (value) => value.endsWith(".json") && resolve(value) !== output,
);
let report;
if (artifacts.length !== 4 || artifacts.some((path) => !existsSync(path))) {
  report = {
    schema_version: 1,
    status: "NOT_RUN",
    reason: "TWO_REAL_RUNS_PER_RUNTIME_REQUIRED",
    demo_sha256: null,
    runs: [],
    pythonDeterministic: false,
    wasmDeterministic: false,
    identityStable: false,
    artifactStable: false,
    catalogStable: false,
    contractStable: false,
    demoStable: false,
    determinismDecision: "NOT_RUN",
    determinism_digest: digest([]),
    canonical_authorization: false,
  };
} else {
  const runs = artifacts.map((path) => JSON.parse(readFileSync(path, "utf8")));
  const python = runs.filter((run) => run.runtime === "PYTHON");
  const wasm = runs.filter((run) => run.runtime === "WASM");
  const shas = new Set(runs.map((run) => run.demoSha256));
  const parserIdentities = new Set(runs.map((run) => `${run.parserVersion}:${run.parserRevision}`));
  const catalogIdentities = new Set(
    runs.map((run) => `${run.catalogVersion}:${run.catalogDigest}`),
  );
  const contractIdentities = new Set(
    runs.map((run) => `${run.contractVersion}:${run.contractDigest}`),
  );
  const runIds = new Set(runs.map((run) => run.runId));
  const wasmArtifactIdentities = new Set(wasm.map((run) => run.artifactIdentity ?? ""));
  const valid =
    python.length === 2 &&
    wasm.length === 2 &&
    shas.size === 1 &&
    parserIdentities.size === 1 &&
    catalogIdentities.size === 1 &&
    contractIdentities.size === 1 &&
    runIds.size === 4 &&
    wasmArtifactIdentities.size === 1 &&
    wasm.every((run) => Boolean(run.artifactIdentity)) &&
    runs.every(
      (run) =>
        run.status === "SUCCEEDED" &&
        typeof run.parserVersion === "string" &&
        typeof run.parserRevision === "string" &&
        (typeof run.catalogVersion === "string" || typeof run.catalogVersion === "number") &&
        typeof run.catalogDigest === "string" &&
        typeof run.contractVersion === "number" &&
        typeof run.contractDigest === "string",
    );
  const dimensions = [
    "rawDigest",
    "normalizedResultDigest",
    "eventDigest",
    "tickDigest",
    "roundDigest",
    "playerDigest",
    "resultDigest",
  ];
  // Determinism compares reruns within each runtime. Cross-runtime equality is
  // the independent parity gate, not a determinism assumption.
  const comparisons = [python, wasm].flatMap((runtimeRuns, index) =>
    dimensions.map((field) => ({
      field,
      runtime: index === 0 ? "PYTHON" : "WASM",
      values: runtimeRuns.map((run) => run[field] ?? null),
      equal:
        runtimeRuns.length === 2 &&
        runtimeRuns.every((run) => typeof run[field] === "string" && run[field].length > 0) &&
        new Set(runtimeRuns.map((run) => stable(run[field]))).size === 1,
    })),
  );
  const status = valid && comparisons.every((row) => row.equal) ? "PASS" : "FAIL";
  report = {
    schema_version: 1,
    status,
    reason: valid ? (status === "PASS" ? null : "DETERMINISM_MISMATCH") : "RUN_IDENTITY_MISMATCH",
    demo_sha256: shas.size === 1 ? runs[0].demoSha256 : null,
    runs: runs.map((run) => run.runIdentity ?? { runId: run.runId, runtime: run.runtime }),
    comparisons,
    pythonDeterministic:
      valid && comparisons.filter((c) => c.runtime === "PYTHON").every((c) => c.equal),
    wasmDeterministic:
      valid && comparisons.filter((c) => c.runtime === "WASM").every((c) => c.equal),
    identityStable: valid,
    artifactStable:
      wasm.length === 2 &&
      wasmArtifactIdentities.size === 1 &&
      wasm.every((r) => Boolean(r.artifactIdentity)),
    catalogStable:
      catalogIdentities.size === 1 &&
      runs.every((r) => r.catalogVersion != null && Boolean(r.catalogDigest)),
    contractStable:
      contractIdentities.size === 1 &&
      runs.every((r) => r.contractVersion != null && Boolean(r.contractDigest)),
    demoStable: shas.size === 1 && runs.every((r) => Boolean(r.demoSha256)),
    determinismDecision: status,
    determinism_digest: digest(comparisons),
    canonical_authorization: false,
  };
}
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(report.status);
process.exitCode = report.status === "PASS" ? 0 : 2;
