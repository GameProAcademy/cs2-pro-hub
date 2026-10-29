/**
 * AI Coach providers (server only): OpenRouter primary, official OpenAI API fallback.
 *
 * Configuration (backend secrets/env, never in code or the client bundle):
 *   OPENROUTER_API_KEY           primary key (OpenRouter)
 *   OPENAI_API_KEY               fallback key (api.openai.com)
 *   AI_PRIMARY_PROVIDER          default "openrouter"
 *   AI_PRIMARY_MODEL             default "openai/gpt-oss-20b"
 *   AI_FALLBACK_PROVIDER         "openai" enables the fallback; unset or "none" = no fallback
 *                                (owner decision 2026-10-29: no OpenAI balance, OpenRouter only)
 *   AI_FALLBACK_MODEL            default "gpt-5.6-luna"
 *   AI_TIMEOUT_MS                default 45000 per attempt
 *
 * Only "openrouter" and "openai" are accepted providers, and any model id naming
 * Gemini is refused: Gemini is not used, not even as a silent fallback.
 *
 * Policy: one attempt per provider (no retry loops, so no duplicated cost). When the
 * primary fails for any reason, the cause is logged and the fallback is tried once with
 * the same request and the same validation. Both failing returns a stable error code.
 * A reply cut by the token limit, empty, or not valid JSON is a failure, never a reply.
 * Logs carry provider, model, status, code, latency and token/cost metadata only —
 * never message content, prompts or keys.
 */
export type CoachProviderName = "openrouter" | "openai";

export type CoachProviderError =
  | "COACH_PROVIDER_NOT_CONFIGURED"
  | "COACH_PROVIDER_AUTH_FAILED"
  | "COACH_PROVIDER_RATE_LIMITED"
  | "COACH_PROVIDER_NO_CREDITS"
  | "COACH_PROVIDER_UNAVAILABLE"
  | "COACH_PROVIDER_BAD_REQUEST"
  | "COACH_PROVIDER_INVALID_RESPONSE"
  | "COACH_PROVIDER_FAILED"
  | "COACH_PROVIDER_EMPTY"
  | "COACH_PROVIDER_TRUNCATED";

export class CoachProviderFailure extends Error {
  constructor(
    readonly code: CoachProviderError,
    readonly status: number | null = null,
    readonly attempts: CoachAttempt[] = [],
    /** Transport-level cause (error class name only, e.g. "AbortError", "TypeError"). */
    readonly transport: string | null = null,
  ) {
    super(code);
  }
}

export interface CoachProviderConfig {
  provider: CoachProviderName;
  model: string;
}

export interface CoachUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  /** Provider-reported cost in USD (OpenRouter `usage.cost`); null when not reported. */
  costUsd: number | null;
}

export interface CoachAttempt {
  provider: CoachProviderName;
  model: string;
  ok: boolean;
  code: CoachProviderError | null;
  status: number | null;
  latencyMs: number;
  /** Error class name when the request never got an HTTP response (timeout / network). */
  transport: string | null;
}

export interface CoachCompletion {
  content: string;
  provider: CoachProviderName;
  /** Model id the provider reports it used (falls back to the configured id). */
  model: string;
  usage: CoachUsage;
  /** Why the fallback answered; null when the primary did. */
  fallbackReason: CoachProviderError | null;
  attempts: CoachAttempt[];
}

const ENDPOINT: Record<CoachProviderName, string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
};
const KEY_ENV: Record<CoachProviderName, string> = {
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
};
export const COACH_DEFAULT_PRIMARY: CoachProviderConfig = {
  provider: "openrouter",
  model: "openai/gpt-oss-20b",
};
export const COACH_DEFAULT_FALLBACK: CoachProviderConfig = {
  provider: "openai",
  model: "gpt-5.6-luna",
};
const DEFAULT_TIMEOUT_MS = 45_000;

type Env = Record<string, string | undefined>;

function providerName(value: string | undefined, fallback: CoachProviderName): CoachProviderName {
  const v = value?.trim().toLowerCase();
  if (!v) return fallback;
  if (v === "openrouter" || v === "openai") return v;
  throw new CoachProviderFailure("COACH_PROVIDER_NOT_CONFIGURED");
}

function modelId(value: string | undefined, fallback: string): string {
  const v = value?.trim() || fallback;
  if (/gemini/i.test(v)) throw new CoachProviderFailure("COACH_PROVIDER_NOT_CONFIGURED");
  return v;
}

