/**
 * VGL 3.0 — Tactical Briefing. The X-ray rail counts the real items of each layer; the Coach map
 * context lists only maps the reply names that exist in the player's matches (with their count);
 * the Coach header is compact on phones; the DNA basis moved into "how to read" with the same text.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const { BriefingRail, CoachMapContext, citedMaps } = await import("@/components/cs2/BriefingKit");
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

describe("citedMaps", () => {
  it("maps named in the text, first mention order, no repeats", () => {
    expect(citedMaps("Na Mirage e na Nuke; de novo Mirage.")).toEqual(["de_mirage", "de_nuke"]);
    expect(citedMaps("Sem mapa aqui, 12 kills.")).toEqual([]);
  });
});

describe("CoachMapContext", () => {
  const seed = (maps: (string | null)[]) => (qc: QueryClient) =>
    qc.setQueryData(PLAYER_OVERVIEW_QUERY_KEY, {
      state: "READY",
      matches: maps.map((map, i) => ({
        matchId: `m${i}`,
        map,
        playedAt: `2026-11-2${i}T00:00:00Z`,
        kills: 10,
        deaths: 8,
      })),
    });

  it("only maps the text names AND the player has, with the real count", () => {
    const html = render(
      <CoachMapContext content="Na Mirage você foi bem; na Inferno e na Vertigo não sei." />,
      seed(["de_mirage", "de_mirage", "de_inferno", null]),
    );
    expect(html).toContain('data-coach-map-link="de_mirage"');
    expect(html).toContain('data-coach-map-link="de_inferno"');
    expect(html).not.toContain('data-coach-map-link="de_vertigo"');
    expect(html).toContain("2 partida(s) suas");
    expect(html).toContain("1 partida(s) suas");
  });

  it("no cited map or no overview: nothing", () => {
    expect(render(<CoachMapContext content="Sem mapa." />, seed(["de_mirage"]))).not.toContain(
      "data-coach-map-context",
    );
    expect(render(<CoachMapContext content="Mirage" />)).not.toContain("data-coach-map-context");
  });
});

describe("BriefingRail", () => {
  it("three steps with the real counts", () => {
    const html = render(
      <BriefingRail
        steps={[
          { id: "a", title: "Observado", icon: "crosshair", count: 6 },
          { id: "b", title: "Inferência", icon: "dna", count: 0 },
          { id: "c", title: "Recomendação", icon: "target", count: 2 },
        ]}
      />,
    );
    expect(html.match(/data-briefing-step=/g)).toHaveLength(3);
    expect(html).toContain('data-briefing-count="6"');
    expect(html).toContain('data-briefing-count="0"');
    expect(html).toContain('href="#a"');
  });
});

describe("source contracts and locales", () => {
  const src = (p: string) => readFileSync(resolve(p), "utf8");
  it("X-ray layers have anchors and the rail uses the diagnosis lists", () => {
    const x = src("src/components/real/RealXRay.tsx");
    expect(x).toContain("id={`xray-layer-${step}`}");
    expect(x).toContain("count: x.inferences.length");
    expect(x).toContain("count: x.recommendations.length");
  });
  it("Coach: compact header on phones, taller conversation, map context after the text", () => {
    expect(src("src/components/coach/RealCoachChat.tsx")).toContain(
      "<CoachText content={message.content} />\n            <CoachMapContext content={message.content} />",
    );
    expect(src("src/components/coach/CoachControls.tsx")).toContain(
      '<span className="max-sm:sr-only">',
    );
    expect(src("src/routes/_authenticated/coach.tsx")).toContain("max-lg:min-h-[420px]");
  });
  it("DNA basis keeps the same text inside 'how to read'", () => {
    const d = src("src/components/real/RealDna.tsx");
    expect(d).toContain("data-dna-basis");
    expect(d).toContain('t("real.dna.basis")');
  });
  it("five locales", () => {
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"] as Locale[])
      for (const k of [
        "vgl3.briefing.label",
        "vgl3.coach.maps",
        "vgl3.coach.mapMatches",
        "vgl3.dna.basis",
      ] as const)
        expect(dictionaries[l][k], `${l} ${k}`).toBeTruthy();
  });
});
