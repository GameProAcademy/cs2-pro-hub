/**
 * FASE 2.2.1E — FACEIT FINAL EDGE-CASE HARDENING.
 *
 * Proves, per code path: no request starts after the deadline, no retry exceeds
 * the budget, control errors never become success, an ongoing match is never
 * definitively complete, and cancelled/aborted never invent a result.
 */
import { describe, expect, it, vi } from "vitest";

import { createFaceitClient } from "../faceit.http";
import {
  faceitMatchConverged,
  isFaceitMatchFinished,
  isFaceitMatchTerminal,
  mapFaceitMatchToMatch,
} from "../faceit.mapper";
import { normalizeApiCallBudget } from "../faceit.sync.server";
import { FACEIT_JOB_API_CALL_BUDGET, FACEIT_MAX_MATCH_FETCH_ATTEMPTS } from "../faceit.constants";
import type { FaceitHistoryItem, FaceitMatch } from "../faceit.types";

const BASE = "https://open.faceit.com/data/v4";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function client(options: {
  fetchImpl: typeof fetch;
  callBudget?: number;
  deadlineAt?: number | (() => number | undefined);
  minSpacingMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}) {
  return createFaceitClient({
    apiKey: "k",
    baseUrl: BASE,
    timeoutMs: 60_000,
    maxRetries: options.maxRetries ?? 3,
    fetchImpl: options.fetchImpl,
    sleep: options.sleep ?? (async () => undefined),
    ...(options.callBudget === undefined ? {} : { callBudget: options.callBudget }),
    ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }),
    ...(options.minSpacingMs === undefined ? {} : { minSpacingMs: options.minSpacingMs }),
  });
}

/* -------------------------------------------------------------------------- */
/* A. DEADLINE                                                                */
/* -------------------------------------------------------------------------- */

