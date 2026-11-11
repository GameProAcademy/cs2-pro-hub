/** CS2 PRO Score (pro-score-v1) — pt-BR. */
export const scorePtBR = {
  "score.of100": "{score} / 100",
  "score.loading": "Calculando…",
  "score.state.EMPTY": "Ainda não há partidas processadas. Envie uma demo para começar.",
  "score.state.INSUFFICIENT_SAMPLE":
    "Ainda não calculado: {matches} de {minimum} partidas completas. Nenhum valor é estimado.",
  "score.state.INSUFFICIENT_COVERAGE":
    "Ainda não calculado: só {coverage}% do peso do Score foi medido nas suas partidas (mínimo {min}%).",
  "score.basis":
    "Calculado com {matches} partida(s) completa(s) e {rounds} rounds. Método {version}.",
  "score.partialExcluded": "{n} partida(s) com leitura parcial ficaram de fora do cálculo.",
  "score.confidence.label": "Confiança da amostra",
  "score.confidence.PROVISIONAL":
    "Provisória (menos de {moderate} rounds): o valor ainda pode mudar bastante com novas partidas",
  "score.confidence.MODERATE": "Moderada ({moderate} a {high} rounds)",
  "score.confidence.HIGH": "Alta ({high} rounds ou mais)",
  "score.coverage": "Cobertura: {coverage}% do peso medido",
  "score.notPercentile":
    "É um índice absoluto do CS2 PRO. Não é percentil nem comparação com outros jogadores, e 50 não significa “na média”.",
  "score.details": "Ver como é calculado",
  "score.components.title": "Como o seu Score é formado",
  "score.col.component": "Componente",
  "score.col.value": "Seu valor",
  "score.col.sample": "Amostra",
  "score.col.weight": "Peso",
  "score.col.points": "Pontos",
  "score.c.round_contribution": "KAST (contribuição por round)",
  "score.c.damage": "Dano por round (ADR ÷ 100)",
  "score.c.kills": "Abates por round",
  "score.c.duel_balance": "Equilíbrio de abates e mortes",
  "score.c.survival": "Sobrevivência",
  "score.c.opening": "Duelos de abertura vencidos",
  "score.c.clutch": "Clutches vencidos",
  "score.unavailable.NOT_OBSERVED": "Não medido: fora do cálculo",
  "score.unavailable.THIN_SAMPLE": "Menos de {min} eventos: fora do cálculo",
  "score.sample.rounds": "{n} rounds",
  "score.sample.opening_duels": "{n} duelo(s)",
  "score.sample.clutches": "{n} clutch(es)",
  "score.method":
    "Média ponderada de sete sinais de desempenho medidos nas suas partidas completas, somando todas as partidas com peso pela amostra de cada uma. Um componente não medido não vira zero: sai do cálculo e o peso é redistribuído entre os demais. Com menos de {minimum} partidas completas ou menos de {minCoverage}% de cobertura, o Score não é exibido. Os pesos são uma decisão de projeto desta versão, não um ajuste estatístico.",
  "score.dnaDifference":
    "O Score resume desempenho. O Player DNA descreve o seu estilo e os seus padrões; sinais de estilo não entram no Score.",
} as const;
