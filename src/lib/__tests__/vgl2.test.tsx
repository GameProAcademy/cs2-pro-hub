/**
 * Visual Game Language 2.0 — authentic CS2 artwork. Every registered asset exists in public/,
 * has a recorded source, never stands in for missing data, and motion respects reduced motion.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MapEmblem, RadialGauge, WeaponArt } from "@/components/cs2/Cs2Art";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { HUD, MAP_ASSETS, mapAssets, weaponArt } from "@/lib/cs2/assets";

vi.mock("@tanstack/react-router", async (orig) => {
  const a = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...a,
    Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <a href="#" className={className}>
        {children}
      </a>
    ),
  };
});

const root = process.cwd();
const pub = (p: string) => join(root, "public", p);
const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];

describe("asset registry", () => {
  it("every registered file exists and the provenance doc covers each group", () => {
    for (const a of Object.values(MAP_ASSETS)) {
      expect(existsSync(pub(a.emblem)), a.emblem).toBe(true);
      expect(existsSync(pub(a.art)), a.art).toBe(true);
    }
    for (const src of Object.values(HUD)) expect(existsSync(pub(src)), src).toBe(true);
    for (const w of [
      "ak47",
      "awp",
      "deagle",
      "flashbang",
      "hegrenade",
      "smokegrenade",
      "molotov",
      "decoy",
    ])
      expect(existsSync(pub(weaponArt(w)!)), w).toBe(true);
    const doc = readFileSync(join(root, "docs/reference/CS2_ASSETS.md"), "utf8");
    expect(doc).toContain("MurkyYT/cs2-map-icons");
    expect(doc).toContain("lexogrine/cs2-react-hud");
  });

  it("no art for ambiguous parser names or unknown maps", () => {
    expect(weaponArt("m4a1")).toBeNull();
    expect(weaponArt("hkp2000")).toBeNull();
    expect(weaponArt(null)).toBeNull();
    expect(weaponArt("knife_karambit")).toBe("/cs2/weapons/knife.svg");
    expect(mapAssets("de_unknown")).toBeNull();
    expect(renderToString(<MapEmblem map={null} />)).toBe("");
    expect(renderToString(<WeaponArt weapon="m4a1" />)).toBe("");
  });

  it("artwork is decorative", () => {
    expect(renderToString(<MapEmblem map="de_mirage" />)).toContain('aria-hidden="true"');
    expect(renderToString(<WeaponArt weapon="ak47" />)).toContain('aria-hidden="true"');
  });
});

describe("radial gauge", () => {
  it("draws a dashed neutral ring with no value (never an empty 0)", () => {
    const none = renderToString(<RadialGauge value={null} label="—" />);
    expect(none).toContain('data-gauge="none"');
    expect(none).toContain('stroke-dasharray="3 5"');
    expect(renderToString(<RadialGauge value={0.71} label="71" />)).toContain('data-gauge="0.710"');
  });
});

describe("last match hero", () => {
  it("shows real events and the em dash for missing ones", async () => {
    const { LastMatchHero } = await import("@/components/cs2/MatchVisuals");
    const m = {
      matchId: "a",
      map: "de_mirage",
      playedAt: "2026-11-25T20:00:00Z",
      dateSource: "played",
      resultStatus: "RESOLVED",
      result: "win",
      scorePlayer: 13,
      scoreOpponent: 9,
      source: "demo",
      kills: 21,
      deaths: 14,
      assists: 4,
      adr: 88.4,
      kast: 74,
      hsPercent: 52,
      rating: 1.1,
      firstKills: null,
      firstDeaths: null,
      tradeKills: 3,
      flashAssists: 2,
      utilityDamage: 64,
      clutchAttempts: 2,
      clutchWins: null,
    } as never;
    const html = renderToString(
      <I18nProvider initialLocale="pt-BR">
        <LastMatchHero m={m} />
      </I18nProvider>,
    );
    expect(html).toContain('data-map-art="de_mirage"');
    expect(html).toContain(">21<");
    // Unknown opening kills → em dash in a dashed cell; unknown clutch wins → "—/2".
    expect(html).toContain("border-dashed");
    expect(html).toContain("—/2");
    for (const l of LOCALES)
      for (const k of [
        "vgl.hero.lastMatch",
        "vgl.hero.openRoom",
        "vgl.stat.openings",
        "vgl.stat.trades",
        "vgl.stat.flashAssists",
        "vgl.stat.clutches",
        "vgl.matches.recent",
      ] as const)
        expect(dictionaries[l][k], `${l} ${k}`).toBeTruthy();
  });
});

describe("motion", () => {
  it("every VGL animation is switched off for prefers-reduced-motion", () => {
    const css = readFileSync(join(root, "src/styles.css"), "utf8");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .vgl-rise"));
    for (const c of [".vgl-rise", ".vgl-ring", ".vgl-art", ".vgl-grow", ".vgl-sweep"])
      expect(block).toContain(c);
  });
});
