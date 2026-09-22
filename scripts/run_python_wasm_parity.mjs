#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const NOT_RUN_REASON = "NO_AUTHORIZED_REAL_DEM_FIXTURE";
const domains = [
  "header",
  "map",
  "tickrate",
  "playback_ticks",
  "players",
  "player_identity",
  "events",
  "rounds",
  "grenades",
  "bomb",
  "damage",
  "deaths",
  "weapons",
  "economy",
  "tick_properties",
  "game_state",
];

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
    .join(",")}}`;
}

function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function outputPath() {
  const marker = process.argv.indexOf("--output");
  return resolve(
    marker >= 0 && process.argv[marker + 1] ? process.argv[marker + 1] : "parity_report.json",
  );
}

function argument(name) {
  const marker = process.argv.indexOf(name);
  return marker >= 0 ? process.argv[marker + 1] : undefined;
}

function notRun(reason = NOT_RUN_REASON) {
  const comparisons = domains.map((field) => ({
    field,
    python_value: null,
    wasm_value: null,
    normalized_python: null,
    normalized_wasm: null,
    equal: null,
    mismatch_reason: "NOT_RUN",
  }));
  const report = {
    schema_version: 1,
    status: "NOT_RUN",
    reason,
    test_fixture_only: false,
    demo_sha256: null,
    comparisons,
    parity_digest: digest(comparisons),
    canonical_authorization: false,
  };
  writeFileSync(outputPath(), `${JSON.stringify(report, null, 2)}\n`);
  console.log("NOT_RUN");
  return 2;
}

function readArtifact(path, runtime) {
  if (!path || !existsSync(path)) throw new Error(`${runtime}_ARTIFACT_REQUIRED`);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (parsed?.status !== "SUCCEEDED" || parsed?.runtime !== runtime) {
    throw new Error(`${runtime}_ARTIFACT_INVALID`);
  }
  return parsed;
}

function domainValue(artifact, domain) {
  const keys = {
    header: "headerEvidence",
    map: "mapEvidence",
    tickrate: "timingEvidence",
    playback_ticks: "timingEvidence",
    players: "playerInventory",
    player_identity: "playerInventory",
    events: "eventEvidence",
    rounds: "roundEvidence",
    grenades: "grenadeEvidence",
    bomb: "bombEvidence",
    damage: "damageEvidence",
    deaths: "deathEvidence",
    weapons: "weaponEvidence",
    economy: "economyEvidence",
    tick_properties: "tickDomainEvidence",
    game_state: "normalizedResult",
  };
  return artifact[keys[domain]] ?? null;
}

function main() {
  const demo = argument("--demo");
  if (!demo) return notRun();
  if (!demo.toLowerCase().endsWith(".dem") || !existsSync(demo))
    return notRun("EXPLICIT_AUTHORIZED_DEM_PATH_REQUIRED");
  const authorizationPath = argument("--authorization");
  if (!authorizationPath || !existsSync(authorizationPath)) return notRun("NO_AUTHORIZED_REAL_DEM");
  const authorization = JSON.parse(readFileSync(authorizationPath, "utf8"));
  const bytes = readFileSync(demo);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    authorization.authorizedDemo !== true ||
    authorization.filename !== basename(demo) ||
    authorization.sha256 !== sha256 ||
    authorization.sizeBytes !== bytes.byteLength
  ) {
    return notRun("AUTHORIZED_DEM_METADATA_MISMATCH");
  }
  const python = readArtifact(argument("--python-artifact"), "PYTHON");
  const wasm = readArtifact(argument("--wasm-artifact"), "WASM");
  if (python.demoSha256 !== sha256 || wasm.demoSha256 !== sha256)
    throw new Error("SAME_DEM_SHA256_REQUIRED");
  const comparisons = domains.map((field) => {
    const pythonValue = domainValue(python, field);
    const wasmValue = domainValue(wasm, field);
    const normalizedPython = JSON.parse(stable(pythonValue));
    const normalizedWasm = JSON.parse(stable(wasmValue));
    const equal = stable(normalizedPython) === stable(normalizedWasm);
    return {
      field,
      python_value: pythonValue,
      wasm_value: wasmValue,
      normalized_python: normalizedPython,
      normalized_wasm: normalizedWasm,
      equal,
      mismatch_reason: equal ? null : "SEMANTIC_MISMATCH",
    };
  });
  const status = comparisons.every((row) => row.equal) ? "PASS" : "FAIL";
  const report = {
    schema_version: 1,
    status,
    demo_sha256: sha256,
    comparisons,
    parity_digest: digest(comparisons),
    canonical_authorization: false,
  };
  writeFileSync(outputPath(), `${JSON.stringify(report, null, 2)}\n`);
  console.log(status);
  return status === "PASS" ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  process.exitCode = notRun(message);
}