/** The active chain from env; throws NOT_CONFIGURED for an unsupported provider or a Gemini model. */
export function resolveCoachChain(env: Env): CoachProviderConfig[] {
  const primary: CoachProviderConfig = {
    provider: providerName(env["AI_PRIMARY_PROVIDER"], COACH_DEFAULT_PRIMARY.provider),
    model: modelId(env["AI_PRIMARY_MODEL"], COACH_DEFAULT_PRIMARY.model),
  };
  // The fallback is opt-in: an account without balance must not be called on every failure.
  // A Gemini model id is refused even while the fallback is off: no dormant route to it.
  modelId(env["AI_FALLBACK_MODEL"], COACH_DEFAULT_FALLBACK.model);
  const fallbackName = env["AI_FALLBACK_PROVIDER"]?.trim().toLowerCase();
  if (!fallbackName || fallbackName === "none") return [primary];
  const fallback: CoachProviderConfig = {
    provider: providerName(fallbackName, COACH_DEFAULT_FALLBACK.provider),
    model: modelId(env["AI_FALLBACK_MODEL"], COACH_DEFAULT_FALLBACK.model),
  };
  return [primary, fallback];
}

function requestBody(cfg: CoachProviderConfig, messages: CoachMessage[], maxTokens: number) {
  if (cfg.provider === "openrouter") {
    return {
      model: cfg.model,
      messages,
      max_tokens: maxTokens,
      // Low reasoning effort, reasoning text not returned (it shares the token budget).
      reasoning: { effort: "low", exclude: true },
    };
  }
  return {
    model: cfg.model,
    messages,
    max_completion_tokens: maxTokens,
    reasoning_effort: "low",
  };
}

function statusCode(status: number): CoachProviderError {
  if (status === 401 || status === 403) return "COACH_PROVIDER_AUTH_FAILED";
  if (status === 402) return "COACH_PROVIDER_NO_CREDITS";
  if (status === 429) return "COACH_PROVIDER_RATE_LIMITED";
  if (status === 408 || status >= 500) return "COACH_PROVIDER_UNAVAILABLE";
  if (status === 400 || status === 404 || status === 422) return "COACH_PROVIDER_BAD_REQUEST";
  return "COACH_PROVIDER_FAILED";
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Diagnosable, secret-free description of a request that never got an HTTP response:
 * error class, the runtime's error code (e.g. ENOTFOUND, ECONNREFUSED,
 * UND_ERR_CONNECT_TIMEOUT) when present, whether our own timeout aborted it, and the
 * first 80 characters of the message with every long token-like run, URL query and
 * "Bearer …" removed. Keys never reach this text (they are only in a header value).
 */
export function transportDetail(error: unknown, timedOut: boolean): string {
  if (timedOut) return "TIMEOUT";
  if (!(error instanceof Error)) return typeof error;
  const own = (error as unknown as { code?: unknown }).code;
  const cause = (error as unknown as { cause?: { code?: unknown } }).cause;
  const code = typeof own === "string" ? own : typeof cause?.code === "string" ? cause.code : null;
  const message = error.message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\?\S*/g, "")
    .replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .slice(0, 80);
  return [error.name, code, message].filter(Boolean).join(": ");
}

export interface CoachMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AttemptResult {
  content: string;
  model: string;
  usage: CoachUsage;
}

