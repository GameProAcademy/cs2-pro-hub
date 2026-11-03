import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATALOG_LOCALES,
  detectTitleLanguage,
  isRecommendable,
  normalizeCatalog,
  planLessonImport,
  sourceFromCatalogJson,
  sourceFromCsv,
  titleContradictsLocale,
  topicsForTitle,
  urlProblem,
  type NormalizedLesson,
  type SourceCatalog,
  type StoredLesson,
} from "../catalog/catalogCore";
import {
  needsFromMessage,
  needsFromPlayer,
  pickRecommendations,
  sanitizeReplyLinks,
  type CatalogCandidate,
} from "../catalog/catalogSelect";

const SEED = resolve(
  process.cwd(),
  "supabase/seed/training-catalog/2026-11-03/training_catalog.json",
);
const seed = normalizeCatalog(sourceFromCatalogJson(JSON.parse(readFileSync(SEED, "utf8"))));
const H = "https://hub.gamepro.academy/courses";

const tiny = (over: Partial<SourceCatalog> = {}): SourceCatalog => ({
  courses: [
    {
      family: "rotina-produtiva",
      language: "BR",
      title: "Rotina [BR]",
      url: `${H}/rotina-produtiva-br/`,
      slug: "rotina-produtiva-br",
    },
    {
      family: "rotina-produtiva",
      language: "PT",
      title: "Rotina [PT]",
      url: `${H}/rotina-produtiva-pt/`,
      slug: "rotina-produtiva-pt",
    },
  ],
  lessons: [
    {
      family: "rotina-produtiva",
      title: "2 – Procrastinação",
      url: `${H}/rotina-produtiva-br/lessons/2-procrastinacao/`,
    },
    {
      family: "rotina-produtiva",
      title: "1 – Conceito de Produtividade",
      url: `${H}/rotina-produtiva/lessons/1-conceito/`,
    },
  ],
  ...over,
});

