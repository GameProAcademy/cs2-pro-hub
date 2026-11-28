/**
 * Visual Game Language — matches, match room and dashboard. CS2 elements decorate real values
 * only: map tiles for real maps, result badges for known results, weapon pictograms for real
 * weapons, grenade pictograms for real grenade types, a map pool that only counts listed matches.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { mapPool } from "@/components/real/MapPool";

const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("map pool", () => {
  it("counts listed matches per real map and keeps unidentified ones apart", () => {
    const pool = mapPool([
      { map: "de_mirage" },
      { map: "de_nuke" },
      { map: "de_mirage" },
      { map: null },
    ]);
    expect(pool.entries).toEqual([
      { map: "de_mirage", matches: 2 },
      { map: "de_nuke", matches: 1 },
    ]);
    expect(pool.unknown).toBe(1);
  });

  it("is empty with no identified map (the card then renders nothing)", () => {
    expect(mapPool([{ map: null }]).entries).toEqual([]);
  });

  it("is translated in the five locales", () => {
    for (const l of LOCALES)
      for (const k of [
        "vgl.mapPool.title",
        "vgl.mapPool.subtitle",
        "vgl.mapPool.matches",
        "vgl.mapPool.unknown",
      ] as const) {
        expect(dictionaries[l][k], `${l} ${k}`).toBeTruthy();
      }
  });

  it("renders a tile with name and count per map", async () => {
    const { MapPoolCard } = await import("@/components/real/MapPool");
    const { RouterProvider, createRouter, createRootRoute, createMemoryHistory } =
      await import("@tanstack/react-router");
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => <MapPoolCard rows={[{ map: "de_mirage" }, { map: "de_mirage" }]} />,
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    const html = renderToString(
      <I18nProvider initialLocale="pt-BR">
        <RouterProvider router={router} />
      </I18nProvider>,
    );
    expect(html).toContain('data-map-pool-entry="de_mirage"');
    expect(html).toContain("2 partidas");
  });
});

describe("matches table and room (source contracts)", () => {
  const data = src("src/components/real/RealData.tsx");
  const room = src("src/components/real/RealMatchRoom.tsx");

  it("matches list: map tile for a real map, the em dash otherwise; result badge only when known", () => {
    expect(data).toContain('{row.map ? <MapTile map={row.map} size="sm" /> : null}');
    expect(data).toContain("row.map ? mapDisplayName(row.map) : NOT_AVAILABLE_MARK");
    expect(data).toMatch(/row\.result \? \(\s*<ToneBadge tone=\{RESULT_TONE\[row\.result\]\}/);
    // Unknown result keeps its own explanation (never a loss).
    expect(data).toContain('row.resultStatus === "UNRESOLVED_BY_DEMO"');
  });

  it("match date and result explanations use the click-triggered dark popover pattern", () => {
    expect(data).toContain('import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";');
    expect(data).toContain("<PopoverTrigger asChild>");
    expect(data).toContain('<PopoverContent className="w-72 text-left normal-case tracking-normal"');
    expect(data).toContain('help={t("real.date.processedNote")}');
    expect(data).toContain('help={t("real.result.unresolvedNote")}');
    expect(data).not.toContain("TooltipProvider");
  });

  it("room: map tile, result badge only for a resolved result, a pictogram per tab", () => {
    expect(room).toContain('<MapTile map={m.map} size="lg" />');
    expect(room).toContain('m.result && m.resultStatus !== "UNRESOLVED_BY_DEMO"');
    for (const tab of ["summary", "rounds", "duels", "deaths", "utility", "map", "replay"])
      expect(room).toMatch(new RegExp(`\\b${tab}: "`));
  });

  it("round strip: a side switch is drawn only from two consecutive recorded sides", () => {
    expect(room).toContain("const switched = !!(prev && r.side && prev !== r.side);");
    for (const l of LOCALES)
      expect((dictionaries[l] as Record<string, string>)["room.strip.sideSwitch"]).toBeTruthy();
  });

  it("duels and utility: weapon and grenade pictograms sit next to the real value", () => {
    const combat = src("src/components/real/RealCombat.tsx");
    const utility = src("src/components/real/RealUtility.tsx");
    expect(combat).toContain("{d.weapon ? <WeaponLabel weapon={d.weapon} /> : NOT_AVAILABLE_MARK}");
    expect(combat).toContain("<WeaponLabel weapon={w.weapon} />");
    expect(utility).toContain("<GrenadeLabel grenade={g.grenade} />");
  });
});
