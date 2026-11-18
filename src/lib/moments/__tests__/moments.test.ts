/** PM5 4.2.10 — `cs2.moments.v1` pure rules: tags, range inside the round, cursor, deep link. */
import { describe, expect, it } from "vitest";

import {
  MAX_RANGE_TICKS,
  POST_TICKS,
  PRE_TICKS,
  checkRange,
  decodeCursor,
  encodeCursor,
  normalizeTags,
  replaySearch,
} from "@/lib/moments/moments";

const round = { roundNumber: 3, startTick: 10_000, endTick: 20_000 };

describe("tags", () => {
  it("trims, lowercases and de-duplicates; accented letters allowed", () => {
    expect(normalizeTags(["  Abertura ", "abertura", "Revisão", ""])).toEqual({
      ok: true,
      tags: ["abertura", "revisão"],
    });
  });
  it("rejects invalid characters and more than 12 tags (never silently changed)", () => {
    expect(normalizeTags(["<script>"])).toEqual({ ok: false });
    expect(normalizeTags(Array.from({ length: 13 }, (_, i) => `t${i}`))).toEqual({ ok: false });
  });
});

describe("range inside the round", () => {
  it("a single tick becomes a clamped window around it", () => {
    expect(checkRange(round, 15_000, undefined)).toEqual({
      ok: true,
      tickStart: 15_000 - PRE_TICKS,
      tickEnd: 15_000 + POST_TICKS,
    });
    expect(checkRange(round, 10_010, undefined)).toEqual({
      ok: true,
      tickStart: 10_000,
      tickEnd: 10_010 + POST_TICKS,
    });
  });
  it("an explicit valid range is kept as typed", () => {
    expect(checkRange(round, 11_000, 12_000)).toEqual({
      ok: true,
      tickStart: 11_000,
      tickEnd: 12_000,
    });
  });
  it.each([
    [round, 9_000, undefined, "OUT_OF_ROUND"],
    [round, 19_000, 21_000, "OUT_OF_ROUND"],
    [round, 12_000, 11_000, "INVERTED"],
    [{ roundNumber: 1, startTick: 0, endTick: 100_000 }, 0, MAX_RANGE_TICKS + 1, "TOO_LONG"],
    [undefined, 1, undefined, "ROUND_NOT_FOUND"],
    [{ roundNumber: 1, startTick: null, endTick: 10 }, 1, undefined, "ROUND_BOUNDARY_UNKNOWN"],
  ] as const)("invalid range → %s", (r, s, e, reason) => {
    expect(checkRange(r, s, e)).toEqual({ ok: false, reason });
  });
});

describe("cursor and deep link", () => {
  it("round-trips and rejects tampered cursors", () => {
    const c = encodeCursor("2026-11-18T01:00:00.123+00:00", "11111111-1111-4111-8111-111111111111");
    expect(decodeCursor(c)).toEqual({
      createdAt: "2026-11-18T01:00:00.123+00:00",
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(decodeCursor("x|y")).toBeNull();
    expect(decodeCursor("2026-11-18T01:00:00Z|11111111-1111-4111-8111-111111111111|z")).toBeNull();
  });
  it("opens the replay on its own match, round and first tick", () => {
    expect(replaySearch({ matchId: "m", roundNumber: 4, tickStart: 123 })).toEqual({
      matchId: "m",
      round: 4,
      tick: 123,
    });
  });
});