describe("FASE 2.2.1E — deadline", () => {
  it("1. deadline válido permite a request", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const c = client({
      fetchImpl: fetchMock as unknown as typeof fetch,
      deadlineAt: Date.now() + 60_000,
    });
    await expect(c.get("/players/p1")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(c.requestCount).toBe(1);
  });

  it("2. deadline já expirado: nenhum fetch e erro de deadline", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const c = client({
      fetchImpl: fetchMock as unknown as typeof fetch,
      deadlineAt: Date.now() - 1,
    });
    await expect(c.get("/players/p1")).rejects.toMatchObject({
      code: "FACEIT_WORKER_DEADLINE_EXCEEDED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(c.requestCount).toBe(0);
  });

  it("3. deadline expira DURANTE o pacing: a request não começa", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    // Primeira request consome o spacing; a segunda precisaria esperar além do deadline.
    let now = 1_000_000;
    const deadline = now + 200;
    const c = createFaceitClient({
      apiKey: "k",
      baseUrl: BASE,
      timeoutMs: 60_000,
      maxRetries: 1,
      minSpacingMs: 500,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
      deadlineAt: () => deadline,
    });
    vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      await c.get("/players/p1");
      now += 10;
      await expect(c.get("/players/p1")).rejects.toMatchObject({
        code: "FACEIT_WORKER_DEADLINE_EXCEEDED",
      });
    } finally {
      vi.restoreAllMocks();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("4. deadline expira entre o assert inicial e o fetch: a request não começa", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    let calls = 0;
    const start = Date.now();
    // O deadline "vira" expirado exatamente depois do primeiro assert.
    const c = client({
      fetchImpl: fetchMock as unknown as typeof fetch,
      deadlineAt: () => (calls++ === 0 ? start + 60_000 : start - 1),
    });
    await expect(c.get("/players/p1")).rejects.toMatchObject({
      code: "FACEIT_WORKER_DEADLINE_EXCEEDED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("5./6. retry após o deadline não começa e Retry-After não é aguardado", async () => {
    const now = 2_000_000;
    const deadline = now + 100;
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: "rate" }, 429, { "retry-after": "600" }),
    );
    const sleep = vi.fn(async () => undefined);
    const c = createFaceitClient({
      apiKey: "k",
      baseUrl: BASE,
      timeoutMs: 60_000,
      maxRetries: 3,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleep,
      deadlineAt: () => deadline,
    });
    vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      await expect(c.get("/players/p1")).rejects.toMatchObject({
        code: "FACEIT_WORKER_DEADLINE_EXCEEDED",
      });
    } finally {
      vi.restoreAllMocks();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("7. request em andamento quando o deadline expira: abort e nenhum retry", async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const c = client({
      fetchImpl: fetchMock as unknown as typeof fetch,
      deadlineAt: Date.now() + 20,
    });
    await expect(c.get("/matches/m1")).rejects.toMatchObject({
      code: "FACEIT_WORKER_DEADLINE_EXCEEDED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* B. API BUDGET                                                              */
/* -------------------------------------------------------------------------- */

describe("FASE 2.2.1E — API budget", () => {
  it("8. budget 3 com 503/503/200 gasta exatamente 3 requests", async () => {
    const responses = [jsonResponse({}, 503), jsonResponse({}, 503), jsonResponse({ ok: true })];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const c = client({ fetchImpl: fetchMock as unknown as typeof fetch, callBudget: 3 });
    await expect(c.get("/players/p1")).resolves.toEqual({ ok: true });
    expect(c.requestCount).toBe(3);
    expect(c.remainingCalls).toBe(0);
  });

  it("9. budget 2 nunca envia a terceira tentativa", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 503));
    const c = client({ fetchImpl: fetchMock as unknown as typeof fetch, callBudget: 2 });
    await expect(c.get("/players/p1")).rejects.toMatchObject({
      code: "FACEIT_API_BUDGET_EXHAUSTED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("10./11. budget 1 envia uma request; budget 0 não envia nenhuma", async () => {
    const one = vi.fn(async () => jsonResponse({}, 503));
    const c1 = client({ fetchImpl: one as unknown as typeof fetch, callBudget: 1 });
    await expect(c1.get("/players/p1")).rejects.toBeTruthy();
    expect(one).toHaveBeenCalledTimes(1);

    const zero = vi.fn(async () => jsonResponse({ ok: true }));
    const c0 = client({ fetchImpl: zero as unknown as typeof fetch, callBudget: 0 });
    await expect(c0.get("/players/p1")).rejects.toMatchObject({
      code: "FACEIT_API_BUDGET_EXHAUSTED",
    });
    expect(zero).not.toHaveBeenCalled();
  });

  it("12. apiCallBudget explícito não é promovido a um mínimo artificial", () => {
    expect(normalizeApiCallBudget(2)).toBe(2);
    expect(normalizeApiCallBudget(1)).toBe(1);
    expect(normalizeApiCallBudget(0)).toBe(0);
    expect(normalizeApiCallBudget(-5)).toBe(0);
    expect(normalizeApiCallBudget(7.9)).toBe(7);
    expect(normalizeApiCallBudget(Number.NaN)).toBe(FACEIT_JOB_API_CALL_BUDGET);
    expect(normalizeApiCallBudget(Number.POSITIVE_INFINITY)).toBe(FACEIT_JOB_API_CALL_BUDGET);
    expect(normalizeApiCallBudget(undefined)).toBe(FACEIT_JOB_API_CALL_BUDGET);
  });

  it("13./15. Retry-After não aumenta o budget e o retry de 429 conta", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 429, { "retry-after": "1" }));
    const c = client({ fetchImpl: fetchMock as unknown as typeof fetch, callBudget: 2 });
    await expect(c.get("/players/p1")).rejects.toBeTruthy();
    expect(c.requestCount).toBe(2);
    expect(c.remainingCalls).toBe(0);
  });

  it("14. retry de timeout conta no budget", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      void init;
      throw new DOMException("aborted", "AbortError");
    });
    const c = client({ fetchImpl: fetchMock as unknown as typeof fetch, callBudget: 2 });
    await expect(c.get("/players/p1")).rejects.toBeTruthy();
    expect(c.requestCount).toBe(2);
  });

  it("16. retry de 5xx conta no budget", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 502));
    const c = client({ fetchImpl: fetchMock as unknown as typeof fetch, callBudget: 3 });
    await expect(c.get("/players/p1")).rejects.toBeTruthy();
    expect(c.requestCount).toBe(3);
  });

  it("17.-21. todos os endpoints FACEIT consomem o mesmo budget central", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const c = client({ fetchImpl: fetchMock as unknown as typeof fetch, callBudget: 5 });
    await c.get("/players/p1");
    await c.get("/players/p1/history", { game: "cs2" });
    await c.get("/matches/m1");
    await c.get("/matches/m1/stats");
    await c.get("/players/p1/stats/cs2");
    expect(c.requestCount).toBe(5);
    expect(c.remainingCalls).toBe(0);
    await expect(c.get("/players/p1")).rejects.toMatchObject({
      code: "FACEIT_API_BUDGET_EXHAUSTED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

/* -------------------------------------------------------------------------- */
/* E. CONVERGENCE / TERMINAL                                                  */
/* -------------------------------------------------------------------------- */

function history(status: string | null, startedAt: number | null, finishedAt: number | null) {
  return {
    match_id: "m1",
    game_id: "cs2",
    status,
    started_at: startedAt,
    finished_at: finishedAt,
    teams: {
      faction1: { roster: [{ player_id: "p1" }] },
      faction2: { roster: [{ player_id: "p2" }] },
    },
    results: null,
  } as unknown as FaceitHistoryItem;
}

function canonicalFor(status: string | null, startedAt: number | null, finishedAt: number | null) {
  return mapFaceitMatchToMatch({
    playerId: "p1",
    history: history(status, startedAt, finishedAt),
    details: null,
    sourceVersion: "test",
    gameId: "cs2",
  });
}

describe("FASE 2.2.1E — convergência e estados terminais", () => {
  const max = FACEIT_MAX_MATCH_FETCH_ATTEMPTS;

  it("26. ongoing com started_at e sem finished_at não é finished nem terminal", () => {
    const canonical = canonicalFor("ongoing", 1_700_000_000, null);
    expect(canonical?.finished).toBe(false);
    expect(canonical?.terminal).toBe(false);
    expect(
      faceitMatchConverged({
        dataComplete: true,
        finished: false,
        terminal: false,
        attempts: 0,
        maxAttempts: max,
      }),
    ).toBe(false);
  });

  it("27. ongoing com maxAttempts atingido continua não convergindo", () => {
    expect(
      faceitMatchConverged({
        dataComplete: false,
        finished: false,
        terminal: false,
        attempts: max + 5,
        maxAttempts: max,
      }),
    ).toBe(false);
  });

  it("28. status desconhecido sem finished_at não é terminal", () => {
    expect(isFaceitMatchTerminal({ status: "weird_state", finishedAt: null })).toBe(false);
    expect(isFaceitMatchTerminal({ status: null, finishedAt: null })).toBe(false);
    expect(canonicalFor(null, 1_700_000_000, null)?.terminal).toBe(false);
  });

  it("29./30. finished com finished_at é finished e terminal; status finished explícito basta", () => {
    expect(isFaceitMatchFinished({ status: "finished", finishedAt: 1_700_003_600 })).toBe(true);
    expect(isFaceitMatchTerminal({ status: "finished", finishedAt: 1_700_003_600 })).toBe(true);
    expect(isFaceitMatchFinished({ status: "FINISHED", finishedAt: null })).toBe(true);
    expect(isFaceitMatchFinished({ status: "ongoing", finishedAt: null })).toBe(false);
  });

  it("31./32. cancelled e aborted são terminais sem inventar resultado", () => {
    for (const status of ["cancelled", "aborted"]) {
      const canonical = canonicalFor(status, 1_700_000_000, 1_700_003_600);
      expect(canonical?.terminal).toBe(true);
      expect(canonical?.finished).toBe(false);
      expect(canonical?.result).toBeNull();
      expect(canonical?.score_player).toBeNull();
      expect(canonical?.score_opponent).toBeNull();
      expect(
        faceitMatchConverged({
          dataComplete: false,
          finished: false,
          terminal: true,
          attempts: max,
          maxAttempts: max,
        }),
      ).toBe(true);
    }
  });

  it("BO3 2-1 nunca produz rounds = 3", () => {
    const details = {
      match_id: "m1",
      status: "finished",
      started_at: 1_700_000_000,
      finished_at: 1_700_010_000,
      best_of: 3,
      teams: {
        faction1: { roster: [{ player_id: "p1" }] },
        faction2: { roster: [{ player_id: "p2" }] },
      },
      results: { winner: "faction1", score: { faction1: 2, faction2: 1 } },
    } as unknown as FaceitMatch;
    const canonical = mapFaceitMatchToMatch({
      playerId: "p1",
      details,
      sourceVersion: "test",
      gameId: "cs2",
    });
    expect(canonical?.score_player).toBe(2);
    expect(canonical?.score_opponent).toBe(1);
    expect(canonical?.rounds).toBeNull();
    expect(canonical?.metadata["score_unit"]).toBe("maps");
  });
});
