/**
 * Fundação 4.2 — CS2 PRO Score pro-score-v1: deterministic, weights applied exactly, missing
 * data never zero, small samples never look precise, partial reads never scored, version
 * traceable, no percentile / tier, and the same value on every surface (pages and Coach).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dictionaries, type Locale } from "@/i18n/config";
import { buildCoachFacts, coachSystemPrompt } from "@/lib/coach/coachContext";
import { guardCoachReply } from "@/lib/coach/coachReplyGuard";
import { FEATURE_CATALOG } from "@/lib/pipeline/features.catalog";
import { buildPlayerDna } from "@/lib/playerDna";
import type { PlayerOverview } from "@/lib/playerOverview";
import {
  buildProScore,
  PRO_SCORE_COMPONENTS,
  PRO_SCORE_MIN_COVERAGE,
  PRO_SCORE_MIN_EVENT_SAMPLE,
  PRO_SCORE_MIN_MATCHES,
  PRO_SCORE_VERSION,
  type ProScoreRow,
} from "@/lib/proScore";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];

type F = Partial<Record<"kast" | "dpr" | "kpr" | "kd" | "surv" | "open" | "clutch", number | null>>;
const row = (id: string, f: F, extra: Partial<ProScoreRow> = {}): ProScoreRow => ({
  match_id: id,
  partial_parse: false,
  sample_rounds: 20,
  sample_opening_duels: 4,
  sample_clutches: 4,
  features: {
    decision_making: { kast: f.kast ?? null },
    aim: { damage_per_round: f.dpr ?? null, kills_per_round: f.kpr ?? null },
    dueling: { kd_balance: f.kd ?? null, opening_success: f.open ?? null },
    survivability: { survival_rate: f.surv ?? null },
    clutch: { clutch_win_rate: f.clutch ?? null },
  },
  ...extra,
});
const full: F = { kast: 0.7, dpr: 0.8, kpr: 0.6, kd: 0.5, surv: 0.4, open: 0.5, clutch: 0.2 };
const three = (f: F = full, extra: Partial<ProScoreRow> = {}) =>
  ["a", "b", "c"].map((id) => row(id, f, extra));

/** The test account's real match_features on 2026-11-10 (production, read-only query). */
const PRODUCTION: ProScoreRow[] = [
  {
    match_id: "747c",
    partial_parse: false,
    sample_rounds: 16,
    sample_opening_duels: 2,
    sample_clutches: 1,
    features: {
      aim: { damage_per_round: 1, kills_per_round: 0.813 },
      clutch: { clutch_win_rate: 0 },
      decision_making: { kast: 0.938 },
      dueling: { kd_balance: 0.65, opening_success: 1 },
      survivability: { survival_rate: 0.562 },
    },
  },
  {
    match_id: "9518",
    partial_parse: false,
    sample_rounds: 23,
    sample_opening_duels: 3,
    sample_clutches: 2,
    features: {
      aim: { damage_per_round: 0.874, kills_per_round: 0.565 },
      clutch: { clutch_win_rate: 0.5 },
      decision_making: { kast: 0.696 },
      dueling: { kd_balance: 0.5, opening_success: 0.667 },
      survivability: { survival_rate: 0.435 },
    },
  },
  {
    match_id: "48e5",
    partial_parse: false,
    sample_rounds: 24,
    sample_opening_duels: 3,
    sample_clutches: 1,
    features: {
      aim: { damage_per_round: 0.661, kills_per_round: 0.5 },
      clutch: { clutch_win_rate: 0 },
      decision_making: { kast: 0.708 },
      dueling: { kd_balance: 0.462, opening_success: 0 },
      survivability: { survival_rate: 0.417 },
    },
  },
];

describe("specification", () => {
  it("weights sum to 1, are positive and every signal is a catalogued [0,1] performance signal", () => {
    expect(PRO_SCORE_VERSION).toBe("pro-score-v1");
    expect(PRO_SCORE_COMPONENTS.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 12);
    const catalog = FEATURE_CATALOG as Record<
      string,
      Record<string, { direction: string; range: unknown }>
    >;
    for (const c of PRO_SCORE_COMPONENTS) {
      expect(c.weight).toBeGreaterThan(0);
      const spec = catalog[c.dimension]![c.signal]!;
      expect(spec.direction).toBe("up"); // performance: never a neutral (style) signal
      expect(spec.range).toEqual([0, 1]);
    }
    expect(new Set(PRO_SCORE_COMPONENTS.map((c) => `${c.dimension}.${c.signal}`)).size).toBe(7);
    // The per-match rating is a blend of kills, deaths and damage: it must not be counted again.
    expect(PRO_SCORE_COMPONENTS.some((c) => c.signal === "rating")).toBe(false);
  });
});