describe("training catalog: import of the owner's file (2026-11-03)", () => {
  it("imports every course and lesson, 0 rejected, 0 sample-course", () => {
    expect(seed.courses).toHaveLength(121);
    expect(seed.lessons).toHaveLength(2795);
    expect(seed.rejected).toHaveLength(0);
    expect([...seed.courses, ...seed.lessons].some((x) => x.url.includes("sample-course"))).toBe(
      false,
    );
    expect(new Set(seed.lessons.map((l) => l.url)).size).toBe(2795);
    expect(new Set(seed.lessons.map((l) => l.key)).size).toBe(2795);
  });

  it("courses: 25 pt-BR and 24 in each other locale", () => {
    const by = (loc: string) => seed.courses.filter((c) => c.locale === loc).length;
    expect([by("pt-BR"), by("pt-PT"), by("en"), by("es"), by("fr")]).toEqual([25, 24, 24, 24, 24]);
  });

  it("language is confirmed only by evidence; unlisted courses and contradicting titles stay pending", () => {
    const status = (s: string) => seed.lessons.filter((l) => l.languageStatus === s).length;
    expect(status("confirmed")).toBe(2230);
    expect(status("pending")).toBe(565);
    const evidence = (e: string) => seed.lessons.filter((l) => l.languageEvidence === e).length;
    expect(evidence("course_slug_suffix")).toBe(2159);
    expect(evidence("localized_course")).toBe(71);
    expect(evidence("unlisted_course")).toBe(503);
    expect(evidence("title_reads_as_pt")).toBe(62);
    // The source defect: Portuguese titles inside EN/ES/FR versions of In-Game 4 and 5.
    const mira = seed.lessons.filter((l) => l.title === "1 – Treinamento de Mira e Headshots");
    // Present in In-Game 3, 4 and 5: confirmed only where the course is Portuguese.
    expect(
      new Set(mira.filter((l) => l.languageStatus === "confirmed").map((l) => l.locale)),
    ).toEqual(new Set(["pt-BR", "pt-PT"]));
    for (const l of mira.filter((x) => x.languageStatus === "pending"))
      expect(["title_reads_as_pt", "unlisted_course"]).toContain(l.languageEvidence);
    // The ES communication course carries Portuguese lessons: never presented as Spanish.
    expect(
      seed.lessons.some(
        (l) =>
          l.courseSlug === "oratoria-y-comunicacion-es" &&
          l.title === "1 – Introdução" &&
          l.languageStatus === "confirmed",
      ),
    ).toBe(false);
  });

  it("every confirmed lesson of a listed course is linked to that course", () => {
    for (const l of seed.lessons) {
      if (l.languageEvidence === "unlisted_course") expect(l.courseKey).toBeNull();
      else expect(l.courseKey).toBe(`course:${l.courseSlug}`);
    }
  });

  it("three tracks, content groups link the language versions of the same content", () => {
    const tracks = new Set(seed.groups.map((g) => g.track));
    expect(tracks).toEqual(
      new Set(["counter_strike_in_game", "strategic_knowledge", "extra_skills", "unclassified"]),
    );
    const mindset = seed.courses
      .filter((c) => c.groupKey === "champion_mindset")
      .map((c) => c.locale)
      .sort();
    expect(mindset).toEqual(["en", "es", "fr", "pt-BR", "pt-PT"]);
    expect(seed.groups.find((g) => g.key === "bonus_content")?.active).toBe(false);
  });

  it("JSON and CSV give the same result", () => {
    const dir = resolve(process.cwd(), "supabase/seed/training-catalog/2026-11-03");
    const csvLessons = [
      "title,url,course_slug_in_lesson_url,course_family_slug,language_hint,language_status",
      ...seed.lessons.map(
        (l) => `"${l.title.replace(/"/g, '""')}",${l.url},${l.courseSlug},${l.family},,`,
      ),
    ].join("\r\n");
    const csvCourses = [
      "﻿course_family_slug,language,title,url,slug,track_hint",
      ...seed.courses.map(
        (c) =>
          `${c.family},${{ "pt-BR": "BR", "pt-PT": "PT", en: "EN", es: "ES", fr: "FR" }[c.locale]},"${c.title}",${c.url},${c.slug},x`,
      ),
    ].join("\n");
    const fromCsv = normalizeCatalog(sourceFromCsv(csvCourses, csvLessons));
    const sig = (n: typeof seed) =>
      n.lessons
        .map((l) => `${l.key}|${l.locale}|${l.languageStatus}`)
        .sort()
        .join("\n");
    expect(sig(fromCsv)).toBe(sig(seed));
    expect(dir).toContain("training-catalog");
  });
});

