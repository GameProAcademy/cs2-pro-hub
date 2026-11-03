import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CATALOG_LOCALES, normalizeCatalog, sourceFromCatalogJson } from "../catalog/catalogCore";
import type { CatalogLocale } from "../catalog/catalogCore";
import {
  coachNeeds,
  pickRecommendations,
  sanitizeReplyLinks,
  type CatalogCandidate,
  type DimensionReading,
} from "../catalog/catalogSelect";
import { coachSystemPrompt } from "../coach/coachContext";
import { buildTrainingPlan, planTopics, type TrainingPlanInput } from "../training/trainingPlan";

// The owner's real catalog, as the database holds it after the initial load.
const seed = normalizeCatalog(
  sourceFromCatalogJson(
    JSON.parse(
      readFileSync(
        resolve(process.cwd(), "supabase/seed/training-catalog/2026-11-03/training_catalog.json"),
        "utf8",
      ),
    ),
  ),
);
const groups = new Map(seed.groups.map((g) => [g.key, g]));
const all: CatalogCandidate[] = [
  ...seed.lessons.map((l, i) => ({
    id: `L${i}`,
    kind: "lesson" as const,
    title: l.title,
    url: l.url,
    locale: l.locale,
    language_status: l.languageStatus,
    active: l.active,
    group_active: groups.get(l.groupKey)!.active,
    group_key: l.groupKey,
    track: groups.get(l.groupKey)!.track,
    topics: l.topics,
    position: l.position,
  })),
  ...seed.courses.map((c, i) => ({
    id: `C${i}`,
    kind: "course" as const,
    title: c.title,
    url: c.url,
    locale: c.locale,
    language_status: "confirmed" as const,
    active: c.active,
    group_active: groups.get(c.groupKey)!.active,
    group_key: c.groupKey,
    track: groups.get(c.groupKey)!.track,
    topics: groups.get(c.groupKey)!.topics,
    position: null,
  })),
];
const byUrl = new Map(all.map((c) => [c.url, c]));
/** What the database read returns for these topics (locale/topic filter; RLS active rows). */
const fetchLike = (locale: CatalogLocale, topics: string[]) =>
  all.filter(
    (c) =>
      c.locale === c.locale &&
      c.active &&
      c.topics.some((t) => topics.includes(t)) &&
      c.locale === locale,
  );

// The owner's production DNA (2026-11-03): clutch 16, teamplay 35, utility 45 lowest.
const OWNER: DimensionReading[] = [
  { dimension: "aim", index: 63 },
  { dimension: "dueling", index: 55 },
  { dimension: "survivability", index: 57 },
  { dimension: "positioning", index: 69 },
  { dimension: "utility", index: 45 },
  { dimension: "decision_making", index: 77 },
  { dimension: "teamplay", index: 35 },
  { dimension: "economy", index: null },
  { dimension: "clutch", index: 16 },
  { dimension: "consistency", index: 54 },
];

function plan(locale: CatalogLocale, over: Partial<TrainingPlanInput> = {}) {
  const input = {
    locale,
    dataState: "READY" as const,
    dimensions: OWNER,
    goals: [] as string[],
    maps: ["de_cache", "de_dust2", "de_mirage"],
    ...over,
  };
  return buildTrainingPlan({ ...input, candidates: fetchLike(locale, planTopics(input)) });
}
const items = (p: ReturnType<typeof plan>) => [
  ...p.weeks.flatMap((w) => w.items),
  ...p.complementary,
];

