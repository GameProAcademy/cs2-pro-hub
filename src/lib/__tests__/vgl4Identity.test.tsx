/**
 * VGL 4.0 — Player Identity 2.0 and Map Experience. Ranks follow the signature (measured only);
 * the identity card shows the same index × 100 as the radar; the map panel lists the player's own
 * matches on that map with each match's own values; nothing is averaged.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";

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
const { dimensionRanks, IdentityCard, DimensionRank, latestSpecialties } =
  await import("@/components/cs2/IdentityKit");
const { matchesOnMap, MapIdentityPanel } = await import("@/components/cs2/MapIdentity");
const { PLAYER_OVERVIEW_QUERY_KEY } = await import("@/components/real/RealData");

const render = (node: ReactNode, seed?: (qc: QueryClient) => void) => {
  const qc = new QueryClient();
  seed?.(qc);
  return renderToString(
    <QueryClientProvider client={qc}>
      <I18nProvider initialLocale="pt-BR">{node}</I18nProvider>
    </QueryClientProvider>,
  );
};

const dims = [
  { dimension: "aim", value: 0.68 },
  { dimension: "dueling", value: 0.41 },
  { dimension: "survivability", value: 0.35 },
  { dimension: "decision_making", value: 0.8 },
  { dimension: "consistency", value: 0.66 },
  { dimension: "economy", value: null },
] as never[];

describe("dimension ranks", () => {
  it("rank among measured only, roles from the signature", () => {
    const r = dimensionRanks(dims);
    expect(r.get("decision_making")).toEqual({ rank: 1, of: 5, role: "top" });
    expect(r.get("consistency")).toEqual({ rank: 3, of: 5, role: "top" });
    expect(r.get("survivability")).toEqual({ rank: 5, of: 5, role: "low" });
    expect(r.has("economy")).toBe(false);
    expect(render(<DimensionRank rank={undefined} />)).toBe("");
    expect(render(<DimensionRank rank={{ rank: 2, of: 5, role: null }} />)).toContain("#2 de 5");
  });
});

describe("IdentityCard", () => {
  it("leads with the highest index and shows the same rounded values", () => {
    const html = render(<IdentityCard dims={dims} matches={10} rounds={216} />);
    expect(html).toContain('data-identity-card="decision_making"');
    expect(html).toContain(">80<");
    expect(html).toContain(">68<");
    expect(html).toContain(">66<");
    expect(html).toMatch(/5<!-- --> \/ <!-- -->6/);
    expect(html).toContain("216 rounds");
  });
  it("nothing measured: no card", () => {
    expect(
      render(
        <IdentityCard
          dims={[{ dimension: "aim", value: null }] as never}
          matches={1}
          rounds={null}
        />,
      ),
    ).toBe("");
  });
  it("specialties carry the measured count for the low ranks", () => {
    const s = latestSpecialties(
      [
        {
          createdAt: "2026-11-25T00:00:00Z",
          dnaVersion: "v3",
          state: "READY",
          matchCount: 10,
          roundCount: 1,
          dimensions: {
            aim: 68,
            dueling: 41,
            survivability: 35,
            decision_making: 80,
            consistency: 66,
          },
        },
      ],
      "v3",
    );
    expect(s?.measured).toBe(5);
  });
});

describe("Map identity", () => {
  const ms = [
    {
      matchId: "a",
      map: "de_mirage",
      playedAt: "2026-11-20T00:00:00Z",
      result: "win",
      kills: 20,
      deaths: 10,
      adr: 90.5,
    },
    {
      matchId: "b",
      map: "de_nuke",
      playedAt: "2026-11-21T00:00:00Z",
      result: null,
      kills: 5,
      deaths: 9,
      adr: null,
    },
    {
      matchId: "c",
      map: "de_mirage",
      playedAt: "2026-11-26T00:00:00Z",
      result: null,
      kills: null,
      deaths: 13,
      adr: 97,
    },
  ] as never[];
  it("own matches on the map, newest first, date span", () => {
    const on = matchesOnMap(ms, "de_mirage");
    expect(on.list.map((m: { matchId: string }) => m.matchId)).toEqual(["c", "a"]);
    expect(on.first).toBe("2026-11-20T00:00:00Z");
    expect(on.last).toBe("2026-11-26T00:00:00Z");
  });
  it("panel: count, each match's own values, unknown stays —", () => {
    const html = render(<MapIdentityPanel map="de_mirage" support="SUPPORTED" />, (qc) =>
      qc.setQueryData(PLAYER_OVERVIEW_QUERY_KEY, { state: "READY", matches: ms }),
    );
    expect(html).toContain('data-map-identity="de_mirage"');
    expect(html.match(/data-map-match=/g)).toHaveLength(2);
    expect(html).toContain("20 / 10");
    expect(html).toContain("ADR 90,5");
    expect(html).toContain("data-map-identity-radar");
    expect(html).not.toContain("null");
  });
  it("five locales for the new keys", () => {
    const keys = Object.keys(dictionaries["pt-BR"]).filter((k) => k.startsWith("vgl4."));
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"] as Locale[])
      for (const k of keys)
        expect(
          dictionaries[l][k as keyof (typeof dictionaries)["pt-BR"]],
          `${l} ${k}`,
        ).toBeTruthy();
  });
});
