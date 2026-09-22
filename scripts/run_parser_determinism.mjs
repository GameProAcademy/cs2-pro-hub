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
    determinism_digest: digest([]),
    canonical_authorization: false,
  };
} else {
  const runs = artifacts.map((path) => JSON.parse(readFileSync(path, "utf8")));
  const python = runs.filter((run) => run.runtime === "PYTHON");
  const wasm = runs.filter((run) => run.runtime === "WASM");
  const shas = new Set(runs.map((run) => run.demoSha256));
  const identities = new Set(runs.map((run) => `${run.parserVersion}:${run.parserRevision}`));
  const runIds = new Set(runs.map((run) => run.runId));
  const valid =
    python.length === 2 &&
    wasm.length === 2 &&
    shas.size === 1 &&
    identities.size <= 2 &&
    runIds.size === 4 &&
    runs.every((run) => run.status === "SUCCEEDED");
  const dimensions = [
    "rawDigest",
    "normalizedResultDigest",
    "eventDigest",
    "tickDigest",
    "roundDigest",
    "playerDigest",
    "resultDigest",
  ];
  const comparisons = dimensions.map((field) => ({
    field,
    values: runs.map((run) => run[field] ?? null),
    equal: new Set(runs.map((run) => stable(run[field] ?? null))).size === 1,
  }));
  const status = valid && comparisons.every((row) => row.equal) ? "PASS" : "FAIL";
  report = {
    schema_version: 1,
    status,
    reason: valid ? (status === "PASS" ? null : "DETERMINISM_MISMATCH") : "RUN_IDENTITY_MISMATCH",
    demo_sha256: shas.size === 1 ? runs[0].demoSha256 : null,
    runs: runs.map((run) => run.runIdentity ?? { runId: run.runId, runtime: run.runtime }),
    comparisons,
    determinism_digest: digest(comparisons),
    canonical_authorization: false,
  };
}
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(report.status);
process.exitCode = report.status === "PASS" ? 0 : 2;
