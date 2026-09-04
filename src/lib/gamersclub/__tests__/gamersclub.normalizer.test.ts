import { describe, expect, it } from "vitest";

import {
  dedupeGamersClubMatches,
  normalizeGamersClubMatch,
  normalizeGamersClubMatchStatus,
  normalizeGamersClubProfile,
  optionalNumber,
} from "../gamersclub.normalizer";

/** FIXTURE — test-only shapes. No production data is created from these. */
const FIXTURE_PROFILE = { id: "1879287", nickname: " zdr ", level: 0, wins: 0, matches: 12 };

describe("gamers club profile normalization", () => {
  it("keeps null as unknown and 0 as an observation", () => {
    const profile = normalizeGamersClubProfile(FIXTURE_PROFILE);
    expect(profile.externalId).toBe("1879287");
    expect(profile.nickname).toBe("zdr");
    expect(profile.level).toBe(0);
    expect(profile.wins).toBe(0);
    expect(profile.losses).toBeNull();
    expect(profile.rank).toBeNull();
    expect(profile.sourceVerifiedAccount).toBeNull();
    expect(profile.completeness).toBeGreaterThan(0);
    expect(profile.completeness).toBeLessThan(1);
  });

  it("never accepts a slug as a GCID", () => {
    expect(normalizeGamersClubProfile({ id: "zdr" }).externalId).toBeNull();
  });

  it("never turns missing numbers into zero", () => {
    expect(optionalNumber(undefined)).toBeNull();
    expect(optionalNumber(null)).toBeNull();
    expect(optionalNumber("")).toBeNull();
    expect(optionalNumber(0)).toBe(0);
  });
});

describe("gamers club match status semantics", () => {
  it("does not treat match_date as evidence of finished", () => {
    const match = normalizeGamersClubMatch({ id: "m1", match_date: "2026-09-01T10:00:00Z" });
    expect(match?.finished).toBe(false);
    expect(match?.terminal).toBe(false);
    expect(match?.sourceComplete).toBe(false);
    expect(match?.result).toBe("unknown");
  });

  it("marks finished only with positive evidence", () => {
    const byStatus = normalizeGamersClubMatchStatus("finished", null);
    expect(byStatus.finished).toBe(true);
    expect(byStatus.terminal).toBe(true);
    const byTimestamp = normalizeGamersClubMatchStatus(null, "2026-09-01T11:00:00Z");
    expect(byTimestamp.finished).toBe(true);
  });

  it("keeps cancelled/aborted terminal but never finished, and never a loss", () => {
    const cancelled = normalizeGamersClubMatch({ id: "m2", status: "cancelled", score_player: 3, score_opponent: 10 });
    expect(cancelled?.finished).toBe(false);
    expect(cancelled?.terminal).toBe(true);
    expect(cancelled?.result).toBe("cancelled");

    const aborted = normalizeGamersClubMatch({ id: "m3", status: "aborted", finished_at: "2026-09-01T11:00:00Z" });
    expect(aborted?.finished).toBe(false);
    expect(aborted?.result).toBe("aborted");
  });

  it("never infers a result without both scores", () => {
    const match = normalizeGamersClubMatch({ id: "m4", status: "finished", score_player: 16 });
    expect(match?.finished).toBe(true);
    expect(match?.result).toBe("unknown");
  });

  it("derives win/loss/draw only from finished matches with both scores", () => {
    expect(normalizeGamersClubMatch({ id: "a", status: "finished", score_player: 16, score_opponent: 9 })?.result).toBe("win");
    expect(normalizeGamersClubMatch({ id: "b", status: "finished", score_player: 9, score_opponent: 16 })?.result).toBe("loss");
    expect(normalizeGamersClubMatch({ id: "c", status: "finished", score_player: 15, score_opponent: 15 })?.result).toBe("draw");
  });

  it("finished never implies source_complete", () => {
    const match = normalizeGamersClubMatch({ id: "d", status: "finished", score_player: 16, score_opponent: 4 });
    expect(match?.finished).toBe(true);
    expect(match?.sourceComplete).toBe(false);
  });

  it("rejects a match without an id and fabricates no metrics", () => {
    expect(normalizeGamersClubMatch({ map: "mirage" })).toBeNull();
    const match = normalizeGamersClubMatch({ id: "e", map: "mirage" });
    expect(match?.kills).toBeNull();
    expect(match?.adr).toBeNull();
    expect(match?.kast).toBeNull();
  });
});

describe("idempotency", () => {
  it("dedupes by source + source_match_id", () => {
    const one = normalizeGamersClubMatch({ id: "m1", status: "finished" })!;
    const again = normalizeGamersClubMatch({ id: "m1", status: "finished" })!;
    const other = normalizeGamersClubMatch({ id: "m2", status: "finished" })!;
    const { unique, duplicates } = dedupeGamersClubMatches([one, again, other]);
    expect(unique).toHaveLength(2);
    expect(duplicates).toBe(1);
  });
});
