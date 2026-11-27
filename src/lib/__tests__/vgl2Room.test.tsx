/**
 * VGL 2.0 continuation — Match Room. Rounds per side are counted from the strip's own rounds
 * (both side and outcome recorded); the rest are reported apart, never as losses.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sideSplit } from "@/components/real/RealMatchRoom";
import { dictionaries, type Locale } from "@/i18n/config";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("side split", () => {
  it("counts won/lost per recorded side and keeps unknown rounds apart", () => {
    expect(
      sideSplit([
        { side: "CT", won: true },
        { side: "CT", won: false },
        { side: "T", won: true },
        { side: "T", won: null },
        { side: null, won: true },
      ]),
    ).toEqual({ CT: { won: 1, lost: 1 }, T: { won: 1, lost: 0 }, unknown: 2 });
  });

  it("is translated in the five locales", () => {
    for (const l of ["pt-BR", "en", "es", "fr", "pt-PT"] as Locale[])
      for (const k of ["vgl.room.sideRoundsWon", "vgl.room.sideUnknown"] as const)
        expect(dictionaries[l][k], `${l} ${k}`).toBeTruthy();
  });
});

describe("rounds and deaths (source contracts)", () => {
  it("round cards: side stripe and logo, result badge only for a known result", () => {
    const r = src("src/components/real/RealRounds.tsx");
    expect(r).toContain('"border-l-side-ct"');
    expect(r).toContain('"border-l-side-t"');
    expect(r).toMatch(
      /round\.won === null \? \(\s*<span className="text-muted-foreground">\{result\}<\/span>/,
    );
    // Kill events: the real weapon's silhouette when unambiguous (moved to the VGL 3.0 kill feed).
    expect(src("src/components/cs2/MatchTimeline.tsx")).toContain("weaponArt(e.weapon) ?");
    expect(r).toContain("<KillFeedLine");
  });

  it("deaths: the recorded weapon gets its silhouette; a missing weapon keeps the text", () => {
    const d = src("src/components/real/RealDeathReview.tsx");
    expect(d).toContain("<WeaponArt\n                    weapon={c.facts.weapon.value}");
    expect(d).toMatch(
      /c\.facts\.weapon\.value \? \(\s*<WeaponLabel weapon=\{c\.facts\.weapon\.value\} \/>\s*\) : \(\s*value\(c\.facts\.weapon\)/,
    );
  });
});
