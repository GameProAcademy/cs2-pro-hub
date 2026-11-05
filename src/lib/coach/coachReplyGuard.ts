/**
 * Fase 3 closeout — deterministic validation of the model's reply against PLAYER_FACTS, run
 * on the server BEFORE the reply is shown or stored. The prompt asks the model not to invent;
 * this makes it impossible for an invention to reach the player:
 *
 *  1. Statistics: in the Data section every number, and in the Interpretation section every
 *     decimal, percentage or number above 10, must equal a value in PLAYER_FACTS (at the
 *     precision written, or as a percentage of a ratio). A line that fails is removed.
 *  2. Comparisons: a sentence comparing the player with other players, an average player, a
 *     rank, a percentile or a professional level is removed (PLAYER_FACTS has no such data).
 *     Comparisons with the player's OWN values ("your average", CT vs T) are kept.
 *  3. Sources: a dotted identifier (table.column or a JSON path) must be an observation source
 *     or a PLAYER_FACTS path; otherwise it is replaced by "—".
 *  4. Flash assists are a CS2 PRO count, never "the game recorded" (see coachContext).
 *
 * The Recommendation section keeps its own numbers (drill durations, repetitions), but its
 * comparisons and sources are still checked. Pure and synchronous: unit-tested directly.
 */
import type { Locale } from "@/i18n/config";

import type { CoachFacts } from "./coachContext";

export interface ReplyGuardResult {
  text: string;
  removed: { stats: number; comparisons: number; sources: number; flashWording: number };
}

const SECTION_NAMES: Record<Locale, [string, string, string]> = {
  "pt-BR": ["Dados", "Interpretação", "Recomendação"],
  "pt-PT": ["Dados", "Interpretação", "Recomendação"],
  en: ["Data", "Interpretation", "Recommendation"],
  es: ["Datos", "Interpretación", "Recomendación"],
  fr: ["Données", "Interprétation", "Recommandation"],
};

/**
 * What the player is told when something was removed — one sentence per kind, in the reply's
 * language, saying WHY (own observed data only, no unverified outside averages) without
 * exposing the guard's rules or the removed text.
 */
export const NOTICE: Record<Locale, { comparisons: string; stats: string; sources: string }> = {
  "pt-BR": {
    comparisons:
      "Removemos uma comparação com outros jogadores ou com médias externas: o Coach usa apenas dados observados nas suas próprias partidas e não usa médias externas não verificadas.",
    stats:
      "Removemos números que não constam nos seus dados processados, para que cada valor mostrado venha das suas partidas.",
    sources: "Fontes que não correspondem aos seus dados aparecem como “—”.",
  },
  "pt-PT": {
    comparisons:
      "Removemos uma comparação com outros jogadores ou com médias externas: o Coach usa apenas dados observados nas suas próprias partidas e não usa médias externas não verificadas.",
    stats:
      "Removemos números que não constam nos seus dados processados, para que cada valor apresentado venha das suas partidas.",
    sources: "As fontes que não correspondem aos seus dados aparecem como “—”.",
  },
  en: {
    comparisons:
      "We removed a comparison with other players or outside averages: the Coach only uses data observed in your own matches and does not use unverified outside averages.",
    stats:
      "We removed numbers that are not in your processed data, so every value shown comes from your matches.",
    sources: "Sources that do not match your data are shown as “—”.",
  },
  es: {
    comparisons:
      "Eliminamos una comparación con otros jugadores o con promedios externos: el Coach solo usa datos observados en tus propias partidas y no usa promedios externos no verificados.",
    stats:
      "Eliminamos números que no están en tus datos procesados, para que cada valor mostrado venga de tus partidas.",
    sources: "Las fuentes que no corresponden a tus datos aparecen como “—”.",
  },
  fr: {
    comparisons:
      "Nous avons retiré une comparaison avec d'autres joueurs ou des moyennes externes : le Coach n'utilise que les données observées dans vos propres matchs et aucune moyenne externe non vérifiée.",
    stats:
      "Nous avons retiré des chiffres absents de vos données traitées, afin que chaque valeur affichée provienne de vos matchs.",
    sources: "Les sources qui ne correspondent pas à vos données apparaissent sous la forme « — ».",
  },
};

