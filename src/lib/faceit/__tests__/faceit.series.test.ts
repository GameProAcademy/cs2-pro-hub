/**
 * FASE 2.2.1C — regression tests for the two silent data-fidelity bugs:
 *
 *  - bo2/bo3 series wrote MAPS WON into `score`/`rounds` as if they were rounds;
 *  - pagination treated a short page as proof of the end of history.
 *
 * Payload shapes follow the documented FACEIT Data API v4 responses.
 */
import { describe, expect, it, vi } from "vitest";

import { createFaceitClient } from "../faceit.http";
import {
  extractFaceitMap,
  faceitMapFromStats,
  faceitSeriesShape,
  mapFaceitMatchToMatch,
} from "../faceit.mapper";
import { fetchFaceitHistory } from "../faceit.matches";

const ME = "player-me";

function teams() {
  return {
    faction1: { nickname: "team A", roster: [{ player_id: ME }] },
    faction2: { nickname: "team B", roster: [{ player_id: "other" }] },
  };
}

function map(details: Record<string, unknown>, mapFromStats?: string | null) {
  return mapFaceitMatchToMatch({
    playerId: ME,
    history: { match_id: "m1" } as never,
    details: { match_id: "m1", teams: teams(), ...details } as never,
    sourceVersion: "data-v4",
    gameId: "cs2",
    ...(mapFromStats === undefined ? {} : { mapFromStats }),
  });
}

describe("BO1 — score é round score", () => {
  it("mantém 13-7 como score e 20 rounds jogados", () => {
    const canonical = map({
      best_of: 1,
      results: { winner: "faction1", score: { faction1: 13, faction2: 7 } },
      voting: { map: { pick: ["de_mirage"] } },
    });
    expect(canonical?.score_player).toBe(13);
    expect(canonical?.score_opponent).toBe(7);
    expect(canonical?.rounds).toBe(20);
    expect(canonical?.map).toBe("de_mirage");
    expect(canonical?.metadata["score_unit"]).toBe("rounds");
    expect(canonical?.metadata["is_series"]).toBe(false);
    expect(canonical?.metadata["rounds_source"]).toBe("match_score");
  });
});

describe("BO2 — score é mapas, rounds vêm dos mapas", () => {
  it("1-1 não é 2 rounds: soma os rounds reais dos dois mapas", () => {
    const canonical = map({
      best_of: 2,
      results: { winner: null, score: { faction1: 1, faction2: 1 } },
      detailed_results: [
        { factions: { faction1: { score: 13 }, faction2: { score: 9 } } },
        { factions: { faction1: { score: 7 }, faction2: { score: 13 } } },
      ],
    });
    expect(canonical?.score_player).toBe(1);
    expect(canonical?.score_opponent).toBe(1);
    expect(canonical?.metadata["score_unit"]).toBe("maps");
    expect(canonical?.rounds).toBe(13 + 9 + 7 + 13);
    expect(canonical?.metadata["rounds_source"]).toBe("detailed_results");
    expect(canonical?.result).toBe("draw");
    // Série de dois mapas não tem "um" mapa.
    expect(canonical?.map).toBeNull();
    expect(canonical?.metadata["maps_played"]).toBe(2);
  });
});

describe("BO3", () => {
  it("2-0 registra mapas ganhos e rounds dos dois mapas jogados", () => {
    const canonical = map({
      best_of: 3,
      results: { winner: "faction1", score: { faction1: 2, faction2: 0 } },
      detailed_results: [
        { factions: { faction1: { score: 13 }, faction2: { score: 5 } } },
        { factions: { faction1: { score: 13 }, faction2: { score: 11 } } },
      ],
    });
    expect(canonical?.score_player).toBe(2);
    expect(canonical?.score_opponent).toBe(0);
    expect(canonical?.rounds).toBe(42);
    expect(canonical?.result).toBe("win");
    expect(canonical?.metadata["map_scores"]).toEqual([
      { player: 13, opponent: 5 },
      { player: 13, opponent: 11 },
    ]);
  });

  it("2-1 nunca vira 3 rounds", () => {
    const canonical = map({
      best_of: 3,
      results: { winner: "faction2", score: { faction1: 1, faction2: 2 } },
      detailed_results: [
        { factions: { faction1: { score: 13 }, faction2: { score: 8 } } },
        { factions: { faction1: { score: 6 }, faction2: { score: 13 } } },
        { factions: { faction1: { score: 14 }, faction2: { score: 16 } } },
      ],
    });
    expect(canonical?.rounds).toBe(70);
    expect(canonical?.rounds).not.toBe(3);
    expect(canonical?.result).toBe("loss");
    expect(canonical?.metadata["maps_played"]).toBe(3);
  });

  it("série sem detailed_results prefere null a um número falso", () => {
    const canonical = map({
      best_of: 3,
      results: { winner: "faction1", score: { faction1: 2, faction2: 1 } },
    });
    expect(canonical?.rounds).toBeNull();
    expect(canonical?.metadata["rounds_source"]).toBeNull();
  });

  it("segmento sem score não produz soma parcial", () => {
    const canonical = map({
      best_of: 3,
      results: { winner: "faction1", score: { faction1: 2, faction2: 0 } },
      detailed_results: [
        { factions: { faction1: { score: 13 }, faction2: { score: 5 } } },
        { factions: { faction1: { score: 13 } } },
      ],
    });
    expect(canonical?.rounds).toBeNull();
  });
});

