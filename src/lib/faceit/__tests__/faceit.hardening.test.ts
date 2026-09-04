/**
 * FASE 2.2.1B — FACEIT hardening tests.
 *
 * Pure/mocked only: no real network, no real credential, no real FACEIT account.
 * Focus: identity resolution rule, deterministic match-stats parsing,
 * null vs zero, bounded and de-duplicated pagination, rate limiting and retry.
 */
import { describe, expect, it, vi } from "vitest";

import { createFaceitClient, faceitBackoffMs, parseRetryAfter } from "../faceit.http";
import { FaceitError, faceitErrorFromStatus, isRetryableFaceitError } from "../faceit.errors";
import {
  mapFaceitLifetimeStats,
  mapFaceitMatchStatsToMetrics,
  mapFaceitMatchToMatch,
  selectFaceitPlayerRounds,
} from "../faceit.mapper";
import { fetchFaceitHistory } from "../faceit.matches";
import { resolveFaceitIdentityFromPayload } from "../faceit.oauth";
import { faceitMatchStatsSchema, parseFaceit, type FaceitMatchStats } from "../faceit.types";

const TARGET = "11111111-2222-3333-4444-555555555555";

function makeClient(
  handler: (url: string, call: number) => Response | Promise<Response>,
  maxRetries = 1,
) {
  let call = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    call += 1;
    return handler(String(input), call);
  });
  const sleeps: number[] = [];
  const client = createFaceitClient({
    apiKey: "test-key",
    baseUrl: "https://open.faceit.com/data/v4",
    timeoutMs: 1000,
    maxRetries,
    fetchImpl: fetchMock as unknown as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, fetchMock, sleeps };
}

describe("resolução canônica de identidade FACEIT", () => {
  it("prefere guid, depois player_id e playerId", () => {
    expect(resolveFaceitIdentityFromPayload({ guid: "abc123", player_id: "other" })).toEqual({
      playerId: "abc123",
      source: "guid",
    });
    expect(resolveFaceitIdentityFromPayload({ player_id: "abc123" })?.source).toBe("player_id");
    expect(resolveFaceitIdentityFromPayload({ playerId: "abc123" })?.source).toBe("playerId");
  });

  it("aceita sub apenas quando é UUID", () => {
    expect(resolveFaceitIdentityFromPayload({ sub: "not-a-uuid" })).toBeNull();
    expect(resolveFaceitIdentityFromPayload({ sub: TARGET })).toEqual({
      playerId: TARGET,
      source: "sub",
    });
  });

  it("nunca aceita nickname nem payload malformado", () => {
    expect(resolveFaceitIdentityFromPayload({ nickname: "s1mple" })).toBeNull();
    expect(resolveFaceitIdentityFromPayload("string")).toBeNull();
    expect(resolveFaceitIdentityFromPayload(null)).toBeNull();
    expect(resolveFaceitIdentityFromPayload({ guid: "  " })).toBeNull();
  });
});

