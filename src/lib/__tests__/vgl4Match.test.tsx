/**
 * VGL 4.0 — Match Experience 2.0. Radar markers are exactly the heatmap points of the selected
 * round (kills and deaths, tick order, nothing else); the economy bars follow the buy label and stay
 * dashed when unknown; the overview keeps null as "—"; strings exist in five locales.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import type { RoundReport } from "@/lib/rounds/roundImpact";
import type { HeatmapPoint } from "@/lib/spatial/heatmap";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, className }: { children: ReactNode; className?: string }) => (
      <a className={className}>{children}</a>
    ),
  };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { radarMarkers, defaultFocusRound, buyLevel, EconomyDuel, RoundRadar } =
  await import("@/components/cs2/RoundFocus");
const { MatchOverview, TabIntro, ROOM_DETAIL_TABS } =
  await import("@/components/cs2/MatchOverview");

const render = (node: ReactNode) =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale="pt-BR">{node}</I18nProvider>
    </QueryClientProvider>,
  );

const pt = (id: string, round: number, tick: number | null): HeatmapPoint => ({
  id,
  matchId: "m",
  round,
  tick,
  side: "CT",
  weapon: "ak47",
  headshot: true,
  x: 100,
  y: 200,
  cell: 0,
});

const round = (o: Partial<RoundReport> = {}): RoundReport =>
  ({
    roundNumber: 1,
    valid: true,
    side: "CT",
    won: true,
    economy: { teams: {}, player: null },
    opening: { status: "NO_DEATH" },
    timeline: [],
    ...o,
  }) as unknown as RoundReport;

describe("radarMarkers", () => {
  it("only the selected round, kills and deaths together, numbered by tick", () => {
    const m = radarMarkers(
      7,
      [pt("k1", 7, 300), pt("k2", 6, 100), pt("k3", 7, 100)],
      [pt("d1", 7, 200), pt("d2", 8, 50)],
    );
    expect(m.map((x) => [x.n, x.kind, x.id])).toEqual([
      [1, "KILL", "KILL-k3"],
      [2, "DEATH", "DEATH-d1"],
      [3, "KILL", "KILL-k1"],
    ]);
    expect(m.every((x) => x.round === 7 && x.x === 100 && x.y === 200)).toBe(true);
  });
  it("no data: no marker", () => {
    expect(radarMarkers(1, undefined, undefined)).toEqual([]);
  });
});

describe("round focus helpers", () => {
  it("default round is the first valid one with a side", () => {
    expect(
      defaultFocusRound([round({ roundNumber: 1, valid: false }), round({ roundNumber: 2 })]),
    ).toBe(2);
    expect(defaultFocusRound([])).toBeNull();
  });
  it("buy level follows the label; unknown is null", () => {
    expect(buyLevel({ status: "CLASSIFIED", category: "full_buy", scaled: false })).toBe(4);
    expect(buyLevel({ status: "CLASSIFIED", category: "eco", scaled: false })).toBe(1);
    expect(buyLevel({ status: "UNKNOWN", reason: "SPEND_NOT_RECORDED" })).toBeNull();
    expect(buyLevel(undefined)).toBeNull();
  });
  it("economy duel: classified bars filled, unknown dashed, no side → nothing", () => {
    const html = render(
      <EconomyDuel
        round={round({
          economy: {
            teams: {
              CT: { label: { status: "CLASSIFIED", category: "half_buy", scaled: false } },
              T: { label: { status: "UNKNOWN", reason: "SPEND_NOT_RECORDED" } },
            },
            player: null,
          } as never,
        })}
      />,
    );
    expect(html).toContain('data-buy-level="3"');
    expect(html).toContain('data-buy-level="unknown"');
    expect(render(<EconomyDuel round={round({ side: null })} />)).toBe("");
  });
  it("radar: a map without validated radar says so instead of drawing", () => {
    const html = render(<RoundRadar matchId="m" map={null} round={1} />);
    expect(html).toContain("data-radar-note");
    expect(html).not.toContain("data-round-radar=");
  });
});

describe("MatchOverview and TabIntro", () => {
  it("null fields are —, never 0", () => {
    const html = render(
      <MatchOverview
        m={
          {
            matchId: "m",
            kills: 18,
            deaths: 13,
            assists: null,
            ctRating: 1.2,
            tRating: null,
            firstKills: 2,
            firstDeaths: null,
            tradeKills: 1,
            flashAssists: 0,
          } as never
        }
      />,
    );
    expect(html).toContain("18 / 13 / —");
    expect(html).toContain("1,20");
    expect(html.match(/data-overview-link=/g)).toHaveLength(ROOM_DETAIL_TABS.length);
  });
  it("the match overview rounds shortcut is labeled Rounds in every locale", () => {
    for (const locale of ["pt-BR", "pt-PT", "en", "es", "fr"] as Locale[])
      expect(dictionaries[locale]["vgl4.tabIntro.rounds.title"]).toBe("Rounds");
  });
  it("tab intros and new strings in five locales", () => {
    expect(render(<TabIntro tab="rounds" />)).toContain('data-tab-intro="rounds"');
    const keys = Object.keys(dictionaries["pt-BR"]).filter((k) => k.startsWith("vgl4."));
    expect(keys.length).toBeGreaterThanOrEqual(36);
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"] as Locale[])
      for (const k of keys)
        expect(
          dictionaries[l][k as keyof (typeof dictionaries)["pt-BR"]],
          `${l} ${k}`,
        ).toBeTruthy();
  });
});
