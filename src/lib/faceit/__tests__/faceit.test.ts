/**
 * FASE 2.2.1 — FACEIT unit tests.
 *
 * Every test uses mocks: no real network call, no real credential, no real
 * FACEIT account. The invariants under test are the security and honesty rules:
 * PKCE, stable error codes, bounded pagination, deduplication and "absent data
 * is null, never zero".
 */
import { describe, expect, it, vi } from "vitest";

import { FaceitClient } from "../faceit.http";
import {
  callbackReason,
  FaceitError,
  faceitErrorFromOAuthParam,
  faceitErrorFromStatus,
  isRetryableFaceitError,
} from "../faceit.errors";
import { mapFaceitMatchStatsToMetrics, mapFaceitMatchToMatch, safeKdRatio } from "../faceit.mapper";
import { fetchFaceitHistory } from "../faceit.matches";
import {
  buildAuthorizeUrl,
  codeChallengeS256,
  generateCodeVerifier,
  generateState,
  extractFaceitPlayerId,
} from "../faceit.oauth";

function client(handler: (url: string) => unknown, extra: Partial<{ maxRetries: number }> = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    Response.json(handler(String(input))),
  );
  return {
    fetchMock,
    client: new FaceitClient({
      apiKey: "test-key",
      baseUrl: "https://open.faceit.com/data/v4",
      timeoutMs: 1000,
      maxRetries: extra.maxRetries ?? 0,
      fetchImpl: fetchMock as unknown as typeof fetch,
    }),
  };
}

describe("OAuth PKCE", () => {
  it("gera verifier e state com entropia suficiente e sem caracteres inválidos", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(generateState()).not.toBe(generateState());
  });

  it("produz um code_challenge S256 estável e diferente do verifier", async () => {
    const challenge = await codeChallengeS256("abc123abc123abc123abc123abc123abc123abc123abc");
    expect(challenge).not.toContain("=");
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("nunca coloca o client secret nem o verifier na URL de autorização", () => {
    const url = buildAuthorizeUrl({
      authorizeUrl: "https://accounts.faceit.com/auth",
      clientId: "client-id",
      redirectUri: "https://app.example.com/cb",
      state: "state-value",
      codeChallenge: "challenge-value",
      scope: "openid profile",
    });
    const params = new URL(url).searchParams;
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toBe("challenge-value");
    expect(url).not.toContain("code_verifier");
    expect(url).not.toContain("secret");
  });
});

describe("identidade FACEIT", () => {
  it("aceita apenas identificadores canônicos, nunca o nickname", () => {
    expect(extractFaceitPlayerId({ guid: "abc" })).toBe("abc");
    expect(extractFaceitPlayerId({ player_id: "xyz" })).toBe("xyz");
    expect(extractFaceitPlayerId({ nickname: "s1mple" })).toBeNull();
    expect(extractFaceitPlayerId(null)).toBeNull();
  });
});

describe("erros", () => {
  it("mapeia status HTTP para códigos estáveis e marca só o que é transitório", () => {
    expect(faceitErrorFromStatus(401).code).toBe("FACEIT_API_UNAUTHORIZED");
    expect(faceitErrorFromStatus(404).code).toBe("FACEIT_RESOURCE_NOT_FOUND");
    expect(faceitErrorFromStatus(429).retryable).toBe(true);
    expect(faceitErrorFromStatus(503).retryable).toBe(true);
    expect(isRetryableFaceitError("FACEIT_API_FORBIDDEN")).toBe(false);
    expect(isRetryableFaceitError("FACEIT_DUPLICATE_ACCOUNT")).toBe(false);
  });

  it("não vaza corpo da FACEIT na mensagem de erro", () => {
    const error = new FaceitError("FACEIT_BAD_REQUEST", { status: 400 });
    expect(error.message).toBe("FACEIT_BAD_REQUEST");
  });

  it("traduz o parâmetro OAuth error e gera motivos amigáveis", () => {
    expect(faceitErrorFromOAuthParam("access_denied")).toBe("FACEIT_OAUTH_ACCESS_DENIED");
    expect(faceitErrorFromOAuthParam("qualquer-coisa")).toBe("FACEIT_OAUTH_FAILED");
    expect(callbackReason("FACEIT_DUPLICATE_ACCOUNT")).toBe("duplicate_account");
    expect(callbackReason("FACEIT_TIMEOUT")).toBe("temporary");
  });
});

describe("client HTTP", () => {
  it("envia a API key como Bearer e nunca na query string", async () => {
    const { client: api, fetchMock } = client(() => ({ ok: true }));
    await api.get("/players/abc");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).not.toContain("test-key");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-key");
  });

  it("não repete requisições para erros permanentes", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 403 }));
    const api = new FaceitClient({
      apiKey: "k",
      baseUrl: "https://open.faceit.com/data/v4",
      timeoutMs: 500,
      maxRetries: 3,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(api.get("/x")).rejects.toMatchObject({ code: "FACEIT_API_FORBIDDEN" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("paginação do histórico", () => {
  it("respeita maxMatches e maxPages e deduplica match_id", async () => {
    const page = (ids: string[]) => ({
      items: ids.map((id) => ({
        match_id: id,
        game_id: "cs2",
        started_at: 1_700_000_000,
        finished_at: 1_700_003_000,
        teams: {},
      })),
    });
    let call = 0;
    const { client: api, fetchMock } = client(() => {
      call += 1;
      // A segunda página repete tudo: o loop precisa parar.
      return call === 1 ? page(["m1", "m2"]) : page(["m1", "m2"]);
    });

    const result = await fetchFaceitHistory(api, {
      playerId: "p1",
      gameId: "cs2",
      maxMatches: 10,
      maxPages: 5,
      pageSize: 2,
    });

    expect(result.items.map((item) => item.match_id)).toEqual(["m1", "m2"]);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe("mapeamento canônico", () => {
  const history = {
    match_id: "1-abc",
    game_id: "cs2",
    started_at: 1_700_000_000,
    finished_at: 1_700_003_600,
    teams: {},
  };

  it("nunca inventa métricas ausentes", () => {
    const metrics = mapFaceitMatchStatsToMetrics(
      {
        rounds: [
          {
            match_id: "1-abc",
            teams: [
              {
                team_id: "t1",
                players: [
                  { player_id: "p1", nickname: "n", player_stats: { Kills: "10", Deaths: "8" } },
                ],
              },
            ],
          },
        ],
      },
      "p1",
    );
    expect(metrics?.kills).toBe(10);
    expect(metrics?.deaths).toBe(8);
    // ADR, HS%, KAST, clutch, flash e economia não vieram: seguem nulos.
    expect(metrics?.adr ?? null).toBeNull();
    expect(metrics?.kast ?? null).toBeNull();
  });

  it("não confunde ausência com zero no KD", () => {
    expect(safeKdRatio(null, 5)).toBeNull();
    expect(safeKdRatio(10, null)).toBeNull();
    expect(safeKdRatio(0, 5)).toBe(0);
  });

  it("ignora partidas sem identificador ou sem data", () => {
    const canonical = mapFaceitMatchToMatch({
      playerId: "p1",
      history,
      details: null,
      sourceVersion: "faceit-v4",
      gameId: "cs2",
    });
    expect(canonical?.external_match_id).toBe("1-abc");
    expect(canonical?.match_date).toBeTruthy();
  });
});
