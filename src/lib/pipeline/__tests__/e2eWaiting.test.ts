import { describe, expect, it } from "vitest";

import { waitForTerminalExecution, type E2EWaitState } from "@/lib/pipeline/e2eWaiting";

const state = (
  status: E2EWaitState["status"],
  retryCount: number,
  overrides: Partial<E2EWaitState> = {},
): E2EWaitState => ({
  status,
  attemptNumber: 7,
  retryCount,
  heartbeatAt: null,
  leaseExpiresAt: null,
  ...overrides,
});

function clock() {
  let value = 0;
  return {
    now: () => value,
    sleep: async (milliseconds: number) => {
      value += milliseconds;
    },
  };
}

describe("waitForTerminalExecution", () => {
  it("waits for the requested durable dispatch to reach processed", async () => {
    const states = [state("pending", 4), state("processing", 4), state("processed", 4)];
    const time = clock();
    const result = await waitForTerminalExecution({
      read: async () => states.shift() ?? state("processed", 4),
      expectedRetryCount: 4,
      expectedAttemptNumber: 7,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      ...time,
    });
    expect(result).toMatchObject({
      terminal: true,
      observedExecution: true,
      polls: 3,
      reason: null,
    });
    expect(result.state?.status).toBe("processed");
  });

  it("accepts a terminal failed state only after the requested dispatch was observed", async () => {
    const states = [state("failed", 3), state("pending", 4), state("failed", 4)];
    const time = clock();
    const result = await waitForTerminalExecution({
      read: async () => states.shift() ?? state("failed", 4),
      expectedRetryCount: 4,
      expectedAttemptNumber: 7,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      ...time,
    });
    expect(result).toMatchObject({ terminal: true, observedExecution: true, polls: 3 });
    expect(result.state?.status).toBe("failed");
  });

  it("blocks a job that remains pending until the finite timeout", async () => {
    const time = clock();
    const result = await waitForTerminalExecution({
      read: async () => state("pending", 4),
      expectedRetryCount: 4,
      expectedAttemptNumber: 7,
      timeoutMs: 250,
      pollIntervalMs: 100,
      ...time,
    });
    expect(result).toMatchObject({
      terminal: false,
      observedExecution: true,
      reason: "E2E_WAIT_TIMEOUT_PENDING",
    });
  });

  it("reports an expired processing lease as a stalled worker", async () => {
    const time = clock();
    const result = await waitForTerminalExecution({
      read: async () =>
        state("processing", 4, {
          heartbeatAt: "1970-01-01T00:00:00.050Z",
          leaseExpiresAt: "1970-01-01T00:00:00.100Z",
        }),
      expectedRetryCount: 4,
      expectedAttemptNumber: 7,
      timeoutMs: 250,
      pollIntervalMs: 100,
      ...time,
    });
    expect(result.reason).toBe("E2E_WORKER_STALLED");
  });

  it("does not confuse an old terminal state with the new dispatch", async () => {
    const time = clock();
    const result = await waitForTerminalExecution({
      read: async () => state("processed", 3),
      expectedRetryCount: 4,
      expectedAttemptNumber: 7,
      timeoutMs: 200,
      pollIntervalMs: 100,
      ...time,
    });
    expect(result).toMatchObject({
      terminal: false,
      observedExecution: false,
      reason: "E2E_WAIT_TIMEOUT",
    });
  });

  it("does not accept a dispatch from another logical attempt", async () => {
    const time = clock();
    const result = await waitForTerminalExecution({
      read: async () => state("processed", 4, { attemptNumber: 8 }),
      expectedRetryCount: 4,
      expectedAttemptNumber: 7,
      timeoutMs: 200,
      pollIntervalMs: 100,
      ...time,
    });
    expect(result).toMatchObject({ terminal: false, observedExecution: false });
  });
});
