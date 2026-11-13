/**
 * PM1 / 4.2.2 — heatmap page states (static render, every locale): empty, unsupported map,
 * NOT_OBSERVED, UNAVAILABLE (no positions), PARTIAL with coverage, radar background from the
 * asset registry, drill-down to round/tick, absence never shown as 0.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/config";
import type { PlayerRound } from "@/lib/roundContext";
import { buildHeatmap, type HeatmapEventRow } from "@/lib/spatial/heatmap";
import { MAP_OVERVIEWS } from "@/lib/spatial/maps";
import { RADAR_ASSETS, radarAsset } from "@/lib/spatial/radarAssets";
import type { SpatialHeatmapResponse } from "@/lib/spatial.functions";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: ReactNode }) => <a>{children}</a> };
});
const { HeatmapBody, DrillDown } = await import("@/components/real/RealHeatmap");

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );

const dust2 = MAP_OVERVIEWS["de_dust2"]!;
const w = (rx: number, ry: number) => ({
  x: rx * dust2.scale + dust2.posX,
  y: dust2.posY - ry * dust2.scale,
  z: 0,
});
const ME = "1";
const rounds: PlayerRound[] = Array.from({ length: 24 }, (_, i) => ({
  round: i + 1,
  side: i < 12 ? "T" : "CT",
  outcome: "UNKNOWN",
  kills: 0,
  deaths: 0,
  damage: 0,
}));
let n = 0;
const death = (round: number, data: unknown): HeatmapEventRow => ({
  id: `e${++n}`,
  matchId: "m1",
  round,
  tick: 5000 + n,
  type: "kill",
  actor: "2",
  victim: ME,
  weapon: "awp",
  headshot: true,
  data,
});
const response = (events: HeatmapEventRow[], map = "de_dust2"): SpatialHeatmapResponse => ({
  maps: [{ map, support: map === "de_dust2" ? "SUPPORTED" : "NOT_VALIDATED", matches: 1 }],
  matches: [{ matchId: "m1", playedAt: "2026-11-12T10:00:00Z", dateSource: "processed" }],
  heatmap: buildHeatmap([{ matchId: "m1", map, participantKey: ME, rounds, events }], {
    map,
    layer: "DEATHS",
    side: "ALL",
    level: "default",
  }),
});
const body = (r: SpatialHeatmapResponse, locale?: Locale) =>
  render(<HeatmapBody r={r} search={{}} onSearch={() => {}} />, locale);

describe("states", () => {
  it("no match at all: empty state", () => {
    const html = body({ maps: [], matches: [], heatmap: null });
    expect(html).toContain(dictionaries["pt-BR"]["spatial.empty.title"]);
  });

  it("unvalidated map: nothing drawn, says why", () => {
    const html = body(response([death(1, { victim_position: w(10, 10) })], "de_mirage"));
    expect(html).toContain('data-map-support="NOT_VALIDATED"');
    expect(html).not.toContain("data-heatmap-svg");
    expect(html).toContain("Mirage");
  });

  it("no eligible event: NOT_OBSERVED text, no zero", () => {
    const html = body(response([]));
    expect(html).toContain('data-status-note="NOT_OBSERVED"');
    expect(html).not.toContain("data-heatmap-svg");
    expect(html).not.toMatch(/data-coverage[^>]*>0/);
  });

  it("events without positions: UNAVAILABLE, reason listed, nothing at (0,0)", () => {
    const html = body(response([death(1, {}), death(2, {})]));
    expect(html).toContain('data-heatmap-status="UNAVAILABLE"');
    expect(html).toContain(dictionaries["pt-BR"]["spatial.excluded.MISSING"]);
    expect(html).not.toContain('cx="0"');
  });

  it("partial coverage shows N/denominator, the radar background and the points", () => {
    const html = body(response([death(1, { victim_position: w(100, 200) }), death(13, {})]));
    expect(html).toContain('data-heatmap-status="PARTIAL"');
    expect(html).toMatch(/data-coverage[^>]*>1<!-- -->\/<!-- -->2</);
    expect(html).toContain('data-radar-asset="/radars/cs2/de_dust2-default.png"');
    expect(html).toContain('cx="100"');
    expect(html).toContain('data-per-round="INSUFFICIENT_SAMPLE"');
    // Layers the data cannot support are listed as not measured.
    expect(html).toContain("data-not-measured");
  });

  it.each(LOCALES)("%s renders without missing keys", (locale) => {
    const html = body(response([death(1, { victim_position: w(100, 200) })]), locale);
    expect(html).not.toMatch(/spatial\.[a-zA-Z]+\.[A-Za-z_.]+/);
  });
});

describe("drill-down", () => {
  it("lists the round, tick, side and weapon of the selected cell; absent tick is —", () => {
    const r = response([
      death(3, { victim_position: w(100, 200) }),
      { ...death(14, { victim_position: w(101, 201) }), tick: null },
    ]).heatmap!;
    const cell = r.points[0]!.cell;
    const html = render(<DrillDown h={r} cell={cell} matches={[]} />);
    expect(html).toContain('data-event-round="3"');
    expect(html).toContain('data-event-round="14"');
    expect(html).toContain(">awp<");
    expect(html).toContain(">—<");
  });
});

describe("radar assets are decoupled and traceable", () => {
  it("every asset is a 1024 radar frame with source and hashes; levels exist for two-level maps", () => {
    for (const a of RADAR_ASSETS) {
      expect(a.src).toBe(`/radars/cs2/${a.map}-${a.level}.png`);
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.sourcePath).toMatch(/^panorama\/images\/overheadmaps\/de_\w+_radar_psd\.vtex_c$/);
      expect(MAP_OVERVIEWS[a.map]).toBeDefined();
    }
    for (const o of Object.values(MAP_OVERVIEWS))
      if (o.lowerLevelMaxZ !== null) expect(radarAsset(o.map, "lower")).not.toBeNull();
    expect(radarAsset("de_unknown", "default")).toBeNull();
  });

  it("every served file matches its registered SHA-256", async () => {
    const { readFileSync } = await import("node:fs");
    const { createHash } = await import("node:crypto");
    for (const a of RADAR_ASSETS) {
      const digest = createHash("sha256")
        .update(readFileSync(`public${a.src}`))
        .digest("hex");
      expect(digest, a.src).toBe(a.sha256);
    }
  });

  it("the heatmap engine never imports the asset registry", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["src/lib/spatial/heatmap.ts", "src/lib/spatial/maps.ts"])
      expect(readFileSync(f, "utf8")).not.toContain("radarAssets");
  });
});
