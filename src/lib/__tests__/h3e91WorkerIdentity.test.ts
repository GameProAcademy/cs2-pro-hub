import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { bridgeWorkerIdentity } from "../h3e91WorkerIdentity";

const COMMIT = "c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d";

describe("bridge worker identity", () => {
  it("publishes the exact expected commit", () => {
    expect(
      bridgeWorkerIdentity({ H3E91_EXPECTED_WORKER_BUILD_COMMIT: COMMIT, NODE_ENV: "production" }),
    ).toEqual({ expectedWorkerBuildCommit: COMMIT, configured: true, enforced: true });
  });

  it("never echoes a value that is not an exact commit", () => {
    for (const value of [
      undefined,
      "",
      "abc",
      `git:${COMMIT}`,
      COMMIT.toUpperCase(),
      `${COMMIT}x`,
    ]) {
      expect(
        bridgeWorkerIdentity({ H3E91_EXPECTED_WORKER_BUILD_COMMIT: value, NODE_ENV: "production" }),
      ).toEqual({ expectedWorkerBuildCommit: null, configured: false, enforced: true });
    }
  });

  it("reports whether the bridge enforces it", () => {
    expect(bridgeWorkerIdentity({ H3E91_EXPECTED_WORKER_BUILD_COMMIT: COMMIT }).enforced).toBe(
      false,
    );
  });

  it("uses the same variable and rule as the bridge", () => {
    const bridge = readFileSync(resolve("src/lib/pipeline/h3e91ExecutionBridge.server.ts"), "utf8");
    expect(bridge).toContain('process.env["H3E91_EXPECTED_WORKER_BUILD_COMMIT"]');
    expect(bridge).toContain("/^[0-9a-f]{40}$/.test(expectedBuild)");
    expect(bridge).toContain('process.env["NODE_ENV"] === "production"');
  });

  it("is served by the existing runtime fingerprint route, with nothing secret", () => {
    const route = readFileSync(
      resolve("src/routes/api/public/parser-attestation-runtime.ts"),
      "utf8",
    );
    expect(route).toContain("bridge: bridgeWorkerIdentity(process.env)");
    expect(route).not.toMatch(/SECRET|TOKEN|KEY/);
  });
});
