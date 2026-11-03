/**
 * Training catalog core (pure; no I/O, no imports).
 *
 * One module shared by every path that touches catalog data, so the rules cannot drift:
 *  - the admin import (server function) and the reproducible initial load script
 *    (`scripts/catalog/build-import-sql.ts`, run with `node --experimental-strip-types`);
 *  - the Training plan and the AI Coach selection (only `isRecommendable` items).
 *
 * Source of truth for the catalog is the database (`catalog_*` tables); this module only
 * validates, normalizes and classifies. Nothing here hard-codes a lesson or a URL.
 *
 * Language rule (owner requirement): a lesson's language is CONFIRMED only by evidence —
 * its course slug carries a locale suffix (-br/-en/-es/-fr/-pt), or its course slug is a
 * localized course of known language. A title that clearly reads as another language
 * overrides that evidence and leaves the lesson PENDING. Lessons of unlisted course slugs
 * stay PENDING. Pending lessons are never recommended.
 */

export const CATALOG_LOCALES = ["pt-BR", "pt-PT", "en", "es", "fr"] as const;
export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

/** Language codes used by the source files (`courses_normalized.csv`, `training_catalog.json`). */
export const SOURCE_LANGUAGE: Record<string, CatalogLocale> = {
  BR: "pt-BR",
  PT: "pt-PT",
  EN: "en",
  ES: "es",
  FR: "fr",
};
const SLUG_SUFFIX: Record<string, CatalogLocale> = {
  br: "pt-BR",
  pt: "pt-PT",
  en: "en",
  es: "es",
  fr: "fr",
};

export const CATALOG_TRACKS = [
  "counter_strike_in_game",
  "strategic_knowledge",
  "extra_skills",
  "unclassified",
] as const;
export type CatalogTrack = (typeof CATALOG_TRACKS)[number];

export type LanguageStatus = "confirmed" | "pending";

/** Hosts and shapes the product accepts; the database enforces the same rule (CHECK). */
export const COURSE_URL_RE = /^https:\/\/hub\.gamepro\.academy\/courses\/[a-z0-9-]+\/$/;
export const LESSON_URL_RE =
  /^https:\/\/hub\.gamepro\.academy\/courses\/[a-z0-9-]+\/lessons\/[a-z0-9-]+\/$/;
export const FORBIDDEN_URL_FRAGMENT = "sample-course";

export type UrlProblem = "SAMPLE_COURSE" | "INVALID_URL";

export function urlProblem(url: string, kind: "course" | "lesson"): UrlProblem | null {
  if (url.toLowerCase().includes(FORBIDDEN_URL_FRAGMENT)) return "SAMPLE_COURSE";
  return (kind === "course" ? COURSE_URL_RE : LESSON_URL_RE).test(url) ? null : "INVALID_URL";
}

/** `/courses/<course-slug>/lessons/<lesson-slug>/` → slugs, or null. */
export function lessonSlugs(url: string): { course: string; lesson: string } | null {
  const m = /\/courses\/([a-z0-9-]+)\/lessons\/([a-z0-9-]+)\/$/.exec(url);
  return m ? { course: m[1]!, lesson: m[2]! } : null;
}

export function localeFromCourseSlug(slug: string): CatalogLocale | null {
  const m = /-(br|pt|en|es|fr)$/.exec(slug);
  return m ? SLUG_SUFFIX[m[1]!]! : null;
}

/* ------------------------------------------------------------------ *
 * Title language check                                                 *
 * ------------------------------------------------------------------ */

type LangFamily = "pt" | "es" | "fr" | "en";
const FAMILY_OF: Record<CatalogLocale, LangFamily> = {
  "pt-BR": "pt",
  "pt-PT": "pt",
  en: "en",
  es: "es",
  fr: "fr",
};