/** Benchmark comparisons: the facts hold no data about other players or any average. */
const BENCHMARK = [
  // pt
  /\b(acima|abaixo) d[ao] m[ée]dia\b(?!\s+(d[aeo]s?\s+)?(sua|seu|suas|seus)\b)/i,
  /\bm[ée]dia (esperada|geral|dos jogadores|do servidor|da comunidade)\b/i,
  /\b(maioria|maior parte) dos jogadores\b/i,
  /\boutros jogadores\b/i,
  /\bjogador(es)? (m[ée]dios?|t[íi]picos?|profissionais|competitivos|do seu n[íi]vel|de n[íi]vel)\b/i,
  /\besperad[oa]s? para (jogadores|o seu n[íi]vel|o n[íi]vel)\b/i,
  /\b(n[íi]vel|padr[ãa]o) (pro|profissional|competitivo|de elite)\b/i,
  /\bem compara[çc][ãa]o (com|a) (outros|a m[ée]dia|jogadores)\b/i,
  // en
  /\b(above|below) (the )?average\b(?!\s+of\s+your\b)/i,
  /\b(expected|typical) (average|value|for (players|your level))\b/i,
  /\b(most|other|average|typical|pro|professional) players\b/i,
  /\bcompared (to|with) (other|the average|players)\b/i,
  /\bpro[- ]level\b/i,
  // es
  /\bpor (encima|debajo) (de la media|del promedio)\b(?!\s+(de\s+)?tus?\b)/i,
  /\b(la mayor[íi]a de los|otros) jugadores\b/i,
  /\bjugador(es)? (promedio|profesionales|t[íi]picos)\b/i,
  /\bnivel profesional\b/i,
  // fr
  /\b(au[- ]dessus|en[- ]dessous) de la moyenne\b(?!\s+de\s+(vos|votre)\b)/i,
  /\b(la plupart des|autres) joueurs\b/i,
  /\bjoueurs? (moyens?|professionnels?|typiques?)\b/i,
  /\bniveau pro(fessionnel)?\b/i,
  // all
  /\bpercentil(e|es)?\b/i,
];

const FLASH_WORDING: Record<Locale, [RegExp, string]> = {
  "pt-BR": [/\bo jogo registrou\b|\bCS2 PRO counted\b/gi, "o CS2 PRO contou"],
  "pt-PT": [/\bo jogo regist(?:ou|rou)\b|\bCS2 PRO counted\b/gi, "o CS2 PRO contou"],
  en: [/\bthe game recorded\b/gi, "CS2 PRO counted"],
  es: [/\bel juego registr[óo]\b|\bCS2 PRO counted\b/gi, "CS2 PRO contó"],
  fr: [/\ble jeu a enregistr[ée]\b|\bCS2 PRO counted\b/gi, "CS2 PRO a compté"],
};

/** Every number in PLAYER_FACTS (recursively), plus fixed scale constants. */
export function factNumbers(facts: unknown): number[] {
  const out: number[] = [100];
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(facts);
  return out;
}

/** Every dotted path in PLAYER_FACTS (indices erased) and every observation source column. */
export function factSources(facts: CoachFacts): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, path: string) => {
    if (path) out.add(path);
    if (Array.isArray(v)) v.forEach((x) => walk(x, `${path}[]`));
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(facts, "");
  for (const o of [...facts.observations, facts.sides.ct.rating, facts.sides.t.rating]) {
    out.add(`observations.${o.metric}`);
    for (const part of o.source.split(/[^A-Za-z0-9_.]+/)) if (part.includes(".")) out.add(part);
  }
  return out;
}

const normalizePath = (p: string) =>
  p
    .replace(/\[[^\]]*\]/g, "[]")
    .replace(/^observations\[\]\.?/, "observations.")
    .replace(/\.$/, "");

/** Numbers written in the reply: "13,9", "0.158", "62.1 %", "-3". Skips dates and map names. */
const NUMBER = /(?<![\w./,:-])[-+]?\d+(?:[.,]\d+)?(?![\w/:]|[.,]\d)/g;
const DATE_LIKE = /\b\d{1,2}[/:]\d{1,2}(?:[/:]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/g;
const URL = /https?:\/\/\S+/g;
const SOURCE =
  /\b[a-z][A-Za-z0-9_]{2,}(?:\[[^\]\s]*\])?(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\s]*\])?)+/g;

function numbersIn(text: string): Array<{ value: number; decimals: number; raw: string }> {
  const clean = text.replace(URL, " ").replace(DATE_LIKE, " ");
  return [...clean.matchAll(NUMBER)].map((m) => {
    const raw = m[0];
    const normal = raw.replace(",", ".");
    const decimals = normal.includes(".") ? normal.split(".")[1]!.length : 0;
    return { value: Number(normal), decimals, raw };
  });
}

const round = (v: number, d: number) => {
  const f = 10 ** d;
  return (Math.sign(v) * Math.round(Math.abs(v) * f + Number.EPSILON)) / f;
};

/** A written number is backed when it equals a fact at the precision written (or ×100). */
export function backed(value: number, decimals: number, facts: number[]): boolean {
  return facts.some((f) => {
    for (const candidate of [f, f * 100]) {
      if (round(candidate, decimals) === value) return true;
      // "0,87" written for 0.8696 at 2 decimals is covered above; also accept a fact written
      // with MORE precision than the contract (13.90 for 13.9).
      if (decimals > 0 && Math.abs(candidate - value) < 10 ** -decimals / 2) return true;
    }
    return false;
  });
}

