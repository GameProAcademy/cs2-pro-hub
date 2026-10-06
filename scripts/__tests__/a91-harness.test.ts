import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("A9.1 isolated harness mechanics — never real execution evidence", () => {
  it("runs Node safety and manifest tests without parsing any DEM", () => {
    const result = spawnSync("node", ["--test", "scripts/a91/contracts.test.mjs"], {
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
    const uploadPaths = source.split("          path: |")[1]?.split("          retention-days:")[0];
    expect(uploadPaths).toBeDefined();
    expect(uploadPaths).not.toMatch(/\*|\.dem\s*$/m);
    expect(uploadPaths?.trim().split("\n")).toHaveLength(7);
  });
});