describe("match stats — seleção determinística por player_id", () => {
  const stats = parseFaceit(faceitMatchStatsSchema, {
    rounds: [
      {
        match_id: "match-1",
        round_stats: { Rounds: "24" },
        teams: [
          {
            team_id: "t1",
            players: [
              { player_id: "other-1", nickname: "Thiago", player_stats: { Kills: "30" } },
              {
                player_id: TARGET,
                nickname: "Thiago_",
                player_stats: { Kills: "20", Deaths: "10", ADR: "88.5", "Headshots %": "0" },
              },
            ],
          },
        ],
      },
      {
        match_id: "match-1",
        round_stats: { Rounds: "16" },
        teams: [
          {
            team_id: "t1",
            players: [
              {
                player_id: TARGET,
                nickname: "Thiago_",
                player_stats: { Kills: "10", Deaths: "8", ADR: "60" },
              },
            ],
          },
        ],
      },
    ],
  }) as FaceitMatchStats;

  it("nunca usa o primeiro round cegamente nem o nickname", () => {
    const rounds = selectFaceitPlayerRounds(stats, TARGET, "match-1");
    expect(rounds).toHaveLength(2);
    const metrics = mapFaceitMatchStatsToMetrics(stats, TARGET, "match-1");
    expect(metrics?.kills).toBe(30);
    expect(metrics?.deaths).toBe(18);
    expect(metrics?.rounds_played).toBe(40);
  });

  it("agrega ratios com média ponderada pelos rounds de cada segmento", () => {
    const metrics = mapFaceitMatchStatsToMetrics(stats, TARGET, "match-1");
    // (88.5*24 + 60*16) / 40
    expect(metrics?.adr).toBeCloseTo(77.1, 1);
  });

  it("zero permanece zero e ausência permanece null", () => {
    const metrics = mapFaceitMatchStatsToMetrics(stats, TARGET, "match-1");
    expect(metrics?.hs_percent).toBe(0);
    expect(metrics?.kast).toBeNull();
    expect(metrics?.rating).toBeNull();
    expect(metrics?.multi_kills).toBeNull();
  });

  it("retorna null quando o jogador alvo não está na resposta", () => {
    expect(mapFaceitMatchStatsToMetrics(stats, "unknown-player")).toBeNull();
  });

  it("ignora rounds de outro match_id", () => {
    expect(selectFaceitPlayerRounds(stats, TARGET, "match-2")).toHaveLength(0);
  });
});

describe("lifetime/aggregate stats", () => {
  it("preserva null e zero e descarta valores não numéricos", () => {
    const mapped = mapFaceitLifetimeStats({
      Matches: "120",
      "Win Rate %": "0",
      ADR: null,
      Region: "EU",
      Flag: true,
    });
    expect(mapped).toEqual({ Matches: 120, "Win Rate %": 0, ADR: null, Region: null });
  });

  it("retorna null quando não há estatísticas", () => {
    expect(mapFaceitLifetimeStats(null)).toBeNull();
  });
});

describe("match details — metadados externos", () => {
  it("registra apenas a disponibilidade da demo, nunca a URL", () => {
    const canonical = mapFaceitMatchToMatch({
      playerId: TARGET,
      history: { match_id: "m1" } as never,
      details: {
        match_id: "m1",
        best_of: 3,
        demo_url: ["https://demos.faceit.com/secret.dem"],
        teams: {
          faction1: { roster: [{ player_id: TARGET }] },
          faction2: { roster: [{ player_id: "x" }] },
        },
        results: { winner: "faction1", score: { faction1: 13, faction2: 7 } },
      } as never,
      sourceVersion: "data-v4",
      gameId: "cs2",
    });
    const metadata = JSON.stringify(canonical?.metadata);
    expect(canonical?.metadata["demo_available"]).toBe(true);
    expect(canonical?.metadata["best_of"]).toBe(3);
    expect(metadata).not.toContain("secret.dem");
    expect(canonical?.result).toBe("win");
    expect(canonical?.rounds).toBe(20);
  });
});

describe("paginação limitada e sem duplicação", () => {
  function page(ids: string[]) {
    return Response.json({ items: ids.map((id) => ({ match_id: id })) });
  }

  it("percorre múltiplas páginas e deduplica ids repetidos", async () => {
    const { client } = makeClient((url) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      if (offset === 0) return page(["a", "b"]);
      if (offset === 2) return page(["b", "c"]);
      return page([]);
    });
    const result = await fetchFaceitHistory(client, {
      playerId: TARGET,
      gameId: "cs2",
      maxMatches: 100,
      maxPages: 5,
      pageSize: 2,
    });
    expect(result.items.map((i) => i.match_id)).toEqual(["a", "b", "c"]);
  });

  it("para em histórico vazio com uma única chamada", async () => {
    const { client, fetchMock } = makeClient(() => page([]));
    const result = await fetchFaceitHistory(client, {
      playerId: TARGET,
      gameId: "cs2",
      maxMatches: 20,
      maxPages: 5,
    });
    expect(result.items).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respeita maxMatches e marca truncated", async () => {
    const { client } = makeClient((url) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      return page([`m${offset}a`, `m${offset}b`]);
    });
    const result = await fetchFaceitHistory(client, {
      playerId: TARGET,
      gameId: "cs2",
      maxMatches: 3,
      maxPages: 10,
      pageSize: 2,
    });
    expect(result.items).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it("respeita maxPages mesmo com histórico infinito", async () => {
    const { client } = makeClient((url) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      return page([`x${offset}`, `y${offset}`]);
    });
    const result = await fetchFaceitHistory(client, {
      playerId: TARGET,
      gameId: "cs2",
      maxMatches: 1000,
      maxPages: 2,
      pageSize: 2,
    });
    expect(result.pages).toBe(2);
  });

  it("aplica limit máximo documentado de 100", async () => {
    const { client, fetchMock } = makeClient(() => page([]));
    await fetchFaceitHistory(client, {
      playerId: TARGET,
      gameId: "cs2",
      maxMatches: 500,
      maxPages: 1,
      pageSize: 500,
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("limit")).toBe("100");
  });
});

