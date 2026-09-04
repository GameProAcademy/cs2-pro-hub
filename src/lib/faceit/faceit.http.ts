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
  /** Number of HTTP requests performed; used by the pagination tests. */
  readonly requestCount: number;
}

function backoffMs(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds, 30) * 1000;
  }
  return Math.min(500 * 2 ** (attempt - 1), 8000);
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

export function createFaceitClient(options: FaceitClientOptions): FaceitClient {
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const base = options.baseUrl.replace(/\/+$/, "");
  let requestCount = 0;

  async function attemptOnce(url: string, endpoint: string, attempt: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const startedAt = Date.now();
    requestCount += 1;
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
      const faceitError = toFaceitError(error);
      if (!(error instanceof FaceitError)) {
        options.onLog?.({
          endpoint,
          status: null,
          errorCode: faceitError.code,
          durationMs: Date.now() - startedAt,
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
          return await attemptOnce(url.toString(), endpoint, attempt);
        } catch (error) {
          lastError = toFaceitError(error);
          if (!lastError.retryable || attempt === maxAttempts) throw lastError;
          await sleep(backoffMs(attempt, lastError.retryAfterSeconds));
        }
      }
      throw lastError;
    },
  };
}
