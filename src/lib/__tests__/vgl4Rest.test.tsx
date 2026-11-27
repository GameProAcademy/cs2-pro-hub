/**
 * VGL 4.0 — Performance highlights (each match's own rating; ties and < 2 rated show nothing),
 * the DNA snapshot timeline (same method only, missing index dashed), moments grouped by match in
 * the same order, the home command row and the admin indicators.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { DNA_VERSION_V3 } from "@/lib/playerDnaV3";

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
const { ratingExtremes, HighlightPair, HomeCommandRow } = await import("@/components/cs2/HudKit");
const { SnapshotTimeline } = await import("@/components/cs2/IdentityKit");
const { groupByMatch } = await import("@/components/moments/RealMoments");

const render = (node: ReactNode, seed?: (qc: QueryClient) => void) => {
  const qc = new QueryClient();
  seed?.(qc);
  return renderToString(
    <QueryClientProvider client={qc}>
      <I18nProvider initialLocale="pt-BR">{node}</I18nProvider>
    </QueryClientProvider>,
  );
};
const m = (id: string, rating: number | null, map = "de_mirage") =>
  ({
    matchId: id,
    rating,
    map,
    playedAt: `2026-11-2${id.length}T00:00:00Z`,
    kills: 10,
    deaths: 5,
  }) as never;

describe("rating highlights", () => {
  it("highest and lowest, each the match's own value", () => {
    const ex = ratingExtremes([m("a", 1.1), m("bb", 0.35), m("ccc", 1.65), m("dddd", null)]);
    expect(ex?.high?.matchId).toBe("ccc");
    expect(ex?.low?.matchId).toBe("bb");
  });
  it("tie on a side → no match on that side; < 2 rated or all equal → nothing", () => {
    expect(ratingExtremes([m("a", 1.5), m("b", 1.5), m("c", 0.5)])?.high).toBeNull();
    expect(ratingExtremes([m("a", 1.0)])).toBeNull();
    expect(ratingExtremes([m("a", 1.0), m("b", 1.0)])).toBeNull();
    expect(render(<HighlightPair matches={[m("a", 1.0)]} />)).toBe("");
    const html = render(<HighlightPair matches={[m("a", 1.1), m("b", 0.4)]} />);
    expect(html).toContain("1,10");
    expect(html).toContain("0,40");
  });
});

describe("snapshot timeline", () => {
  it("only the current method's READY snapshots, newest first, missing index dashed", () => {
    const html = render(<SnapshotTimeline />, (qc) =>
      qc.setQueryData(
        ["player", "dna", "history"],
        [
          {
            createdAt: "2026-11-24T00:00:00Z",
            dnaVersion: DNA_VERSION_V3,
            state: "READY",
            matchCount: 3,
            roundCount: 1,
            dimensions: { aim: 70 },
          },
          {
            createdAt: "2026-11-26T00:00:00Z",
            dnaVersion: DNA_VERSION_V3,
            state: "READY",
            matchCount: 10,
            roundCount: 1,
            dimensions: { aim: 68 },
          },
          {
            createdAt: "2026-11-25T00:00:00Z",
            dnaVersion: "old",
            state: "READY",
            matchCount: 5,
            roundCount: 1,
            dimensions: { aim: 1 },
          },
        ],
      ),
    );
    expect(html.match(/data-snapshot="/g)).toHaveLength(2);
    expect(html.indexOf("2026-11-26")).toBeLessThan(html.indexOf("2026-11-24"));
    expect(html).toContain("border-dashed");
  });
  it("no snapshot: nothing", () => {
    expect(
      render(<SnapshotTimeline />, (qc) => qc.setQueryData(["player", "dna", "history"], [])),
    ).toBe("");
  });
});

describe("moments grouped by match", () => {
  it("consecutive moments of a match together, order unchanged", () => {
    const g = groupByMatch([
      { id: "1", matchId: "a", map: "de_nuke" },
      { id: "2", matchId: "a", map: "de_nuke" },
      { id: "3", matchId: null, map: null },
      { id: "4", matchId: "a", map: "de_nuke" },
    ] as never);
    expect(g.map((x: { items: { id: string }[] }) => x.items.map((i) => i.id))).toEqual([
      ["1", "2"],
      ["3"],
      ["4"],
    ]);
  });
});

describe("home and admin", () => {
  it("home command row: training state from the plan's own integers, maps played", () => {
    const html = render(
      <HomeCommandRow matches={[m("a", 1), m("b", 1, "de_nuke"), m("c", 1)]} />,
      (qc) =>
        qc.setQueryData(["player", "training", "adaptive"], {
          plan: { status: "ACTIVE", adherence: { done: 0, due: 4 } },
        }),
    );
    expect(html).toContain("0 / 4");
    expect(html).toContain("2 mapa(s) jogado(s)");
  });
  it("admin indicators keep their values and gain an icon", () => {
    const a = readFileSync(resolve("src/routes/_authenticated/admin/index.tsx"), "utf8");
    expect(a).toMatch(/<StatCard\s+icon={Users}/);
    expect(a).toContain("{value}</p>");
  });
});
