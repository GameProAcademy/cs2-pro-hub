import { describe, expect, it } from "vitest";

import { getMapPerformanceDisplayContext } from "@/lib/cs2/mapPerformance";
import type { MapPerformance } from "@/types";

const NOW = "2026-08-01T00:00:00.000Z"; // pool V6 (Cache in, Overpass out)

function row(partial: Partial<MapPerformance> & { map: string }): MapPerformance {
  return { matches: 10, winRate: 50, rating: 1, adr: 80, ...partial };
}

describe("map performance display context", () => {
  it("marks a map valid on the match date but out of the current pool", () => {
    const ctx = getMapPerformanceDisplayContext(
      row({ map: "Overpass", matchDate: "2025-08-10T00:00:00.000Z" }),
      NOW,
    );
    expect(ctx.wasActiveAtMatchDate).toBe(true);
    expect(ctx.isCurrentlyActive).toBe(false);
    expect(ctx.isHistorical).toBe(true);
    expect(ctx.historicalPoolVersion).toBe(4);
    expect(ctx.displayLabel).toBe("Overpass*");
  });

  it("does not mark Overpass in 2026-08 as historical-valid (it left the pool)", () => {
    const ctx = getMapPerformanceDisplayContext(
      row({ map: "Overpass", matchDate: "2026-08-10T00:00:00.000Z" }),
      NOW,
    );
    expect(ctx.wasActiveAtMatchDate).toBe(false);
    expect(ctx.isHistorical).toBe(false);
    expect(ctx.isOutOfPool).toBe(true);
    expect(ctx.displayLabel).toBe("Overpass");
  });

  it("does not treat Cache before 2026-07-08 as an Active Duty map of that date", () => {
    const before = getMapPerformanceDisplayContext(
      row({ map: "Cache", matchDate: "2026-06-30T00:00:00.000Z" }),
      NOW,
    );
    expect(before.wasActiveAtMatchDate).toBe(false);
    expect(before.historicalPoolVersion).toBe(5);

    const after = getMapPerformanceDisplayContext(
      row({ map: "Cache", matchDate: "2026-07-09T00:00:00.000Z" }),
      NOW,
    );
    expect(after.wasActiveAtMatchDate).toBe(true);
    expect(after.isCurrentlyActive).toBe(true);
    expect(after.isHistorical).toBe(false);
  });

  it("handles Vertigo before and after it left the pool", () => {
    const valid = getMapPerformanceDisplayContext(
      row({ map: "de_vertigo", matchDate: "2024-06-01T00:00:00.000Z" }),
      NOW,
    );
    expect(valid.wasActiveAtMatchDate).toBe(true);
    expect(valid.isHistorical).toBe(true);
    expect(valid.displayLabel).toBe("Vertigo*");

    const gone = getMapPerformanceDisplayContext(
      row({ map: "Vertigo", matchDate: "2026-05-01T00:00:00.000Z" }),
      NOW,
    );
    expect(gone.wasActiveAtMatchDate).toBe(false);
    expect(gone.isOutOfPool).toBe(true);
  });

  it("resolves every pool boundary through the historical resolver", () => {
    const versions: Array<[string, number]> = [
      ["2023-09-27T00:00:00.000Z", 1],
      ["2024-04-25T00:00:00.000Z", 2],
      ["2025-01-28T00:00:00.000Z", 3],
      ["2025-07-16T00:00:00.000Z", 4],
      ["2026-01-21T00:00:00.000Z", 5],
      ["2026-07-08T00:00:00.000Z", 6],
    ];
    for (const [date, version] of versions) {
      expect(
        getMapPerformanceDisplayContext(row({ map: "Mirage", matchDate: date }), NOW)
          .historicalPoolVersion,
      ).toBe(version);
    }
  });

  it("never guesses when the match date is unknown", () => {
    const ctx = getMapPerformanceDisplayContext(row({ map: "Overpass" }), NOW);
    expect(ctx.matchDate).toBeNull();
    expect(ctx.wasActiveAtMatchDate).toBeNull();
    expect(ctx.isHistorical).toBe(false);
    expect(ctx.displayLabel).toBe("Overpass");
  });

  it("keeps unknown maps verbatim and out of the pool", () => {
    const ctx = getMapPerformanceDisplayContext(
      row({ map: "de_tuscan", matchDate: "2025-01-01T00:00:00.000Z" }),
      NOW,
    );
    expect(ctx.code).toBeNull();
    expect(ctx.isCurrentlyActive).toBe(false);
    expect(ctx.isOutOfPool).toBe(true);
    expect(ctx.displayLabel).toBe("de_tuscan");
  });

  it("treats absent data as absent, never as 0%", () => {
    const noMatches = getMapPerformanceDisplayContext(
      row({ map: "Nuke", matches: 0, winRate: null }),
      NOW,
    );
    expect(noMatches.hasData).toBe(false);
    expect(noMatches.winRate).toBeNull();

    const zeroWinRate = getMapPerformanceDisplayContext(
      row({ map: "Nuke", matches: 5, winRate: 0 }),
      NOW,
    );
    expect(zeroWinRate.hasData).toBe(true);
    expect(zeroWinRate.winRate).toBe(0);
  });

  it("normalises aliases before resolving the pool", () => {
    const ctx = getMapPerformanceDisplayContext(
      row({ map: "DUST II", matchDate: "2026-08-01T00:00:00.000Z" }),
      NOW,
    );
    expect(ctx.code).toBe("dust2");
    expect(ctx.isCurrentlyActive).toBe(true);
    expect(ctx.displayLabel).toBe("Dust II");
  });
});
