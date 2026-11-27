/**
 * Visual Game Language for the AI Coach — presentation only.
 *
 * Classifies a heading the Coach itself wrote ("Dados observados", "Next step", "Pontos a
 * melhorar"…) so the UI can give that section a panel, an icon and a tone. It never changes,
 * adds or reorders text, and an unrecognised heading stays a plain heading. Five locales.
 */
export type CoachSectionKind = "observed" | "interpretation" | "action" | "strength" | "weakness";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[*_`#:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Order matters: "pontos a melhorar" is a weakness before it is an action; "plano de treino" an action.
const RULES: ReadonlyArray<[CoachSectionKind, RegExp]> = [
  [
    "weakness",
    /\b(fragilidad|fragilidade|fraqueza|pontos? fracos?|weak|weakness|debilidad|faiblesse|a melhorar|to improve|para mejorar|a ameliorer|areas? de melhoria|erros?|mistakes?|errores|erreurs)/,
  ],
  [
    "strength",
    /\b(pontos? fortes?|forcas?|strengths?|fortalezas?|puntos? fuertes?|points? forts?|o que (voce )?faz bem|what you do well)/,
  ],
  [
    "action",
    /\b(proxim[oa]s? (passos?|acao|acoes)|next (steps?|action)|siguientes? pasos?|proxima accion|prochaines? etapes?|prochaine action|recomenda|recommend|recomendaci|plano|plan |plan$|treino|training|entrenamiento|entrainement|drills?|exercicios?|exercises?|ejercicios?|exercices?|acao|acciones?|actions?)/,
  ],
  [
    "interpretation",
    /\b(interpreta|leitura|reading|analise|analysis|analisis|analyse|diagnostic|diagnost|o que (isso )?significa|what (this|it) means|que significa|ce que cela signifie)/,
  ],
  [
    "observed",
    /\b(dados|data|datos|donnees|observad|observed|observ|numeros|numbers|metricas|metrics|metriques|estatisticas|statistics|estadisticas|statistiques|evidencias?|evidence|pruebas|preuves)/,
  ],
];

export function coachSectionKind(heading: string): CoachSectionKind | null {
  const h = norm(heading);
  for (const [kind, re] of RULES) if (re.test(h)) return kind;
  return null;
}

/** Splits plain text into text and numeric runs so numbers can be set in mono. */
export function numericParts(text: string): Array<{ kind: "text" | "number"; text: string }> {
  const out: Array<{ kind: "text" | "number"; text: string }> = [];
  const re = /(?<![\p{L}\d])[-+]?\d+(?:[.,]\d+)?\s?%?(?![\p{L}\d])/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: "text", text: text.slice(last, i) });
    out.push({ kind: "number", text: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/**
 * VGL 2.0 continuation: references the reply itself makes, so the UI can decorate them next to
 * the word (map emblem, weapon silhouette, side logo, mono number). The concatenated `text` of
 * the parts is always exactly the input; unknown words stay plain text.
 */
export type CoachToken =
  | { kind: "text"; text: string }
  | { kind: "number"; text: string }
  | { kind: "map"; text: string; map: string }
  | { kind: "weapon"; text: string; weapon: string }
  | { kind: "side"; text: string; side: "CT" | "T" };

const MAP_WORDS: Record<string, string> = {
  mirage: "de_mirage",
  inferno: "de_inferno",
  nuke: "de_nuke",
  anubis: "de_anubis",
  ancient: "de_ancient",
  "dust ii": "de_dust2",
  dust2: "de_dust2",
  overpass: "de_overpass",
  train: "de_train",
  vertigo: "de_vertigo",
};

// Display names whose parser weapon is unambiguous (no M4A4/M4A1-S or P2000/USP-S guessing).
const WEAPON_WORDS: Record<string, string> = {
  "ak-47": "ak47",
  ak47: "ak47",
  awp: "awp",
  "m4a1-s": "m4a1_silencer",
  "desert eagle": "deagle",
  deagle: "deagle",
  "usp-s": "usp_silencer",
  "glock-18": "glock",
  glock: "glock",
  galil: "galilar",
  famas: "famas",
  "ssg 08": "ssg08",
  scout: "ssg08",
  mp9: "mp9",
  "mac-10": "mac10",
  p250: "p250",
  "tec-9": "tec9",
  "five-seven": "fiveseven",
  "cz75-auto": "cz75a",
  molotov: "molotov",
  "he grenade": "hegrenade",
  smoke: "smokegrenade",
  flash: "flashbang",
  flashbang: "flashbang",
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORDS = [...Object.keys(MAP_WORDS), ...Object.keys(WEAPON_WORDS)].sort(
  (a, b) => b.length - a.length,
);
const TOKEN_RE = new RegExp(
  `(?<![\\p{L}\\d])(?:(${WORDS.map(esc).join("|")})|(CT|TR)|([-+]?\\d+(?:[.,]\\d+)?\\s?%?))(?![\\p{L}\\d])`,
  "giu",
);

export function coachTokens(text: string): CoachToken[] {
  const out: CoachToken[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    // "CT"/"TR" only in capitals (avoid words like "tr" inside other languages' text).
    if (m[2] && m[2] !== m[2].toUpperCase()) continue;
    if (i > last) out.push({ kind: "text", text: text.slice(last, i) });
    const word = m[0];
    if (m[1]) {
      const key = m[1].toLowerCase();
      if (MAP_WORDS[key]) out.push({ kind: "map", text: word, map: MAP_WORDS[key]! });
      else out.push({ kind: "weapon", text: word, weapon: WEAPON_WORDS[key]! });
    } else if (m[2]) out.push({ kind: "side", text: word, side: m[2] === "CT" ? "CT" : "T" });
    else out.push({ kind: "number", text: word });
    last = i + word.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