describe("formula", () => {
  it("is the weighted mean of the components × 100, one decimal", () => {
    const s = buildProScore(three());
    const expected =
      0.25 * 0.7 + 0.2 * 0.8 + 0.15 * 0.6 + 0.15 * 0.5 + 0.1 * 0.4 + 0.1 * 0.5 + 0.05 * 0.2;
    expect(s.state).toBe("READY");
    expect(s.score).toBe(Math.round(expected * 1000) / 10);
    expect(s.coverage).toBe(1);
    expect(s.components.reduce((a, c) => a + c.contribution, 0)).toBeCloseTo(s.score as number, 0);
  });

  it("each weight is applied exactly: raising one component by 0.1 moves the score by 10 × weight", () => {
    const base = buildProScore(three()).score as number;
    const keys: Array<[keyof F, number]> = [
      ["kast", 0.25],
      ["dpr", 0.2],
      ["kpr", 0.15],
      ["kd", 0.15],
      ["surv", 0.1],
      ["open", 0.1],
      ["clutch", 0.05],
    ];
    for (const [k, w] of keys) {
      const moved = buildProScore(three({ ...full, [k]: (full[k] as number) + 0.1 }))
        .score as number;
      expect(moved - base, k).toBeCloseTo(10 * w, 5);
    }
  });

  it("stays within 0–100 at the extremes", () => {
    const all = (v: number): F => ({ kast: v, dpr: v, kpr: v, kd: v, surv: v, open: v, clutch: v });
    expect(buildProScore(three(all(0))).score).toBe(0);
    expect(buildProScore(three(all(1))).score).toBe(100);
  });

  it("pools by the match's own sample (not a mean of per-match ratios)", () => {
    const rows = [
      row("a", { ...full, kast: 0.5 }, { sample_rounds: 30 }),
      row("b", { ...full, kast: 1 }, { sample_rounds: 10 }),
      row("c", { ...full, kast: 0.5 }, { sample_rounds: 20 }),
    ];
    const kast = buildProScore(rows).components.find((c) => c.id === "round_contribution")!;
    expect(kast.value).toBeCloseTo((15 + 10 + 10) / 60, 12);
    expect(kast).toMatchObject({ sample: 60, sampleUnit: "rounds", matches: 3 });
  });

  it("is deterministic and independent of row order", () => {
    const a = JSON.stringify(buildProScore(PRODUCTION));
    expect(JSON.stringify(buildProScore([...PRODUCTION]))).toBe(a);
    expect(buildProScore([...PRODUCTION].reverse()).score).toBe(buildProScore(PRODUCTION).score);
  });

  it("an out-of-range or non-numeric reading is not a reading", () => {
    const bad = three().map((r) => ({
      ...r,
      features: { ...(r.features as object), decision_making: { kast: 1.7 } },
    }));
    expect(buildProScore(bad).components.find((c) => c.id === "round_contribution")).toMatchObject({
      available: false,
      value: null,
    });
  });
});

describe("missing data is never zero", () => {
  it("an unobserved component leaves the calculation and its weight is redistributed", () => {
    const without = buildProScore(three({ ...full, surv: null }));
    const surv = without.components.find((c) => c.id === "survival")!;
    expect(surv).toMatchObject({
      available: false,
      value: null,
      unavailableReason: "NOT_OBSERVED",
      contribution: 0,
    });
    expect(without.coverage).toBe(0.9);
    const expected =
      (0.25 * 0.7 + 0.2 * 0.8 + 0.15 * 0.6 + 0.15 * 0.5 + 0.1 * 0.5 + 0.05 * 0.2) / 0.9;
    expect(without.score).toBe(Math.round(expected * 1000) / 10);
    // If the missing value had been treated as 0 the score would be lower: it is not.
    expect(without.score as number).toBeGreaterThan(
      buildProScore(three({ ...full, surv: 0 })).score as number,
    );
  });

  it("an observed 0 IS scored as 0", () => {
    const zero = buildProScore(three({ ...full, surv: 0 }));
    expect(zero.components.find((c) => c.id === "survival")).toMatchObject({
      available: true,
      value: 0,
    });
  });

  it("a value without its denominator is left out, not guessed", () => {
    const rows = three(full, { sample_rounds: null });
    const s = buildProScore(rows);
    expect(s.components.filter((c) => c.sampleUnit === "rounds").every((c) => !c.available)).toBe(
      true,
    );
    expect(s.state).toBe("INSUFFICIENT_COVERAGE");
    expect(s.score).toBeNull();
  });

  it(`event components need ${PRO_SCORE_MIN_EVENT_SAMPLE} pooled events`, () => {
    const thin = buildProScore(three(full, { sample_opening_duels: 3, sample_clutches: 1 }));
    expect(thin.components.find((c) => c.id === "opening")).toMatchObject({
      available: false,
      unavailableReason: "THIN_SAMPLE",
      sample: 9,
    });
    expect(thin.components.find((c) => c.id === "clutch")).toMatchObject({
      available: false,
      unavailableReason: "THIN_SAMPLE",
      sample: 3,
    });
    expect(thin.coverage).toBe(0.85);
    expect(thin.state).toBe("READY");
  });

  it(`below ${PRO_SCORE_MIN_COVERAGE * 100}% coverage there is no score`, () => {
    const s = buildProScore(three({ kast: 0.7, dpr: 0.8, kpr: 0.6 }));
    expect(s.coverage).toBe(0.6);
    expect(s).toMatchObject({ state: "INSUFFICIENT_COVERAGE", score: null, confidence: null });
  });
});

