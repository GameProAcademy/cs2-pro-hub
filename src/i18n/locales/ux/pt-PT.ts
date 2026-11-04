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
    "Dano causado aos inimigos dividido pelo número de rondas que jogou. Só aparece quando a demo inclui os eventos de dano.",
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
    "A nota geral de desempenho do CS2 PRO. Ainda não é calculada: só será apresentada quando a fórmula, os pesos e a amostra mínima estiverem validados.",

  "real.proScoreContext.body":
    "O CS2 PRO Score ainda não é calculado. Só aparecerá quando a fórmula, os pesos e o número mínimo de partidas estiverem validados, e nunca será uma estimativa.",
  "real.proScoreContext.instead":
    "Entretanto, acompanhe nesta página as métricas medidas nas suas partidas. O rating da tabela de partidas vale apenas para cada partida isolada e não substitui o CS2 PRO Score.",
  "real.proScore.where": "Saiba mais em Desempenho",
  "training.real.accessNote":
    "As aulas abrem na plataforma de cursos GamePro (hub.gamepro.academy), num novo separador. O acesso a cada aula é controlado pela sua conta nessa plataforma, onde fica o seu progresso: o CS2 PRO não acompanha o progresso das aulas.",
};
