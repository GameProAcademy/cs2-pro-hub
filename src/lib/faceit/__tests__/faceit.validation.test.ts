/**
 * FASE 2.2.1D — FACEIT final validation patch.
 *
 * Pure/mocked only: no network, no credential, no real FACEIT account.
 * Focus: what proves a match is FINISHED, convergence of ongoing matches, the
 * API-call budget as a real hard ceiling (retries included), the worker
 * deadline, and null != zero.
 */
import { describe, expect, it, vi } from "vitest";

import { createFaceitClient } from "../faceit.http";
import { FaceitError, isFaceitBudgetError, isRetryableFaceitError } from "../faceit.errors";
import { FACEIT_MAX_MATCH_FETCH_ATTEMPTS } from "../faceit.constants";
import {
  faceitMatchConverged,
  isFaceitMatchFinished,
  mapFaceitMatchStatsToMetrics,
  mapFaceitMatchToMatch,
} from "../faceit.mapper";
import { faceitMatchStatsSchema, parseFaceit, type FaceitMatchStats } from "../faceit.types";

const PLAYER = "11111111-2222-3333-4444-555555555555";

function detailsFor(status: string | null, startedAt: number | null, finishedAt: number | null) {
  return {
    match_id: "match-1",
    game: "cs2",
    ...(status === null ? {} : { status }),
    ...(startedAt === null ? {} : { started_at: startedAt }),
    ...(finishedAt === null ? {} : { finished_at: finishedAt }),
    teams: {
      faction1: { nickname: "team-a", roster: [{ player_id: PLAYER }] },
      faction2: { nickname: "team-b", roster: [{ player_id: "other" }] },
    },
    results: { score: { faction1: 8, faction2: 6 } },
  } as never;
}

function canonicalFor(status: string | null, startedAt: number | null, finishedAt: number | null) {
  return mapFaceitMatchToMatch({
    playerId: PLAYER,
    details: detailsFor(status, startedAt, finishedAt),
    sourceVersion: "test",
    gameId: "cs2",
  });
}

describe("FASE 2.2.1D — definição de finished", () => {
  it("CASO A — ongoing com started_at e sem finished_at NÃO é finished", () => {
    const canonical = canonicalFor("ongoing", 1_700_000_000, null);
    expect(canonical?.match_date).not.toBeNull(); // vem de started_at
    expect(canonical?.finished).toBe(false);
  });

  it("CASO B — finished com finished_at é finished", () => {
    expect(canonicalFor("finished", 1_700_000_000, 1_700_003_600)?.finished).toBe(true);
  });

  it("CASO C — status finished sem finished_at é finished", () => {
    expect(canonicalFor("finished", 1_700_000_000, null)?.finished).toBe(true);
  });

  it("CASO D — ongoing com finished_at é finished", () => {
    expect(canonicalFor("ongoing", 1_700_000_000, 1_700_003_600)?.finished).toBe(true);
  });

  it("CASO E — status ausente sem finished_at NÃO é finished", () => {
    expect(canonicalFor(null, 1_700_000_000, null)?.finished).toBe(false);
  });

  it("match_date nunca é prova de finalização", () => {
    expect(isFaceitMatchFinished({ status: "ongoing", finishedAt: null })).toBe(false);
    expect(isFaceitMatchFinished({ status: "ready" })).toBe(false);
    expect(isFaceitMatchFinished({ status: "aborted" })).toBe(false);
    expect(isFaceitMatchFinished({ status: "FINISHED" })).toBe(true);
    expect(isFaceitMatchFinished({ finishedAt: 1 })).toBe(true);
    expect(isFaceitMatchFinished({ finishedAt: 0 })).toBe(false);
  });

  it("registra o estado honestamente nos metadados", () => {
    const canonical = canonicalFor("ongoing", 1_700_000_000, null);
    const metadata = canonical?.metadata as Record<string, unknown>;
    expect(metadata["finished"]).toBe(false);
    expect(metadata["status"]).toBe("ongoing");
  });
});

