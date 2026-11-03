/**
 * Catalog selection (pure): player needs → a FEW relevant catalog items.
 *
 * Needs come only from evidence: weakest OBSERVED Player DNA dimensions (a null dimension is
 * not a weakness), the goals the player declared in the profile, and topics named in the
 * player's own message. No need → no recommendation (an empty list is a valid answer).
 *
 * Every candidate passes `isRecommendable` (active, classified track, confirmed language in
 * the player's locale, valid non-sample URL) before it can be scored, whatever the caller
 * already filtered in the database.
 */
import {
  TOPIC_RULES,
  isRecommendable,
  type CatalogLocale,
  type CatalogTrack,
  type LanguageStatus,
} from "./catalogCore.ts";

export type NeedSource = "dna" | "goal" | "message" | "map";

export interface Need {
  topic: string;
  weight: number;
  source: NeedSource;
  /** What justified the need: a DNA dimension code, a goal code, a map or "message". */
  detail: string;
}

/** Topics that describe a whole course family; never enough on their own to pick a lesson. */
const GENERIC_TOPICS = new Set(["in_game", "ranked_progression"]);

export const DIMENSION_TOPICS: Record<string, string[]> = {
  aim: ["aim"],
  dueling: ["aim", "positioning"],
  survivability: ["positioning", "demo_review"],
  positioning: ["positioning"],
  utility: ["utility"],
  decision_making: ["decision", "economy"],
  teamplay: ["roles_teamplay", "communication"],
  economy: ["economy"],
  clutch: ["decision", "mindset"],
  consistency: ["warmup_routine", "routine_productivity"],
};

export const GOAL_TOPICS: Record<string, string[]> = {
  CLIMB_RATING: ["ranked_progression", "decision"],
  AIM_MECHANICS: ["aim", "settings", "warmup_routine"],
  GAMESENSE_DECISION: ["decision", "positioning", "economy"],
  CONSISTENCY: ["routine_productivity", "warmup_routine", "mindset"],
  COMPETITIVE_TEAM: ["roles_teamplay", "communication"],
  PRO_CAREER: ["mindset", "personal_development", "branding", "content_creation"],
};

/** Extra multilingual intents for free text (the title rules cover in-game vocabulary). */
const MESSAGE_RULES: Array<[string, RegExp]> = [
  [
    "communication",
    /(comunica|communicat|comunicaci|\bcalls?\b|callout|orat[óo]ria|public speaking|prise de parole|hablar en p[úu]blico)/,
  ],
  [
    "career",
    /(carreira|career|carrera|carri[èe]re|mercado gamer|gaming (industry|market)|march[ée] du jeu|trabalhar (com|no)|work in|profiss[ãa]o|streamer|criador de conte|content creator)/,
  ],
  [
    "content_creation",
    /(youtube|tik ?tok|edi[çc][ãa]o de v[ií]deo|video edit|edici[óo]n de v[ií]deo|montage vid[ée]o|\bstream|conte[úu]do|\bcontent\b|\bclips?\b|capcut)/,
  ],
  [
    "routine_productivity",
    /(rotina|routine|rutina|consist[êe]n|consistency|disciplin|procrastina|organiza|produtiv|productiv)/,
  ],
  [
    "mindset",
    /(\bmental|mindset|\btilt|ansiedad|ansiedade|anxi|confian[çc]a|confidence|confianza|confiance|press[ãa]o|pressure|presi[óo]n|pression)/,
  ],
  [
    "health_mobility",
    /(alongamento|stretch|estiramiento|[ée]tirement|postura|posture|dor nas costas|back pain|ergonom)/,
  ],
  [
    "ai_tools",
    /(chatgpt|midjourney|intelig[êe]ncia artificial|artificial intelligence|inteligencia artificial)/,
  ],
  ["marketing_ads", /(an[úu]ncios?|\bads\b|tr[áa]fego pago|marketing|publicidad|publicit)/],
  ["branding", /(\bmarca pessoal|personal brand|branding|marca personal|marque personnelle)/],
];

export function topicsFromMessage(message: string): string[] {
  const text = message.toLowerCase();
  const found = new Set<string>();
  for (const [topic, re] of [...TOPIC_RULES, ...MESSAGE_RULES]) if (re.test(text)) found.add(topic);
  // A side alone ("CT", "TR") is not a learning need.
  found.delete("side_ct");
  found.delete("side_t");
  return [...found];
}

export interface DimensionReading {
  /** DNA dimension code (aim, utility, …). */
  dimension: string;
  /** 0-100 index; null = not observed (never a weakness). */
  index: number | null;
}

/**
 * Needs for a player: up to `maxDimensions` weakest observed DNA dimensions (only those below
 * `ceiling`), then declared goals. Weights: weakest dimension first.
 */
export function needsFromPlayer(input: {
  dimensions: DimensionReading[];
  goals: string[];
  maxDimensions?: number;
  ceiling?: number;
}): Need[] {
  const ceiling = input.ceiling ?? 60;
  const weakest = input.dimensions
    .filter((d): d is { dimension: string; index: number } => d.index !== null && d.index < ceiling)
    .sort((a, b) => a.index - b.index)
    .slice(0, input.maxDimensions ?? 3);
  const needs: Need[] = [];
  weakest.forEach((d, rank) => {
    for (const topic of DIMENSION_TOPICS[d.dimension] ?? [])
      needs.push({ topic, weight: 3 - rank, source: "dna", detail: d.dimension });
  });
  for (const goal of input.goals)
    for (const topic of GOAL_TOPICS[goal] ?? [])
      needs.push({ topic, weight: 1, source: "goal", detail: goal });
  return needs;
}

