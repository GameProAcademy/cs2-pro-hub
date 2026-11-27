/**
 * VGL 2.0 continuation — Performance and Evolution visuals. The ribbon lists the real matches
 * (oldest first, unknown result stays "—"); the combat HUD keeps null totals as "—"; the
 * "before → now" panel appears only for comparisons the report marks OK and never invents one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { buildEvolution } from "@/lib/evolution/evolution";
import type { OverviewMatch } from "@/lib/playerOverview";

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
const { EvolutionBody } = await import("@/components/real/RealEvolution");
const { MatchRibbon } = await import("@/components/cs2/PerformanceVisuals");

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
const noop = () => {};
let seq = 0;
const match = (o: Partial<OverviewMatch> = {}): OverviewMatch => {
  seq += 1;
  return {
    matchId: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    map: "de_mirage",
    playedAt: `2026-10-${String((seq % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    dateSource: "played",
    resultStatus: "UNKNOWN",
    result: null,
    scorePlayer: null,
    scoreOpponent: null,
    source: "demo",
    kills: 20,
    deaths: 10,
    assists: 5,
    adr: 80,
    kast: 70,
    hsPercent: 50,
    rating: 1.1,
    firstKills: 3,
    firstDeaths: 2,
    tradeKills: 2,
    flashAssists: 1,
    flashAssistMethod: "GAME_FLAG",
    utilityDamage: null,
    clutchAttempts: 0,
    clutchWins: 0,
    ctRating: 1.2,
    tRating: 1.0,
    roundsPlayed: 20,
    admission: null,
    limitations: [],
    ...o,
  };
};
const many = (n: number, o: Partial<OverviewMatch> = {}) =>
  Array.from({ length: n }, () => match(o));
const F = { window: 10 as const, map: null, side: "ALL" as const };

describe("VGL 2.0 Performance", () => {
  it("ribbon lists every match oldest first; unknown result is not invented", () => {
    const a = match({ playedAt: "2026-10-20T00:00:00Z", result: "win", resultStatus: "KNOWN" });
    const b = match({ playedAt: "2026-10-02T00:00:00Z", map: "de_nuke" });
    const html = render(<MatchRibbon matches={[a, b]} />);
    expect(html.match(/data-match-ribbon-item=/g)).toHaveLength(2);
    expect(html.indexOf("de_nuke")).toBeLessThan(html.indexOf("de_mirage"));
    expect(html).toContain('data-match-ribbon-item="unknown"');
    expect(html).toContain('data-match-ribbon-item="win"');
  });

  it("combat HUD reuses HudStat and the real totals; no new calculation", () => {
    const src = readFileSync(resolve("src/routes/_authenticated/performance.tsx"), "utf8");
    expect(src).toContain("data-combat-hud");
    expect(src).toMatch(/totals\.openingKills === null \? null/);
    expect(src).toMatch(/totals\.flashAssists === null \? null/);
    expect(src).toContain("performanceTotals(");
    for (const l of LOCALES) {
      expect(dictionaries[l]["vgl.perf.combat"]).toBeTruthy();
      expect(dictionaries[l]["vgl.perf.ribbon"]).toBeTruthy();
    }
  });
});

describe("VGL 2.0 Evolution before → now", () => {
  it.each(LOCALES)("only OK comparisons get a card (%s)", (loc) => {
    const prev = many(10, { kills: 10, playedAt: "2026-01-01T00:00:00Z" });
    const recent = many(10, { kills: 20, playedAt: "2026-06-01T00:00:00Z" });
    const rep = buildEvolution([...prev, ...recent], F);
    const html = render(
      <EvolutionBody r={{ status: "OK", report: rep }} search={{}} onSearch={noop} />,
      loc,
    );
    expect(html).toContain("data-period-compare");
    const okKeys = rep.metrics
      .filter((m) => m.comparison.status === "OK" && m.comparison.delta !== null)
      .map((m) => m.key);
    expect(okKeys).toContain("kd");
    expect(html.match(/data-period-metric=/g)).toHaveLength(okKeys.length);
    expect(html).toMatch(/data-period-metric="kd" data-period-direction="UP"/);
    for (const m of rep.metrics.filter((x) => !okKeys.includes(x.key)))
      expect(html).not.toContain(`data-period-metric="${m.key}"`);
  });

  it("no previous period: empty state, no invented delta", () => {
    const html = render(
      <EvolutionBody
        r={{ status: "OK", report: buildEvolution(many(7), F) }}
        search={{}}
        onSearch={noop}
      />,
    );
    expect(html).toContain("data-period-compare-empty");
    expect(html).not.toContain("data-period-metric=");
  });

  it("insufficient sample: the panel is not rendered at all", () => {
    const html = render(
      <EvolutionBody
        r={{ status: "OK", report: buildEvolution(many(2), F) }}
        search={{}}
        onSearch={noop}
      />,
    );
    expect(html).not.toContain("data-period-compare");
  });
});
