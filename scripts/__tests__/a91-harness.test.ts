import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("A9.1 isolated harness mechanics — never real execution evidence", () => {
  it("runs Node safety and manifest tests without parsing any DEM", () => {
    const result = spawnSync("node", ["--test", "scripts/a91/contracts-node-checks.mjs"], {
      encoding: "utf8",
    });
    expect(result.stdout + result.stderr).not.toContain("# fail 1");
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
  it("runs synthetic Python validation, cleanup and no-execution tests", () => {
    const result = spawnSync(
      "python3",
      ["-m", "unittest", "discover", "-s", "scripts/a91", "-p", "test_*.py"],
      { encoding: "utf8" },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
  it("keeps workflow manual, main-only, read-only and artifact allowlisted", () => {
    const source = readFileSync(resolve(".github/workflows/a91-real-dem-gate.yml"), "utf8");
    expect(source).toContain("workflow_dispatch:");
    expect(source).not.toMatch(/^\s+(push|pull_request):/m);
    expect(source).toContain("github.ref == 'refs/heads/main'");
    expect(source).toContain("contents: read");
    expect(source).not.toContain("contents: write");
    expect(source).toContain("steps.upload-guard.outputs.safe == 'true'");
    expect(source).not.toContain("set -x");
    expect(source).toContain("A91_DEMO_URL: ${{ secrets.A91_DEMO_URL }}");
    expect(source).not.toContain("demo_url:");
    expect(source).not.toMatch(/inputs\.demo_url|contents: write|railway|supabase|deploy/i);
    expect(source).toContain("if: always()");
    const uploadPaths = source.split("          path: |")[1]?.split("          retention-days:")[0];
    expect(uploadPaths).toBeDefined();
    expect(uploadPaths).not.toMatch(/\*|\.dem\s*$/m);
    expect(uploadPaths?.trim().split("\n")).toHaveLength(7);
    const names = uploadPaths?.trim().split("\n").map((line) => line.trim().split("/").at(-1)).sort();
    expect(names).toEqual(["a91_real_dem_report.json", "parity_report.json", "determinism_report.json", "python_run_1.json", "python_run_2.json", "wasm_run_1.json", "wasm_run_2.json"].sort());
  });
  it("executes the worker's exact tick-call expression with five mock arguments", () => {
    const source = readFileSync("src/lib/client-parser/clientParser.worker.ts", "utf8");
    const expression = source.match(/parser\.parseTicks\(bytes,\s*\[\.\.\.CLIENT_TICK_PROPERTIES\],\s*probeTicks,\s*\[\],\s*false\)/)?.[0];
    expect(expression).toBeDefined();
    if (!expression) throw new Error("WORKER_TICK_SIGNATURE_REGRESSION");
    const bytes = new Uint8Array([1]);
    const ticks = new Int32Array([0, 10]);
    let observed: unknown[] = [];
    const parser = { parseTicks: (...args: unknown[]) => { observed = args; return []; } };
    // Evaluate only the actual call expression, not the worker or a DEM parser.
    new Function("parser", "bytes", "CLIENT_TICK_PROPERTIES", "probeTicks", `return ${expression}`)(parser, bytes, ["health"], ticks);
    expect(observed).toEqual([bytes, ["health"], ticks, [], false]);
    expect(source).toMatch(/wantedPlayers\?: unknown\[\]/);
  });
  it("never tracks a DEM file", () => {
    const result = spawnSync("git", ["ls-files", "*.dem"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });
});