describe("sample, partial reads and confidence", () => {
  it(`0, 1, 2 and ${PRO_SCORE_MIN_MATCHES} matches`, () => {
    expect(buildProScore([])).toMatchObject({ state: "EMPTY", score: null });
    expect(buildProScore([row("a", full)])).toMatchObject({
      state: "INSUFFICIENT_SAMPLE",
      score: null,
    });
    expect(buildProScore([row("a", full), row("b", full)])).toMatchObject({
      state: "INSUFFICIENT_SAMPLE",
      score: null,
    });
    expect(buildProScore(three()).state).toBe("READY");
  });

  it("a duplicated match adds neither a match nor sample", () => {
    const s = buildProScore([row("a", full), row("a", full), row("b", full)]);
    expect(s).toMatchObject({ matches: 2, rounds: 40, state: "INSUFFICIENT_SAMPLE" });
  });

  it("partially read matches are excluded, counted and never scored", () => {
    const rows = [...three(), row("p", { ...full, kast: 0 }, { partial_parse: true })];
    const s = buildProScore(rows);
    expect(s).toMatchObject({ matches: 3, partialMatchesExcluded: 1, rounds: 60 });
    expect(s.score).toBe(buildProScore(three()).score);
    const onlyPartial = buildProScore(three(full, { partial_parse: true }));
    expect(onlyPartial).toMatchObject({
      state: "INSUFFICIENT_SAMPLE",
      score: null,
      partialMatchesExcluded: 3,
    });
  });

  it("confidence reflects pooled rounds only", () => {
    expect(buildProScore(three(full, { sample_rounds: 20 })).confidence).toBe("PROVISIONAL");
    expect(buildProScore(three(full, { sample_rounds: 50 })).confidence).toBe("MODERATE");
    expect(buildProScore(three(full, { sample_rounds: 100 })).confidence).toBe("HIGH");
  });

  it("there is never a percentile or a tier", () => {
    for (const s of [buildProScore([]), buildProScore(three())]) {
      expect(s.percentile).toBeNull();
      expect(s.tier).toBeNull();
    }
  });
});

describe("the production case", () => {
  it("test account, 3 complete matches, 63 rounds: 67.1, provisional, 85% coverage", () => {
    const s = buildProScore(PRODUCTION);
    const v = (id: string) => s.components.find((c) => c.id === id)!;
    expect(v("round_contribution").value).toBeCloseTo(
      (0.938 * 16 + 0.696 * 23 + 0.708 * 24) / 63,
      9,
    );
    expect(v("opening")).toMatchObject({ available: false, sample: 8 });
    expect(v("clutch")).toMatchObject({ available: false, sample: 4 });
    expect(s).toMatchObject({
      state: "READY",
      score: 67.1,
      coverage: 0.85,
      confidence: "PROVISIONAL",
      matches: 3,
      rounds: 63,
    });
  });
});

