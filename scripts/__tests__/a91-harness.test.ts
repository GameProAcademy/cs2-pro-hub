import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("A9.1 isolated harness mechanics — never real execution evidence", () => {
  it("runs Node safety and manifest tests without parsing any DEM", () => {
    const result = spawnSync("node", ["scripts/a91/contracts-node-checks.mjs"], {
      encoding: "utf8",
      timeout: 30000,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }, 30000); // The envelope regression serializes 256 MiB; this is a test-only budget, not a parser limit.
  it("runs standalone tick/header/inventory and WASM map normalization regressions without treating them as Vitest suites", () => {
    const normalization = spawnSync("node", ["scripts/a91/wasm_value_normalization.check.mjs"], {
      encoding: "utf8",
      timeout: 30000,
    });
    expect(normalization.status, normalization.stdout + normalization.stderr).toBe(0);
    expect(normalization.stdout).toContain("A91_WASM_MAP_NORMALIZATION_PASS");
    for (const script of [
      "scripts/a91/tick_probe.check.mjs",
      "scripts/a91/header_probe.check.mjs",
      "scripts/a91/inventory_determinism.check.mjs",
    ]) {
      const result = spawnSync("node", [script], {
        encoding: "utf8",
        timeout: 30000,
      });
      expect(result.status, `${script}: ${result.stdout}${result.stderr}`).toBe(0);
      expect(result.stdout).toMatch(/regression checks PASS/);
    }
  });
  it("runs the canonical contract vectors and the cross-runtime comparator checks", () => {
    for (const [script, marker] of [
      ["scripts/a91/canonical_schema.check.mjs", "JavaScript vector checks PASS"],
      ["scripts/a91/cross_runtime.check.mjs", "cross-runtime contract checks PASS"],
    ] as const) {
      const result = spawnSync("node", [script], { encoding: "utf8", timeout: 60000 });
      expect(result.status, `${script}: ${result.stdout}${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(marker);
    }
    // The same vectors must be consumed by the Python implementation.
    const python = readFileSync(resolve("scripts/a91/test_canonical_schema.py"), "utf8");
    expect(python).toContain('"canonical" / "vectors.json"');
    // Both producers must build semantic evidence through the shared builders.
    expect(readFileSync(resolve("scripts/a91/run_wasm_reference.mjs"), "utf8")).toContain(
      "...buildSemanticEvidence({",
    );
    expect(readFileSync(resolve("services/cs2-demo-parser/python_reference.py"), "utf8")).toContain(
      "**build_semantic_evidence(",
    );
  }, 60000);
  it("keeps the A9.1 runner aligned with the renamed probe regression scripts", () => {
    const runner = readFileSync(resolve("scripts/a91/rebuild_wasm_large_demo.py"), "utf8");
    expect(runner).toContain("scripts/a91/header_probe.check.mjs");
    expect(runner).toContain("scripts/a91/tick_probe.check.mjs");
    expect(runner).toContain("scripts/a91/canonical_schema.check.mjs");
    expect(runner).toContain("scripts/a91/cross_runtime.check.mjs");
    expect(runner).not.toContain("scripts/a91/header_probe.test.mjs");
    expect(runner).not.toContain("scripts/a91/tick_probe.test.mjs");
  });
  it("runs synthetic Python validation, cleanup and no-execution tests", () => {
    const result = spawnSync(
      "python3",
      ["-m", "unittest", "discover", "-s", "scripts/a91", "-p", "test_*.py"],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }, 30000);
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
    expect(source).toContain("DEM_SHA256: ${{ inputs.expected_sha256 }}");
    // The real-DEM workflow must build its isolated WASM artifact before execute.py;
    // calling execute.py directly cannot satisfy the required artifact/manifest inputs.
    expect(source).toContain("run: python scripts/a91/rebuild_wasm_large_demo.py");
    expect(source).not.toContain("run: python scripts/a91/execute.py");
    for (const pinned of [
      "UPSTREAM_COMMIT: d3767705dc5846d73ed29db50eaeda58778dc934",
      "UPSTREAM_TAG: v0.42.0",
      "RUST_VERSION: 1.91.1",
      "WASM_PACK_VERSION: 0.13.1",
      "WASM_BINDGEN_VERSION: 0.2.100",
    ]) {
      expect(source).toContain(pinned);
    }
    const remediationWorkflow = readFileSync(
      resolve(".github/workflows/a91-wasm-large-demo-remediation.yml"),
      "utf8",
    );
    for (const pinned of [
      "UPSTREAM_COMMIT: d3767705dc5846d73ed29db50eaeda58778dc934",
      "UPSTREAM_TAG: v0.42.0",
      "RUST_VERSION: 1.91.1",
      "WASM_PACK_VERSION: 0.13.1",
      "WASM_BINDGEN_VERSION: 0.2.100",
    ]) {
      expect(remediationWorkflow).toContain(pinned);
    }
    expect(source).not.toContain("demo_url:");
    expect(source).not.toMatch(/inputs\.demo_url|contents: write|railway|supabase|deploy/i);
    expect(source).toContain("if: always()");
    const uploadPaths = source.split("          path: |")[1]?.split("          retention-days:")[0];
    expect(uploadPaths).toBeDefined();
    expect(uploadPaths).not.toMatch(/\*|\.dem\s*$/m);
    expect(uploadPaths?.trim().split("\n")).toHaveLength(3);
    const names = uploadPaths
      ?.trim()
      .split("\n")
      .map((line) => line.trim().split("/").at(-1))
      .sort();
    expect(names).toEqual(
      ["a91_real_dem_report.json", "parity_report.json", "determinism_report.json"].sort(),
    );
  });
  it("executes the worker's exact tick-call expression with five mock arguments", () => {
    const source = readFileSync("src/lib/client-parser/clientParser.worker.ts", "utf8");
    const expression = source.match(
      /parser\.parseTicks\(bytes,\s*\[\.\.\.CLIENT_TICK_PROPERTIES\],\s*probeTicks,\s*\[\],\s*false\)/,
    )?.[0];
    expect(expression).toBeDefined();
    if (!expression) throw new Error("WORKER_TICK_SIGNATURE_REGRESSION");
    const bytes = new Uint8Array([1]);
    const ticks = new Int32Array([0, 10]);
    let observed: unknown[] = [];
    const parser = {
      parseTicks: (...args: unknown[]) => {
        observed = args;
        return [];
      },
    };
    // Evaluate only the actual call expression, not the worker or a DEM parser.
    new Function("parser", "bytes", "CLIENT_TICK_PROPERTIES", "probeTicks", `return ${expression}`)(
      parser,
      bytes,
      ["health"],
      ticks,
    );
    expect(observed).toEqual([bytes, ["health"], ticks, [], false]);
    expect(source).toMatch(/wantedPlayers\?: unknown\[\]/);
  });
  it("keeps the real DEM gate read-only and requires a reviewed PR for promotion", () => {
    const workflow = readFileSync(
      resolve(".github/workflows/a91-wasm-large-demo-remediation.yml"),
      "utf8",
    );
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toContain("promote_on_pass");
    expect(workflow).not.toContain("contents: write");
    const script = readFileSync("scripts/a91/rebuild_wasm_large_demo.py", "utf8");
    expect(script).not.toContain("INPUT_PROMOTE_ON_PASS");
    expect(script).not.toContain("git push");
    expect(script).not.toContain("git commit");

    expect(script).toContain("def child_environment(");
    expect(script).toContain("env=child_environment()");
    expect(script).toContain("env=gate_env");
    const gateScript = readFileSync("scripts/a91/execute.py", "utf8");
    expect(gateScript).toContain("if k not in sensitive_inputs");
    expect(gateScript).toContain(
      '"scripts/a91/finalize_report.mjs", str(temporary), str(output), wasm_manifest',
    );
    expect(script).toContain(
      'run("node", "scripts/a91/inventory_determinism.check.mjs", cwd=ROOT)',
    );
    const finalizer = readFileSync("scripts/a91/finalize_report.mjs", "utf8");
    expect(finalizer).toContain("process.argv[4]");
    expect(finalizer).toContain("resolve(manifestPath)");
    const wasmRunner = readFileSync("scripts/a91/run_wasm_reference.mjs", "utf8");
    expect(wasmRunner).toContain("normalizeWasmValue(rawResult)");
    expect(wasmRunner).toContain("normalizeEventRows(normalizedValue, request.eventName)");
    expect(wasmRunner).toContain("canonicalizeInventory(api, apiValue)");
    expect(wasmRunner).not.toContain("canonicalizeInventory(api, normalizedValue)");
  });
  it("filters post-completion attestation at the workflow trigger instead of creating skipped jobs", () => {
    const workflow = readFileSync(
      resolve(".github/workflows/f553-r11-post-completion.yml"),
      "utf8",
    );
    expect(workflow).toMatch(
      /workflow_run:\s*\n\s+workflows:\s*\[Quality Gates\]\s*\n\s+types:\s*\[completed\]\s*\n\s+branches:\s*\[main\]/,
    );
    expect(workflow).not.toContain("if: github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toMatch(/permissions:\s*\n\s+actions:\s*read\s*\n\s+contents:\s*read/);
  });
  it("keeps WASM memory access bound to initSync exports, not the wrapper closure", () => {
    const source = readFileSync("scripts/a91/run_wasm_reference.mjs", "utf8");
    expect(source).toMatch(/const wasmExports = parser\.initSync\(wasm\);/);
    expect(source).toMatch(/return \{ parser, wasmExports \};/);
    expect(source).toMatch(/wasmExports\.memory instanceof WebAssembly\.Memory/);
    expect(source).not.toMatch(/parser\.memory/);
  });

  it("never tracks a DEM file", () => {
    const result = spawnSync("git", ["ls-files", "*.dem"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });
});
