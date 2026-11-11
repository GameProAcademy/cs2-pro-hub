/**
 * Fase 1 — UX e clareza: glossary, honest "not available" values, locale formatting, the
 * CS2 PRO Score context and the training access note. SSR renders the real components.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MetricCard } from "@/components/common/MetricCard";
import { GlossaryList, MetricTerm } from "@/components/common/MetricTerm";
import { FLASH_ASSIST_WINDOW_SECONDS, TRADE_WINDOW_SECONDS } from "@/config/pipeline";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { uxPtBR } from "@/i18n/locales/ux/pt-BR";
import { formatDate, formatNumber, NOT_AVAILABLE_MARK } from "@/lib/format";
import { METRIC_IDS, fillGlossary, glossaryKeys } from "@/lib/glossary";
import { performanceSeries } from "@/lib/performanceSeries";
import type { OverviewMatch, PlayerOverview } from "@/lib/playerOverview";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});

const { RealAggregates, RealMatchesTable } = await import("@/components/real/RealData");

const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];
const read = (p: string) => readFileSync(resolve(p), "utf8");

function render(node: React.ReactNode, locale: Locale = "pt-BR") {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
}

function match(over: Partial<OverviewMatch> = {}): OverviewMatch {
  return {
    matchId: "m1",
    playedAt: "2026-10-21T18:00:00.000Z",
    dateSource: "played",
    resultStatus: "KNOWN",
    utilityDamage: null,
    clutchAttempts: null,
    clutchWins: null,
    ctRating: null,
    tRating: null,
    map: "de_mirage",
    result: "win",
    scorePlayer: 13,
    scoreOpponent: 9,
    kills: 20,
    deaths: 15,
    adr: 84.25,
    kast: 72.5,
    hsPercent: 45,
    rating: 1.12,
    admission: "CERTIFIED",
    limitations: [],
    ...over,
  } as OverviewMatch;
}

describe("glossary", () => {
  it("every canonical metric has label, short label and definition in the 5 locales", () => {
    for (const locale of LOCALES) {
      const dict = dictionaries[locale] as Record<string, string>;
      for (const id of METRIC_IDS) {
        for (const key of Object.values(glossaryKeys(id))) {
          expect(dict[key]?.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
        }
      }
      for (const key of Object.keys(uxPtBR)) {
        expect(dict[key]?.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("windows in definitions come from the engine configuration, never typed in", () => {
    for (const locale of LOCALES) {
      const dict = dictionaries[locale] as Record<string, string>;
      expect(dict["glossary.kast.definition"]).toContain("{tradeWindow}");
      expect(dict["glossary.tradeKills.definition"]).toContain("{tradeWindow}");
      expect(dict["glossary.flashAssists.definition"]).toContain("{flashWindow}");
      expect(fillGlossary(dict["glossary.kast.definition"]!)).toContain(
        `${TRADE_WINDOW_SECONDS} s`,
      );
      expect(fillGlossary(dict["glossary.flashAssists.definition"]!)).toContain(
        `${FLASH_ASSIST_WINDOW_SECONDS} s`,
      );
    }
  });

  it("the match rating is never presented as the CS2 PRO Score or HLTV Rating", () => {
    for (const locale of LOCALES) {
      const def = (dictionaries[locale] as Record<string, string>)["glossary.rating.definition"]!;
      expect(def).toContain("HLTV");
      expect(def).toContain("CS2 PRO Score");
    }
  });

  it("MetricTerm exposes an accessible trigger for the definition", () => {
    const html = render(<MetricTerm id="kast" />);
    expect(html).toContain("KAST");
    expect(html).toContain('aria-label="O que é KAST?"');
    expect(html).toContain('data-glossary-term="kast"');
    // WCAG 2.2 AA 2.5.8: the trigger's hit area is at least 24×24 px.
    expect(html).toMatch(/class="[^"]*\bsize-6\b[^"]*"[^>]*data-glossary-term/);
    const en = render(<MetricTerm id="adr" variant="label" />, "en");
    expect(en).toContain("ADR (average damage per round)");
  });

  it("the glossary list renders every metric with its filled definition", () => {
    const html = render(<GlossaryList ids={METRIC_IDS} />);
    for (const id of METRIC_IDS) expect(html).toContain(`data-glossary-entry="${id}"`);
    expect(html).not.toContain("{tradeWindow}");
    expect(html).not.toContain("{flashWindow}");
  });
});

describe("not available is never zero", () => {
  it("MetricCard shows a dash, announces it and explains it", () => {
    const html = render(<MetricCard label="ADR" value={null} unit="%" showDemoTag={false} />);
    expect(html).toContain(NOT_AVAILABLE_MARK);
    expect(html).toContain('class="sr-only">Não disponível');
    expect(html).toContain("Sem dados suficientes");
    expect(html).toContain('data-metric-missing="true"');
    expect(html).not.toContain(">%<");
    expect(html).not.toMatch(/>0</);
  });

  it("a measured zero stays zero", () => {
    const html = render(<MetricCard label="Trades" value={0} showDemoTag={false} />);
    expect(html).toContain(">0<");
    expect(html).not.toContain("data-metric-missing");
  });

  it("aggregates with unknown values render not-available, not 0", () => {
    const overview = {
      aggregates: {
        matches: 2,
        kd: null,
        adr: null,
        kast: null,
        hsPercent: null,
        rating: null,
        wins: 0,
        decided: 0,
        limited: 0,
      },
    } as unknown as PlayerOverview;
    const html = render(<RealAggregates overview={overview} />);
    expect((html.match(/data-metric-missing="true"/g) ?? []).length).toBe(4);
  });

  it("table cells for unknown values are announced", () => {
    const html = render(
      <RealMatchesTable rows={[match({ adr: null, kast: null, rating: null })]} />,
    );
    expect((html.match(/class="sr-only">Não disponível/g) ?? []).length).toBe(3);
  });
});

describe("locale formatting", () => {
  it("numbers use the locale decimal separator", () => {
    expect(formatNumber(84.25, "pt-BR", 1)).toBe("84,3");
    expect(formatNumber(84.25, "en-US", 1)).toBe("84.3");
    expect(formatNumber(null, "pt-BR", 1)).toBe(NOT_AVAILABLE_MARK);
    expect(formatNumber(Number.NaN, "en-US", 1)).toBe(NOT_AVAILABLE_MARK);
  });

  it("dates follow the locale", () => {
    expect(formatDate("2026-10-21T18:00:00.000Z", "pt-BR")).toBe("21/10/2026");
    expect(formatDate("2026-10-21T18:00:00.000Z", "en-US")).toBe("10/21/26");
    expect(formatDate(null, "pt-BR")).toBe(NOT_AVAILABLE_MARK);
  });

  it("the matches table shows localized date and decimals", () => {
    const pt = render(<RealMatchesTable rows={[match()]} />);
    expect(pt).toContain("21/10/2026");
    expect(pt).toContain("84,3");
    expect(pt).toContain("1,12");
    const en = render(<RealMatchesTable rows={[match()]} />, "en");
    expect(en).toContain("10/21/26");
    expect(en).toContain("84.3");
    expect(en).not.toContain("2026-10-21<");
  });

  it("chart labels follow the locale", () => {
    expect(performanceSeries([match()], "en-US")[0]?.label).toBe("10/21 mirage");
    expect(performanceSeries([match()], "pt-BR")[0]?.label).toBe("21/10 mirage");
  });
});

describe("wiring", () => {
  it("Performance explains the CS2 PRO Score and lists the glossary", () => {
    const page = read("src/routes/_authenticated/performance.tsx");
    const real = page.slice(
      page.indexOf("function RealPerformancePage"),
      page.indexOf("function PerformancePage"),
    );
    expect(real).toContain("<ProScoreContext />");
    expect(page).toContain('id="cs2-pro-score"');
    expect(real).toContain("<GlossaryList ids={METRIC_IDS} />");
    expect(real).toContain('<MetricTerm id="openingKills" variant="label" />');
  });

  it("the Dashboard Pro Score panel links to its explanation", () => {
    // Fundação 4.2: the panel is now the real Score card; the link lives in that component.
    expect(read("src/routes/_authenticated/dashboard.tsx")).toContain("<RealProScoreCard />");
    expect(read("src/components/real/RealProScore.tsx")).toContain(
      '<Link to="/performance" hash="cs2-pro-score">',
    );
  });

  it("training explains where lessons open and that progress is not tracked here", () => {
    expect(read("src/components/training/RealTrainingPlan.tsx")).toContain(
      't("training.real.accessNote")',
    );
    expect(uxPtBR["training.real.accessNote"]).toContain("hub.gamepro.academy");
  });

  it("the limited-admission badge uses the warning token, not raw palette colours", () => {
    const data = read("src/components/real/RealData.tsx");
    expect(data).not.toMatch(/amber-\d{3}/);
    expect(data).toContain("text-warning");
  });

  it("no raw ISO slicing for display dates in real-data components", () => {
    const data = read("src/components/real/RealData.tsx");
    expect(data).not.toContain("playedAt.slice(0, 10)");
    expect(data).not.toContain("queuedAt.slice(0, 16)");
  });
});