describe("training catalog: validation", () => {
  it("rejects every sample-course URL, course or lesson", () => {
    const n = normalizeCatalog(
      tiny({
        courses: [
          {
            family: "x",
            language: "BR",
            title: "S",
            url: `${H}/sample-course/`,
            slug: "sample-course",
          },
        ],
        lessons: [
          { family: "x", title: "S", url: `${H}/sample-course/lessons/a/` },
          { family: "x", title: "S", url: `${H}/x-br/lessons/sample-course-intro/` },
        ],
      }),
    );
    expect(n.rejected.map((r) => r.reason)).toEqual([
      "SAMPLE_COURSE",
      "SAMPLE_COURSE",
      "SAMPLE_COURSE",
    ]);
    expect(n.courses).toHaveLength(0);
    expect(n.lessons).toHaveLength(0);
  });

  it("detects invalid URLs", () => {
    for (const url of [
      "http://hub.gamepro.academy/courses/a/lessons/b/",
      "https://evil.example.com/courses/a/lessons/b/",
      "https://hub.gamepro.academy/courses/a/lessons/b",
      "https://hub.gamepro.academy/courses/A/lessons/b/",
      "javascript:alert(1)",
      "",
    ])
      expect(urlProblem(url, "lesson")).toBe("INVALID_URL");
    expect(urlProblem(`${H}/a-br/`, "course")).toBeNull();
    expect(urlProblem(`${H}/a-br/lessons/b/`, "lesson")).toBeNull();
  });

  it("prevents duplicates by URL and by key", () => {
    const l = {
      family: "rotina-produtiva",
      title: "Aula",
      url: `${H}/rotina-produtiva-br/lessons/a/`,
    };
    const n = normalizeCatalog(
      tiny({
        lessons: [
          l,
          l,
          { ...l, url: `${H}/rotina-produtiva-br/lessons/b/`, key: "lesson:rotina-produtiva-br/a" },
        ],
      }),
    );
    expect(n.lessons).toHaveLength(1);
    expect(n.rejected.map((r) => r.reason)).toEqual(["DUPLICATE_URL", "DUPLICATE_KEY"]);
  });

  it("title language check: loan words never override URL evidence; Portuguese in an EN course does", () => {
    expect(
      titleContradictsLocale("11 – Inserindo textos animados call to action", "pt-BR"),
    ).toBeNull();
    expect(titleContradictsLocale("7 – Inserindo Marca D’água no Canal", "pt-PT")).toBeNull();
    expect(titleContradictsLocale("1 – Treinamento de Mira e Headshots", "en")).toBe("pt");
    expect(titleContradictsLocale("1 – Introdução", "es")).toBe("pt");
    expect(detectTitleLanguage("Mirage CT – A")).toBeNull();
    // Untranslated Portuguese lessons with no grammatical marker (found by simulating a plan).
    expect(titleContradictsLocale("3 – Uso Eficaz de Granadas", "en")).toBe("pt");
    expect(titleContradictsLocale("3 – Uso Eficaz de Granadas", "fr")).toBe("pt");
    expect(titleContradictsLocale("Nível 1 – Parte 1", "es")).toBe("pt");
    // Valid Spanish stays confirmed.
    expect(titleContradictsLocale("3 – Uso Eficaz de Granadas", "es")).toBeNull();
    expect(titleContradictsLocale("4 – Comunicacion de Alto Nivel", "es")).toBeNull();
    expect(titleContradictsLocale("5 – Instalando WordPress", "es")).toBeNull();
    expect(titleContradictsLocale("3 – Effective Use of Grenades", "en")).toBeNull();
  });

  it("tags in-game lessons with multilingual topics", () => {
    expect(topicsForTitle("3 – Uso Eficaz de Granadas")).toContain("utility");
    expect(topicsForTitle("3 – Effective Use of Grenades")).toContain("utility");
    expect(topicsForTitle("2 – Prática de Controle Recoil")).toContain("aim");
    expect(topicsForTitle("8 – Nuke TR – Miolo")).toEqual(
      expect.arrayContaining(["map:de_nuke", "side_t", "positioning"]),
    );
  });
});