describe("FASE 2.2.1D — convergência", () => {
  const max = FACEIT_MAX_MATCH_FETCH_ATTEMPTS;

  it("TESTE G — ongoing nunca converge, nem estourando as tentativas", () => {
    expect(
      faceitMatchConverged({
        dataComplete: false,
        finished: false,
        attempts: max,
        maxAttempts: max,
      }),
    ).toBe(false);
    expect(
      faceitMatchConverged({
        dataComplete: false,
        finished: false,
        attempts: max + 10,
        maxAttempts: max,
      }),
    ).toBe(false);
  });

  it("TESTE H — finished converge com dados completos ou tentativas esgotadas", () => {
    // FASE 2.2.1E: dados completos NÃO bastam; o ciclo precisa ter terminado.
    expect(
      faceitMatchConverged({ dataComplete: true, finished: false, attempts: 0, maxAttempts: max }),
    ).toBe(false);
    expect(
      faceitMatchConverged({
        dataComplete: true,
        finished: true,
        attempts: 0,
        maxAttempts: max,
      }),
    ).toBe(true);
    expect(
      faceitMatchConverged({
        dataComplete: false,
        finished: true,
        attempts: max,
        maxAttempts: max,
      }),
    ).toBe(true);
    expect(
      faceitMatchConverged({ dataComplete: false, finished: true, attempts: 1, maxAttempts: max }),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* API call budget                                                            */
/* -------------------------------------------------------------------------- */

function budgetClient(
  responses: Array<() => Response>,
  options: { callBudget?: number; deadlineAt?: number; maxRetries?: number } = {},
) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const factory = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return factory!();
  });
  const client = createFaceitClient({
    apiKey: "test-key",
    baseUrl: "https://open.faceit.com/data/v4",
    timeoutMs: 1000,
    maxRetries: options.maxRetries ?? 5,
    fetchImpl: fetchMock as unknown as typeof fetch,
    sleep: async () => undefined,
    ...(options.callBudget === undefined ? {} : { callBudget: options.callBudget }),
    ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }),
  });
  return { client, fetchMock };
}

const fail503 = () => new Response("boom", { status: 503 });
const ok = () => new Response(JSON.stringify({ items: [] }), { status: 200 });
const rateLimited = () =>
  new Response("slow down", { status: 429, headers: { "retry-after": "2" } });

