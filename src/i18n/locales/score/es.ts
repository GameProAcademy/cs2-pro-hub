/** CS2 PRO Score (pro-score-v1) — es. */
export const scoreEs = {
  "score.of100": "{score} / 100",
  "score.loading": "Calculando…",
  "score.state.EMPTY": "Aún no hay partidas procesadas. Sube una demo para empezar.",
  "score.state.INSUFFICIENT_SAMPLE":
    "Aún no calculado: {matches} de {minimum} partidas completas. No se estima ningún valor.",
  "score.state.INSUFFICIENT_COVERAGE":
    "Aún no calculado: solo se midió el {coverage}% del peso del Score en tus partidas (mínimo {min}%).",
  "score.basis":
    "Calculado con {matches} partida(s) completa(s) y {rounds} rondas. Método {version}.",
  "score.partialExcluded": "{n} partida(s) con lectura parcial quedaron fuera del cálculo.",
  "score.confidence.label": "Confianza de la muestra",
  "score.confidence.PROVISIONAL":
    "Provisional (menos de {moderate} rondas): el valor aún puede cambiar bastante con nuevas partidas",
  "score.confidence.MODERATE": "Moderada ({moderate} a {high} rondas)",
  "score.confidence.HIGH": "Alta ({high} rondas o más)",
  "score.coverage": "Cobertura: {coverage}% del peso medido",
  "score.notPercentile":
    "Es un índice absoluto de CS2 PRO. No es un percentil ni una comparación con otros jugadores, y 50 no significa “en la media”.",
  "score.details": "Ver cómo se calcula",
  "score.components.title": "Cómo se forma tu Score",
  "score.col.component": "Componente",
  "score.col.value": "Tu valor",
  "score.col.sample": "Muestra",
  "score.col.weight": "Peso",
  "score.col.points": "Puntos",
  "score.c.round_contribution": "KAST (contribución por ronda)",
  "score.c.damage": "Daño por ronda (ADR ÷ 100)",
  "score.c.kills": "Bajas por ronda",
  "score.c.duel_balance": "Equilibrio de bajas y muertes",
  "score.c.survival": "Supervivencia",
  "score.c.opening": "Duelos de apertura ganados",
  "score.c.clutch": "Clutches ganados",
  "score.unavailable.NOT_OBSERVED": "No medido: fuera del cálculo",
  "score.unavailable.THIN_SAMPLE": "Menos de {min} eventos: fuera del cálculo",
  "score.sample.rounds": "{n} rondas",
  "score.sample.opening_duels": "{n} duelo(s)",
  "score.sample.clutches": "{n} clutch(es)",
  "score.method":
    "Media ponderada de siete señales de rendimiento medidas en tus partidas completas, sumando todas las partidas con peso según la muestra de cada una. Un componente no medido no se convierte en cero: sale del cálculo y su peso se redistribuye. Con menos de {minimum} partidas completas o menos del {minCoverage}% de cobertura, el Score no se muestra. Los pesos son una decisión de diseño de esta versión, no un ajuste estadístico.",
  "score.dnaDifference":
    "El Score resume el rendimiento. El Player DNA describe tu estilo y tus patrones; las señales de estilo no entran en el Score.",
} as const;
