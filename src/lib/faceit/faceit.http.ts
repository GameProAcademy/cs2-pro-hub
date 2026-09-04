/**
 * FASE 2.2.1 — centralised FACEIT Data API HTTP client.
 *
 * All calls are server-side, HTTPS, authenticated with the API key in the
 * Authorization header. The key never leaves this module, raw responses never
 * reach the frontend, and 429/5xx/timeouts are retried with backoff while
 * 4xx failures are not retried at all.
 */
import { FaceitError, faceitErrorFromStatus, toFaceitError } from "./faceit.errors";

export interface FaceitClientOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  /** Injectable for tests. Defaults to the runtime fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests, so backoff never really sleeps. */
  sleep?: (ms: number) => Promise<void>;
  /** Structured, secret-free observability hook. */
  onLog?: (entry: FaceitRequestLog) => void;
  /**
   * Minimum spacing between two requests (FASE 2.2.1C). Simple, per-client
   * pacing: it prevents needless bursts without pretending to be a distributed
   * rate limiter. Retry-After and backoff remain untouched and always win.
   */
  minSpacingMs?: number;
  /**
   * FASE 2.2.1D — HARD CEILING of HTTP requests this client may ever send.
   * Every real attempt counts, INCLUDING retries after 429/5xx/timeout/network
   * error. When the ceiling is reached the request is not sent at all and a
   * controlled `FACEIT_API_BUDGET_EXHAUSTED` is raised.
   */
  callBudget?: number;
  /**
   * FASE 2.2.1D — epoch ms after which no new request may START, and beyond
   * which an in-flight request is aborted. Combined with `timeoutMs`: the
   * effective abort is whichever comes first, so the normal request timeout is
   * never silently replaced by a shorter arbitrary one.
   */
  deadlineAt?: number | (() => number | undefined);
}

export interface FaceitRequestLog {
  endpoint: string;
  status: number | null;
  errorCode: string | null;
  durationMs: number;
  attempt: number;
}

export interface FaceitClient {
  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<unknown>;
  /** REAL number of HTTP requests performed, retries included. */
  readonly requestCount: number;
  /** Requests still allowed by the budget (`Infinity` when unbounded). */
  readonly remainingCalls: number;
}

/** Hard ceiling for any single wait, so a hostile Retry-After cannot stall us. */
export const FACEIT_MAX_BACKOFF_MS = 30_000;

/**
 * Exponential backoff with full jitter. `Retry-After` always wins (capped), and
 * jitter avoids synchronised retry storms across concurrent jobs.
 */
export function faceitBackoffMs(
  attempt: number,
  retryAfterSeconds?: number,
  random: () => number = Math.random,
): number {
  if (retryAfterSeconds !== undefined && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, FACEIT_MAX_BACKOFF_MS);
  }
  const ceiling = Math.min(500 * 2 ** (attempt - 1), 8000);
  // Full jitter, but never below 100ms so we do not hot-loop.
  return Math.max(100, Math.round(ceiling * (0.5 + random() * 0.5)));
}

