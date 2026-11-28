/** VGL 5.0 — map-rank-v1: deterministic best map with small-sample protection. */
import { describe, expect, it } from "vitest";

import { MAP_RANK_MIN_MATCHES, rankMaps, tierOf, type MapRankInput } from "@/lib/maps/mapRanking";

const POOL = ["ancient", "anubis", "cache", "dust2", "inferno", "mirage", "nuke"] as const;
let day = 0;
function m(map: string, rating: number, over: Partial<MapRankInput> = {}): MapRankInput {
  day += 1;
  return {
    map,
    playedAt: new Date(Date.UTC(2026, 10, 1) + day * 86_400_000).toISOString(),
    result: "win",
    kills: Math.round(rating * 20),
    deaths: 18,
    adr: 60 + rating * 20,
    kast: 60 + rating * 10,
    hsPercent: 40,
    rating,
    roundsPlayed: 24,
    ...over,
  };
}
const rep = (n: number, f: () => MapRankInput) => Array.from({ length: n }, f);

describe("rankMaps", () => {
  it("no matches → EMPTY, every pool map NO_DATA", () => {
    const r = rankMaps([], POOL, 6);
    expect(r.state).toBe("EMPTY");
    expect(r.best).toBeNull();
    expect(r.maps.map((x) => x.tier)).toEqual(Array(7).fill("NO_DATA"));
  });

  it("one match → INSUFFICIENT, never a best map", () => {
    const r = rankMaps([m("de_mirage", 1.4)], POOL, 6);
    expect(r.state).toBe("INSUFFICIENT");
    expect(r.best).toBeNull();
    expect(tierOf(r, "de_mirage")?.tier).toBe("PROVISIONAL");
  });

  it("two exceptional matches never beat a consistent sample", () => {
    const r = rankMaps(
      [
        ...rep(2, () => m("de_nuke", 1.9)),
        ...rep(8, () => m("de_mirage", 1.15)),
        ...rep(6, () => m("de_inferno", 0.9)),
      ],
      POOL,
      6,
    );
    expect(r.best?.map).toBe("mirage");
    expect(tierOf(r, "de_nuke")?.tier).toBe("PROVISIONAL");
    expect(tierOf(r, "de_nuke")?.estimate).toBeNull();
  });

  it("tiers: best, second, third, medians, develop; adapts to the number ranked", () => {
    const maps: Array<[string, number]> = [
      ["de_mirage", 1.4],
      ["de_inferno", 1.25],
      ["de_nuke", 1.1],
      ["de_ancient", 1.0],
      ["de_anubis", 0.95],
      ["de_dust2", 0.9],
      ["de_cache", 0.7],
    ];
    const r = rankMaps(
      maps.flatMap(([map, v]) => rep(5, () => m(map, v))),
      POOL,
      6,
    );
    expect(r.maps.map((x) => [x.map, x.tier])).toEqual([
      ["mirage", "BEST"],
      ["inferno", "SECOND"],
      ["nuke", "THIRD"],
      ["ancient", "MEDIAN"],
      ["anubis", "MEDIAN"],
      ["dust2", "MEDIAN"],
      ["cache", "DEVELOP"],
    ]);
    const three = rankMaps(
      maps.slice(0, 3).flatMap(([map, v]) => rep(4, () => m(map, v))),
      POOL,
      6,
    );
    expect(three.maps.slice(0, 3).map((x) => x.tier)).toEqual(["BEST", "SECOND", "THIRD"]);
    expect(three.maps.some((x) => x.tier === "DEVELOP")).toBe(false);
  });

  it("inconsistency lowers the rank (lower bound)", () => {
    const steady = rep(6, () => m("de_mirage", 1.2));
    const swingy = [1.9, 0.5, 1.9, 0.5, 1.9, 0.6].map((v) => m("de_inferno", v));
    const r = rankMaps([...steady, ...swingy, ...rep(6, () => m("de_nuke", 1.0))], POOL, 6);
    expect(r.best?.map).toBe("mirage");
  });

  it("missing values are never zero; incomplete matches and off-pool maps are excluded", () => {
    const r = rankMaps(
      [
        ...rep(3, () => m("de_mirage", 1.1, { adr: null, kast: null })),
        ...rep(3, () => m("de_nuke", 1.0)),
        m("de_nuke", 3, { roundsPlayed: 6 }),
        m("de_overpass", 3),
        m("de_nuke", 3, { rating: null }),
      ],
      POOL,
      6,
    );
    expect(r.eligibleMatches).toBe(6);
    const mirage = tierOf(r, "mirage")!;
    expect(mirage.adr).toBeNull();
    expect(mirage.kast).toBeNull();
    expect(tierOf(r, "overpass")).toBeNull();
  });

  it("is deterministic and recalculates when a new match arrives", () => {
    const base = [...rep(4, () => m("de_mirage", 1.2)), ...rep(4, () => m("de_nuke", 1.1))];
    expect(JSON.stringify(rankMaps(base, POOL, 6))).toBe(JSON.stringify(rankMaps(base, POOL, 6)));
    expect(rankMaps(base, POOL, 6).best?.map).toBe("mirage");
    const after = [...base, ...rep(6, () => m("de_nuke", 1.6))];
    expect(rankMaps(after, POOL, 6).best?.map).toBe("nuke");
  });

  it("confidence comes from the sample size only", () => {
    const r = rankMaps(
      [...rep(MAP_RANK_MIN_MATCHES, () => m("de_mirage", 1)), ...rep(10, () => m("de_nuke", 1))],
      POOL,
      6,
    );
    expect(tierOf(r, "mirage")?.confidence).toBe("PROVISIONAL");
    expect(tierOf(r, "nuke")?.confidence).toBe("HIGH");
  });
});