describe("Meu Treinamento: personalized plan from the real catalog", () => {
  it("priorities are the weakest observed dimensions; each gets practice and real lessons", () => {
    const p = plan("pt-BR");
    expect(p.state).toBe("READY");
    expect(p.priorities).toEqual([
      { dimension: "clutch", index: 16 },
      { dimension: "teamplay", index: 35 },
      { dimension: "utility", index: 45 },
    ]);
    expect(p.weeks.map((w) => w.focus)).toEqual(["clutch", "teamplay", "utility", "consolidation"]);
    for (const w of p.weeks.slice(0, 3)) expect(w.practice).toEqual([w.focus]);
  });

  it("in-game lesson for a utility weakness (case 1)", () => {
    const week = plan("pt-BR").weeks.find((w) => w.focus === "utility")!;
    expect(week.items.map((r) => r.title)).toContain("3 – Uso Eficaz de Granadas");
    expect(week.items.every((r) => r.track === "counter_strike_in_game")).toBe(true);
  });

  it("Strategic Knowledge for teamplay/communication (case 2) and consistency (case 3)", () => {
    const comp = plan("pt-BR").complementary;
    expect(
      comp.some((r) => r.track === "strategic_knowledge" && r.need.topic === "communication"),
    ).toBe(true);
    const consistency = plan("pt-BR", {
      dimensions: [{ dimension: "consistency", index: 30 }],
    }).complementary;
    expect(
      consistency.some(
        (r) => r.need.topic === "routine_productivity" && r.track === "strategic_knowledge",
      ),
    ).toBe(true);
  });

  it("Extra Skills when the player's goal is a gaming career (case 4)", () => {
    const p = plan("pt-BR", { dimensions: [], goals: ["PRO_CAREER"] });
    expect(items(p).some((r) => r.track === "extra_skills")).toBe(true);
  });

  for (const locale of CATALOG_LOCALES) {
    it(`${locale}: every plan item is a real catalog item in ${locale}, active and language-confirmed`, () => {
      const p = plan(locale, { goals: ["PRO_CAREER", "COMPETITIVE_TEAM"] });
      expect(items(p).length).toBeGreaterThan(0);
      for (const r of items(p)) {
        const stored = byUrl.get(r.url)!;
        expect(stored).toBeDefined();
        expect(stored.title).toBe(r.title);
        expect(stored.locale).toBe(locale);
        expect(stored.language_status).toBe("confirmed");
        expect(stored.active && stored.group_active).toBe(true);
        expect(r.url).not.toContain("sample-course");
      }
      // The untranslated Portuguese lessons of In-Game 4/5 are never served in EN/ES/FR.
      if (locale === "en" || locale === "fr")
        expect(items(p).some((r) => /Uso Eficaz|Treinamento de Mira/.test(r.title))).toBe(false);
    });
  }

  it("no evidence → no item: no data, and no weakness without goals", () => {
    expect(plan("pt-BR", { dataState: "NO_MATCHES" }).state).toBe("NO_DATA");
    const strong = plan("en", {
      dimensions: OWNER.map((d) => ({ ...d, index: d.index === null ? null : 80 })),
    });
    expect(strong.state).toBe("NO_PRIORITY");
    expect(items(strong)).toEqual([]);
  });

  it("a small sample keeps the plan but marks it provisional", () => {
    expect(plan("pt-BR", { dataState: "INSUFFICIENT_SAMPLE" }).provisional).toBe(true);
  });
});

