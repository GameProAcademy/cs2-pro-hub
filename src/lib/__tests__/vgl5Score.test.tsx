/**
 * VGL 5.0 — Frente 4/10: the Score's presentation changed, its value did not. The displayed
 * number is pro-score-v1's own value with the same one-decimal formatting; no number without
 * a READY Score; the three explanations are tooltips; "how it is formed" is a closed accordion.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScoreHero, formatScore } from "@/components/score/ScoreHero";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { buildProScore, type ProScoreRow } from "@/lib/proScore";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const row = (id: string): ProScoreRow => ({
  match_id: id,
  partial_parse: false,
  sample_rounds: 20,
  sample_opening_duels: 4,
  sample_clutches: 4,
  features: {
    decision_making: { kast: 0.7 },
    aim: { damage_per_round: 0.8, kills_per_round: 0.6 },
    dueling: { kd_balance: 0.5, opening_success: 0.5 },
    survivability: { survival_rate: 0.4 },
    clutch: { clutch_win_rate: 0.2 },
  },
});

const render = (node: React.ReactNode, locale: Locale = "pt-BR") =>
  renderToString(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);

describe("ScoreHero", () => {
  it("shows exactly pro-score-v1's value (one decimal, unchanged formula)", () => {
    const score = buildProScore(["a", "b", "c"].map(row));
    expect(score.state).toBe("READY");
    const html = render(<ScoreHero score={score} />);
    const shown = formatScore(score.score!, "pt-BR");
    // Same formatting the previous component used.
    expect(shown).toBe(
      new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
        score.score!,
      ),
    );
    expect(html).toContain(`>${shown}<`);
    expect(html).toContain('data-pro-score-state="READY"');
    expect(html).toContain(`data-score-meter="${Math.round((score.score! / 100) * 20)}"`);
    expect(html).toContain("data-score-coverage");
  });

  it("no number below the minimum sample or coverage: the honest state instead", () => {
    const two = buildProScore(["a", "b"].map(row));
    const html = render(<ScoreHero score={two} />, "en");
    expect(html).toContain('data-pro-score-state="INSUFFICIENT_SAMPLE"');
    expect(html).not.toContain("data-pro-score-value");
    expect(html).toContain('data-score-meter="none"');
    expect(html).toContain("2 of 3");
    const empty = buildProScore([]);
    expect(render(<ScoreHero score={empty} />)).toContain('data-pro-score-state="EMPTY"');
  });

  it("never presents the Score as a rank: no tiers, no percentile", () => {
    const src = read("src/components/score/ScoreHero.tsx");
    expect(src).not.toMatch(/percentile\s*[:=]|tier\s*[:=]/i);
  });
});

describe("Performance and Início wiring", () => {
  it("three tooltips (texts unchanged) and a closed-by-default accordion", () => {
    const src = read("src/components/real/RealProScore.tsx");
    expect(src).toContain('fill(t("score.method")');
    expect(src).toContain('{t("score.notPercentile")} {t("score.dnaDifference")}');
    expect(src).toContain('{t("real.proScoreContext.instead")}');
    expect(src).toContain('<Accordion type="single" collapsible data-score-formation>');
    expect(src).not.toMatch(/defaultValue=/);
    const perf = read("src/routes/_authenticated/performance.tsx");
    expect(perf).not.toContain('t("real.proScoreContext.instead")');
  });

  it("Início keeps Score and Player DNA side by side (VGL 5.1: after best map and indicators)", () => {
    const d = read("src/routes/_authenticated/dashboard.tsx");
    const headline = d.indexOf("data-home-headline");
    expect(headline).toBeGreaterThan(0);
    expect(d.indexOf("<RealProScoreCard />")).toBeGreaterThan(headline);
    expect(d.indexOf("<DnaIdentityCard")).toBeGreaterThan(headline);
    expect(d.indexOf("<BestMapHero")).toBeLessThan(headline);
  });

  it("every new text exists in the five languages", () => {
    for (const l of LOCALES)
      for (const k of [
        "vgl5.score.badge",
        "vgl5.score.tip.method",
        "vgl5.score.tip.meaning",
        "vgl5.score.tip.rating",
        "vgl5.score.conf.MODERATE",
        "vgl5.dna.badge",
        "vgl5.dna.predominant",
      ] as const)
        expect(dictionaries[l][k], `${l} ${k}`).toBeTruthy();
  });
});