/** Markers that are distinctive for each language in short course titles. */
const LANGUAGE_MARKERS: Record<LangFamily, RegExp[]> = {
  pt: [
    /ção\b/,
    /ções\b/,
    /[ãõ]/,
    / (do|da|dos|das|com|seu|sua|seus|suas|você|não|nos|nas|um|uma|ao|os|e) /,
    /\bdo /,
  ],
  es: [/ción\b/, /ciones\b/, /ñ/, /[¿¡]/, / (el|los|las|del|tu|tus|y|una|al|cómo) /],
  fr: [/[èœ]/, / (le|les|des|du|et|vos|votre|pour|au|aux) /, /(^| )[ld]['’][a-zàâéèêîôû]/],
  en: [/ (the|of|and|your|how|with|to|for|from) /, /\bthe /, /\bhow /],
};

/**
 * Language family a title clearly reads as, or null when it is not distinctive
 * ("Mirage CT – A", "Introduction", "Nível 1 – Parte 1" are all null).
 */
function languageScores(title: string): Array<{ lang: LangFamily; score: number }> {
  const text = ` ${title
    .toLowerCase()
    .replace(/[–—:|()[\],.!?]/g, " ")
    .replace(/\s+/g, " ")} `;
  const scores = (Object.keys(LANGUAGE_MARKERS) as LangFamily[]).map((lang) => ({
    lang,
    score: LANGUAGE_MARKERS[lang].filter((re) => re.test(text)).length,
  }));
  return scores.sort((a, b) => b.score - a.score);
}

export function detectTitleLanguage(title: string): LangFamily | null {
  const scores = languageScores(title);
  const [first, second] = scores;
  if (!first || first.score === 0) return null;
  if (second && second.score === first.score) return null;
  return first.lang;
}

/**
 * Does the title read as another language than the evidenced locale?
 *  - A Portuguese title inside an EN/ES/FR course: one distinctive marker is enough. That is the
 *    defect present in the source (untranslated "Treinamento de Mira e Headshots" lessons in the
 *    EN/ES/FR versions of In-Game 4 and 5).
 *  - Any other contradiction needs two distinct markers and more than the locale's own, so one
 *    loan word ("call to action", "making of", "D’água") never overrides URL evidence.
 */
export function titleContradictsLocale(title: string, locale: CatalogLocale): LangFamily | null {
  const scores = languageScores(title);
  const top = scores[0];
  const second = scores[1];
  const ownLang = FAMILY_OF[locale];
  const own = scores.find((s) => s.lang === ownLang)?.score ?? 0;
  if (!top || top.lang === ownLang || top.score === 0 || top.score <= own) return null;
  if (second && second.score === top.score) return null;
  if (top.lang === "pt" && ownLang !== "pt") return top.lang;
  return top.score >= 2 ? top.lang : null;
}

/* ------------------------------------------------------------------ *
 * Content groups, tracks and topics                                    *
 * ------------------------------------------------------------------ */

/**
 * Same content published under different family slugs per language. Classification by
 * lesson CONTENT (reviewed 2026-11-03), not by name only; editable later by an admin
 * (`track_source = 'admin'` is never overwritten by an import).
 */
interface GroupDefinition {
  track: CatalogTrack;
  families: string[];
  topics: string[];
  active?: boolean;
}

export const CONTENT_GROUPS: Record<string, GroupDefinition> = {
  cs2_in_game_1: {
    track: "counter_strike_in_game",
    families: ["counter-strike-2-pro-in-game-1"],
    topics: ["in_game"],
  },
  cs2_in_game_2: {
    track: "counter_strike_in_game",
    families: ["counter-strike-2-pro-in-game-2"],
    topics: ["in_game", "ranked_progression"],
  },
  cs2_in_game_3: {
    track: "counter_strike_in_game",
    families: ["counter-strike-2-pro-in-game-3"],
    topics: ["in_game"],
  },
  cs2_in_game_4: {
    track: "counter_strike_in_game",
    families: ["counter-strike-2-pro-in-game-4"],
    topics: ["in_game"],
  },
  cs2_in_game_5: {
    track: "counter_strike_in_game",
    families: ["counter-strike-2-pro-in-game-5"],
    topics: ["in_game"],
  },
  champion_mindset: {
    track: "strategic_knowledge",
    families: [
      "mindset-de-campeao",
      "champion-mindset",
      "mentalidad-de-campeon",
      "mentalite-de-champion",
    ],
    topics: ["mindset"],
  },
  mental_drives: {
    track: "strategic_knowledge",
    families: ["drives-mentais", "mental-drives", "drives-mentales", "drives-mentaux"],
    topics: ["mindset"],
  },
  success_fundamentals: {
    track: "strategic_knowledge",
    families: [
      "fundamentos-do-sucesso",
      "fundamentals-of-success",
      "fundamentos-del-exito",
      "fondamentaux-du-succes",
    ],
    topics: ["mindset"],
  },
  personal_development: {
    track: "strategic_knowledge",
    families: [
      "desenvolvimento-pessoal",
      "personal-development",
      "desarrollo-personal",
      "developpement-personnel",
    ],
    topics: ["personal_development", "routine_productivity"],
  },
  productive_routine: {
    track: "strategic_knowledge",
    families: ["rotina-produtiva", "productive-routine", "rutina-productiva", "routine-productive"],
    topics: ["routine_productivity"],
  },
  communication: {
    track: "strategic_knowledge",
    families: [
      "oratoria-e-comunicacao",
      "public-speaking-and-communication",
      "oratoria-y-comunicacion",
      "prise-de-parole-et-communication",
    ],
    topics: ["communication"],
  },
  stretching_mobility: {
    track: "strategic_knowledge",
    families: [
      "alongamentos-respiracao-e-mobilidade",
      "stretching-breathing-and-mobility",
      "estiramientos-respiracion-y-movilidad",
      "etirements-respiration-et-mobilite",
    ],
    topics: ["health_mobility"],
  },
  video_editing: {
    track: "extra_skills",
    families: ["edicao-de-video", "edicao-de-video-2", "edicion-de-video", "montage-video"],
    topics: ["content_creation", "video_editing"],
  },
  capcut: {
    track: "extra_skills",
    families: ["capcut"],
    topics: ["content_creation", "video_editing"],
  },
  branding: {
    track: "extra_skills",
    families: ["marca-e-branding", "mark-and-branding", "marca-y-branding", "marque-et-branding"],
    topics: ["branding", "career"],
  },
  chatgpt: { track: "extra_skills", families: ["chatgpt"], topics: ["ai_tools"] },
  midjourney: {
    track: "extra_skills",
    families: ["midjourney", "midjourney-3"],
    topics: ["ai_tools"],
  },
  facebook_ads: { track: "extra_skills", families: ["facebook-ads"], topics: ["marketing_ads"] },
  google_ads: { track: "extra_skills", families: ["google-ads"], topics: ["marketing_ads"] },
  pinterest: { track: "extra_skills", families: ["pinterest"], topics: ["marketing_ads"] },
  tiktok: {
    track: "extra_skills",
    families: ["tik-tok"],
    topics: ["content_creation", "marketing_ads"],
  },
  youtube: {
    track: "extra_skills",
    families: ["youtube"],
    topics: ["content_creation", "streaming"],
  },
  wordpress: { track: "extra_skills", families: ["wordpress"], topics: ["web"] },
  // Not classified with enough evidence: one introductory lesson, kept for owner review.
  gaming_history: { track: "unclassified", families: ["a-era-do-video-game"], topics: [] },
  // Announcements ("Os Bônus Estão Chegando"), not lessons: imported inactive.
  bonus_content: {
    track: "unclassified",
    families: ["conteudo-bonus", "bonus-content", "contenido-bonus", "contenu-bonus"],
    topics: [],
    active: false,
  },
};

const GROUP_OF_FAMILY: Record<string, string> = Object.fromEntries(
  Object.entries(CONTENT_GROUPS).flatMap(([key, g]) => g.families.map((f) => [f, key])),
);

/** Unknown families become their own unclassified group (never recommended until classified). */
export function groupOfFamily(family: string): { key: string; definition: GroupDefinition } {
  const key = GROUP_OF_FAMILY[family];
  if (key) return { key, definition: CONTENT_GROUPS[key]! };
  return {
    key: `family:${family}`,
    definition: { track: "unclassified", families: [family], topics: [] },
  };
}

/** Topic codes shared by the catalog, the Training plan and the Coach selection. */
export const TOPIC_RULES: Array<[string, RegExp]> = [
  [
    "aim",
    /\b(mira|aim|headshots?|recoil|recul|retroceso|crosshair|punter[ií]a|vis[ée]e|sensibili|sensitiv|dpi)/,
  ],
  ["utility", /(granad|grenade|\bsmokes?\b|\bflash|molotov|utilit)/],
  [
    "positioning",
    /(posicion|positioning|positionnement|controle de mapa|controlo do mapa|map control|control del mapa|contr[ôo]le de la carte)/,
  ],
  ["economy", /econom/],
  [
    "roles_teamplay",
    /(fun[çc][õo]es|\broles?\b|r[ôo]les|funciones|responsab|time profissional|professional team|equipo profesional|[ée]quipe professionnelle)/,
  ],
  [
    "decision",
    /(after plant|post-?plant|rota[çc]|rotat|rotaci|realmente funciona|really works|fonctionne vraiment)/,
  ],
  ["demo_review", /(demos?\b|erros|mistakes|errores|erreurs)/],
  [
    "settings",
    /(configura|settings|param[èe]tres|r[ée]glages|v[ií]deo e [áa]udio|video and audio|v[ií]deo y audio|vid[ée]o et audio)/,
  ],
  [
    "warmup_routine",
    /(aquecimento|warm-?up|calentamiento|[ée]chauffement|mapas de trein|training maps|mapas de entrenamiento|cartes d.entra[îi]nement)/,
  ],
  ["skins_market", /\bskins?\b/],
  ["map:de_mirage", /\bmirage\b/],
  ["map:de_ancient", /\bancient\b/],
  ["map:de_dust2", /\bdust ?2\b/],
  ["map:de_overpass", /\boverpass\b/],
  ["map:de_inferno", /\binferno\b/],
  ["map:de_anubis", /\banubis\b/],
  ["map:de_nuke", /\bnuke\b/],
  ["map:de_vertigo", /\bvertigo\b/],
  ["side_ct", /\bct\b/],
  ["side_t", /\b(tr|t)\b/],
  ["routine_productivity", /(procrastina|produtiv|productiv|motiva|foco|focus|enfoque|concentra)/],
  ["mindset", /(mindset|mentalid|mentalit|ansiedad|ansiedade|anxi)/],
];

export function topicsForTitle(title: string): string[] {
  const text = title.toLowerCase();
  const found = TOPIC_RULES.filter(([, re]) => re.test(text)).map(([topic]) => topic);
  // A map-position lesson is positioning content too.
  if (found.some((t) => t.startsWith("map:")) && !found.includes("positioning"))
    found.push("positioning");
  return found;
}

/* ------------------------------------------------------------------ *
 * Normalization                                                        *
 * ------------------------------------------------------------------ */

export interface SourceCourse {
  family: string;
  language: string;
  title: string;
  url: string;
  slug: string;
}
export interface SourceLesson {
  title: string;
  url: string;
  family: string;
  /** Optional stable key from a previous export; matches before url. */
  key?: string;
}
export interface SourceCatalog {
  courses: SourceCourse[];
  lessons: SourceLesson[];
}

export interface NormalizedGroup {
  key: string;
  track: CatalogTrack;
  topics: string[];
  active: boolean;
}
export interface NormalizedCourse {
  key: string;
  groupKey: string;
  family: string;
  slug: string;
  locale: CatalogLocale;
  title: string;
  url: string;
  active: boolean;
}
export interface NormalizedLesson {
  key: string;
  groupKey: string;
  family: string;
  courseSlug: string;
  /** Null when the course slug is not a listed localized course. */
  courseKey: string | null;
  locale: CatalogLocale | null;
  languageStatus: LanguageStatus;
  languageEvidence: string;
  title: string;
  url: string;
  position: number | null;
  topics: string[];
  active: boolean;
}
export interface Rejection {
  kind: "course" | "lesson";
  ref: string;
  reason: UrlProblem | "DUPLICATE_URL" | "DUPLICATE_KEY" | "UNKNOWN_LANGUAGE" | "MISSING_TITLE";
}
export interface NormalizedCatalog {
  groups: NormalizedGroup[];
  courses: NormalizedCourse[];
  lessons: NormalizedLesson[];
  rejected: Rejection[];
}

function cleanTitle(title: unknown): string {
  return typeof title === "string" ? title.replace(/\s+/g, " ").trim().slice(0, 300) : "";
}

function lessonPosition(title: string): number | null {
  const m = /^(\d{1,3})\b/.exec(title);
  return m ? Number(m[1]) : null;
}

export function normalizeCatalog(source: SourceCatalog): NormalizedCatalog {
  const rejected: Rejection[] = [];
  const groups = new Map<string, NormalizedGroup>();
  const ensureGroup = (family: string) => {
    const { key, definition } = groupOfFamily(family);
    if (!groups.has(key))
      groups.set(key, {
        key,
        track: definition.track,
        topics: [...definition.topics],
        active: definition.active ?? true,
      });
    return groups.get(key)!;
  };

  const courses: NormalizedCourse[] = [];
  const courseBySlug = new Map<string, NormalizedCourse>();
  const seenUrls = new Set<string>();
  for (const c of source.courses) {
    const url = (c.url ?? "").trim();
    const title = cleanTitle(c.title);
    const problem = urlProblem(url, "course");
    if (problem) {
      rejected.push({ kind: "course", ref: url || c.slug, reason: problem });
      continue;
    }
    const locale = SOURCE_LANGUAGE[(c.language ?? "").trim().toUpperCase()];
    if (!locale) {
      rejected.push({ kind: "course", ref: url, reason: "UNKNOWN_LANGUAGE" });
      continue;
    }
    if (!title) {
      rejected.push({ kind: "course", ref: url, reason: "MISSING_TITLE" });
      continue;
    }
    if (seenUrls.has(url) || courseBySlug.has(c.slug)) {
      rejected.push({
        kind: "course",
        ref: url,
        reason: seenUrls.has(url) ? "DUPLICATE_URL" : "DUPLICATE_KEY",
      });
      continue;
    }
    seenUrls.add(url);
    const group = ensureGroup(c.family);
    const course: NormalizedCourse = {
      key: `course:${c.slug}`,
      groupKey: group.key,
      family: c.family,
      slug: c.slug,
      locale,
      title,
      url,
      active: group.active,
    };
    courses.push(course);
    courseBySlug.set(c.slug, course);
  }

  const lessons: NormalizedLesson[] = [];
  const seenKeys = new Set<string>();
  for (const l of source.lessons) {
    const url = (l.url ?? "").trim();
    const title = cleanTitle(l.title);
    const problem = urlProblem(url, "lesson");
    if (problem) {
      rejected.push({ kind: "lesson", ref: url, reason: problem });
      continue;
    }
    if (!title) {
      rejected.push({ kind: "lesson", ref: url, reason: "MISSING_TITLE" });
      continue;
    }
    const slugs = lessonSlugs(url)!;
    const key = l.key?.trim() || `lesson:${slugs.course}/${slugs.lesson}`;
    if (seenUrls.has(url) || seenKeys.has(key)) {
      rejected.push({
        kind: "lesson",
        ref: url,
        reason: seenUrls.has(url) ? "DUPLICATE_URL" : "DUPLICATE_KEY",
      });
      continue;
    }
    seenUrls.add(url);
    seenKeys.add(key);

    const course = courseBySlug.get(slugs.course) ?? null;
    const family = course?.family ?? l.family;
    const group = ensureGroup(family);
    let locale: CatalogLocale | null = localeFromCourseSlug(slugs.course);
    let evidence = locale ? "course_slug_suffix" : "";
    if (!locale && course) {
      locale = course.locale;
      evidence = "localized_course";
    }
    let status: LanguageStatus = locale ? "confirmed" : "pending";
    if (!locale) evidence = "unlisted_course";
    if (locale) {
      const contradiction = titleContradictsLocale(title, locale);
      if (contradiction) {
        status = "pending";
        evidence = `title_reads_as_${contradiction}`;
      }
    }
    lessons.push({
      key,
      groupKey: group.key,
      family,
      courseSlug: slugs.course,
      courseKey: course ? course.key : null,
      locale,
      languageStatus: status,
      languageEvidence: evidence,
      title,
      url,
      position: lessonPosition(title),
      topics: [...new Set([...group.topics, ...topicsForTitle(title)])],
      active: group.active,
    });
  }

  return { groups: [...groups.values()], courses, lessons, rejected };
}

/** `training_catalog.json` (schema 1.0) → source records. */
export function sourceFromCatalogJson(raw: unknown): SourceCatalog {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const families = Array.isArray(obj["course_catalog"]) ? (obj["course_catalog"] as unknown[]) : [];
  const courses: SourceCourse[] = [];
  const lessons: SourceLesson[] = [];
  for (const f of families) {
    const fam = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    const family = String(fam["course_family_slug"] ?? "");
    for (const c of Array.isArray(fam["localized_courses"])
      ? (fam["localized_courses"] as unknown[])
      : []) {
      const r = (c ?? {}) as Record<string, unknown>;
      courses.push({
        family,
        language: String(r["language"] ?? ""),
        title: String(r["title"] ?? ""),
        url: String(r["url"] ?? ""),
        slug: String(r["slug"] ?? ""),
      });
    }
    for (const l of Array.isArray(fam["lessons"]) ? (fam["lessons"] as unknown[]) : []) {
      const r = (l ?? {}) as Record<string, unknown>;
      const lesson: SourceLesson = {
        family: String(r["course_family_slug"] ?? family),
        title: String(r["title"] ?? ""),
        url: String(r["url"] ?? ""),
      };
      if (typeof r["key"] === "string") lesson.key = r["key"];
      lessons.push(lesson);
    }
  }
  return { courses, lessons };
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

/** `courses_normalized.csv` + `lessons_normalized.csv` (either may be empty) → source records. */
export function sourceFromCsv(coursesCsv: string, lessonsCsv: string): SourceCatalog {
  return {
    courses: parseCsv(coursesCsv).map((r) => ({
      family: r["course_family_slug"] ?? "",
      language: r["language"] ?? "",
      title: r["title"] ?? "",
      url: r["url"] ?? "",
      slug: r["slug"] ?? "",
    })),
    lessons: parseCsv(lessonsCsv).map((r) => {
      const lesson: SourceLesson = {
        title: r["title"] ?? "",
        url: r["url"] ?? "",
        family: r["course_family_slug"] ?? "",
      };
      if (r["key"]) lesson.key = r["key"];
      return lesson;
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Import plan against what is stored                                   *
 * ------------------------------------------------------------------ */

export interface StoredLesson {
  id: string;
  key: string;
  url: string;
  title: string;
  locale: CatalogLocale | null;
  language_status: LanguageStatus;
  language_evidence: string;
  topics: string[];
}
export interface ImportPlan {
  insertLessons: NormalizedLesson[];
  updateLessons: Array<{ id: string; changes: Partial<NormalizedLesson> }>;
  unchangedLessons: number;
  /** Stored lessons absent from the file: reported, NEVER deleted or deactivated by an import. */
  notInFile: number;
}

/**
 * Matches by key, then by url. Admin decisions are preserved: a lesson whose language was
 * set by an admin (`language_evidence = 'admin'`) keeps its locale and status.
 */
export function planLessonImport(stored: StoredLesson[], incoming: NormalizedLesson[]): ImportPlan {
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const byUrl = new Map(stored.map((s) => [s.url, s]));
  const touched = new Set<string>();
  const plan: ImportPlan = {
    insertLessons: [],
    updateLessons: [],
    unchangedLessons: 0,
    notInFile: 0,
  };
  for (const lesson of incoming) {
    const match = byKey.get(lesson.key) ?? byUrl.get(lesson.url);
    if (!match) {
      plan.insertLessons.push(lesson);
      continue;
    }
    touched.add(match.id);
    const changes: Partial<NormalizedLesson> = {};
    if (match.title !== lesson.title) changes.title = lesson.title;
    if (match.url !== lesson.url) changes.url = lesson.url;
    if (match.language_evidence !== "admin") {
      if (match.locale !== lesson.locale) changes.locale = lesson.locale;
      if (match.language_status !== lesson.languageStatus)
        changes.languageStatus = lesson.languageStatus;
      if (match.language_evidence !== lesson.languageEvidence)
        changes.languageEvidence = lesson.languageEvidence;
    }
    const topics = [...new Set([...match.topics, ...lesson.topics])].sort();
    if (topics.join() !== [...match.topics].sort().join()) changes.topics = topics;
    if (Object.keys(changes).length) plan.updateLessons.push({ id: match.id, changes });
    else plan.unchangedLessons++;
  }
  plan.notInFile = stored.filter((s) => !touched.has(s.id)).length;
  return plan;
}

/* ------------------------------------------------------------------ *
 * Recommendation eligibility                                           *
 * ------------------------------------------------------------------ */

export interface RecommendableRow {
  /** Defaults to "lesson". */
  kind?: "lesson" | "course";
  active: boolean;
  group_active: boolean;
  track: CatalogTrack;
  locale: CatalogLocale | null;
  language_status: LanguageStatus;
  url: string;
}

/** The single gate every recommendation path applies (database filters are a second layer). */
export function isRecommendable(row: RecommendableRow, locale: CatalogLocale): boolean {
  return (
    row.active &&
    row.group_active &&
    row.track !== "unclassified" &&
    row.language_status === "confirmed" &&
    row.locale === locale &&
    urlProblem(row.url, row.kind ?? "lesson") === null
  );
}
