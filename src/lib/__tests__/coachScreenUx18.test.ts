import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coachSystemPrompt, parseCoachScreen, validateCoachInput } from "@/lib/coach/coachContext";
import { coachScreenFrom } from "@/lib/coach/coachScreen";
import { pickCoachMatch } from "@/lib/coach.functions";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OTHER = "99999999-9999-4999-8999-999999999999";

describe("UX-1.8 Coach screen context (R-11)", () => {
  it("client: area, room match and tab from the URL; nothing else leaves the browser", () => {
    expect(coachScreenFrom(`/matches/${A}`, {})).toEqual({
      area: "matches",
      matchId: A,
      tab: "summary",
    });
    expect(coachScreenFrom(`/matches/${A}`, { tab: "deaths", event: B })).toEqual({
      area: "matches",
      matchId: A,
      tab: "deaths",
    });
    expect(coachScreenFrom("/analysis", {})).toEqual({ area: "game", matchId: null, tab: null });
    expect(coachScreenFrom("/profile", {})).toBeNull();
    expect(coachScreenFrom("/rounds", { matchId: "not-a-uuid" })).toEqual({
      area: "matches",
      matchId: null,
      tab: null,
    });
  });

  it("server: allow-lists only; unknown area, tab or id is dropped", () => {
    expect(parseCoachScreen({ area: "admin" })).toBeNull();
    expect(parseCoachScreen("matches")).toBeNull();
    expect(parseCoachScreen({ area: "matches", matchId: "x' or 1=1", tab: "deaths" })).toEqual({
      area: "matches",
      matchId: null,
      tab: null,
    });
    expect(parseCoachScreen({ area: "matches", matchId: A, tab: "<script>" })).toEqual({
      area: "matches",
      matchId: A,
      tab: null,
    });
    const v = validateCoachInput({
      message: "e esta partida?",
      locale: "pt-BR",
      screen: { area: "matches", matchId: A, tab: "rounds", extra: "x" },
    });
    expect(v.ok && v.screen).toEqual({ area: "matches", matchId: A, tab: "rounds" });
  });

  it("server: a match id that is not the caller's own is ignored (most recent instead)", () => {
    const overview = {
      matches: [
        { matchId: A, playedAt: "2026-11-10T10:00:00Z" },
        { matchId: B, playedAt: "2026-11-17T10:00:00Z" },
      ],
    } as never;
    expect(pickCoachMatch(overview, A)?.matchId).toBe(A);
    expect(pickCoachMatch(overview, OTHER)?.matchId).toBe(B);
    expect(pickCoachMatch(overview, null)?.matchId).toBe(B);
  });

  it("the focus check happens before any match read, against the caller's own overview", () => {
    const src = readFileSync("src/lib/coach.functions.ts", "utf8");
    expect(src).toMatch(
      /overview\.matches\.find\(\(m\) => m\.matchId === input\.screen!\.matchId\)/,
    );
    expect(src).toContain("loadLatestMatchPlay(db, context.userId, overview, focus?.matchId)");
  });

  it("the prompt carries rule 33 and the facts never the raw match id", () => {
    const prompt = coachSystemPrompt("pt-BR");
    expect(prompt).toContain("33. Open screen");
    expect(prompt).toContain("when screen.matchInFocus is true, the match open on the screen");
    const src = readFileSync("src/lib/coach.functions.ts", "utf8");
    // The screen fact is built from map and date only.
    expect(src).toContain("match: focus ? coachMatchLabel(focus) : null");
    expect(src).toMatch(
      /return \{ map: m\.map \?\? null, date: m\.playedAt\.slice\(0, 10\), dateBasis: m\.dateSource \}/,
    );
  });
});
