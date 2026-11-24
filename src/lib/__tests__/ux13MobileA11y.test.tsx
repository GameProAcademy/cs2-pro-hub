/**
 * UX-1.3 — mobile and accessibility basics (Doc. 2, §13) and the A-class items shipped with it:
 * M-2/R-22 deaths list, M-4/R-20 menu dialog, M-10/R-12 Coach at every width, R-17 economy no
 * longer "unsupported", R-19 upload without the interface-only path, R-23 dimension label.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dictionaries, type Locale } from "@/i18n/config";
import { buildXRay } from "@/lib/diagnostics/xray";
import { buildPlayerDna } from "@/lib/playerDna";
import type { PlayerOverview } from "@/lib/playerOverview";

const read = (p: string) => readFileSync(resolve(p), "utf8");
const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];

describe("UX-1.3", () => {
  it("M-4: the mobile menu is a dialog (Esc, focus trap, focus back to the trigger)", () => {
    const src = read("src/components/layout/AppShell.tsx");
    expect(src).toContain("DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}");
    expect(src).toContain("<DialogPrimitive.Trigger asChild>");
    expect(src).toContain("<DialogPrimitive.Title");
  });

  it("M-10 / R-12: the Coach button is not desktop-only and opens a dialog", () => {
    const src = read("src/components/coach/CoachFab.tsx");
    expect(src).not.toMatch(/hidden[^"]*lg:flex/);
    expect(src).not.toMatch(/fixed inset-0 z-50 hidden lg:block/);
    expect(src).toContain("<DialogPrimitive.Root open={open} onOpenChange={setOpen}>");
  });

  it("R-19: the upload page has only the real demo path, without engineering status", () => {
    const src = read("src/routes/_authenticated/upload.tsx");
    expect(src).not.toMatch(/analyze\.report\.|analyze\.pipeline\.|PathCard|notImplemented/);
    expect(src).toContain("<DemoIngestPanel");
  });

  it("R-17: purchase classification is not listed as unsupported", () => {
    const x = buildXRay({
      overview: { matches: [], aggregates: null } as unknown as PlayerOverview,
      dna: buildPlayerDna([]),
      sides: [],
    });
    expect(x.unsupported).not.toContain("economyClassification");
  });

  it.each(LOCALES)("R-23: the 'positioning' dimension is named after its signals (%s)", (l) => {
    const d = dictionaries[l] as Record<string, string>;
    expect(d["dna.dim.positioning"]).not.toMatch(/posici|position/i);
    expect(d["training.area.positioning"]).toBe(d["dna.dim.positioning"]);
  });

  it.each(LOCALES)("M-2: the deaths list texts exist (%s)", (l) => {
    const d = dictionaries[l] as Record<string, string>;
    for (const k of [
      "diagnosis.list.round",
      "diagnosis.list.allRounds",
      "diagnosis.list.count",
      "diagnosis.list.more",
      "diagnosis.list.toggle",
    ])
      expect(d[k], k).toBeTruthy();
  });
});

describe("R-21: CT/T colours are tokens", () => {
  it("no component paints a side with a raw palette colour", () => {
    const replay = read("src/components/real/RealReplay.tsx");
    expect(replay).toContain("fill-side-ct stroke-side-ct");
    expect(replay).not.toMatch(/sky-\d{3}|amber-\d{3}/);
    const css = read("src/styles.css");
    expect(css).toMatch(/--side-ct: oklch/);
    expect(css).toMatch(/--color-side-t: var\(--side-t\)/);
  });
});
