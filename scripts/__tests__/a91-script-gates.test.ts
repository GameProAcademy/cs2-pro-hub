import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const parity = join(process.cwd(), "scripts/run_python_wasm_parity.mjs");
const determinism = join(process.cwd(), "scripts/run_parser_determinism.mjs");

type Report = {
  status?: string;
  reason?: string;
  canonical_authorization?: boolean;
};

function run(script: string, args: string[], cwd = process.cwd()) {
  const result = spawnSync("node", [script, ...args], {
    cwd,
    encoding: "utf8",
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function readJson(path: string): Report {
  return JSON.parse(readFileSync(path, "utf8")) as Report;
}

function withFixture<T>(callback: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "a91-gate-"));

  try {
    return callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeDemoFixture(dir: string) {
  const path = join(dir, "synthetic-fixture.dem");
  const bytes = Buffer.from("synthetic gate fixture; parser is never invoked");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const authorization = join(dir, "authorization.json");

  writeFileSync(path, bytes);
  writeFileSync(
    authorization,
    JSON.stringify({
      authorizedDemo: true,
      filename: "synthetic-fixture.dem",
      sha256,
      sizeBytes: bytes.byteLength,
    }),
  );

  return { path, authorization, sha256 };
}

function artifact(
  runtime: "PYTHON" | "WASM",
  runId: string,
  demoSha256: string,
) {
  return {
    status: "SUCCEEDED",
    runtime,
    runId,
    demoSha256,
    parserVersion: "0.42.0",
    parserRevision: "git:test-revision",
    catalogVersion: "test-catalog",
    catalogDigest: "catalog-digest",
    contractVersion: 1,
    contractDigest: "contract-digest",
    artifactIdentity:
      runtime === "WASM" ? "wasm-test-artifact" : undefined,
    rawDigest: "raw",
    normalizedResultDigest: "normalized",
    eventDigest: "event",
    tickDigest: "tick",
    roundDigest: "round",
    playerDigest: "player",
    resultDigest: "result",
  };
}

describe("A9.1 parity/determinism fail-closed branches", () => {
  it("keeps parity NOT_RUN without an authorized real DEM", () =>
    withFixture((dir) => {
      const output = join(dir, "report.json");
      const result = run(parity, ["--output", output]);
      const report = readJson(output);

      expect(result.code).toBe(2);
      expect(report.status).toBe("NOT_RUN");
      expect(report.reason).toBe("NO_AUTHORIZED_REAL_DEM_FIXTURE");
      expect(report.canonical_authorization).toBe(false);
    }));

  it("rejects parity on parser/catalog/contract identity mismatch", () =>
    withFixture((dir) => {
      const demo = writeDemoFixture(dir);
      const python = artifact("PYTHON", "py-1", demo.sha256);
      const wasm = artifact("WASM", "wasm-1", demo.sha256);

      wasm.catalogDigest = "different";

      const pythonPath = join(dir, "python.json");
      const wasmPath = join(dir, "wasm.json");
      const output = join(dir, "report.json");

      writeFileSync(pythonPath, JSON.stringify(python));
      writeFileSync(wasmPath, JSON.stringify(wasm));

      const result = run(
        parity,
        [
          "--demo",
          demo.path,
          "--authorization",
          demo.authorization,
          "--python-artifact",
          pythonPath,
          "--wasm-artifact",
          wasmPath,
          "--output",
          output,
        ],
      );
      const report = readJson(output);

      expect(result.code).toBe(2);
      expect(report.reason).toBe(
        "PARSER_CONTRACT_IDENTITY_MISMATCH:catalogDigest",
      );
      expect(report.canonical_authorization).toBe(false);
    }));

  it("rejects parity when artifact DEM hashes differ", () =>
    withFixture((dir) => {
      const demo = writeDemoFixture(dir);
      const pythonPath = join(dir, "python.json");
      const wasmPath = join(dir, "wasm.json");
      const output = join(dir, "report.json");

      writeFileSync(
        pythonPath,
        JSON.stringify(artifact("PYTHON", "py-1", demo.sha256)),
      );
      writeFileSync(
        wasmPath,
        JSON.stringify(artifact("WASM", "wasm-1", "wrong-demo-sha")),
      );

      const result = run(
        parity,
        [
          "--demo",
          demo.path,
          "--authorization",
          demo.authorization,
          "--python-artifact",
          pythonPath,
          "--wasm-artifact",
          wasmPath,
          "--output",
          output,
        ],
      );

      expect(result.code).toBe(2);
      expect(readJson(output).reason).toBe("SAME_DEM_SHA256_REQUIRED");
    }));

  it("rejects determinism when run identity/status is invalid", () =>
    withFixture((dir) => {
      const specs = [
        ["py-1", "PYTHON"],
        ["py-2", "PYTHON"],
        ["wasm-1", "WASM"],
        ["wasm-2", "WASM"],
      ] as const;

      specs.forEach(([id, runtime], index) => {
        const runData = artifact(runtime, id, "demo-sha");

        if (index === 3) runData.parserRevision = "different";
        if (index === 2) runData.status = "FAILED";

        writeFileSync(
          join(dir, id + ".json"),
          JSON.stringify(runData),
        );
      });

      const output = join(dir, "report.json");
      const result = run(
        determinism,
        [
          ...specs.map(([id]) => join(dir, id + ".json")),
          "--output",
          output,
        ],
      );
      const report = readJson(output);

      expect(result.code).toBe(2);
      expect(report.status).toBe("FAIL");
      expect(report.reason).toBe("RUN_IDENTITY_MISMATCH");
      expect(report.canonical_authorization).toBe(false);
    }));

  it("rejects determinism when a digest dimension differs", () =>
    withFixture((dir) => {
      const specs = [
        ["py-1", "PYTHON"],
        ["py-2", "PYTHON"],
        ["wasm-1", "WASM"],
        ["wasm-2", "WASM"],
      ] as const;

      specs.forEach(([id, runtime], index) => {
        const runData = artifact(runtime, id, "demo-sha");

        if (index === 3) runData.resultDigest = "different";

        writeFileSync(
          join(dir, id + ".json"),
          JSON.stringify(runData),
        );
      });

      const output = join(dir, "report.json");
      const result = run(
        determinism,
        [
          ...specs.map(([id]) => join(dir, id + ".json")),
          "--output",
          output,
        ],
      );
      const report = readJson(output);

      expect(result.code).toBe(2);
      expect(report.status).toBe("FAIL");
      expect(report.reason).toBe("DETERMINISM_MISMATCH");
      expect(report.canonical_authorization).toBe(false);
    }));
});