describe("training catalog: later imports", () => {
  const stored = (l: NormalizedLesson, over: Partial<StoredLesson> = {}): StoredLesson => ({
    id: "11111111-1111-1111-1111-111111111111",
    key: l.key,
    url: l.url,
    title: l.title,
    locale: l.locale,
    language_status: l.languageStatus,
    language_evidence: l.languageEvidence,
    topics: l.topics,
    ...over,
  });

  it("a changed URL updates the same row (same id, same key): associations survive", () => {
    const [lesson] = normalizeCatalog(tiny()).lessons;
    const plan = planLessonImport(
      [stored(lesson!, { url: `${H}/rotina-produtiva-br/lessons/old/` })],
      [lesson!],
    );
    expect(plan.insertLessons).toHaveLength(0);
    expect(plan.updateLessons).toEqual([
      { id: "11111111-1111-1111-1111-111111111111", changes: { url: lesson!.url } },
    ]);
  });

  it("rows missing from a partial file are reported, never deleted", () => {
    const n = normalizeCatalog(tiny());
    const extra = {
      ...stored(n.lessons[0]!),
      id: "22222222-2222-2222-2222-222222222222",
      key: "lesson:other/x",
      url: `${H}/other/lessons/x/`,
    };
    const plan = planLessonImport([stored(n.lessons[0]!), extra], [n.lessons[0]!]);
    expect(plan.notInFile).toBe(1);
    expect(plan.unchangedLessons).toBe(1);
  });

  it("an admin language decision is never overwritten by an import", () => {
    const [, pending] = normalizeCatalog(tiny()).lessons;
    expect(pending!.languageStatus).toBe("pending");
    const plan = planLessonImport(
      [
        stored(pending!, {
          locale: "pt-BR",
          language_status: "confirmed",
          language_evidence: "admin",
        }),
      ],
      [pending!],
    );
    expect(plan.updateLessons).toHaveLength(0);
  });

  it("new lessons and new families need no code change; unknown families wait for classification", () => {
    const n = normalizeCatalog(
      tiny({
        courses: [
          {
            family: "novo-curso",
            language: "EN",
            title: "New [EN]",
            url: `${H}/novo-curso-en/`,
            slug: "novo-curso-en",
          },
        ],
        lessons: [
          {
            family: "novo-curso",
            title: "1 – Something",
            url: `${H}/novo-curso-en/lessons/1-something/`,
          },
          {
            family: "counter-strike-2-pro-in-game-3",
            title: "9 – New Smoke Lineups",
            url: `${H}/counter-strike-2-pro-in-game-3-en/lessons/9-new-smokes/`,
          },
        ],
      }),
    );
    expect(n.groups.find((g) => g.key === "family:novo-curso")?.track).toBe("unclassified");
    const smoke = n.lessons.find((l) => l.title.includes("Smoke"))!;
    expect(smoke).toMatchObject({
      groupKey: "cs2_in_game_3",
      locale: "en",
      languageStatus: "confirmed",
    });
    expect(smoke.topics).toContain("utility");
  });
});