/** The player asks how to improve / for training or lessons (any of the 5 locales). */
export const IMPROVEMENT_INTENT =
  /(melhor|improv|mejor|am[ée]lior|trein|train|entren|entra[îi]n|evolu|aula|lesson|clase|le[çc]on|curso|course|cours\b|recomend|recommend|dica|tips?\b|consejo|conseil|como posso|how (can|do|should) i|c[óo]mo (puedo|empiezo|empezar)|comment (puis|faire|commencer|devenir)|come[çc]ar|start|empezar|commencer|quero (aprender|trabalhar|ser)|i want to|quiero|je veux|aprender|learn|apprendre)/;

/**
 * Coach needs, only when the player asks to learn or improve: the topics the player named
 * first; without a named topic, the weakest observed DNA dimensions. Nothing else.
 */
export function coachNeeds(message: string, dimensions: DimensionReading[]): Need[] {
  // A statistics question ("what was my KAST on Mirage?", "how many enemies did I flash?")
  // names topics but asks for no learning content: no recommendation.
  if (!IMPROVEMENT_INTENT.test(message.toLowerCase())) return [];
  const fromMessage = needsFromMessage(message);
  if (fromMessage.length) return fromMessage;
  return needsFromPlayer({ dimensions, goals: [], maxDimensions: 2 });
}

export function needsFromMessage(message: string): Need[] {
  return topicsFromMessage(message).map((topic) => ({
    topic,
    weight: 4,
    source: "message" as const,
    detail: "message",
  }));
}

export interface CatalogCandidate {
  id: string;
  kind: "lesson" | "course";
  title: string;
  url: string;
  locale: CatalogLocale | null;
  language_status: LanguageStatus;
  active: boolean;
  group_active: boolean;
  group_key: string;
  track: CatalogTrack;
  topics: string[];
  position: number | null;
}

export interface Recommendation {
  id: string;
  kind: "lesson" | "course";
  title: string;
  url: string;
  track: CatalogTrack;
  /** The need that selected it (drives the justification shown to the player). */
  need: Need;
}

/**
 * Picks at most `max` items: each must match at least one need on a specific topic, one per
 * content group, never the same URL twice; a lesson beats its whole course when both match.
 */
export function pickRecommendations(
  candidates: CatalogCandidate[],
  needs: Need[],
  locale: CatalogLocale,
  options: {
    max?: number;
    tracks?: CatalogTrack[];
    exclude?: Set<string>;
    /** Items per content group (default 1). A plan may take several lessons of one course. */
    perGroup?: number;
    /** At most one item per need topic (varied recommendations). */
    onePerNeed?: boolean;
  } = {},
): Recommendation[] {
  if (!needs.length) return [];
  const scored: Array<{ c: CatalogCandidate; score: number; need: Need }> = [];
  for (const c of candidates) {
    if (options.exclude?.has(c.id) || options.exclude?.has(c.url)) continue;
    if (options.tracks && !options.tracks.includes(c.track)) continue;
    if (!isRecommendable(c, locale)) continue;
    let best: Need | null = null;
    let score = 0;
    for (const n of needs) {
      if (GENERIC_TOPICS.has(n.topic) && n.source !== "message" && n.source !== "goal") continue;
      if (!c.topics.includes(n.topic)) continue;
      score += n.weight;
      if (!best || n.weight > best.weight) best = n;
    }
    if (!best) continue;
    // A specific lesson is a better answer than a whole course on the same need.
    if (c.kind === "lesson") score += 0.5;
    scored.push({ c, score, need: best });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.c.position ?? 999) - (b.c.position ?? 999) ||
      a.c.title.localeCompare(b.c.title),
  );
  const out: Recommendation[] = [];
  const perGroup = new Map<string, number>();
  const seen = new Set<string>();
  // The same lesson is published in several courses (In-Game 3, 4 and 5): one title once.
  const titleKey = (t: string) => t.replace(/^\d+\s*[–-]\s*/, "").toLowerCase();
  const needTaken = new Set<string>();
  for (const { c, need } of scored) {
    if (out.length >= (options.max ?? 3)) break;
    const used = perGroup.get(c.group_key) ?? 0;
    if (used >= (options.perGroup ?? 1)) continue;
    if (seen.has(c.url) || seen.has(titleKey(c.title))) continue;
    // Several items for one group must serve different needs.
    if (used > 0 && needTaken.has(`${c.group_key}|${need.topic}`)) continue;
    if (options.onePerNeed && needTaken.has(`*|${need.topic}`)) continue;
    needTaken.add(`*|${need.topic}`);
    perGroup.set(c.group_key, used + 1);
    needTaken.add(`${c.group_key}|${need.topic}`);
    seen.add(c.url);
    seen.add(titleKey(c.title));
    out.push({ id: c.id, kind: c.kind, title: c.title, url: c.url, track: c.track, need });
  }
  return out;
}

/**
 * Removes from a model reply every URL that is not one of the allowed catalog URLs (the
 * Coach may only link what the server selected). Markdown links keep their text.
 */
export function sanitizeReplyLinks(
  reply: string,
  allowed: Set<string>,
): { text: string; removed: number } {
  let removed = 0;
  const keep = (url: string) => allowed.has(url) || allowed.has(url.replace(/[).,;:!?]+$/, ""));
  let text = reply.replace(
    /\[([^\]]{1,300})\]\((https?:\/\/[^\s)]+)\)/g,
    (m, label: string, url: string) => {
      if (keep(url)) return m;
      removed++;
      return label;
    },
  );
  text = text.replace(/https?:\/\/[^\s)<>\]]+/g, (url) => {
    if (keep(url)) return url;
    removed++;
    return "";
  });
  return { text, removed };
}