describe("AI Coach: contextual catalog recommendations", () => {
  const coach = (locale: CatalogLocale, message: string) => {
    const needs = coachNeeds(message, OWNER);
    return pickRecommendations(
      fetchLike(locale, [...new Set(needs.map((n) => n.topic))]),
      needs,
      locale,
      {
        max: 3,
        onePerNeed: true,
      },
    );
  };

  it("grenades → in-game utility lesson", () => {
    const r = coach("pt-BR", "Como melhorar meu uso de granadas?");
    expect(r[0]).toMatchObject({
      title: "3 – Uso Eficaz de Granadas",
      track: "counter_strike_in_game",
    });
  });

  it("communication with the team → Strategic Knowledge", () => {
    const r = coach("es", "¿Cómo puedo mejorar mi comunicación con el equipo?");
    expect(
      r.some((x) => x.track === "strategic_knowledge" && x.need.topic === "communication"),
    ).toBe(true);
  });

  it("working in the gaming market → Extra Skills", () => {
    const r = coach(
      "fr",
      "Comment commencer à travailler dans le marché du jeu vidéo comme créateur de contenu ?",
    );
    expect(r.some((x) => x.track === "extra_skills")).toBe(true);
  });

  // Production 2026-11-03 (reply catalog=0): "Por onde começo?" was not read as a request to
  // learn, and "minha marca" was not read as branding.
  it("building a personal brand / career, phrased as 'where do I start' → Extra Skills (5 locales)", () => {
    const cases: Array<[CatalogLocale, string]> = [
      ["pt-BR", "Quero construir minha marca como jogador e crescer na carreira. Por onde começo?"],
      ["pt-PT", "Quero construir a minha marca como jogador. Por onde começo?"],
      ["en", "I want to build my brand as a player. Where do I start?"],
      ["es", "Quiero construir mi marca como jugador, ¿por dónde empiezo?"],
      ["fr", "Je veux développer ma marque de joueur, par où commencer ?"],
    ];
    for (const [locale, message] of cases) {
      const r = coach(locale, message);
      expect(r.length, `${locale}: ${message}`).toBeGreaterThan(0);
      expect(
        r.some((x) => x.track === "extra_skills" && ["branding", "career"].includes(x.need.topic)),
        locale,
      ).toBe(true);
    }
  });

  it("how to improve, no topic named → weakest observed DNA dimensions", () => {
    const needs = coachNeeds("How can I improve?", OWNER);
    expect([...new Set(needs.map((n) => n.detail))]).toEqual(["clutch", "teamplay"]);
  });

  it("no relevant content → no recommendation", () => {
    for (const m of [
      "Qual foi meu rating médio?",
      "What was my KAST on Mirage?",
      "Quantos inimigos eu ceguei com flash em cada partida?",
      "Bonjour",
    ])
      expect(coach("pt-BR", m)).toEqual([]);
  });

  for (const locale of CATALOG_LOCALES) {
    it(`${locale}: recommendations are real catalog items of ${locale}; invented links are stripped`, () => {
      const r = coach(locale, "How can I improve my grenades / granadas / smoke utility?");
      for (const x of r) {
        expect(byUrl.get(x.url)?.title).toBe(x.title);
        expect(byUrl.get(x.url)?.locale).toBe(locale);
      }
      const allowed = new Set(r.map((x) => x.url));
      const reply = `Veja ${r[0]?.url ?? ""} e https://hub.gamepro.academy/courses/invented/lessons/x/`;
      const clean = sanitizeReplyLinks(reply, allowed).text;
      expect(clean).not.toContain("/invented/");
      if (r[0]) expect(clean).toContain(r[0].url);
      expect(coachSystemPrompt(locale)).toContain(
        "you may recommend ONLY items from catalogSuggestions",
      );
    });
  }
});

describe("integration wiring (source)", () => {
  const coachFn = readFileSync(resolve(process.cwd(), "src/lib/coach.functions.ts"), "utf8");
  const trainingFn = readFileSync(resolve(process.cwd(), "src/lib/training.functions.ts"), "utf8");

  it("the Coach reads a bounded catalog slice and stores only sanitized replies", () => {
    expect(coachFn).toContain("fetchCatalogCandidates(");
    expect(coachFn).toContain("max: 3");
    expect(coachFn).toContain("sanitizeReplyLinks(");
    expect(coachFn).toMatch(/content,\n\s+\/\/ Provenance|content,\s*\n/);
    expect(coachFn).not.toMatch(/content: completion\.content/);
  });

  it("the Training plan is authenticated and reads the catalog with the caller's session", () => {
    expect(trainingFn).toContain("requireSupabaseAuth");
    expect(trainingFn).toContain("fetchCatalogCandidates(db, data.locale");
    expect(trainingFn).not.toContain("supabaseAdmin");
  });
});
