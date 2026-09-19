import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("demo lifecycle against disposable PostgreSQL", () => {
  it(
    "proves two-session reserve/enqueue concurrency and persisted invariants",
    () => {
      const output = execFileSync("python3", ["scripts/pipeline-concurrency-harness.py"], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 120_000,
        env: { PATH: process.env.PATH, HOME: "/tmp", G5RF1_ITERATIONS: "25" },
      });
      const result = JSON.parse(output.trim()) as Record<string, unknown>;
      expect(result).toMatchObject({
        database: "disposable-local-postgresql",
        independentConnections: true,
        failures: 0,
        deadlocks: 0,
        timeouts: 0,
        teardown: true,
      });
      expect(result.iterations).toBe(25);
      expect(result.successes).toBe(25);
    },
    130_000,
  );
});