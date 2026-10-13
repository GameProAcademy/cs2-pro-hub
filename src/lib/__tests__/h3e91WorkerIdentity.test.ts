import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { bridgeWorkerIdentity } from "../h3e91WorkerIdentity";

const COMMIT = "c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d";

function withEnv(commit: string | undefined, nodeEnv: string | undefined) {
  vi.stubEnv("H3E91_EXPECTED_WORKER_BUILD_COMMIT", commit as string);
  vi.stubEnv("NODE_ENV", nodeEnv as string);
  return bridgeWorkerIdentity();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bridge worker identity", () => {
  it("publishes the exact expected commit", () => {
    expect(withEnv(COMMIT, "production")).toEqual({
      expectedWorkerBuildCommit: COMMIT,
      configured: true,
      enforced: true,
    });
  });

  it("never echoes a value the bridge would reject as unconfigured", () => {
    for (const value of [
      undefined,
      "",
      "abc",
      `git:${COMMIT}`,
      COMMIT.toUpperCase(),
      `${COMMIT}x`,
      // The bridge does not trim: a padded value is unconfigured there, so here too.
      ` ${COMMIT}`,
      `${COMMIT}\n`,
    ]) {
      expect(withEnv(value, "production")).toEqual({
        expectedWorkerBuildCommit: null,
        configured: false,
        enforced: true,
      });
    }
  });

  it("reports whether the bridge enforces it", () => {
    for (const nodeEnv of [undefined, "", "development", "test", "Production"]) {
      expect(withEnv(COMMIT, nodeEnv).enforced).toBe(false);
    }
  });

  it("evaluates the bridge's own expressions, character for character", () => {
    const bridge = readFileSync(resolve("src/lib/pipeline/h3e91ExecutionBridge.server.ts"), "utf8");
    const helper = readFileSync(resolve("src/lib/h3e91WorkerIdentity.ts"), "utf8");
    for (const expression of [
      'process.env["H3E91_EXPECTED_WORKER_BUILD_COMMIT"] ?? ""',
      "/^[0-9a-f]{40}$/.test(expectedBuild)",
      'process.env["NODE_ENV"] === "production"',
    ]) {
      expect(bridge).toContain(expression);
      expect(helper).toContain(expression);
    }
    expect(helper).not.toMatch(/\.trim\(\)/);
  });

  it("is served by the existing runtime fingerprint route, with nothing secret", () => {
    const route = readFileSync(
      resolve("src/routes/api/public/parser-attestation-runtime.ts"),
      "utf8",
    );
    expect(route).toContain("bridge: bridgeWorkerIdentity()");
    expect(route).not.toMatch(/SECRET|TOKEN|KEY/);
  });
});