function needsBacking(
  n: { value: number; decimals: number; raw: string },
  section: number,
  line: string,
): boolean {
  if (section === 0) return true; // Data: every number
  if (section === 1) {
    // Interpretation: decimals, percentages and anything that is not a small count.
    const pct = new RegExp(`${n.raw.replace(/[.+]/g, "\\$&")}\\s*%`).test(line);
    return n.decimals > 0 || pct || Math.abs(n.value) > 10;
  }
  return false; // Recommendation: drill numbers (minutes, repetitions) are advice
}

function sectionOf(line: string, names: [string, string, string], current: number): number {
  const heading = line
    .replace(/^[#>*_\s]+|[*_:\s]+$/g, "")
    .trim()
    .toLowerCase();
  const idx = names.findIndex((n) => heading === n.toLowerCase());
  return idx >= 0 ? idx : current;
}

/** Splits a prose line into sentences, keeping the bullet / table prefix intact. */
function sentences(line: string): string[] {
  // Split only on sentence punctuation followed by a space, so "13.9" stays one number.
  return line.split(/(?<=[.!?])\s+(?=\S)/);
}

export function guardCoachReply(
  content: string,
  facts: CoachFacts,
  locale: Locale,
): ReplyGuardResult {
  const names = SECTION_NAMES[locale];
  const numbers = factNumbers(facts);
  const sources = new Set([...factSources(facts)].map(normalizePath));
  const removed = { stats: 0, comparisons: 0, sources: 0, flashWording: 0 };

  const [flashRe, flashFix] = FLASH_WORDING[locale];
  let text = content.replace(flashRe, () => {
    removed.flashWording++;
    return flashFix;
  });

  // Sources: replace every unknown dotted identifier (outside URLs) by "—".
  text = text
    .split(/(https?:\/\/\S+)/g)
    .map((chunk, i) =>
      i % 2 === 1
        ? chunk
        : chunk.replace(SOURCE, (token) => {
            if (sources.has(normalizePath(token))) return token;
            removed.sources++;
            return "—";
          }),
    )
    .join("");

  const out: string[] = [];
  let section = -1;
  for (const line of text.split("\n")) {
    const next = sectionOf(line, names, section);
    if (next !== section) {
      section = next;
      out.push(line);
      continue;
    }
    const isTable = /^\s*\|/.test(line);
    if (isTable) {
      if (
        /^\s*\|[\s:|-]+\|\s*$/.test(line) ||
        out.at(-1) === undefined ||
        !/^\s*\|/.test(out.at(-1)!)
      ) {
        // header or separator row: kept (dropped below if the table ends up empty)
        out.push(line);
        continue;
      }
      if (BENCHMARK.some((re) => re.test(line))) {
        removed.comparisons++;
        continue;
      }
      if (
        numbersIn(line).some(
          (n) => needsBacking(n, section, line) && !backed(n.value, n.decimals, numbers),
        )
      ) {
        removed.stats++;
        continue;
      }
      out.push(line);
      continue;
    }
    const prefix = line.match(/^\s*(?:[-*•]\s+|\d+\.\s+)?/)![0];
    const kept = sentences(line.slice(prefix.length)).filter((s) => {
      if (BENCHMARK.some((re) => re.test(s))) {
        removed.comparisons++;
        return false;
      }
      if (
        numbersIn(s).some(
          (n) => needsBacking(n, section, s) && !backed(n.value, n.decimals, numbers),
        )
      ) {
        removed.stats++;
        return false;
      }
      return true;
    });
    const body = kept.join(" ").trim();
    if (body || !line.trim()) out.push(body ? prefix + body : line);
  }

  // A table left with only its header and separator says nothing: drop it.
  const cleaned: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const header = out[i]!;
    const sep = out[i + 1];
    const after = out[i + 2];
    if (
      /^\s*\|/.test(header) &&
      sep !== undefined &&
      /^\s*\|[\s:|-]+\|\s*$/.test(sep) &&
      (after === undefined || !/^\s*\|/.test(after))
    ) {
      i++;
      continue;
    }
    cleaned.push(header);
  }

  let result = cleaned
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const notice = (["comparisons", "stats", "sources"] as const)
    .filter((k) => removed[k] > 0)
    .map((k) => NOTICE[locale][k]);
  if (notice.length) result = `${result}\n\n_${notice.join(" ")}_`;
  return { text: result, removed };
}

/** Compact provenance fragment: g=stats.comparisons.sources.flashWording */
export function guardTag(r: ReplyGuardResult["removed"]): string {
  return `guard=${r.stats}.${r.comparisons}.${r.sources}.${r.flashWording}`;
}