describe("one value on every surface", () => {
  it("pages and Coach call the same pure function over the same rows", () => {
    const fn = read("src/lib/proScore.functions.ts");
    expect(fn).toContain('createServerFn({ method: "GET" })');
    expect(fn).toContain(".middleware([requireSupabaseAuth])");
    expect(fn).toContain("loadPlayerDna(context.supabase, context.userId)");
    expect(fn).not.toMatch(
      /inputValidator|service_role|client\.server|\.insert\(|\.upsert\(|\.update\(/,
    );
    const coach = read("src/lib/coach.functions.ts");
    expect(coach).toContain("proScore: buildProScore(dnaRows)");
    expect(read("src/routes/_authenticated/dashboard.tsx")).toContain("<RealProScoreCard />");
    expect(read("src/routes/_authenticated/performance.tsx")).toContain("<RealProScoreDetails />");
  });

  it("the Coach gets the shown value when READY and a state (no number) otherwise", () => {
    const overview = { matches: [], aggregates: null } as unknown as PlayerOverview;
    const ready = buildCoachFacts(overview, buildPlayerDna([]), "pt-BR", {
      proScore: buildProScore(PRODUCTION),
    });
    expect(ready.proScore).toMatchObject({
      status: "READY",
      shown: "67.1 / 100",
      version: "pro-score-v1",
      confidence: "PROVISIONAL",
      coveragePercent: 85,
    });
    expect(ready.proScore.components).toHaveLength(7);
    expect(ready.proScore.components.find((c) => !c.inScore)!.component).toBe(
      "Duelos de abertura vencidos",
    );
    expect(ready.notAvailable.some((n) => n.startsWith("CS2 PRO Score"))).toBe(false);

    const few = buildCoachFacts(overview, buildPlayerDna([]), "en", {
      proScore: buildProScore(PRODUCTION.slice(0, 2)),
    });
    expect(few.proScore).toMatchObject({
      status: "INSUFFICIENT_SAMPLE",
      shown: null,
      components: [],
    });
    expect(few.notAvailable.some((n) => n.startsWith("CS2 PRO Score: NOT AVAILABLE"))).toBe(true);
    const none = buildCoachFacts(overview, buildPlayerDna([]), "en");
    expect(none.proScore).toMatchObject({ status: "NOT_OBSERVED", shown: null });
    expect(JSON.stringify(few.proScore)).not.toMatch(/\d\d\.\d \/ 100/);
  });

  it("a reply quoting the Score and its components survives the reply guard; an invented one does not", () => {
    const overview = { matches: [], aggregates: null } as unknown as PlayerOverview;
    const facts = buildCoachFacts(overview, buildPlayerDna([]), "pt-BR", {
      proScore: buildProScore(PRODUCTION),
    });
    expect(facts.proScore.score).toBe(67.1);
    const reply = (line: string) =>
      guardCoachReply(
        `Dados\n\n- ${line}\n\nInterpretação\n\nok.\n\nRecomendação\n\nok.`,
        facts,
        "pt-BR",
      );
    const real = reply("CS2 PRO Score: 67,1 / 100, com 63 rounds e cobertura de 85%. KAST 76,2%.");
    expect(real.text).toContain("67,1 / 100");
    expect(real.text).toContain("76,2%");
    expect(real.removed.stats).toBe(0);
    const invented = reply("CS2 PRO Score: 71,4 / 100.");
    expect(invented.text).not.toContain("71,4");
    expect(invented.removed.stats).toBeGreaterThan(0);
    // The guard itself is unchanged: a percentile sentence is still removed.
    const pct = reply("Você está no percentil 80.");
    expect(pct.removed.comparisons + pct.removed.stats).toBeGreaterThan(0);
    // Below READY no numeric score exists to quote.
    const few = buildCoachFacts(overview, buildPlayerDna([]), "pt-BR", {
      proScore: buildProScore(PRODUCTION.slice(0, 2)),
    });
    expect(few.proScore.score).toBeNull();
  });

  it("the Coach is told it is an absolute index, never a percentile or a comparison", () => {
    const p = coachSystemPrompt("en");
    expect(p).toContain("22. CS2 PRO Score");
    expect(p).toContain("never call it a percentile, a rank, a tier or a comparison");
    expect(p).toContain("never estimate one");
  });

  it("no demo value can reach the real pages", () => {
    expect(read("src/config/app.ts")).toMatch(/DEMO_DATA\s*=\s*false/);
    const ui = read("src/components/real/RealProScore.tsx");
    expect(ui).not.toMatch(/@\/data\/|playerService|ProScoreCard"/);
    expect(ui).toContain('score.state !== "READY" || score.score === null');
  });

  it.each(LOCALES)(
    "%s: every Score label exists and nothing still says 'not calculated yet'",
    (locale) => {
      const d = dictionaries[locale] as Record<string, string>;
      for (const key of Object.keys(dictionaries["pt-BR"]).filter((k) => k.startsWith("score.")))
        expect(d[key], `${locale} ${key}`).toBeTruthy();
      for (const c of PRO_SCORE_COMPONENTS) expect(d[`score.c.${c.id}`]).toBeTruthy();
      expect(d["score.notPercentile"]).toMatch(/percentil|percentile/i);
      expect(d["glossary.proScore.definition"]).not.toMatch(
        /Ainda não é calculad|not calculated yet|Aún no se calcula|pas encore calculé/i,
      );
    },
  );
});