describe("FASE 2.2.1D — API budget é hard ceiling real", () => {
  it("TESTE K — budget 3 permite 503, 503 e sucesso na terceira chamada", async () => {
    const { client, fetchMock } = budgetClient([fail503, fail503, ok], { callBudget: 3 });
    await expect(client.get("/players/x/history")).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(client.requestCount).toBe(3);
    expect(client.remainingCalls).toBe(0);
  });

  it("TESTE K — budget 2 nunca envia a terceira tentativa", async () => {
    const { client, fetchMock } = budgetClient([fail503, fail503, ok], { callBudget: 2 });
    await expect(client.get("/players/x/history")).rejects.toMatchObject({
      code: "FACEIT_API_BUDGET_EXHAUSTED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.requestCount).toBe(2);
  });

  it("nenhuma chamada é feita quando o budget já está esgotado", async () => {
    const { client, fetchMock } = budgetClient([ok], { callBudget: 1 });
    await client.get("/players/x");
    await expect(client.get("/players/x/stats/cs2")).rejects.toMatchObject({
      code: "FACEIT_API_BUDGET_EXHAUSTED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("TESTE L — Retry-After é respeitado quando há orçamento e ignorado quando não há", async () => {
    const withBudget = budgetClient([rateLimited, ok], { callBudget: 2 });
    await expect(withBudget.client.get("/matches/m1")).resolves.toBeTruthy();
    expect(withBudget.fetchMock).toHaveBeenCalledTimes(2);

    const withoutBudget = budgetClient([rateLimited, ok], { callBudget: 1 });
    await expect(withoutBudget.client.get("/matches/m1")).rejects.toMatchObject({
      code: "FACEIT_API_BUDGET_EXHAUSTED",
    });
    expect(withoutBudget.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("orçamento vale para qualquer endpoint (history, profile, details, stats, lifetime)", async () => {
    const { client, fetchMock } = budgetClient([ok], { callBudget: 3 });
    await client.get("/players/x");
    await client.get("/players/x/history");
    await client.get("/matches/m1");
    await expect(client.get("/matches/m1/stats")).rejects.toMatchObject({
      code: "FACEIT_API_BUDGET_EXHAUSTED",
    });
    await expect(client.get("/players/x/stats/cs2")).rejects.toMatchObject({
      code: "FACEIT_API_BUDGET_EXHAUSTED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(client.requestCount).toBe(3);
  });

  it("apiCalls conta requests reais, incluindo retries", async () => {
    const { client } = budgetClient([fail503, fail503, ok]);
    await client.get("/matches/m1");
    expect(client.requestCount).toBe(3);
    expect(client.remainingCalls).toBe(Number.POSITIVE_INFINITY);
  });

  it("budget/deadline não são erros permanentes de integração nem retentáveis por HTTP", () => {
    expect(isFaceitBudgetError("FACEIT_API_BUDGET_EXHAUSTED")).toBe(true);
    expect(isFaceitBudgetError("FACEIT_WORKER_DEADLINE_EXCEEDED")).toBe(true);
    expect(isFaceitBudgetError("FACEIT_TEMPORARY_ERROR")).toBe(false);
    expect(isRetryableFaceitError("FACEIT_API_BUDGET_EXHAUSTED")).toBe(false);
    expect(isRetryableFaceitError("FACEIT_WORKER_DEADLINE_EXCEEDED")).toBe(false);
    expect(new FaceitError("FACEIT_API_BUDGET_EXHAUSTED").retryable).toBe(false);
  });
});

describe("FASE 2.2.1D — worker deadline", () => {
  it("TESTE N — deadline expirado impede qualquer nova chamada", async () => {
    const { client, fetchMock } = budgetClient([ok], { deadlineAt: Date.now() - 1 });
    await expect(client.get("/players/x/history")).rejects.toMatchObject({
      code: "FACEIT_WORKER_DEADLINE_EXCEEDED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TESTE N — deadline que expira durante a execução impede o retry", async () => {
    let deadline = Date.now() + 50;
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      deadline = Date.now() - 1; // o orçamento de tempo acabou durante a request
      return new Response("boom", { status: 503 });
    });
    const client = createFaceitClient({
      apiKey: "k",
      baseUrl: "https://open.faceit.com/data/v4",
      timeoutMs: 1000,
      maxRetries: 4,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
      deadlineAt: () => deadline,
    });
    await expect(client.get("/matches/m1")).rejects.toMatchObject({
      code: "FACEIT_WORKER_DEADLINE_EXCEEDED",
    });
    expect(call).toBe(1);
  });

  it("aborta a request quando o deadline é mais próximo que o timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("x", "AbortError")),
            );
          }),
      );
      const client = createFaceitClient({
        apiKey: "k",
        baseUrl: "https://open.faceit.com/data/v4",
        timeoutMs: 60_000,
        maxRetries: 1,
        fetchImpl: fetchMock as unknown as typeof fetch,
        sleep: async () => undefined,
        deadlineAt: Date.now() + 20,
      });
      // FASE 2.2.1E: abortar por deadline é parada controlada, não timeout comum.
      const request = expect(client.get("/matches/m1")).rejects.toMatchObject({
        code: "FACEIT_WORKER_DEADLINE_EXCEEDED",
      });
      await vi.advanceTimersByTimeAsync(21);
      await request;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("FASE 2.2.1D — TESTE J: ausência continua null, zero continua zero", () => {
  it("KAST/ADR/rating/rounds ausentes permanecem null", () => {
    const stats = parseFaceit(faceitMatchStatsSchema, {
      rounds: [
        {
          match_id: "match-1",
          round_stats: {},
          teams: [{ players: [{ player_id: PLAYER, player_stats: { Kills: "10", ADR: "0" } }] }],
        },
      ],
    }) as FaceitMatchStats;
    const metrics = mapFaceitMatchStatsToMetrics(stats, PLAYER, "match-1");
    expect(metrics).not.toBeNull();
    expect(metrics?.kills).toBe(10);
    expect(metrics?.adr).toBe(0);
    expect(metrics?.kast).toBeNull();
    expect(metrics?.rating).toBeNull();
    expect(metrics?.rounds_played).toBeNull();
    expect(metrics?.hs_percent).toBeNull();
  });

  it("mapa indeterminado permanece null, nunca 'unknown'", () => {
    const canonical = canonicalFor("finished", 1_700_000_000, 1_700_003_600);
    expect(canonical?.map).toBeNull();
  });
});