describe("training catalog: recommendation gate and selection", () => {
  const cand = (over: Partial<CatalogCandidate> = {}): CatalogCandidate => ({
    id: "l1",
    kind: "lesson",
    title: "3 – Uso Eficaz de Granadas",
    url: `${H}/counter-strike-2-pro-in-game-3-br/lessons/3-uso-eficaz-de-granadas/`,
    locale: "pt-BR",
    language_status: "confirmed",
    active: true,
    group_active: true,
    group_key: "cs2_in_game_3",
    track: "counter_strike_in_game",
    topics: ["in_game", "utility"],
    position: 3,
    ...over,
  });
  const utilityNeed = needsFromPlayer({
    dimensions: [{ dimension: "utility", index: 45 }],
    goals: [],
  });

  it("only active, classified, confirmed, same-locale, valid-URL items are recommendable", () => {
    const ok = cand();
    expect(isRecommendable(ok, "pt-BR")).toBe(true);
    expect(isRecommendable({ ...ok, active: false }, "pt-BR")).toBe(false);
    expect(isRecommendable({ ...ok, group_active: false }, "pt-BR")).toBe(false);
    expect(isRecommendable({ ...ok, language_status: "pending" }, "pt-BR")).toBe(false);
    expect(isRecommendable({ ...ok, track: "unclassified" }, "pt-BR")).toBe(false);
    expect(isRecommendable(ok, "pt-PT")).toBe(false);
    expect(isRecommendable({ ...ok, url: `${H}/sample-course/lessons/x/` }, "pt-BR")).toBe(false);
  });

  for (const locale of CATALOG_LOCALES) {
    it(`${locale}: picks only items of the player's locale`, () => {
      const items = CATALOG_LOCALES.map((loc, i) =>
        cand({ id: `l${i}`, locale: loc, group_key: `g${i}`, url: `${H}/c-${i}/lessons/x/` }),
      );
      const picked = pickRecommendations(items, utilityNeed, locale, { max: 5 });
      expect(picked.map((p) => p.id)).toEqual([`l${CATALOG_LOCALES.indexOf(locale)}`]);
    });
  }

  it("filters by track and never repeats a group or URL", () => {
    const items = [
      cand(),
      cand({ id: "l2", url: `${H}/counter-strike-2-pro-in-game-3-br/lessons/other/` }),
      cand({
        id: "s1",
        group_key: "productive_routine",
        track: "strategic_knowledge",
        topics: ["routine_productivity"],
        url: `${H}/rotina-produtiva-br/lessons/2/`,
      }),
    ];
    const needs = [
      ...utilityNeed,
      ...needsFromPlayer({ dimensions: [{ dimension: "consistency", index: 40 }], goals: [] }),
    ];
    expect(pickRecommendations(items, needs, "pt-BR", { max: 5 }).map((p) => p.id)).toEqual([
      "l1",
      "s1",
    ]);
    expect(
      pickRecommendations(items, needs, "pt-BR", { tracks: ["strategic_knowledge"] }).map(
        (p) => p.id,
      ),
    ).toEqual(["s1"]);
  });

  it("no need, or no matching content → no recommendation", () => {
    expect(pickRecommendations([cand()], [], "pt-BR")).toEqual([]);
    expect(
      pickRecommendations([cand()], needsFromMessage("qual foi meu rating?"), "pt-BR"),
    ).toEqual([]);
    // A null dimension is not a weakness.
    expect(
      needsFromPlayer({ dimensions: [{ dimension: "utility", index: null }], goals: [] }),
    ).toEqual([]);
  });

  it("a lesson beats its whole course on the same need", () => {
    const course = cand({
      id: "c1",
      kind: "course",
      url: `${H}/counter-strike-2-pro-in-game-3-br/`,
      position: null,
    });
    const picked = pickRecommendations([course, cand()], utilityNeed, "pt-BR");
    expect(picked.map((p) => p.id)).toEqual(["l1"]);
  });

  it("strips every link the server did not select", () => {
    const allowed = new Set([`${H}/a-br/lessons/b/`]);
    const reply = `Veja [esta aula](${H}/a-br/lessons/b/) e [outra](https://evil.example.com/x) ou ${H}/invented/lessons/z/.`;
    const { text, removed } = sanitizeReplyLinks(reply, allowed);
    expect(text).toContain(`(${H}/a-br/lessons/b/)`);
    expect(text).not.toContain("evil.example.com");
    expect(text).not.toContain("/invented/");
    expect(text).toContain("outra");
    expect(removed).toBe(2);
  });
});

describe("training catalog: admin access control (source and schema)", () => {
  const fns = readFileSync(resolve(process.cwd(), "src/lib/catalogAdmin.functions.ts"), "utf8");
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261103120000_training_catalog.sql"),
    "utf8",
  );

  it("every admin server function resolves the administrator before touching data", () => {
    const handlers = fns.split("createServerFn(").slice(1);
    expect(handlers.length).toBeGreaterThanOrEqual(7);
    for (const h of handlers) {
      expect(h).toContain("requireSupabaseAuth");
      expect(h).toContain("await resolveAdmin(ctx)");
      expect(h).not.toContain("supabaseAdmin");
    }
  });

  it("only admin_master writes; players read active rows only; anon has no grant", () => {
    for (const t of ["catalog_content_groups", "catalog_courses", "catalog_lessons"]) {
      expect(sql).toMatch(
        new RegExp(
          `ON public\\.${t} FOR ALL TO authenticated\\s+USING \\(public\\.is_admin_master\\(auth\\.uid\\(\\)\\)\\) WITH CHECK \\(public\\.is_admin_master`,
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `ON public\\.${t} FOR SELECT TO authenticated\\s+USING \\(active OR public\\.is_admin_master`,
        ),
      );
    }
    expect(sql).not.toMatch(/TO anon/);
    expect(sql).toContain("strpos(pg_catalog.lower(_url), 'sample-course') = 0");
  });
});