describe("forma da série e extração de mapa", () => {
  it("best_of é autoritativo e detailed_results é fallback", () => {
    expect(faceitSeriesShape({ best_of: 1 } as never)).toMatchObject({ isSeries: false });
    expect(faceitSeriesShape({ best_of: 3 } as never)).toMatchObject({ isSeries: true });
    expect(faceitSeriesShape({ detailed_results: [{}, {}] } as never)).toMatchObject({
      isSeries: true,
      mapsPlayed: 2,
    });
    expect(faceitSeriesShape(null)).toMatchObject({ isSeries: false, bestOf: null });
  });

  it("usa o mapa das estatísticas quando o voting não decidiu", () => {
    expect(extractFaceitMap({ voting: { map: { pick: [] } } } as never, "de_nuke")).toBe("de_nuke");
    expect(extractFaceitMap({ voting: { map: { pick: ["de_ancient"] } } } as never)).toBe(
      "de_ancient",
    );
    // Dois picks e nada nos stats: mapa indisponível, nunca inventado.
    expect(extractFaceitMap({ voting: { map: { pick: ["a", "b"] } } } as never, null)).toBeNull();
  });

  it("stats com vários mapas não resolvem um mapa único", () => {
    const stats = {
      rounds: [
        { match_id: "m1", round_stats: { Map: "de_mirage" } },
        { match_id: "m1", round_stats: { Map: "de_nuke" } },
      ],
    };
    expect(faceitMapFromStats(stats as never, "m1")).toBeNull();
    expect(
      faceitMapFromStats(
        { rounds: [{ match_id: "m1", round_stats: { Map: "de_dust2" } }] } as never,
        "m1",
      ),
    ).toBe("de_dust2");
  });
});

/* -------------------------------------------------------------------------- */

function historyClient(pages: Array<Array<string>>) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const ids = pages[Math.min(call, pages.length - 1)] ?? [];
    call += 1;
    return Response.json({
      items: ids.map((id) => ({
        match_id: id,
        game_id: "cs2",
        started_at: 1_700_000_000,
        finished_at: 1_700_003_000,
        teams: {},
      })),
    });
  });
  const client = createFaceitClient({
    apiKey: "k",
    baseUrl: "https://open.faceit.com/data/v4",
    timeoutMs: 500,
    maxRetries: 0,
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
  return { client, fetchMock };
}

function offsets(fetchMock: ReturnType<typeof vi.fn>): number[] {
  return fetchMock.mock.calls.map((call) => {
    const url = new URL(String(call[0]));
    return Number(url.searchParams.get("offset"));
  });
}

describe("paginação — truncamento honesto", () => {
  it("página curta NÃO é prova de fim: sonda a próxima e só então conclui", async () => {
    const { client, fetchMock } = historyClient([["m1", "m2"], ["m3"], []]);
    const result = await fetchFaceitHistory(client, {
      playerId: "p1",
      gameId: "cs2",
      maxMatches: 50,
      maxPages: 5,
      pageSize: 2,
    });
    expect(result.items.map((item) => item.match_id)).toEqual(["m1", "m2", "m3"]);
    expect(result.stopReason).toBe("end_of_history");
    expect(result.truncated).toBe(false);
    expect(offsets(fetchMock)).toEqual([0, 2, 3]);
  });

  it("página cheia continua e o offset avança pelos itens recebidos", async () => {
    const { client, fetchMock } = historyClient([["m1", "m2"], ["m3", "m4"], []]);
    const result = await fetchFaceitHistory(client, {
      playerId: "p1",
      gameId: "cs2",
      maxMatches: 50,
      maxPages: 5,
      pageSize: 2,
    });
    expect(result.items).toHaveLength(4);
    expect(offsets(fetchMock)).toEqual([0, 2, 4]);
    expect(result.truncated).toBe(false);
  });

  it("maxPages interrompe e sinaliza truncated", async () => {
    const { client } = historyClient([
      ["m1", "m2"],
      ["m3", "m4"],
      ["m5", "m6"],
    ]);
    const result = await fetchFaceitHistory(client, {
      playerId: "p1",
      gameId: "cs2",
      maxMatches: 100,
      maxPages: 2,
      pageSize: 2,
    });
    expect(result.pages).toBe(2);
    expect(result.items).toHaveLength(4);
    expect(result.stopReason).toBe("page_limit");
    expect(result.truncated).toBe(true);
  });

  it("maxMatches interrompe e sinaliza truncated", async () => {
    const { client } = historyClient([["m1", "m2", "m3"]]);
    const result = await fetchFaceitHistory(client, {
      playerId: "p1",
      gameId: "cs2",
      maxMatches: 2,
      maxPages: 5,
    });
    expect(result.items).toHaveLength(2);
    expect(result.stopReason).toBe("match_limit");
    expect(result.truncated).toBe(true);
  });

  it("uma página só de ids conhecidos não encerra o sync imediatamente", async () => {
    // A janela incremental sobrepõe de propósito: a primeira página pode ser
    // inteiramente conhecida enquanto a seguinte traz partidas novas.
    const { client } = historyClient([["m1", "m2"], ["m1", "m2"], ["m3", "m4"], []]);
    const result = await fetchFaceitHistory(client, {
      playerId: "p1",
      gameId: "cs2",
      maxMatches: 50,
      maxPages: 6,
      pageSize: 2,
    });
    expect(result.items.map((item) => item.match_id)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(result.stopReason).toBe("end_of_history");
  });

  it("histórico vazio é o único fim provado, com uma única chamada", async () => {
    const { client, fetchMock } = historyClient([[]]);
    const result = await fetchFaceitHistory(client, {
      playerId: "p1",
      gameId: "cs2",
      maxMatches: 50,
      maxPages: 5,
    });
    expect(result.items).toHaveLength(0);
    expect(result.truncated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
