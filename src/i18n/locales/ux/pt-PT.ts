import type { uxPtBR } from "./pt-BR";

export const uxPtPT: Record<keyof typeof uxPtBR, string> = {
  "common.notAvailable": "Não disponível",
  "common.notAvailableHint": "Dados insuficientes",
  "glossary.title": "Glossário das métricas",
  "glossary.description": "O que significa cada número e como o CS2 PRO o calcula.",
  "glossary.open": "O que é {term}?",

  "glossary.kd.label": "K/D",
  "glossary.kd.short": "K/D",
  "glossary.kd.definition":
    "Abates divididos por mortes. Na média geral, somamos os abates e as mortes de todas as partidas que têm estes dados.",
  "glossary.adr.label": "ADR (dano médio por ronda)",
  "glossary.adr.short": "ADR",
  "glossary.adr.definition":
    "Vida que retirou aos inimigos, dividida pelas rondas que jogou. Cada golpe conta no máximo a vida que o inimigo ainda tinha; dano em aliados, em si próprio, do mundo e em jogadores de lado desconhecido não entra. Só aparece quando a demo inclui os eventos de dano.",
  "adr.partial": "parcial",
  "adr.partial.hint":
    "ADR parcial: alguns dos seus golpes ficaram de fora porque a demo não registou o lado da vítima ou não permitiu saber quanta vida o golpe retirou. O valor real é igual ou superior; nada foi estimado.",
  "adr.partialMatches": "Parcial em {n} partida(s): o valor real é igual ou superior.",
  "adr.partialRounds": "Parcial em {n} ronda(s): o valor real é igual ou superior.",
  "glossary.kast.label": "KAST",
  "glossary.kast.short": "KAST",
  "glossary.kast.definition":
    "Percentagem de rondas em que fez um abate (K), deu uma assistência (A, incluindo por flash), sobreviveu de forma comprovada (S) ou foi trocado (T: um colega abateu quem o abateu em até {tradeWindow} s).",
  "glossary.hsPercent.label": "HS% (headshots)",
  "glossary.hsPercent.short": "HS%",
  "glossary.hsPercent.definition": "Percentagem dos seus abates feitos com tiro na cabeça.",
  "glossary.rating.label": "Rating da partida",
  "glossary.rating.short": "Rating",
  "glossary.rating.definition":
    "Indicador relativo de uma única partida, calculado pelo CS2 PRO a partir de abates por ronda, mortes por ronda e ADR. Valores mais altos indicam um melhor desempenho nessa partida. Não é o HLTV Rating nem o CS2 PRO Score.",
  "glossary.winRate.label": "Taxa de vitória",
  "glossary.winRate.short": "Vitórias",
  "glossary.winRate.definition":
    "Vitórias divididas pelas partidas com vitória ou derrota. Empates e partidas sem resultado não contam.",
  "glossary.openingKills.label": "Abates de abertura (entry)",
  "glossary.openingKills.short": "Abertura",
  "glossary.openingKills.definition":
    "Rondas em que fez o primeiro abate da ronda. As rondas em que não é possível saber a ordem dos abates ficam de fora.",
  "glossary.openingDeaths.label": "Mortes de abertura",
  "glossary.openingDeaths.short": "Morte de abertura",
  "glossary.openingDeaths.definition":
    "Rondas em que foi a primeira morte da ronda. As rondas em que não é possível saber a ordem dos abates ficam de fora.",
  "glossary.tradeKills.label": "Trade kills",
  "glossary.tradeKills.short": "Trades",
  "glossary.tradeKills.definition":
    "Abates em que abateu um inimigo que tinha acabado de abater um colega seu, em até {tradeWindow} s, na mesma ronda.",
  "glossary.flashAssists.label": "Assistências por flash",
  "glossary.flashAssists.short": "Flash assists",
  "glossary.flashAssists.definition":
    "Abates de colegas sobre uma vítima que cegou com uma flash. Usamos a marcação do próprio jogo; se a demo não a tiver, conta a sua flash que cegou a vítima até {flashWindow} s antes do abate.",
  "glossary.clutch.label": "Clutch",
  "glossary.clutch.short": "Clutch",
  "glossary.clutch.definition":
    "Situação em que é o último vivo da sua equipa contra um ou mais inimigos vivos. Sem os eventos de abate não é possível saber e o valor fica indisponível.",
  "glossary.utility.label": "Utilitários",
  "glossary.utility.short": "Utility",
  "glossary.utility.definition": "Granadas: HE, flash, fumo, molotov/incendiária e decoy.",
  "glossary.proScore.label": "CS2 PRO Score",
  "glossary.proScore.short": "PRO Score",
  "glossary.proScore.definition":
    "Índice de 0 a 100 do seu desempenho medido nas partidas completas: média ponderada de KAST, dano e abates por ronda, equilíbrio de abates e mortes, sobrevivência, duelos de abertura e clutches. Não é percentil nem comparação com outros jogadores.",

  "real.proScoreContext.body":
    "O CS2 PRO Score resume o seu desempenho medido em um índice de 0 a 100. Ele só aparece com pelo menos 3 partidas completas e cobertura suficiente, e nunca é uma estimativa.",
  "real.proScoreContext.instead":
    "O rating que aparece na tabela de partidas vale só para cada partida isolada e não substitui o CS2 PRO Score.",
  "real.proScore.where": "Saiba mais em Desempenho",
};
