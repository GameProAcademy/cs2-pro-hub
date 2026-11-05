/**
 * Fase 3.3 — OpenRouter resilience, security and cost: error classes, ONE bounded retry only
 * when no billed completion can exist, idempotent sends, a context size guard, correlation
 * ids in logs and no secret anywhere. The provider and model are never swapped.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { coachErrorKey } from "@/components/coach/coachErrors";
import {
  COACH_MAX_CONTEXT_CHARS,
  contextChars,
  fitHistory,
  validateCoachInput,
} from "@/lib/coach/coachContext";
import {
  CoachProviderFailure,
  MAX_RETRIES,
  backoffMs,
  completeCoach,
  isTransient,
  resolveCoachChain,
  retryAfterMs,
  statusCode,
} from "@/lib/coach/coachProvider.server";

const msgs = [{ role: "user" as const, content: "hi" }];
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
const ok = (content: string, extra: Record<string, unknown> = {}) =>
  json(200, { choices: [{ message: { content }, finish_reason: "stop" }], ...extra });
const PROD = { OPENROUTER_API_KEY: "sk-or-v1-secretsecretsecretsecret" }; // production shape
const sleeps: number[] = [];
const run = (fetchImpl: unknown, env: Record<string, string | undefined> = PROD) =>
  completeCoach(msgs, {
    maxTokens: 10,
    env,
    fetchImpl: fetchImpl as typeof fetch,
    now: () => 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    correlationId: "11111111-1111-4111-8111-111111111111",
  });
const fail = (fetchImpl: unknown, env?: Record<string, string | undefined>) =>
  run(fetchImpl, env).then(
    () => {
      throw new Error("expected a failure");
    },
    (e: CoachProviderFailure) => e,
  );
const netError = (code: string) => {
  const e = new TypeError("fetch failed");
  (e as unknown as { cause: unknown }).cause = { code };
  return e;
};

afterEach(() => {
  sleeps.length = 0;
  vi.restoreAllMocks();
});

describe("provider and model are fixed (production: OpenRouter only, no fallback)", () => {
  it("the default chain is exactly OpenRouter openai/gpt-oss-20b", () => {
    expect(resolveCoachChain(PROD)).toEqual([
      { provider: "openrouter", model: "openai/gpt-oss-20b" },
    ]);
  });
});

describe("the 20 provider scenarios", () => {
  it("1. success on the first try: one call, no sleep", async () => {
    const f = vi.fn(async () => ok("answer"));
    const out = await run(f);
    expect(out.content).toBe("answer");
    expect(f).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("2. our own timeout is TIMEOUT and is NEVER retried (the provider may have billed)", async () => {
    const f = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_r, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    const failure = await fail(f, { ...PROD, AI_TIMEOUT_MS: "5" });
    expect(failure.code).toBe("COACH_PROVIDER_TIMEOUT");
    expect(failure.attempts[0]!.transport).toBe("TIMEOUT");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([["ECONNREFUSED"], ["ECONNRESET"], ["EAI_AGAIN"], ["UND_ERR_CONNECT_TIMEOUT"]])(
    "3. a connection never established (%s) is retried once, then succeeds",
    async (code) => {
      const f = vi
        .fn()
        .mockRejectedValueOnce(netError(code))
        .mockResolvedValueOnce(ok("after retry"));
      const out = await run(f);
      expect(out.content).toBe("after retry");
      expect(out.attempts.map((a) => a.retry)).toEqual([0, 1]);
      expect(f).toHaveBeenCalledTimes(2);
      expect(sleeps).toEqual([400 + 125]);
    },
  );

  it("4. an unknown network error (no connect code) is not retried", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const failure = await fail(f);
    expect(failure.code).toBe("COACH_PROVIDER_UNAVAILABLE");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("5. 429 is retried once honouring a short Retry-After", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(429, {}, { "Retry-After": "2" }))
      .mockResolvedValueOnce(ok("ok"));
    await run(f);
    expect(sleeps).toEqual([2000]);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("6. 429 with a long Retry-After is not retried (the player is told to wait)", async () => {
    const f = vi.fn(async () => json(429, {}, { "Retry-After": "60" }));
    const failure = await fail(f);
    expect(failure.code).toBe("COACH_PROVIDER_RATE_LIMITED");
    expect(f).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("7. 429 twice: exactly one retry, then RATE_LIMITED (no loop)", async () => {
    const f = vi.fn(async () => json(429, {}));
    const failure = await fail(f);
    expect(failure.code).toBe("COACH_PROVIDER_RATE_LIMITED");
    expect(f).toHaveBeenCalledTimes(1 + MAX_RETRIES);
  });

  it.each([[502], [503]])("8. HTTP %s is retried once with backoff", async (status) => {
    const f = vi.fn().mockResolvedValueOnce(json(status, {})).mockResolvedValueOnce(ok("ok"));
    await run(f);
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleeps).toHaveLength(1);
  });

  it.each([[500], [504]])("9. HTTP %s is not retried", async (status) => {
    const f = vi.fn(async () => json(status, {}));
    expect((await fail(f)).code).toBe("COACH_PROVIDER_UNAVAILABLE");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("10. 401 → AUTH_FAILED, not retried", async () => {
    const f = vi.fn(async () => json(401, {}));
    expect((await fail(f)).code).toBe("COACH_PROVIDER_AUTH_FAILED");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("11. 403 → FORBIDDEN (its own class), not retried", async () => {
    const f = vi.fn(async () => json(403, {}));
    expect((await fail(f)).code).toBe("COACH_PROVIDER_FORBIDDEN");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("12. 402 → NO_CREDITS, not retried", async () => {
    const f = vi.fn(async () => json(402, {}));
    expect((await fail(f)).code).toBe("COACH_PROVIDER_NO_CREDITS");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("13. 404 or 'no endpoints found' → MODEL_UNAVAILABLE; the model is never swapped", async () => {
    const f = vi.fn(async () =>
      json(400, { error: { message: "No endpoints found for openai/gpt-oss-20b." } }),
    );
    const failure = await fail(f);
    expect(failure.code).toBe("COACH_PROVIDER_MODEL_UNAVAILABLE");
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(statusCode(404)).toBe("COACH_PROVIDER_MODEL_UNAVAILABLE");
  });

  it("14. other 400 → BAD_REQUEST, not retried", async () => {
    const f = vi.fn(async () => json(400, { error: { message: "context too long" } }));
    expect((await fail(f)).code).toBe("COACH_PROVIDER_BAD_REQUEST");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("15. invalid JSON → INVALID_RESPONSE, not retried (a completion may have been billed)", async () => {
    const f = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect((await fail(f)).code).toBe("COACH_PROVIDER_INVALID_RESPONSE");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("16. 200 carrying an error object → INVALID_RESPONSE, not retried", async () => {
    const f = vi.fn(async () => json(200, { error: { code: 502, message: "upstream" } }));
    expect((await fail(f)).code).toBe("COACH_PROVIDER_INVALID_RESPONSE");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("17. empty content → EMPTY, not retried", async () => {
    const f = vi.fn(async () => ok("  "));
    expect((await fail(f)).code).toBe("COACH_PROVIDER_EMPTY");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("18. truncated reply → TRUNCATED, not retried", async () => {
    const f = vi.fn(async () =>
      json(200, { choices: [{ message: { content: "**Dados**" }, finish_reason: "length" }] }),
    );
    expect((await fail(f)).code).toBe("COACH_PROVIDER_TRUNCATED");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("19. missing key → NOT_CONFIGURED with no network call", async () => {
    const f = vi.fn(async () => ok("x"));
    expect((await fail(f, {})).code).toBe("COACH_PROVIDER_NOT_CONFIGURED");
    expect(f).not.toHaveBeenCalled();
  });

  it("20. usage and provider-reported cost are kept for provenance", async () => {
    const f = vi.fn(async () =>
      ok("x", {
        model: "openai/gpt-oss-20b",
        provider: "SomeUpstream",
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.00001 },
      }),
    );
    const out = await run(f);
    expect(out.usage).toMatchObject({ promptTokens: 100, completionTokens: 20 });
    expect(out.model).toBe("openai/gpt-oss-20b");
    expect(out.fallbackReason).toBeNull();
  });
});

describe("retry policy (pure)", () => {
  const F = (code: CoachProviderFailure["code"], status: number | null, transport: string | null) =>
    new CoachProviderFailure(code, status, [], transport);

  it("only failures that cannot have produced a billed completion are transient", () => {
    expect(isTransient(F("COACH_PROVIDER_RATE_LIMITED", 429, null))).toBe(true);
    expect(isTransient(F("COACH_PROVIDER_UNAVAILABLE", 502, null))).toBe(true);
    expect(isTransient(F("COACH_PROVIDER_UNAVAILABLE", 503, null))).toBe(true);
    expect(isTransient(F("COACH_PROVIDER_UNAVAILABLE", null, "TypeError: ECONNRESET: x"))).toBe(
      true,
    );
    expect(isTransient(F("COACH_PROVIDER_TIMEOUT", null, "TIMEOUT"))).toBe(false);
    expect(isTransient(F("COACH_PROVIDER_UNAVAILABLE", 500, null))).toBe(false);
    expect(isTransient(F("COACH_PROVIDER_UNAVAILABLE", null, "TypeError: fetch failed"))).toBe(
      false,
    );
    expect(isTransient(F("COACH_PROVIDER_TRUNCATED", 200, null))).toBe(false);
    expect(MAX_RETRIES).toBe(1);
  });

  it("backoff is exponential with bounded jitter; Retry-After is capped at 4 s", () => {
    expect(backoffMs(1, () => 0)).toBe(400);
    expect(backoffMs(1, () => 0.999)).toBe(649);
    expect(backoffMs(2, () => 0)).toBe(800);
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs("5")).toBe(Infinity);
    expect(retryAfterMs("soon")).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });
});

describe("logs carry a correlation id and never a secret or content", () => {
  it("every attempt log has the correlation id and the retry index only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const f = vi.fn().mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(ok("the answer"));
    await run(f);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain("11111111-1111-4111-8111-111111111111");
    expect(logged).not.toContain("sk-or-v1");
    expect(logged).not.toContain("the answer");
    expect(logged).not.toContain('"hi"');
    expect(info.mock.calls.map((c) => (c[1] as { retry: number }).retry)).toEqual([0, 1]);
  });
});

describe("idempotency of sends", () => {
  const src = readFileSync(resolve("src/lib/coach.functions.ts"), "utf8");
  const ui = readFileSync(resolve("src/components/coach/RealCoachChat.tsx"), "utf8");

  it("the request id is a validated UUID (anything else is ignored)", () => {
    const base = { message: "oi", locale: "pt-BR" };
    const id = "8f1c2d3e-0000-4000-8000-000000000001";
    expect(validateCoachInput({ ...base, requestId: id })).toMatchObject({ requestId: id });
    expect(validateCoachInput({ ...base, requestId: "x'; drop" })).toMatchObject({
      requestId: null,
    });
    expect(validateCoachInput(base)).toMatchObject({ requestId: null });
  });

  // Fase 3.5 (intentional): replay, storage under the request id and the reply's back
  // reference are now guaranteed by the reservation RPCs. The same properties are asserted
  // on the new mechanism here, behaviourally in coachIdempotency35.test.ts and against real
  // PostgreSQL in scripts/coach-reservation-harness.py.
  const sql = readFileSync(
    resolve("supabase/migrations/20261105100000_coach_request_reservations.sql"),
    "utf8",
  );
  const flow = readFileSync(resolve("src/lib/coach/coachSendFlow.ts"), "utf8");

  it("an answered request id is replayed BEFORE the rate limit and the provider", () => {
    const replay = flow.indexOf('case "REPLAY"');
    expect(replay).toBeGreaterThan(0);
    expect(replay).toBeLessThan(flow.indexOf("await d.withinRateLimit()"));
    expect(replay).toBeLessThan(flow.indexOf("d.generate("));
  });

  it("the question is stored under the request id and the reply points back to it", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.coach_messages \(id, conversation_id, role, content\)\s*VALUES \(p_request_id, v_conversation, 'player', p_question\)/,
    );
    expect(sql).toMatch(
      /INSERT INTO public\.coach_messages \(conversation_id, role, content, context_type, context_id\)\s*VALUES \(v_conversation, 'coach', p_reply, left\(p_context_type, 255\), p_request_id\)/,
    );
    // A concurrent duplicate never reaches the provider: the claim decides the single owner.
    expect(sql).toContain("ON CONFLICT (request_id) DO NOTHING");
    expect(sql).toContain("FOR UPDATE");
    expect(flow).toContain('error: "COACH_REQUEST_IN_PROGRESS"');
  });

  it("the chat reuses the request id when the same question is retried", () => {
    expect(ui).toMatch(/prior\.message === message && prior\.conversationId === conversationId/);
    expect(ui).toContain("data: { message, locale, conversationId, requestId }");
    expect(ui).toMatch(/if \(result\.ok\) \{\s*requestRef\.current = null;/);
  });

  it("a persistence failure has its own code (the provider answered)", () => {
    // Fase 3.5 (intentional): the code is produced by the flow, which also keeps the reply
    // (PERSIST_PENDING) so the retry persists it without a new generation.
    expect(flow).toContain('error: lost ? "COACH_REQUEST_IN_PROGRESS" : "COACH_PERSIST_FAILED"');
    expect(flow).toMatch(/: await persistPending\(d\.rpc,/);
  });
});

describe("context size guard", () => {
  it("drops the oldest turns first and never the fixed part", () => {
    const h = [
      { content: "a".repeat(10_000) },
      { content: "b".repeat(10_000) },
      { content: "c".repeat(10_000) },
    ];
    const r = fitHistory(h, 25_000);
    expect(r.dropped).toBe(1);
    expect(r.history.map((x) => x.content[0])).toEqual(["b", "c"]);
    expect(25_000 + contextChars(r.history)).toBeLessThanOrEqual(COACH_MAX_CONTEXT_CHARS);
    expect(fitHistory(h, 100).dropped).toBe(0);
    expect(fitHistory(h, COACH_MAX_CONTEXT_CHARS + 1).history).toEqual([]);
  });
});

describe("every failure class has a specific, localized message", () => {
  it("new codes map to coach2.error.* keys", () => {
    expect(coachErrorKey("COACH_PROVIDER_TIMEOUT")).toBe("coach2.error.timeout");
    expect(coachErrorKey("COACH_PROVIDER_FORBIDDEN")).toBe("coach2.error.providerConfig");
    expect(coachErrorKey("COACH_PROVIDER_AUTH_FAILED")).toBe("coach2.error.providerConfig");
    expect(coachErrorKey("COACH_PROVIDER_NO_CREDITS")).toBe("coach2.error.noCredits");
    expect(coachErrorKey("COACH_PROVIDER_MODEL_UNAVAILABLE")).toBe("coach2.error.modelUnavailable");
    expect(coachErrorKey("COACH_REQUEST_IN_PROGRESS")).toBe("coach2.error.inProgress");
    expect(coachErrorKey("COACH_PERSIST_FAILED")).toBe("coach2.error.persist");
    expect(coachErrorKey("COACH_PROVIDER_TRUNCATED")).toBe("coach2.error.invalidResponse");
    expect(coachErrorKey("COACH_PROVIDER_RATE_LIMITED")).toBe("real.aicoach.error.busy");
  });
});
