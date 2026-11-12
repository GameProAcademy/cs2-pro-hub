import type { xrayPtBR } from "./pt-BR";

export const xrayPtPT: Record<keyof typeof xrayPtBR, string> = {
  "real.result.unresolved": "Não determinado pela demo",
  "real.result.unresolvedNote":
    "Resultado e marcador: a demo não identificou a equipa de cada jogador, por isso o CS2 PRO não determina vitória nem derrota (limitação L04 da admissão). Nenhum resultado é estimado.",
  "real.date.processed": "processada em",
  "real.date.processedNote":
    "Data: as demos de CS2 não indicam quando a partida foi jogada. Quando a partida não tem data própria, mostramos a data em que o CS2 PRO a processou.",
  "real.winRate.sample": "{wins} de {decided} partida(s) com resultado",
  "real.winRate.unresolved": "Nenhuma das {n} partida(s) tem resultado determinado pela demo",

  "real.dna.inFormation": "Em formação",
  "real.dna.inFormationIndex": "Índice em formação ({matches} de {minimum} partidas)",
  "real.dna.radarInFormation":
    "O radar e os índices por dimensão aparecem a partir de {minimum} partidas. Os sinais abaixo são reais.",
  "real.dna.history.title": "Evolução do Player DNA",
  "real.dna.history.description":
    "Cada linha é um snapshot guardado quando as suas partidas mudaram. Os snapshots antigos não são substituídos.",
  "real.dna.history.empty": "Ainda não há snapshots guardados.",
  "real.dna.history.date": "Data",
  "real.dna.history.matches": "Partidas",
  "real.dna.history.state": "Estado",
  "real.dna.history.READY": "Perfil com amostra mínima",
  "real.dna.history.INSUFFICIENT_SAMPLE": "Em formação",
  "real.dna.dashboard.inFormation":
    "Em formação: {matches} de {minimum} partidas para um perfil estável.",
  "real.dna.dashboard.ready": "Perfil com {matches} partidas e {observed} dimensões observadas.",
  "real.dna.dashboard.empty": "Ainda sem partidas com sinais de Player DNA.",
  "real.dna.dashboard.noSnapshot":
    "Ainda não existe um perfil do Player DNA guardado. Abra o Player DNA para ver os seus sinais.",
  "real.dna.open": "Ver Player DNA",

  "xray.sample":
    "Base: {matches} partida(s), {rounds} rondas jogadas. Resultado conhecido em {decided} partida(s).",
  "xray.inFormation":
    "Raio-X em formação: {matches} de {minimum} partidas. As observações são reais; inferências e recomendações só aparecem com a amostra mínima.",
  "xray.empty":
    "O Raio-X aparece quando existir pelo menos uma partida processada com os seus dados.",
  "xray.layer.observed": "Observado",
  "xray.layer.observedHint": "Valores medidos nas suas partidas, com a amostra de cada um.",
  "xray.layer.inference": "Inferência",
  "xray.layer.inferenceHint":
    "Leitura feita a partir das observações, segundo uma regra documentada: as dimensões do Player DNA com menor índice, abaixo de {ceiling}/100.",
  "xray.layer.recommendation": "Recomendação",
  "xray.layer.recommendationHint":
    "O que trabalhar, ligado ao seu plano de treino. Nenhuma aula é escolhida aqui.",
  "xray.dim.aim_duels": "Pontaria e duelos",
  "xray.dim.survival_positioning": "Sobrevivência e posicionamento",
  "xray.dim.utility": "Utilitários",
  "xray.dim.impact": "Impacto na ronda",
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
  "xray.metric.clutchWins": "Clutches ganhos",
  "xray.metric.ctRating": "Rating no lado CT",
  "xray.metric.tRating": "Rating no lado TR",
  "xray.sides.title": "Lados CT e TR",
  "xray.sides.description":
    "Rondas jogadas em cada lado e o rating da partida restrito a essas rondas. Abates e dano por lado ainda não são guardados por ronda.",
  "xray.sides.ct": "CT",
  "xray.sides.t": "TR",
  "xray.sides.rounds": "{n} rondas",
  "xray.roundContext.note":
    "Lado e resultado de cada ronda sua ({version}): o lado vem do registo da ronda e o vencedor só é usado quando a demo o regista com duas observações concordantes. Resultado e equipas da partida continuam de fora (limitação L04).",
  "xray.roundContext.outcome": "Rondas ganhas / perdidas",
  "xray.roundContext.outcomeValue": "{won} / {lost}",
  "xray.roundContext.outcomeUnknown": "{n} sem vencedor registado",
  "xray.roundContext.killsDeaths": "Abates / mortes",
  "xray.roundContext.winRate": "Taxa de rondas ganhas",
  "xray.roundContext.kpr": "Abates por ronda",
  "xray.roundContext.adr": "Dano por ronda",
  "xray.roundContext.insufficient": "{n} ronda(s) neste lado: as taxas aparecem a partir de {min}.",
  "xray.inference.item": "{dimension}: índice {index}/100 (abaixo de {ceiling})",
  "xray.inference.NO_DATA": "Sem partidas com sinais de Player DNA.",
  "xray.inference.INSUFFICIENT_SAMPLE":
    "Sem inferência: o Player DNA tem {matches} de {minimum} partidas mínimas.",
  "xray.inference.NONE_BELOW_CEILING": "Nenhuma dimensão observada está abaixo de {ceiling}/100.",
  "xray.recommendation.item": "Dar prioridade a {dimension} no treino.",
  "xray.recommendation.none": "Sem recomendação enquanto não houver inferência.",
  "xray.recommendation.open": "Abrir plano de treino",
  "xray.unsupported.title": "O que o CS2 PRO ainda não mede",
  "xray.unsupported.enemiesFlashed":
    "Inimigos cegados: não foram registados eventos de cegueira por flash nestas partidas.",
  "xray.unsupported.positions": "Posições e mapa de calor (as coordenadas não são extraídas).",
  "xray.unsupported.economyClassification":
    "Classificação de compra (eco, force, full) — não há classificador revisto.",
  "xray.unsupported.sideSplitKills": "Abates e dano separados por lado (não guardados por ronda).",
};
