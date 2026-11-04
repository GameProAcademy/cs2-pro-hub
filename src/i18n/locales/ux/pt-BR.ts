/** Fase 1 (UX e clareza): glossário de métricas, estados "sem dados" e contexto. */
export const uxPtBR = {
  "common.notAvailable": "Não disponível",
  "common.notAvailableHint": "Sem dados suficientes",
  "glossary.title": "Glossário das métricas",
  "glossary.description": "O que cada número significa e como o CS2 PRO calcula.",
  "glossary.open": "O que é {term}?",

  "glossary.kd.label": "K/D",
  "glossary.kd.short": "K/D",
  "glossary.kd.definition":
    "Abates divididos por mortes. Na média geral, somamos os abates e as mortes de todas as partidas que têm esses dados.",
  "glossary.adr.label": "ADR (dano médio por round)",
  "glossary.adr.short": "ADR",
  "glossary.adr.definition":
    "Dano causado aos inimigos dividido pelo número de rounds que você jogou. Só aparece quando a demo traz os eventos de dano.",
  "glossary.kast.label": "KAST",
  "glossary.kast.short": "KAST",
  "glossary.kast.definition":
    "Percentual de rounds em que você fez um abate (K), deu uma assistência (A, inclusive por flash), sobreviveu (S, comprovadamente) ou foi trocado (T: um colega matou quem matou você em até {tradeWindow} s).",
  "glossary.hsPercent.label": "HS% (headshots)",
  "glossary.hsPercent.short": "HS%",
  "glossary.hsPercent.definition": "Percentual dos seus abates feitos com tiro na cabeça.",
  "glossary.rating.label": "Rating da partida",
  "glossary.rating.short": "Rating",
  "glossary.rating.definition":
    "Indicador relativo de uma única partida, calculado pelo CS2 PRO a partir de abates por round, mortes por round e ADR. Valores maiores indicam um desempenho melhor naquela partida. Não é o HLTV Rating nem o CS2 PRO Score.",
  "glossary.winRate.label": "Taxa de vitória",
  "glossary.winRate.short": "Vitórias",
  "glossary.winRate.definition":
    "Vitórias divididas pelas partidas com vitória ou derrota. Empates e partidas sem resultado não entram na conta.",
  "glossary.openingKills.label": "Abates de abertura (entry)",
  "glossary.openingKills.short": "Abertura",
  "glossary.openingKills.definition":
    "Rounds em que você fez o primeiro abate do round. Rounds em que não dá para saber a ordem dos abates ficam de fora.",
  "glossary.openingDeaths.label": "Mortes de abertura",
  "glossary.openingDeaths.short": "Morte de abertura",
  "glossary.openingDeaths.definition":
    "Rounds em que você foi a primeira morte do round. Rounds em que não dá para saber a ordem dos abates ficam de fora.",
  "glossary.tradeKills.label": "Trade kills",
  "glossary.tradeKills.short": "Trades",
  "glossary.tradeKills.definition":
    "Abates em que você matou um inimigo que tinha acabado de matar um colega seu, em até {tradeWindow} s, no mesmo round.",
  "glossary.flashAssists.label": "Assistências por flash",
  "glossary.flashAssists.short": "Flash assists",
  "glossary.flashAssists.definition":
    "Abates de colegas em que você cegou a vítima com uma flash. Usamos a marcação do próprio jogo; quando a demo não a traz, conta a sua flash que cegou a vítima até {flashWindow} s antes do abate.",
  "glossary.clutch.label": "Clutch",
  "glossary.clutch.short": "Clutch",
  "glossary.clutch.definition":
    "Situação em que você é o último vivo do seu time contra um ou mais inimigos vivos. Sem os eventos de abate não dá para saber, e o valor fica indisponível.",
  "glossary.utility.label": "Utilitários",
  "glossary.utility.short": "Utility",
  "glossary.utility.definition": "Granadas: HE, flash, smoke, molotov/incendiária e decoy.",
  "glossary.proScore.label": "CS2 PRO Score",
  "glossary.proScore.short": "PRO Score",
  "glossary.proScore.definition":
    "Nota geral de desempenho do CS2 PRO. Ainda não é calculada: só será exibida quando fórmula, pesos e amostra mínima estiverem validados.",

  "real.proScoreContext.body":
    "O CS2 PRO Score ainda não é calculado. Ele só aparecerá quando a fórmula, os pesos e a quantidade mínima de partidas estiverem validados, e nunca será uma estimativa.",
  "real.proScoreContext.instead":
    "Enquanto isso, acompanhe as métricas medidas nas suas partidas nesta página. O rating que aparece na tabela de partidas vale só para cada partida isolada e não substitui o CS2 PRO Score.",
  "real.proScore.where": "Entenda na Performance",
  "training.real.accessNote":
    "O CS2 PRO só recomenda aulas do catálogo GamePro, escolhidas a partir das suas partidas e objetivos, e mostra o link. A aula abre em hub.gamepro.academy, numa nova aba, com o seu próprio login dessa plataforma. O CS2 PRO não recebe nenhuma informação de lá: não sabe se você abriu, assistiu ou concluiu uma aula, e nada disso entra nas suas métricas ou recomendações.",
} as const;
