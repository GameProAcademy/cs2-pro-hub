/**
 * VGL 5.0 — Palavra do Treinador (`coach-word-v1`): deterministic, pre-written, never AI.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dictionaries, type Locale } from "@/i18n/config";
import { rankMaps } from "@/lib/maps/mapRanking";
import {
  COACH_WORD_IDS,
  coachWordFor,
  matchWord,
  type CoachWordMatch,
  type CoachWordSection,
  type CoachWordXRay,
} from "@/lib/coachWord/coachWord";

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
let day = 0;
function m(over: Partial<CoachWordMatch> = {}): CoachWordMatch {
  day += 1;
  return {
    map: "de_mirage",
    playedAt: new Date(Date.UTC(2026, 9, 1) + day * 86_400_000).toISOString(),
    result: "win",
    kills: 20,
    deaths: 18,
    adr: 75,
    kast: 70,
    hsPercent: 40,
    rating: 1,
    roundsPlayed: 24,
    ...over,
  };
}
const many = (n: number, over: Partial<CoachWordMatch> = {}) =>
  Array.from({ length: n }, () => m(over));

describe("selection by section", () => {
  it("too few matches → the insufficient message, never a negative one", () => {
    for (const section of ["dashboard", "analysis", "performance"] as CoachWordSection[]) {
      const w = coachWordFor(section, { matches: many(2, { adr: 40, kast: 40 }) });
      expect(w.tone, section).toBe("insufficient");
    }
  });

  it("metric thresholds: low, high and intermediate values", () => {
    expect(coachWordFor("performance", { matches: many(4, { adr: 55 }) }).id).toBe("adrLow");
    expect(coachWordFor("performance", { matches: many(4, { kast: 58 }) }).id).toBe("kastLow");
    expect(coachWordFor("performance", { matches: many(4, { kills: 12, deaths: 18 }) }).id).toBe(
      "kdLow",
    );
    expect(coachWordFor("performance", { matches: many(4, { adr: 92 }) }).id).toBe("adrHigh");
    expect(coachWordFor("performance", { matches: many(4) }).id).toBe("balanced");
  });

  it("aim without survival wins over the single-metric messages", () => {
    const w = coachWordFor("performance", {
      matches: many(4, { hsPercent: 55, adr: 86, kast: 60, kills: 18, deaths: 21 }),
    });
    expect(w.id).toBe("aimSurvival");
  });

  it("missing values are never read as a problem", () => {
    const w = coachWordFor("performance", {
      matches: many(4, { adr: null, kast: null, hsPercent: null }),
    });
    expect(["adrLow", "kastLow", "aimSurvival"]).not.toContain(w.id);
  });

  it("evolution: decline, improvement, inconsistency and too few matches", () => {
    const older = many(3, { rating: 1.2 });
    expect(coachWordFor("evolution", { matches: [...older, ...many(3, { rating: 0.9 })] }).id).toBe(
      "trendDown",
    );
    expect(
      coachWordFor("evolution", {
        matches: [...many(3, { rating: 0.9 }), ...many(3, { rating: 1.15 })],
      }).id,
    ).toBe("trendUp");
    expect(
      coachWordFor("evolution", {
        matches: [0.4, 1.6, 0.5, 1.5, 0.45, 1.55].map((rating) => m({ rating })),
      }).id,
    ).toBe("inconsistent");
    expect(coachWordFor("evolution", { matches: many(4) }).id).toBe("trendPending");
  });

  it("maps use map-rank-v1: best map, map to develop, pending", () => {
    const strong = [
      ...many(8, { map: "de_mirage", rating: 1.7, adr: 100, kast: 82, kills: 26 }),
      ...many(8, { map: "de_nuke", rating: 0.9 }),
    ];
    const r = rankMaps(strong);
    expect(coachWordFor("maps", { mapRanking: r }).id).toBe("mapBest");
    expect(coachWordFor("maps", { mapRanking: rankMaps(many(2)) }).id).toBe("mapsPending");
    const four = [
      ...many(4, { map: "de_mirage", rating: 1.2 }),
      ...many(4, { map: "de_nuke", rating: 1.15 }),
      ...many(4, { map: "de_inferno", rating: 1.1 }),
      ...many(4, { map: "de_ancient", rating: 0.6, adr: 50, kast: 50 }),
    ];
    const w = coachWordFor("maps", { mapRanking: rankMaps(four) });
    expect(w.id).toBe("mapDevelop");
    expect(w.vars["map"]).toBe("ancient");
  });

  it("player DNA, training and goals", () => {
    expect(
      coachWordFor("playerDna", {
        dna: [
          { dimension: "utility", value: 30 },
          { dimension: "aim", value: 70 },
        ],
      }).id,
    ).toBe("dnaLow");
    expect(
      coachWordFor("playerDna", {
        dna: [
          { dimension: "aim", value: 72 },
          { dimension: "clutch", value: 50 },
        ],
      }).id,
    ).toBe("dnaTop");
    expect(coachWordFor("playerDna", { dna: null }).id).toBe("dnaPending");
    expect(
      coachWordFor("training", { matches: many(4), trainingTop: "utility" }).vars["dimension"],
    ).toBe("utility");
    expect(coachWordFor("goals", { goals: null }).id).toBe("goalsNone");
    expect(
      coachWordFor("goals", { goals: { total: 2, reached: 1, inProgress: 1, waiting: 0 } }).id,
    ).toBe("goalsProgress");
    expect(
      coachWordFor("goals", { goals: { total: 1, reached: 1, inProgress: 0, waiting: 0 } }).id,
    ).toBe("goalsReached");
  });

  it("dashboard: decline first, then a weakness, then the training focus", () => {
    const declining = [...many(3, { rating: 1.25 }), ...many(3, { rating: 0.9 })];
    expect(coachWordFor("dashboard", { matches: declining }).id).toBe("trendDown");
    expect(coachWordFor("dashboard", { matches: many(4, { kast: 55 }) }).id).toBe("kastLow");
    expect(coachWordFor("dashboard", { matches: many(4), trainingTop: "aim" }).id).toBe(
      "trainingFocus",
    );
  });

  it("one message per section, so a screen never shows two contradicting messages", () => {
    const w = coachWordFor("performance", { matches: many(4, { adr: 92, kast: 55 }) });
    expect(w.id).toBe("kastLow");
  });

  it("is deterministic", () => {
    const ctx = { matches: many(6) };
    expect(JSON.stringify(coachWordFor("dashboard", ctx))).toBe(
      JSON.stringify(coachWordFor("dashboard", ctx)),
    );
  });
});

describe("match summary uses only that match", () => {
  it("good individual game in a loss, damage, survival, tough, solid win, short", () => {
    expect(matchWord(m({ result: "loss", adr: 92 })).id).toBe("matchGoodLoss");
    expect(matchWord(m({ adr: 101 })).id).toBe("matchDamage");
    expect(matchWord(m({ deaths: 21, kast: 50, adr: 70 })).id).toBe("matchSurvival");
    expect(matchWord(m({ kills: 9, deaths: 17, adr: 50, result: "loss" })).id).toBe("matchTough");
    expect(matchWord(m({ kast: 80 })).id).toBe("matchSolidWin");
    expect(matchWord(m({ roundsPlayed: 6 })).id).toBe("matchShort");
    expect(matchWord(m()).vars["map"]).toBe("de_mirage");
  });
});

describe("content and safety", () => {
  it("every message exists in the five languages, with its practical tip", () => {
    for (const l of LOCALES) {
      const d = dictionaries[l] as Record<string, string>;
      for (const id of COACH_WORD_IDS) {
        expect(d[`cw.${id}.text`], `${l} ${id}`).toBeTruthy();
        expect(d[`cw.${id}.tip`], `${l} ${id} tip`).toBeTruthy();
      }
      for (const k of ["cw.title", "cw.talk", "cw.practice", "cw.ask"])
        expect(d[k], `${l} ${k}`).toBeTruthy();
    }
  });

  it("placeholders match across languages", () => {
    const vars = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)]
        .map((x) => x[1])
        .sort()
        .join(",");
    for (const id of COACH_WORD_IDS)
      for (const part of ["text", "tip"])
        for (const l of LOCALES)
          expect(
            vars((dictionaries[l] as Record<string, string>)[`cw.${id}.${part}`]!),
            `${l} ${id}.${part}`,
          ).toBe(vars((dictionaries["pt-BR"] as Record<string, string>)[`cw.${id}.${part}`]!));
  });

  it("no generative AI: the engine and the card import no provider or server call", () => {
    const dir = resolve(process.cwd(), "src/lib/coachWord");
    const files = [
      ...readdirSync(dir)
        .filter((f) => f.endsWith(".ts"))
        .map((f) => join(dir, f)),
      resolve(process.cwd(), "src/components/coachWord/CoachWordCard.tsx"),
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/openrouter|openai|sendCoachMessage|fetch\(/i);
    }
  });

  it("the card is on the eight sections and the match summary", () => {
    const wants: Array<[string, string]> = [
      ["src/routes/_authenticated/dashboard.tsx", "dashboard"],
      ["src/components/real/RealXRay.tsx", "analysis"],
      ["src/components/real/RealDna.tsx", "playerDna"],
      ["src/routes/_authenticated/performance.tsx", "performance"],
      ["src/components/real/RealEvolution.tsx", "evolution"],
      ["src/components/real/RealHeatmap.tsx", "maps"],
      ["src/components/training/RealTrainingPlan.tsx", "training"],
      ["src/routes/_authenticated/goals.tsx", "goals"],
      ["src/components/real/RealMatchRoom.tsx", "match"],
    ];
    for (const [file, section] of wants)
      expect(readFileSync(resolve(process.cwd(), file), "utf8"), file).toContain(
        `<CoachWordCard section="${section}"`,
      );
  });
});

describe("VGL 5.1 — Raio-X speaks from the Raio-X", () => {
  const ready = (over: Partial<CoachWordXRay> = {}): CoachWordXRay => ({
    state: "READY",
    matches: 6,
    minMatches: 5,
    inference: null,
    notObserved: 0,
    ctRating: 1.05,
    tRating: 1.0,
    ...over,
  });
  const ok = many(6);

  it("never falls back to the Player DNA message", () => {
    const dna = [{ dimension: "utility", value: 20 }];
    for (const x of [ready(), ready({ notObserved: 2 }), null]) {
      const w = coachWordFor("analysis", { matches: ok, dna, xray: x });
      expect(["dnaLow", "dnaTop", "dnaEven", "trainingFocus"]).not.toContain(w.id);
    }
  });

  it("forming, inference, sides, gaps, balanced — in that order", () => {
    expect(
      coachWordFor("analysis", { matches: ok, xray: ready({ state: "IN_FORMATION", matches: 3 }) })
        .id,
    ).toBe("xrayForming");
    expect(
      coachWordFor("analysis", {
        matches: ok,
        xray: ready({ inference: { dimension: "utility", index: 28 } }),
      }),
    ).toMatchObject({ id: "xrayInference", vars: { dimension: "utility", v: 28 } });
    expect(
      coachWordFor("analysis", { matches: ok, xray: ready({ ctRating: 0.82, tRating: 1.1 }) }),
    ).toMatchObject({
      id: "xraySideGap",
      vars: { weakSide: "ct", strongSide: "t" },
    });
    expect(coachWordFor("analysis", { matches: ok, xray: ready({ notObserved: 2 }) }).id).toBe(
      "xrayGaps",
    );
    expect(coachWordFor("analysis", { matches: ok, xray: ready() }).id).toBe("balanced");
  });

  it("a measured weakness in the observed numbers still wins; empty or thin samples stay insufficient", () => {
    expect(coachWordFor("analysis", { matches: many(6, { adr: 55 }), xray: ready() }).id).toBe(
      "adrLow",
    );
    expect(coachWordFor("analysis", { matches: ok, xray: ready({ state: "EMPTY" }) }).id).toBe(
      "insufficient",
    );
    expect(coachWordFor("analysis", { matches: many(2), xray: ready() }).id).toBe("insufficient");
  });

  it("a side with no measured rating is never compared", () => {
    expect(
      coachWordFor("analysis", { matches: ok, xray: ready({ ctRating: null, tRating: 1.4 }) }).id,
    ).toBe("balanced");
  });

  it("the card no longer shows the technical source line nor a permanent colored border", () => {
    const card = readFileSync("src/components/coachWord/CoachWordCard.tsx", "utf8");
    expect(card).not.toMatch(/cw\.source|COACH_WORD_VERSION/);
    expect(card).not.toMatch(
      /border-warning\/35|"border-primary\/30",|absolute inset-y-0 left-0 w-1/,
    );
    expect(card).toContain("analysis: { overview: true, xray: true }");
    for (const loc of ["pt-BR", "en", "es", "fr", "pt-PT"]) {
      const bank = readFileSync(`src/i18n/locales/vgl5/${loc}.ts`, "utf8");
      expect(bank).not.toMatch(/coach-word-v1|regras fixas|fixed rules|reglas fijas|règles fixes/);
      for (const id of ["xrayForming", "xrayInference", "xraySideGap", "xrayGaps"])
        expect(bank).toContain(`"cw.${id}.text"`);
    }
  });
});
