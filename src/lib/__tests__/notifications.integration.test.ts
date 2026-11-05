/**
 * Fase 4 — notifications SQL against a disposable PostgreSQL with independent sessions
 * (scripts/notifications-harness.py): dedup under concurrency, RLS, column grants, spoofing,
 * preferences, consent, volume cap, retention and analytics.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("notifications against disposable PostgreSQL", () => {
  it("dedup, ownership, preferences, consent, caps and retention hold", () => {
    const output = execFileSync("python3", ["scripts/notifications-harness.py"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 180_000,
      env: { PATH: process.env["PATH"], HOME: "/tmp" },
    });
    const result = JSON.parse(output.trim()) as {
      checks: Record<string, boolean>;
      failures: string[];
      teardown: boolean;
    };
    expect(result.failures).toEqual([]);
    expect(Object.keys(result.checks).length).toBeGreaterThanOrEqual(30);
    expect(result.teardown).toBe(true);
  }, 200_000);
});
