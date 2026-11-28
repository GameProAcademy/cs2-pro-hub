/** VGL 5.1 — Frentes 4 e 6: Score card in the DNA card family; fixed Home order. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("Home order (Frente 6)", () => {
  it("best map → five indicators → Score + DNA → Coach's Word → Training/Coach/Maps → last matches", () => {
    const src = read("src/routes/_authenticated/dashboard.tsx");
    const body = src.slice(src.indexOf("function RealDashboardPage"));
    const order = [
      "<BestMapHero",
      "<RealAggregates",
      "<RealProScoreCard",
      "<DnaIdentityCard",
      '<CoachWordCard section="dashboard"',
      "<HomeCommandRow",
      't("dashboard.lastMatches")',
      "<MapPoolCard",
    ].map((m) => body.indexOf(m));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(body).toContain('<div className="grid gap-5 lg:grid-cols-2" data-home-headline>');
  });
});

describe("Score card (Frente 4)", () => {
  const src = read("src/components/real/RealProScore.tsx");
  const card = src.slice(
    src.indexOf("export function RealProScoreCard"),
    src.indexOf("const SCORE_ART"),
  );
  const dna = read("src/components/cs2/IdentityKit.tsx");

  it("uses the DNA identity card's panel, art mask and CTA styles", () => {
    const panel =
      "surface-panel vgl-grid relative isolate flex h-full flex-col overflow-hidden rounded-xl border border-border p-5 sm:p-6";
    expect(card).toContain(panel);
    expect(dna).toContain(panel);
    expect(card).toContain("<Cs2Mask");
    expect(card).toContain("data-score-identity-cta");
    expect(card).not.toContain("<ChartCard");
  });

  it("keeps the number, tooltips and details link; reads contributions without recomputing", () => {
    expect(card).toContain("<ScoreHero score={score} tips={<ScoreTips />} />");
    expect(card).toContain('hash="cs2-pro-score"');
    expect(card).toContain("c.available && c.contribution > 0");
    expect(card).not.toMatch(/weight\s*\*|computeProScore|buildProScore/);
  });
});
