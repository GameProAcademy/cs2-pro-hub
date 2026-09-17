export type E2EWaitStatus = "pending" | "processing" | "processed" | "failed";

export interface E2EWaitState {
  status: E2EWaitStatus;
  retryCount: number;
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
}

export interface E2EWaitOptions<T extends E2EWaitState> {
  read: () => Promise<T | null>;
  expectedRetryCount: number;
  timeoutMs: number;
  pollIntervalMs: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface E2EWaitResult<T extends E2EWaitState> {
  state: T | null;
  terminal: boolean;
  observedExecution: boolean;
  polls: number;
  reason: string | null;
}

const terminal = (status: E2EWaitStatus) => status === "processed" || status === "failed";

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function timeoutReason(state: E2EWaitState | null, nowMs: number): string {
  if (!state) return "E2E_JOB_DISAPPEARED";
  if (state.status === "pending") return "E2E_WAIT_TIMEOUT_PENDING";
  if (state.status === "processing") {
    const leaseMs = state.leaseExpiresAt ? Date.parse(state.leaseExpiresAt) : Number.NaN;
    const heartbeatMs = state.heartbeatAt ? Date.parse(state.heartbeatAt) : Number.NaN;
    if ((Number.isFinite(leaseMs) && leaseMs <= nowMs) || !Number.isFinite(heartbeatMs)) {
      return "E2E_WORKER_STALLED";
    }
    return "E2E_WAIT_TIMEOUT_PROCESSING";
  }
  return "E2E_WAIT_TIMEOUT";
}

/** Waits for one specifically requeued durable dispatch; it never executes the job itself. */
export async function waitForTerminalExecution<T extends E2EWaitState>(
  options: E2EWaitOptions<T>,
): Promise<E2EWaitResult<T>> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = now();
  let polls = 0;
  let latest: T | null = null;
  let observedExecution = false;

  while (now() - startedAt <= options.timeoutMs) {
    latest = await options.read();
    polls += 1;
    if (!latest) {
      return {
        state: null,
        terminal: false,
        observedExecution,
        polls,
        reason: "E2E_JOB_DISAPPEARED",
      };
    }

    if (latest.retryCount >= options.expectedRetryCount) observedExecution = true;
    if (observedExecution && terminal(latest.status)) {
      return { state: latest, terminal: true, observedExecution: true, polls, reason: null };
    }

    const remaining = options.timeoutMs - (now() - startedAt);
    if (remaining <= 0) break;
    await sleep(Math.min(options.pollIntervalMs, remaining));
  }

  return {
    state: latest,
    terminal: false,
    observedExecution,
    polls,
    reason: timeoutReason(latest, now()),
  };
}
