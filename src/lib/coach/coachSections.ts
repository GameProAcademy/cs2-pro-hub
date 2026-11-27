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
