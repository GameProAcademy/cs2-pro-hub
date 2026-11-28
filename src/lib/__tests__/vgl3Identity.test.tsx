/**
 * VGL 3.0 — Player Identity and Home. Specialties come from the latest comparable persisted DNA
 * snapshot with the DNA page's own ranking (no snapshot → nothing); the hero CTA never overlaps the
 * map name on phones; the KPI grid has two columns on phones; an unknown score is "— : —", never 0.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { latestSpecialties } from "@/components/cs2/IdentityKit";
import { dictionaries, type Locale } from "@/i18n/config";
import type { DnaHistoryEntry } from "@/lib/xray.functions";

const V = "dna-weighted-v3";
const entry = (o: Partial<DnaHistoryEntry>): DnaHistoryEntry => ({
  createdAt: "2026-11-20T10:00:00Z",
  dnaVersion: V,
  state: "READY",
  matchCount: 10,
  roundCount: 200,
  dimensions: {},
  ...o,
});

describe("latestSpecialties", () => {
  it("uses the newest READY snapshot of the same method and the signature ranking", () => {
    const s = latestSpecialties(
      [
        entry({
          createdAt: "2026-11-25T10:00:00Z",
          dimensions: {
            aim: 68,
            dueling: 41,
            survivability: 35,
            utility: 36,
            decision_making: 80,
            consistency: 66,
          },
        }),
        entry({ createdAt: "2026-11-24T10:00:00Z", dimensions: { aim: 99 } }),
        entry({ createdAt: "2026-11-26T10:00:00Z", dnaVersion: "old", dimensions: { aim: 10 } }),
        entry({
          createdAt: "2026-11-27T10:00:00Z",
          state: "INSUFFICIENT_SAMPLE",
          dimensions: { aim: 5 },
        }),
      ],
      V,
    );
    expect(s?.at).toBe("2026-11-25T10:00:00Z");
    expect(s?.top.map((d) => d.dimension)).toEqual(["decision_making", "aim", "consistency"]);
    expect(s?.low.map((d) => d.dimension)).toEqual(["survivability", "utility"]);
    expect(s?.top[0]?.value).toBeCloseTo(0.8);
  });

  it("no comparable snapshot, or nothing measured: null (the strip is not drawn)", () => {
    expect(latestSpecialties([], V)).toBeNull();
    expect(
      latestSpecialties([entry({ dnaVersion: "old", dimensions: { aim: 50 } })], V),
    ).toBeNull();
    expect(latestSpecialties([entry({ dimensions: { aim: null } })], V)).toBeNull();
  });

  it("strings in the five locales", () => {
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"] as Locale[])
      for (const k of ["vgl3.specialty.title", "vgl3.specialty.source"] as const)
        expect(dictionaries[l][k], `${l} ${k}`).toBeTruthy();
  });
});

describe("Home and matches layout contracts", () => {
  const src = (p: string) => readFileSync(resolve(p), "utf8");
  it("hero CTA takes its own row on phones", () => {
    // VGL 5.0: the home hero is the best map scene (same CTA contract).
    expect(src("src/components/cs2/BestMap.tsx")).toMatch(
      /w-full items-center justify-center[^"]*sm:w-auto"\s*data-hero-cta/,
    );
  });
  it("KPI grid: two columns on phones, five on wide screens; limited note stacks on phones", () => {
    const d = src("src/components/real/RealData.tsx");
    expect(d).toContain('"grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-5"');
    expect(d).toContain("col-span-2 flex flex-col items-start gap-2");
  });
  it("match card shows an unknown score as — : — with a label, never 0", () => {
    const m = src("src/components/cs2/MatchVisuals.tsx");
    expect(m).toContain("`${NOT_AVAILABLE_MARK} : ${NOT_AVAILABLE_MARK}`");
    expect(m).toContain('<Score m={m} className="text-lg" showUnknown />');
  });
  it("home and profile show the specialties strip", () => {
    expect(src("src/routes/_authenticated/dashboard.tsx")).toContain("<SpecialtyStrip />");
    expect(src("src/routes/_authenticated/profile.tsx")).toContain("<SpecialtyStrip");
  });
});