describe("rate limit, retry e erros permanentes", () => {
  it("respeita Retry-After em segundos e em data HTTP", () => {
    expect(parseRetryAfter("30")).toBe(30);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("garbage")).toBeUndefined();
    const future = new Date(Date.now() + 5000).toUTCString();
    expect(parseRetryAfter(future)).toBeGreaterThanOrEqual(1);
  });

  it("faz backoff com jitter e teto de 30s", () => {
    expect(faceitBackoffMs(1, 3600)).toBe(30_000);
    const withJitter = faceitBackoffMs(3, undefined, () => 0);
    expect(withJitter).toBeGreaterThanOrEqual(100);
    expect(withJitter).toBeLessThanOrEqual(8000);
    expect(faceitBackoffMs(1, undefined, () => 0)).not.toBe(
      faceitBackoffMs(1, undefined, () => 1),
    );
  });

  it("429 é reclassificado, aguarda o Retry-After e não faz loop infinito", async () => {
    const { client, sleeps, fetchMock } = makeClient(
      () => new Response("", { status: 429, headers: { "retry-after": "2" } }),
      3,
    );
    await expect(client.get("/players/x")).rejects.toMatchObject({
      code: "FACEIT_RATE_LIMITED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([2000, 2000]);
  });

  it("5xx é retentado e depois falha com código estruturado", async () => {
    const { client, fetchMock } = makeClient(() => new Response("", { status: 503 }), 2);
    await expect(client.get("/players/x")).rejects.toMatchObject({
      code: "FACEIT_TEMPORARY_ERROR",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("401/403/404/400 não são retentados", async () => {
    for (const [status, code] of [
      [400, "FACEIT_BAD_REQUEST"],
      [401, "FACEIT_API_UNAUTHORIZED"],
      [403, "FACEIT_API_FORBIDDEN"],
      [404, "FACEIT_RESOURCE_NOT_FOUND"],
    ] as const) {
      const { client, fetchMock } = makeClient(() => new Response("", { status }), 3);
      await expect(client.get("/players/x")).rejects.toMatchObject({ code });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(isRetryableFaceitError(code)).toBe(false);
    }
  });

  it("timeout e falha de rede viram códigos retentáveis", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(isRetryableFaceitError("FACEIT_TIMEOUT")).toBe(true);
    expect(isRetryableFaceitError("FACEIT_NETWORK_ERROR")).toBe(true);
    expect(abort.name).toBe("AbortError");
  });

  it("payload inválido produz FACEIT_MALFORMED_RESPONSE", async () => {
    const { client } = makeClient(() => new Response("not-json", { status: 200 }));
    await expect(client.get("/players/x")).rejects.toBeInstanceOf(FaceitError);
    expect(faceitErrorFromStatus(500).retryable).toBe(true);
  });

  it("nunca expõe a API key na URL", async () => {
    const { client, fetchMock } = makeClient(() => Response.json({ items: [] }));
    await client.get("/players/x/history", { game: "cs2" });
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("test-key");
  });
});
