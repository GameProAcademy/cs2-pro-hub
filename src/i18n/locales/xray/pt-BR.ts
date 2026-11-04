/** Fase 2 (dados e Raio-X): resultado, datas, Player DNA em formação, histórico e Raio-X. */
export const xrayPtBR = {
  "real.result.unresolved": "Não determinado pela demo",
  "real.result.unresolvedNote":
    "Resultado e placar: a demo não identificou o time de cada jogador, então o CS2 PRO não determina vitória nem derrota (limitação L04 da admissão). Nenhum resultado é estimado.",
  "real.date.processed": "processada em",
  "real.date.processedNote":
    "Data: demos de CS2 não informam quando a partida foi jogada. Quando a partida não traz data própria, mostramos a data em que o CS2 PRO a processou.",
  "real.winRate.sample": "{wins} de {decided} partida(s) com resultado",
  "real.winRate.unresolved": "Nenhuma das {n} partida(s) tem resultado determinado pela demo",

  "real.dna.inFormation": "Em formação",
  "real.dna.inFormationIndex": "Índice em formação ({matches} de {minimum} partidas)",
  "real.dna.radarInFormation":
    "O radar e os índices por dimensão aparecem a partir de {minimum} partidas. Os sinais abaixo são reais.",
  "real.dna.history.title": "Evolução do Player DNA",
  "real.dna.history.description":
    "Cada linha é um snapshot salvo quando suas partidas mudaram. Os snapshots antigos não são sobrescritos.",
  "real.dna.history.empty": "Ainda não há snapshots salvos.",
  "real.dna.history.date": "Data",
  "real.dna.history.matches": "Partidas",
  "real.dna.history.state": "Estado",
  "real.dna.history.READY": "Perfil com amostra mínima",
  "real.dna.history.INSUFFICIENT_SAMPLE": "Em formação",
  "real.dna.dashboard.inFormation":
    "Em formação: {matches} de {minimum} partidas para um perfil estável.",
  "real.dna.dashboard.ready": "Perfil com {matches} partidas e {observed} dimensões observadas.",
  "real.dna.dashboard.empty": "Ainda sem partidas com sinais de Player DNA.",
  "real.dna.open": "Ver Player DNA",

  "xray.sample":
    "Base: {matches} partida(s), {rounds} rounds jogados. Resultado conhecido em {decided} partida(s).",
  "xray.inFormation":
    "Raio-X em formação: {matches} de {minimum} partidas. As observações são reais; inferências e recomendações só aparecem com a amostra mínima.",
  "xray.empty":
    "O Raio-X aparece quando houver pelo menos uma partida processada com os seus dados.",
  "xray.layer.observed": "Observado",
  "xray.layer.observedHint": "Valores medidos nas suas partidas, com a amostra de cada um.",
  "xray.layer.inference": "Inferência",
  "xray.layer.inferenceHint":
    "Leitura feita a partir das observações, por uma regra documentada: as dimensões do Player DNA com menor índice, abaixo de {ceiling}/100.",
  "xray.layer.recommendation": "Recomendação",
  "xray.layer.recommendationHint":
    "O que trabalhar, ligado ao seu plano de treino. Nenhuma aula é escolhida aqui.",
  "xray.dim.aim_duels": "Mira e duelos",
  "xray.dim.survival_positioning": "Sobrevivência e posicionamento",
  "xray.dim.utility": "Utilitários",
  "xray.dim.impact": "Impacto no round",
  "xray.dim.consistency": "Consistência",
  "xray.dim.decision": "Tomada de decisão",
  "xray.dim.notObserved": "Sem dados observados nesta dimensão.",
  "xray.status.NOT_MEASURED": "Não medido",
  "xray.status.EXCLUDED_BY_ADMISSION": "Excluído pela admissão da demo",
  "xray.inMatches": "em {n} partida(s)",
  "xray.dnaIndex": "Índice DNA",
  "xray.metric.kills": "Abates",
  "xray.metric.deaths": "Mortes",
  "xray.metric.utilityDamage": "Dano com granadas",
  "xray.metric.clutchWins": "Clutches vencidos",
  "xray.metric.ctRating": "Rating no lado CT",
  "xray.metric.tRating": "Rating no lado TR",
  "xray.sides.title": "Lados CT e TR",
  "xray.sides.description":
    "Rounds jogados em cada lado e o rating da partida restrito a esses rounds. Abates e dano por lado ainda não são gravados por round.",
  "xray.sides.ct": "CT",
  "xray.sides.t": "TR",
  "xray.sides.rounds": "{n} rounds",
  "xray.inference.item": "{dimension}: índice {index}/100 (abaixo de {ceiling})",
  "xray.inference.NO_DATA": "Sem partidas com sinais de Player DNA.",
  "xray.inference.INSUFFICIENT_SAMPLE":
    "Sem inferência: o Player DNA tem {matches} de {minimum} partidas mínimas.",
  "xray.inference.NONE_BELOW_CEILING": "Nenhuma dimensão observada está abaixo de {ceiling}/100.",
  "xray.recommendation.item": "Priorizar {dimension} no treino.",
  "xray.recommendation.none": "Sem recomendação enquanto não houver inferência.",
  "xray.recommendation.open": "Abrir plano de treino",
  "xray.unsupported.title": "O que o CS2 PRO ainda não mede",
  "xray.unsupported.enemiesFlashed":
    "Inimigos cegados (as demos não trazem quem foi cegado por flash).",
  "xray.unsupported.positions": "Posições e mapa de calor (coordenadas não são extraídas).",
  "xray.unsupported.economyClassification":
    "Classificação de compra (eco, force, full) — não há classificador revisado.",
  "xray.unsupported.sideSplitKills": "Abates e dano separados por lado (não gravados por round).",
} as const;