/** `Retry-After` is either delta-seconds or an HTTP date; both are supported. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  }
  const date = Date.parse(trimmed);
  if (!Number.isFinite(date)) return undefined;
  const seconds = Math.ceil((date - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
}

export function createFaceitClient(options: FaceitClientOptions): FaceitClient {
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const base = options.baseUrl.replace(/\/+$/, "");
  const minSpacingMs = Math.max(0, options.minSpacingMs ?? 0);
  const callBudget =
    typeof options.callBudget === "number" && Number.isFinite(options.callBudget)
      ? Math.max(0, Math.floor(options.callBudget))
      : Number.POSITIVE_INFINITY;
  let requestCount = 0;
  let lastRequestAt = 0;

  function deadlineAt(): number | undefined {
    const raw =
      typeof options.deadlineAt === "function" ? options.deadlineAt() : options.deadlineAt;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
  }

  /**
   * Single gate every real attempt must pass. It is checked before the initial
   * request AND before each retry, so no code path can exceed the ceiling.
   */
  function assertCanSend(): void {
    if (requestCount >= callBudget) throw new FaceitError("FACEIT_API_BUDGET_EXHAUSTED");
    const deadline = deadlineAt();
    if (deadline !== undefined && Date.now() >= deadline) {
      throw new FaceitError("FACEIT_WORKER_DEADLINE_EXCEEDED");
    }
  }

  /**
   * FASE 2.2.1E — deadline-aware wait. A wait that would end after the deadline
   * is pointless: the request it precedes could never legally start, so we fail
   * immediately with the deadline code instead of sleeping first.
   */
  async function waitFor(ms: number): Promise<void> {
    if (ms <= 0) return;
    const deadline = deadlineAt();
    if (deadline !== undefined && Date.now() + ms >= deadline) {
      throw new FaceitError("FACEIT_WORKER_DEADLINE_EXCEEDED");
    }
    await sleep(ms);
  }

  async function pace(): Promise<void> {
    if (minSpacingMs === 0) return;
    const waitMs = lastRequestAt + minSpacingMs - Date.now();
    await waitFor(waitMs);
    lastRequestAt = Date.now();
  }

  async function attemptOnce(url: string, endpoint: string, attempt: number): Promise<unknown> {
    // FINAL defence: the deadline/budget may have expired while pacing. A
    // request is NEVER sent just because it was authorised a moment ago.
    assertCanSend();
    const controller = new AbortController();
    // Abort at whichever comes first: the request timeout or the worker deadline.
    const deadline = deadlineAt();
    const untilDeadline = deadline === undefined ? Number.POSITIVE_INFINITY : deadline - Date.now();
    const abortInMs = Math.max(1, Math.min(options.timeoutMs, untilDeadline));
    const timer = setTimeout(() => controller.abort(), abortInMs);
    const startedAt = Date.now();
    requestCount += 1;
    lastRequestAt = startedAt;
    try {
      const response = await doFetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = faceitErrorFromStatus(
          response.status,
          parseRetryAfter(response.headers.get("retry-after")),
        );
        options.onLog?.({
          endpoint,
          status: response.status,
          errorCode: error.code,
          durationMs: Date.now() - startedAt,
          attempt,
        });
        throw error;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new FaceitError("FACEIT_MALFORMED_RESPONSE", { status: response.status });
      }

      options.onLog?.({
        endpoint,
        status: response.status,
        errorCode: null,
        durationMs: Date.now() - startedAt,
        attempt,
      });
      return payload;
    } catch (error) {
      let faceitError = toFaceitError(error);
      // An in-flight request aborted BECAUSE the worker deadline expired is a
      // controlled stop, not a retryable timeout.
      const now = Date.now();
      const currentDeadline = deadlineAt();
      if (
        faceitError.code === "FACEIT_TIMEOUT" &&
        currentDeadline !== undefined &&
        now >= currentDeadline
      ) {
        faceitError = new FaceitError("FACEIT_WORKER_DEADLINE_EXCEEDED");
      }
      if (!(error instanceof FaceitError)) {
        options.onLog?.({
          endpoint,
          status: null,
          errorCode: faceitError.code,
          durationMs: now - startedAt,
          attempt,
        });
      }
      throw faceitError;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get requestCount() {
      return requestCount;
    },
    get remainingCalls() {
      return callBudget === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : Math.max(0, callBudget - requestCount);
    },
    async get(path, query) {
      const url = new URL(base + (path.startsWith("/") ? path : `/${path}`));
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
      // The logical endpoint never contains identifiers of a third party beyond
      // the path itself, and never a secret.
      const endpoint = path;
      const maxAttempts = Math.max(1, options.maxRetries);

      let lastError: FaceitError = new FaceitError("FACEIT_INTERNAL_ERROR");
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          // Budget/deadline gate FIRST: a request that cannot be afforded is
          // never sent, not even as a retry after Retry-After.
          assertCanSend();
          await pace();
          return await attemptOnce(url.toString(), endpoint, attempt);
        } catch (error) {
          lastError = toFaceitError(error);
          if (!lastError.retryable || attempt === maxAttempts) throw lastError;
          // Waiting is pointless if the retry itself could never be sent, and a
          // Retry-After that ends past the deadline must not be waited out.
          assertCanSend();
          await waitFor(faceitBackoffMs(attempt, lastError.retryAfterSeconds));
        }
      }
      throw lastError;
    },
  };
}
