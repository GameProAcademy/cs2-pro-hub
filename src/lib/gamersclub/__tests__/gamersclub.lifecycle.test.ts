import { describe, expect, it } from "vitest";

import { decideCache, freshness } from "../gamersclub.cache";
import {
  canPersistForConnection,
  classifyRunOutcome,
  controlCodeToCounters,
  emptyRunCounters,
  isJobStale,
  nextJobStatus,
  retryDelayMs,
  shouldRethrow,
} from "../gamersclub.jobs";
import { GamersClubError } from "../gamersclub.errors";
import { paginateGamersClub } from "../gamersclub.pagination";

describe("job outcome semantics", () => {
  it("only reports success when everything expected was collected", () => {
    const counters = { ...emptyRunCounters(), itemsExpected: 3, itemsCollected: 3 };
    expect(classifyRunOutcome(counters)).toBe("success");
    expect(nextJobStatus("success", 1)).toBe("completed");
  });

  it("never calls a partial collection success", () => {
    expect(classifyRunOutcome({ ...emptyRunCounters(), itemsExpected: 5, itemsCollected: 2 })).toBe("partial");
    expect(classifyRunOutcome({ ...emptyRunCounters(), itemsCollected: 2, budgetExhausted: true })).toBe("partial");
    expect(classifyRunOutcome({ ...emptyRunCounters(), itemsCollected: 2, itemsDeferred: 1 })).toBe("partial");
    // Technically finished, semantically partial.
    expect(nextJobStatus("partial", 1)).toBe("completed");
  });

  it("distinguishes blocked, rate limited, timeout, cancelled and failed", () => {
    expect(classifyRunOutcome({ ...emptyRunCounters(), blocked: true })).toBe("blocked_external_access");
    expect(classifyRunOutcome({ ...emptyRunCounters(), rateLimited: true })).toBe("rate_limited");
    expect(classifyRunOutcome({ ...emptyRunCounters(), deadlineExceeded: true })).toBe("timeout");
    expect(classifyRunOutcome({ ...emptyRunCounters(), deadlineExceeded: true, itemsCollected: 1 })).toBe("partial");
    expect(classifyRunOutcome({ ...emptyRunCounters(), cancelled: true })).toBe("cancelled");
    expect(classifyRunOutcome({ ...emptyRunCounters(), failed: true })).toBe("failed");
  });

  it("does not retry a permanent external block, but retries transient failures", () => {
    expect(nextJobStatus("blocked_external_access", 1)).toBe("failed");
    expect(nextJobStatus("rate_limited", 1)).toBe("retrying");
    expect(nextJobStatus("rate_limited", 3, 3)).toBe("failed");
  });

  it("recovers only genuinely stale jobs", () => {
    const now = Date.parse("2026-09-04T12:00:00Z");
    expect(isJobStale(new Date(now - 10_000).toISOString(), now)).toBe(false);
    expect(isJobStale(new Date(now - 600_000).toISOString(), now)).toBe(true);
    expect(isJobStale(null, now)).toBe(true);
  });

  it("never waits past the deadline and honours Retry-After within the ceiling", () => {
    const now = 1_000_000;
    expect(retryDelayMs(2, { random: () => 0, now, deadlineAt: now + 100 })).toBe(100);
    expect(retryDelayMs(1, { random: () => 0, retryAfterMs: 3_000, now })).toBe(3_000);
    expect(retryDelayMs(9, { random: () => 1, now })).toBeLessThanOrEqual(5_000);
  });

  it("rethrows control errors instead of swallowing them", () => {
    expect(shouldRethrow(new GamersClubError("GC_WORKER_DEADLINE_EXCEEDED"))).toBe(true);
    expect(shouldRethrow(new GamersClubError("GC_API_BUDGET_EXHAUSTED"))).toBe(true);
    expect(shouldRethrow(new GamersClubError("GC_INVALID_RESPONSE"))).toBe(false);
    expect(classifyRunOutcome(controlCodeToCounters("GC_API_BUDGET_EXHAUSTED", emptyRunCounters()))).toBe("partial");
  });
});

