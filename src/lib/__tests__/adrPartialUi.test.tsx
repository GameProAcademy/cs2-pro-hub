/**
 * UX-1.0 G2 — ADR coverage on screen: the PARTIAL marker (5 locales), the aggregate hint, the
 * table footnote, demo rows without enemy-hp shown as NOT MEASURED, and pooled numerators
 * without float noise.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { formatPooledPart } from "@/lib/format";
import { aggregate, shapeMatches, type OverviewMetricRow } from "@/lib/playerOverview";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { RealAggregates, RealMatchesTable } = await import("@/components/real/RealData");

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: React.ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );

const matchRow = (id: string) => ({
  id,
  map: "de_nuke",
  played_at: "2026-11-17T20:00:00Z",
  match_date: null,
  created_at: "2026-11-17T21:00:00Z",
  result: null,
  score_player: null,
  score_opponent: null,
  data_source: "demo",
});
const metric = (id: string, extra: Partial<OverviewMetricRow>): OverviewMetricRow => ({
  match_id: id,
  kills: 18,
  deaths: 17,
  assists: 3,
  adr: "111.40",
  kast: "79.2",
  hs_percent: "50",
  rating: "0.91",
  rounds_played: 24,
  ...extra,
});

const matches = shapeMatches(
  [
    metric("p", { damage_enemy_hp: 1998, damage_enemy_hp_excluded_hits: 1 }),
    metric("c", {
      adr: "123.50",
      rounds_played: 23,
      damage_enemy_hp: 1726,
      damage_enemy_hp_excluded_hits: 0,
    }),
    // A demo without enemy-hp: NOT MEASURED, never the historical 111.4.
    metric("n", { damage_enemy_hp: null }),
  ],
  [matchRow("p"), matchRow("c"), matchRow("n")] as never,
  [],
);

describe("ADR coverage on screen", () => {
  it("shapes demo rows from enemy-hp and leaves the uncovered demo NOT MEASURED", () => {
    const byId = Object.fromEntries(matches.map((m) => [m.matchId, m]));
    expect(byId["p"]).toMatchObject({ adr: 83.3, adrPartial: true });
    expect(byId["c"]).toMatchObject({ adr: 75, adrPartial: false });
    expect(byId["n"]!.adr).toBeNull();
    const a = aggregate(matches)!;
    expect(a.adrPartialMatches).toBe(1);
    expect(a.adr).toBeCloseTo((1998 + 1726) / 47, 6);
  });

  it.each(LOCALES)("marks the partial row, explains it and never shows 111,4 (%s)", (locale) => {
    const d = dictionaries[locale] as Record<string, string>;
    const html = render(<RealMatchesTable rows={matches} />, locale);
    expect(html.match(/data-adr-partial="true"/g)).toHaveLength(1);
    expect(html).toContain("data-adr-partial-note");
    expect(html).toContain(d["adr.partial"]!);
    expect(html).not.toMatch(/111[,.]4/);
    const agg = render(
      <RealAggregates overview={{ aggregates: aggregate(matches) } as never} />,
      locale,
    );
    expect(agg).toContain(d["adr.partialMatches"]!.split("{n}")[0]!);
  });

  it("every locale carries the partial-ADR texts", () => {
    for (const l of LOCALES) {
      const d = dictionaries[l] as Record<string, string>;
      for (const k of [
        "adr.partial",
        "adr.partial.hint",
        "adr.partialMatches",
        "adr.partialRounds",
      ])
        expect(d[k], `${l} ${k}`).toBeTruthy();
      expect(d["score.c.damage"]).not.toMatch(/ADR/);
    }
  });

  it("pooled numerators drop float noise but keep real fractions", () => {
    expect(formatPooledPart(24.996000000000002, "pt-BR")).toBe("25");
    expect(formatPooledPart(49.024, "pt-BR")).toBe("49");
    expect(formatPooledPart(54.43, "pt-BR")).toBe("54,4");
    expect(formatPooledPart(4850, "en")).toBe("4,850");
  });
});
