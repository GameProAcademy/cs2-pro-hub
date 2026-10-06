import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const parity = join(process.cwd(), "scripts/run_python_wasm_parity.mjs");
const determinism = join(process.cwd(), "scripts/run_parser_determinism.mjs");

function run(script: string, args: string[], cwd = process.cwd()) {
  const r = spawnSync("node", [script, ...args], { cwd, encoding: "utf8" });
  return { code: r.status ?? 1, out: r.stdout ?? "", err: r.stderr ?? "" };
}
function json(path: string) { return JSON.parse(readFileSync(path, "utf8")); }
function fixture<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "a91-gate-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function demo(dir: string) {
  const path = join(dir, "synthetic-fixture.dem");
  const bytes = Buffer.from("synthetic gate fixture; parser is never invoked");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const auth = join(dir, "authorization.json");
  writeFileSync(path, bytes);
  writeFileSync(auth, JSON.stringify({ authorizedDemo: true, filename: "synthetic-fixture.dem", sha256, sizeBytes: bytes.byteLength }));
  return { path, auth, sha256 };
}
function artifact(runtime: "PYTHON" | "WASM", runId: string, sha256: string) {
  return {
    status: "SUCCEEDED", runtime, runId, demoSha256: sha256,
    parserVersion: "0.42.0", parserRevision: "git:test-revision",
    catalogVersion: "test-catalog", catalogDigest: "catalog-digest",
    contractVersion: 1, contractDigest: "contract-digest",
    artifactIdentity: runtime === "WASM" ? "wasm-test-artifact" : undefined,
    rawDigest: "raw", normalizedResultDigest: "normalized", eventDigest: "event",
    tickDigest: "tick", roundDigest: "round", playerDigest: "player", resultDigest: "result",
  };
}

describe("A9.1 parity/determinism fail-closed branches", () => {
  it("keeps parity NOT_RUN without an authorized real DEM", () => fixture((dir) => {
    const output = join(dir, "report.json");
    const r = run(parity, ["--output", output]);
    const report = json(output);
    expect(r.code).toBe(2);
    expect(report.status).toBe("NOT_RUN");
    expect(report.reason).toBe("NO_AUTHORIZED_REAL_DEM_FIXTURE");
    expect(report.canonical_authorization).toBe(false);
  }));

  it("rejects parity on parser/catalog/contract identity mismatch", () => fixture((dir) => {
    const d = demo(dir), py = artifact("PYTHON", "py-1", d.sha256), wasm = artifact("WASM", "wasm-1", d.sha256);
    wasm.catalogDigest = "different";
    const pyPath = join(dir, "py.json"), wasmPath = join(dir, "wasm.json"), output = join(dir, "report.json");
    writeFileSync(pyPath, JSON.stringify(py)); writeFileSync(wasmPath, JSON.stringify(wasm));
    const r = run(parity, ["--demo", d.path, "--authorization", d.auth, "--python-artifact", pyPath, "--wasm-artifact", wasmPath, "--output", output]);
    const report = json(output);
    expect(r.code).toBe(2);
    expect(report.reason).toBe("PARSER_CONTRACT_IDENTITY_MISMATCH:catalogDigest");
    expect(report.canonical_authorization).toBe(false);
  }));

  it("rejects parity when artifact DEM hashes differ", () => fixture((dir) => {
    const d = demo(dir), pyPath = join(dir, "py.json"), wasmPath = join(dir, "wasm.json"), output = join(dir, "report.json");
    writeFileSync(pyPath, JSON.stringify(artifact("PYTHON", "py-1", d.sha256)));
    writeFileSync(wasmPath, JSON.stringify(artifact("WASM", "wasm-1", "wrong-demo-sha")));
    const r = run(parity, ["--demo", d.path, "--authorization", d.auth, "--python-artifact", pyPath, "--wasm-artifact", wasmPath, "--output", output]);
    expect(r.code).toBe(2);
    expect(json(output).reason).toBe("SAME_DEM_SHA256_REQUIRED");
  }));

  it("rejects determinism when run identity/status is invalid", () => fixture((dir) => {
    const specs = [["py-1","PYTHON"],["py-2","PYTHON"],["wasm-1","WASM"],["wasm-2","WASM"]] as const;
    specs.forEach(([id, runtime], i) => {
      const a = artifact(runtime, id, "demo-sha");
      if (i === 3) a.parserRevision = "different";
      if (i === 2) a.status = "FAILED";
      writeFileSync(join(dir, id + ".json"), JSON.stringify(a));
    });
    const output = join(dir, "report.json");
    const r = run(determinism, [...specs.map(([id]) => join(dir, id + ".json")), "--output", output]);
    const report = json(output);
    expect(r.code).toBe(2);
    expect(report.status).toBe("FAIL");
    expect(report.reason).toBe("RUN_IDENTITY_MISMATCH");
    expect(report.canonical_authorization).toBe(false);
  }));

  it("rejects determinism when a digest dimension differs", () => fixture((dir) => {
    const specs = [["py-1","PYTHON"],["py-2","PYTHON"],["wasm-1","WASM"],["wasm-2","WASM"]] as const;
    specs.forEach(([id, runtime], i) => {
      const a = artifact(runtime, id, "demo-sha");
      if (i === 3) a.resultDigest = "different";
      writeFileSync(join(dir, id + ".json"), JSON.stringify(a));
    });
    const output = join(dir, "report.json");
    const r = run(determinism, [...specs.map(([id]) => join(dir, id + ".json")), "--output", output]);
    const report = json(output);
    expect(r.code).toBe(2);
    expect(report.status).toBe("FAIL");
    expect(report.reason).toBe("DETERMINISM_MISMATCH");
    expect(report.canonical_authorization).toBe(false);
  }));
});