describe("disconnect safety", () => {
  const claimed = { connectionId: "c1", playerId: "p1", status: "connected" };

  it("refuses to persist when the connection vanished, changed owner or disconnected", () => {
    expect(canPersistForConnection(claimed, claimed)).toBe(true);
    expect(canPersistForConnection(claimed, null)).toBe(false);
    expect(canPersistForConnection(claimed, { ...claimed, playerId: "p2" })).toBe(false);
    expect(canPersistForConnection(claimed, { ...claimed, connectionId: "c2" })).toBe(false);
    expect(canPersistForConnection(claimed, { ...claimed, status: "disconnected" })).toBe(false);
  });
});

describe("bounded pagination", () => {
  const page = (ids: string[], exhausted = false) => ({ items: ids.map((id) => ({ id })), exhausted });

  it("respects the literal request budget", async () => {
    let calls = 0;
    const outcome = await paginateGamersClub(
      () => {
        calls += 1;
        return Promise.resolve(page(["a", "b"]));
      },
      (item) => item.id,
      { requestBudget: 2, pageSize: 2, maxItems: 100 },
    );
    expect(calls).toBe(2);
    expect(outcome.report.stopReason).toBe("budget");
    expect(outcome.report.truncated).toBe(true);
  });

  it("stops at the deadline without starting another page", async () => {
    let calls = 0;
    let clock = 0;
    const outcome = await paginateGamersClub(
      () => {
        calls += 1;
        clock += 100;
        return Promise.resolve(page([`p${calls}`]));
      },
      (item) => item.id,
      { deadlineAt: 150, now: () => clock, pageSize: 1 },
    );
    expect(calls).toBe(2);
    expect(outcome.report.stopReason).toBe("deadline");
  });

  it("dedupes and stops on repeated pages", async () => {
    const outcome = await paginateGamersClub(
      () => Promise.resolve(page(["a", "b"])),
      (item) => item.id,
      { pageSize: 2, maxPages: 10 },
    );
    expect(outcome.items).toHaveLength(2);
    expect(outcome.report.duplicates).toBeGreaterThan(0);
    expect(outcome.report.stopReason).toBe("duplicate_pages");
  });

  it("does not treat a short page as the end of the data", async () => {
    const pages = [page(["a"]), page(["b"]), page(["c"], true)];
    let index = 0;
    const outcome = await paginateGamersClub(
      () => Promise.resolve(pages[index++]!),
      (item) => item.id,
      { pageSize: 5 },
    );
    expect(outcome.items).toHaveLength(3);
    expect(outcome.report.stopReason).toBe("completed");
    expect(outcome.report.truncated).toBe(false);
  });

  it("caps by maxPages and maxItems", async () => {
    const capped = await paginateGamersClub(
      ({ offset }) => Promise.resolve(page([`x${offset}`, `y${offset}`])),
      (item) => item.id,
      { pageSize: 2, maxPages: 2 },
    );
    expect(capped.report.stopReason).toBe("max_pages");

    let n = 0;
    const limited = await paginateGamersClub(
      () => Promise.resolve(page([`i${n++}`, `i${n++}`])),
      (item) => item.id,
      { pageSize: 2, maxItems: 3, maxPages: 10 },
    );
    expect(limited.items).toHaveLength(3);
    expect(limited.report.stopReason).toBe("max_items");
  });
});

describe("cache freshness", () => {
  const now = Date.parse("2026-09-04T12:00:00Z");

  it("classifies fresh, stale, expired and unknown", () => {
    expect(freshness("profile", new Date(now - 60_000).toISOString(), now)).toBe("fresh");
    expect(freshness("profile", new Date(now - 60 * 60_000).toISOString(), now)).toBe("stale");
    expect(freshness("profile", new Date(now - 10 * 60 * 60_000).toISOString(), now)).toBe("expired");
    expect(freshness("profile", null, now)).toBe("unknown");
  });

  it("uses different TTLs per data kind and reports hit/stale/miss/refresh", () => {
    const observedAt = new Date(now - 20 * 60_000).toISOString();
    expect(decideCache("profile", observedAt, { now }).outcome).toBe("cache_hit");
    expect(decideCache("match_history", observedAt, { now }).outcome).toBe("cache_stale");
    expect(decideCache("match_history", null, { now }).outcome).toBe("cache_miss");
    expect(decideCache("profile", observedAt, { now, force: true }).outcome).toBe("cache_refresh");
    expect(decideCache("profile", observedAt, { now }).refresh).toBe(false);
  });
});
