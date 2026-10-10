import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(".github/workflows/quality-gates.yml"), "utf8");

/** Split the workflow into its job blocks (jobs are keys at two-space indent). */
function jobs(source: string): Record<string, string> {
  const body = source.slice(source.indexOf("\njobs:\n") + "\njobs:\n".length);
  const result: Record<string, string> = {};
  let current: string | null = null;
  for (const line of body.split("\n")) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      current = header[1];
      result[current] = "";
    } else if (current) result[current] += `${line}\n`;
  }
  return result;
}

const all = jobs(workflow);
const runsOnMainPullRequests = (block: string) =>
  !/^\s{4}if:/m.test(block) ||
  /github\.event_name == 'pull_request' && github\.base_ref == 'main'/.test(block);

describe("Quality Gates: parser tests cannot be silently skipped on main", () => {
  it("triggers on pull requests to main with no path filter", () => {
    const on = workflow.slice(workflow.indexOf("\non:\n"), workflow.indexOf("\njobs:\n"));
    expect(on).toMatch(/pull_request:\s*\n\s+branches: \[main, /);
    // A path filter makes the whole workflow, and every check in it, absent.
    expect(on).not.toMatch(/^\s+paths(-ignore)?:/m);
  });

  it("runs the COMPLETE parser suite on pull requests to main, not a file list", () => {
    const gate = all["contract-gate"];
    expect(gate).toBeDefined();
    expect(runsOnMainPullRequests(gate)).toBe(true);
    expect(gate).toContain("working-directory: services/cs2-demo-parser");
    expect(gate).toContain("pip install -r requirements-dev.txt");
    // The whole suite: `pytest -q -rs` with no file arguments.
    expect(gate).toMatch(/^\s+run: pytest -q -rs\s*$/m);
    expect(gate).not.toMatch(/pytest[^\n]*\n\s+tests\/test_/);
    expect(gate).not.toMatch(/tests\/test_[a-z_]+\.py/);
    expect(gate).toContain("run: python scripts/ci/verify_parser_test_collection.py");
    expect(gate).not.toContain("continue-on-error");
    expect(gate).not.toMatch(/pytest[^\n]*(--deselect|--ignore| -k )/);
  });

  it("keeps the job name the post-completion attestation requires", () => {
    expect(all["contract-gate"]).toContain("name: Contract-sensitive parser tests");
    const attest = readFileSync(resolve("scripts/f553-r11-post-completion-attest.py"), "utf8");
    expect(attest).toContain("'Contract-sensitive parser tests'");
  });

  it("has parser tests on disk for the files this gate exists to protect", () => {
    const tests = readdirSync(resolve("services/cs2-demo-parser/tests")).filter((name) =>
      /^test_.*\.py$/.test(name),
    );
    expect(tests).toContain("test_parser_semantics.py");
    expect(tests.length).toBeGreaterThanOrEqual(20);
    const verifier = readFileSync(resolve("scripts/ci/verify_parser_test_collection.py"), "utf8");
    expect(verifier).toContain('glob("test_*.py")');
    expect(verifier).toContain('"--collect-only"');
  });

  it("aggregates every main gate into one check that fails on skipped or cancelled", () => {
    const gate = all["main-required-gates"];
    expect(gate).toBeDefined();
    expect(gate).toContain("always()");
    expect(runsOnMainPullRequests(gate)).toBe(true);
    const needs = /needs: \[([^\]]+)\]/
      .exec(gate)![1]
      .split(",")
      .map((name) => name.trim());
    // Every job that runs on pull requests to main must be aggregated.
    const mainJobs = Object.entries(all)
      .filter(([name, block]) => name !== "main-required-gates" && runsOnMainPullRequests(block))
      .map(([name]) => name);
    expect(needs.sort()).toEqual(mainJobs.sort());
    for (const name of needs) expect(gate).toContain(`needs.${name}.result`);
    expect(gate).toContain('if [ "$result" != "success" ]; then status=1; fi');
    expect(gate).not.toContain("continue-on-error");
  });

  it("preserves the R11.2 gate and its own in-run parser suite", () => {
    const r11 = all["f553-r11-2-execution"];
    expect(r11).toContain("name: F553 R11.2 EXECUTION");
    expect(r11).toContain("python3 scripts/f553-r11-execution-engine.py");
    expect(r11).toContain("(cd services/cs2-demo-parser && /tmp/f553-parser-venv/bin/pytest -q)");
  });

  it("never triggers the real A9.1 gate automatically", () => {
    const real = readFileSync(resolve(".github/workflows/a91-real-dem-gate.yml"), "utf8");
    expect(real).toContain("workflow_dispatch:");
    expect(real).not.toMatch(/^\s+(push|pull_request|schedule|workflow_run):/m);
    expect(workflow).not.toContain("a91-real-dem-gate");
    expect(workflow).not.toContain("A91_DEMO_URL");
  });
});