async function attempt(
  cfg: CoachProviderConfig,
  messages: CoachMessage[],
  options: { maxTokens: number; env: Env; fetchImpl: typeof fetch; timeoutMs: number },
): Promise<AttemptResult> {
  // Production 2026-10-29: the OpenRouter call failed before any HTTP response with a
  // TypeError (fetch rejects a header value with a line break or other non-printable
  // character, e.g. a key pasted with a trailing newline). Surrounding whitespace is
  // trimmed; anything still outside printable ASCII is a configuration error, reported
  // as such (never as a network failure) and never sent.
  const key = options.env[KEY_ENV[cfg.provider]]?.trim();
  if (!key) throw new CoachProviderFailure("COACH_PROVIDER_NOT_CONFIGURED");
  if (!/^[\x21-\x7e]+$/.test(key)) {
    throw new CoachProviderFailure("COACH_PROVIDER_NOT_CONFIGURED", null, [], "INVALID_KEY_FORMAT");
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (cfg.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://gamepro.network";
    headers["X-Title"] = "CS2 PRO AI Coach";
  }
  // Build the headers before the network call so a header rejected by the runtime is told
  // apart from a network failure (both surface as a TypeError from fetch). The runtime's
  // message can echo the header value, so only the classification is kept.
  try {
    new Headers(headers);
  } catch {
    throw new CoachProviderFailure("COACH_PROVIDER_NOT_CONFIGURED", null, [], "INVALID_HEADER");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  let response: Response;
  try {
    const send = options.fetchImpl; // called unbound, never as a method of `options`
    response = await send(ENDPOINT[cfg.provider], {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody(cfg, messages, options.maxTokens)),
      signal: controller.signal,
    });
  } catch (error) {
    // Timeout or transport. Headers were validated above, so this is the network layer.
    throw new CoachProviderFailure(
      "COACH_PROVIDER_UNAVAILABLE",
      null,
      [],
      transportDetail(error, controller.signal.aborted),
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new CoachProviderFailure(statusCode(response.status), response.status);
  let body: {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
    model?: unknown;
    error?: unknown;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      cost?: unknown;
      completion_tokens_details?: { reasoning_tokens?: unknown };
    };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new CoachProviderFailure("COACH_PROVIDER_INVALID_RESPONSE", response.status);
  }
  // OpenRouter can return HTTP 200 with an error object (e.g. mid-generation failure).
  if (!body || typeof body !== "object" || body.error) {
    throw new CoachProviderFailure("COACH_PROVIDER_INVALID_RESPONSE", response.status);
  }
  const choice = Array.isArray(body.choices) ? body.choices[0] : undefined;
  if (!choice) throw new CoachProviderFailure("COACH_PROVIDER_INVALID_RESPONSE", response.status);
  // A reply cut by the token limit is never shown or stored as if it were complete.
  if (choice.finish_reason === "length") {
    throw new CoachProviderFailure("COACH_PROVIDER_TRUNCATED", response.status);
  }
  if (choice.finish_reason === "error" || choice.finish_reason === "content_filter") {
    throw new CoachProviderFailure("COACH_PROVIDER_FAILED", response.status);
  }
  const content = choice.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new CoachProviderFailure("COACH_PROVIDER_EMPTY", response.status);
  }
  return {
    content: content.trim(),
    model: typeof body.model === "string" && body.model ? body.model : cfg.model,
    usage: {
      promptTokens: finite(body.usage?.prompt_tokens),
      completionTokens: finite(body.usage?.completion_tokens),
      reasoningTokens: finite(body.usage?.completion_tokens_details?.reasoning_tokens),
      costUsd: cfg.provider === "openrouter" ? finite(body.usage?.cost) : null,
    },
  };
}

function logAttempt(a: CoachAttempt, usage: CoachUsage | null) {
  // Operational metadata only: no content, prompt, user id or key.
  console.info("[ai-coach] provider attempt", {
    provider: a.provider,
    model: a.model,
    ok: a.ok,
    code: a.code,
    status: a.status,
    latencyMs: a.latencyMs,
    transport: a.transport,
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    reasoningTokens: usage?.reasoningTokens ?? null,
    costUsd: usage?.costUsd ?? null,
  });
}

export async function completeCoach(
  messages: CoachMessage[],
  options: {
    maxTokens: number;
    env?: Env;
    fetchImpl?: typeof fetch;
    now?: () => number;
  },
): Promise<CoachCompletion> {
  const env = options.env ?? (process.env as Env);
  // Never pass the global `fetch` around as a bare reference: called as a method of another
  // object (`options.fetchImpl(...)`) it gets the wrong `this`, and the Cloudflare Workers
  // runtime rejects that with "TypeError: Illegal invocation" before any request is sent
  // (production 2026-10-29). The wrapper always calls it unbound, as `fetch(...)`.
  const fetchImpl: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const timeoutMs =
    Number(env["AI_TIMEOUT_MS"]) > 0 ? Number(env["AI_TIMEOUT_MS"]) : DEFAULT_TIMEOUT_MS;
  const chain = resolveCoachChain(env);
  const attempts: CoachAttempt[] = [];
  // The reported code is the PRIMARY's: a fallback that cannot help (no balance, not
  // configured) must never be presented as the primary's failure. Every attempt stays in
  // `attempts` for diagnosis.
  let primaryFailure: CoachProviderFailure | null = null;

  for (const cfg of chain) {
    const started = now();
    try {
      const result = await attempt(cfg, messages, {
        maxTokens: options.maxTokens,
        env,
        fetchImpl,
        timeoutMs,
      });
      const record: CoachAttempt = {
        provider: cfg.provider,
        model: cfg.model,
        ok: true,
        code: null,
        status: 200,
        latencyMs: now() - started,
        transport: null,
      };
      attempts.push(record);
      logAttempt(record, result.usage);
      return {
        content: result.content,
        provider: cfg.provider,
        model: result.model,
        usage: result.usage,
        fallbackReason: attempts.length > 1 ? attempts[0]!.code : null,
        attempts,
      };
    } catch (error) {
      const failure =
        error instanceof CoachProviderFailure
          ? error
          : new CoachProviderFailure("COACH_PROVIDER_FAILED");
      const record: CoachAttempt = {
        provider: cfg.provider,
        model: cfg.model,
        ok: false,
        code: failure.code,
        status: failure.status,
        latencyMs: now() - started,
        transport: failure.transport,
      };
      attempts.push(record);
      logAttempt(record, null);
      primaryFailure ??= failure;
    }
  }
  throw new CoachProviderFailure(
    primaryFailure?.code ?? "COACH_PROVIDER_FAILED",
    primaryFailure?.status ?? null,
    attempts,
  );
}
