/**
 * UX-1.0 — mobile and accessibility guards (criteria M-1, M-6, M-9, M-10 of the UX-1 spec).
 * Source-level checks: the production measurements are repeated in the browser after release.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { splitAxisLabel } from "@/lib/dnaAxisLabel";

const read = (p: string) => readFileSync(resolve(p), "utf8");

describe("M-1 duel list: no clipped control below 640 px", () => {
  const src = read("src/components/real/RealCombat.tsx");

  it("turns every duel row into a two-column card below 640 px", () => {
    expect(src).toContain('className="w-full text-sm max-sm:block" data-duel-list');
    expect(src).toMatch(/max-sm:grid max-sm:grid-cols-2/);
    expect(src).toContain("max-sm:sr-only"); // header kept for screen readers
  });

  it("gives the Replay link a real touch target (≥ 44 px on mobile, ≥ 28 px on desktop)", () => {
    const link = src.slice(src.indexOf("data-replay-link") - 600, src.indexOf("data-replay-link"));
    expect(link).toContain("max-sm:min-h-11");
    expect(link).toContain("min-h-7");
    expect(link).toContain("focus-visible:ring-2");
  });
});

describe("M-6 tables never overflow the page", () => {
  it.each([
    ["src/components/real/RealCombat.tsx", 5],
    ["src/components/real/RealUtility.tsx", 2],
    ["src/components/real/RealDna.tsx", 1],
  ])("%s wraps its raw tables in a scroll container", (file, n) => {
    const src = read(file);
    expect(src.split("data-table-scroll").length - 1).toBe(n);
  });
});

describe("M-9 radar labels stay inside the chart", () => {
  it("splits long labels into two balanced lines and keeps short ones", () => {
    expect(splitAxisLabel("Trabalho em equipe")).toEqual(["Trabalho", "em equipe"]);
    expect(splitAxisLabel("Tomada de decisão")).toEqual(["Tomada de", "decisão"]);
    expect(splitAxisLabel("Mira")).toEqual(["Mira"]);
    expect(splitAxisLabel("Posicionamento")).toEqual(["Posicionamento"]); // one word: never cut
  });

  it("uses a smaller radius on narrow screens", () => {
    expect(read("src/components/charts/DnaRadarChart.tsx")).toContain(
      'outerRadius={mobile ? "58%" : "72%"}',
    );
  });
});

describe("M-10 the Coach composer stays above the bottom navigation", () => {
  it("sizes the chat to the dynamic viewport below lg", () => {
    expect(read("src/routes/_authenticated/coach.tsx")).toContain(
      // VGL 5.1: shorter page header (no visible description) → more room for the chat.
      "max-lg:h-[calc(100dvh-14rem-env(safe-area-inset-bottom))]",
    );
  });
});
