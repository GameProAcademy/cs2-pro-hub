import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const checker = resolve(process.cwd(), "scripts/verify-browser-parser-build.mjs");

function checkOutput(file?: string) {
  const cwd = mkdtempSync(join(tmpdir(), "h3e91-browser-isolation-"));
  try {
    const output = join(cwd, ".output/public/assets");
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "entry.js"), file ?? 'console.log("ready");');
    return spawnSync(process.execPath, [checker], { cwd, encoding: "utf8" });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("R4.1 production bundle seal verifier", () => {
  it("rejects a parser worker in emitted output", () => {
    const result = checkOutput('new Worker("clientParser.worker");');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("H3E91_BROWSER_PARSER_IN_PRODUCTION_BUILD");
  });

  it("rejects a bundled client parser entry", () => {
    expect(checkOutput('name: "gamepro-client-parser-poc"').status).not.toBe(0);
  });

  it("does not claim sealing when no output exists", () => {
    const cwd = mkdtempSync(join(tmpdir(), "h3e91-no-build-"));
    try {
      const result = spawnSync(process.execPath, [checker], { cwd, encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("H3E91_BROWSER_BUILD_OUTPUT_MISSING");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("accepts only a clean synthetic output", () => {
    const result = checkOutput();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("H3E91_BROWSER_PARSER_SEALED");
  });
});