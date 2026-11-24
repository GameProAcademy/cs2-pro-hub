/**
 * UX-1.5 — five areas (R-08, M-3) and the Match Room (R-06, Doc. 2 §1, §3, §11).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { areaOf, navAreas, navItems } from "@/config/navigation";
import { dictionaries, type Locale } from "@/i18n/config";
import { MATCH_ROOM_TABS, roomTitle } from "@/components/real/RealMatchRoom";

const read = (p: string) => readFileSync(resolve(p), "utf8");
const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];

describe("five areas", () => {
  it("has exactly the five areas of the spec, in order", () => {
    expect(navAreas.map((a) => a.id)).toEqual(["home", "matches", "game", "training", "coach"]);
  });

  it("every current page is an area or a section of one (≤ 2 taps), except the account", () => {
    const reachable = new Set(
      navAreas.flatMap((a) => [a.to, ...(a.sections ?? []).map((s) => s.to)]),
    );
    const perMatch = ["/rounds", "/deaths", "/duels", "/utility", "/replay"]; // Match Room tabs
    for (const i of navItems) {
      if (i.to === "/profile" || perMatch.includes(i.to)) continue;
      expect(reachable.has(i.to), i.to).toBe(true);
    }
  });

  it.each([
    ["/dashboard", "home"],
    ["/matches", "matches"],
    ["/matches/0b6b7b0e-1111-4111-8111-111111111111", "matches"],
    ["/rounds", "matches"],
    ["/player-dna", "game"],
    ["/maps", "game"],
    ["/goals", "training"],
    ["/coach", "coach"],
  ])("%s belongs to %s", (path, id) => {
    expect(areaOf(path)?.id).toBe(id);
  });

  it("the account pages belong to no area", () => {
    expect(areaOf("/profile")).toBeNull();
    expect(areaOf("/upload")).toBeNull();
  });

  it.each(LOCALES)("area names and room texts exist (%s)", (l) => {
    const d = dictionaries[l] as Record<string, string>;
    for (const a of navAreas) expect(d[a.labelKey], a.labelKey).toBeTruthy();
    for (const tab of MATCH_ROOM_TABS) expect(d[`room.tab.${tab}`], tab).toBeTruthy();
    for (const k of ["room.result.unresolved", "room.strip.unknown", "room.date.processed"])
      expect(d[k], k).toBeTruthy();
  });

  it("M-3: the bottom bar shows the five areas with full labels and aria-current", () => {
    const shell = read("src/components/layout/AppShell.tsx");
    expect(shell).toContain("grid grid-cols-5");
    expect(shell).not.toContain('.split(" ").at(-1)');
    expect(shell).toContain('aria-current={isActive ? "page" : undefined}');
  });
});

describe("Match Room", () => {
  it("has the seven tabs of the spec", () => {
    expect(MATCH_ROOM_TABS).toEqual([
      "summary",
      "rounds",
      "duels",
      "deaths",
      "utility",
      "map",
      "replay",
    ]);
  });

  it("titles the room with the match itself", () => {
    expect(roomTitle({ map: "de_mirage", playedAt: "2026-11-17T14:08:00Z" }, "pt-BR")).toMatch(
      /^Mirage · /,
    );
  });

  it.each([
    ["rounds", "rounds"],
    ["duels", "duels"],
    ["utility", "utility"],
    ["deaths", "deaths"],
    ["replay", "replay"],
    ["maps", "map"],
  ])("the old /%s?matchId link redirects to the %s tab", (file, tab) => {
    const src = read(`src/routes/_authenticated/${file}.tsx`);
    expect(src).toContain('to: "/matches/$matchId"');
    expect(src).toContain(`tab: "${tab}"`);
    expect(src).toMatch(/if \(search\.matchId\)/);
  });

  it("adds no server function: the room reuses the pages and their queries", () => {
    const room = read("src/components/real/RealMatchRoom.tsx");
    expect(room).not.toContain("createServerFn");
    expect(room).toContain("<EmbeddedScope>");
    expect(room).toContain("roundsQueryKey({ matchId })");
  });
});
