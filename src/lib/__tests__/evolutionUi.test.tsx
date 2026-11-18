/**
 * PM4 / 4.2.8 — evolution page states (static render, every locale): EMPTY, PARTIAL window with
 * the real N, INSUFFICIENT_SAMPLE blocks the numbers, NOT_MEASURED never shown as 0, consistency
 * and comparison statuses, incompatible flash methods, side filter note, drill-down links; plus the
 * strict input schema.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/config";
import { buildEvolution, type EvolutionFilters } from "@/lib/evolution/evolution";
import type { OverviewMatch } from "@/lib/playerOverview";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, search }: { children: ReactNode; search?: Record<string, unknown> }) => (
      <a data-search={search ? JSON.stringify(search) : undefined}>{children}</a>
    ),
  };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { EvolutionBody } = await import("@/components/real/RealEvolution");
const { evolutionInput } = await import("@/lib/evolution.functions");

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
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
const F = (o: Partial<EvolutionFilters> = {}): EvolutionFilters => ({
  window: 10,
  map: null,
  side: "ALL",
  ...o,
});
const ok = (ms: OverviewMatch[], f = F()) =>
  ({ status: "OK", report: buildEvolution(ms, f) }) as const;
const many = (n: number, o: Partial<OverviewMatch> = {}) =>
  Array.from({ length: n }, () => match(o));

describe("evolution page states", () => {
  it.each(LOCALES)("EMPTY and PARTIAL window render in %s", (loc) => {
    const empty = render(
      <EvolutionBody r={{ status: "EMPTY" }} search={{}} onSearch={noop} />,
      loc,
    );
    expect(empty).toContain('data-evolution-status="EMPTY"');
    expect(empty).toContain(esc(dictionaries[loc]["evolution.empty.description"]));
    const html = render(<EvolutionBody r={ok(many(7))} search={{}} onSearch={noop} />, loc);
    expect(html).toContain('data-window-status="PARTIAL"');
    expect(html).toContain(esc(dictionaries[loc]["evolution.window.partial"]));
    expect(html).toContain('data-metric="kd" data-metric-status="OK"');
    expect(html).toContain('data-consistency-status="OK"');
    expect(html).toContain('data-comparison-status="NO_PREVIOUS_PERIOD"');
    expect(html).toContain(esc(dictionaries[loc]["evolution.notCausal"]));
  });

  it("fewer than 3 matches: no numbers, only the insufficient-sample note", () => {
    const html = render(<EvolutionBody r={ok(many(2))} search={{}} onSearch={noop} />);
    expect(html).toContain('data-window-status="INSUFFICIENT_SAMPLE"');
    expect(html).not.toContain("data-evolution-table");
    expect(html).not.toContain("data-metric=");
  });

  it("a metric measured in no match is NOT_MEASURED, never 0", () => {
    const html = render(<EvolutionBody r={ok(many(5))} search={{}} onSearch={noop} />);
    expect(html).toContain('data-metric="clutchWinRate" data-metric-status="NO_SAMPLE"');
  });

  it("flash assists from two attribution methods are not pooled", () => {
    const ms = [...many(3), ...many(3, { flashAssistMethod: "TIMED_ATTRIBUTION" })];
    const html = render(<EvolutionBody r={ok(ms)} search={{}} onSearch={noop} />);
    expect(html).toContain(
      'data-metric="flashAssistsPerRound" data-metric-status="INCOMPATIBLE_METHODS"',
    );
  });

  it("comparison OK with 10 + 10 matches shows the change and both N", () => {
    const prev = many(10, { kills: 10, playedAt: "2026-01-01T00:00:00Z" });
    const recent = many(10, { kills: 20, playedAt: "2026-06-01T00:00:00Z" });
    const html = render(<EvolutionBody r={ok([...prev, ...recent])} search={{}} onSearch={noop} />);
    expect(html).toMatch(/data-metric="kd"[\s\S]*?data-comparison-status="OK"/);
    expect(html).toContain('data-delta="UP"');
  });

  it("side filter: only the rating and a note saying why", () => {
    const html = render(
      <EvolutionBody r={ok(many(5), F({ side: "CT" }))} search={{ side: "CT" }} onSearch={noop} />,
      "en",
    );
    expect(html).toContain('data-evolution-note="SIDE"');
    expect(html).toContain('data-metric="rating"');
    expect(html).not.toContain('data-metric="kd"');
  });

  it("each match in the window drills down to its rounds", () => {
    const ms = many(3);
    const html = render(<EvolutionBody r={ok(ms)} search={{}} onSearch={noop} />);
    const links = [...html.matchAll(/data-search="([^"]+)"/g)].map((m) =>
      JSON.parse(m[1]!.replace(/&quot;/g, '"')),
    );
    expect(links.map((l) => l.matchId).sort()).toEqual(ms.map((m) => m.matchId).sort());
  });
});

describe("evolution input", () => {
  it("is strict: window in 5/10/20/50, safe map key, side enum", () => {
    expect(evolutionInput.parse({})).toEqual({});
    expect(evolutionInput.parse({ window: 20, map: "de_nuke", side: "CT" })).toEqual({
      window: 20,
      map: "de_nuke",
      side: "CT",
    });
    expect(() => evolutionInput.parse({ window: 7 })).toThrow();
    expect(() => evolutionInput.parse({ map: "x' or 1=1" })).toThrow();
    expect(() => evolutionInput.parse({ playerId: "x" })).toThrow();
  });
});
