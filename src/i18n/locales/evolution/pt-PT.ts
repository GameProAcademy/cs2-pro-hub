import type { evolutionPtBR } from "./pt-BR";

export const evolutionPtPT: Record<keyof typeof evolutionPtBR, string> = {
  "nav.evolution": "Evolução",
  "evolution.eyebrow": "Evolução e consistência",
  "evolution.title": "A sua evolução",
  "evolution.description":
    "Janelas dos seus últimos jogos, consistência jogo a jogo e comparação com o período anterior. Tudo é descritivo e mostra quantos jogos sustentam cada número.",
  "evolution.empty.title": "Ainda não há jogos",
  "evolution.empty.description": "Envie demos para acompanhar a sua evolução.",
  "evolution.filter.window": "Janela",
  "evolution.filter.windowN": "Últimas {n}",
  "evolution.filter.map": "Mapa",
  "evolution.filter.allMaps": "Todos os mapas",
  "evolution.filter.side": "Lado",
  "evolution.side.ALL": "Ambos",
  "evolution.side.CT": "CT",
  "evolution.side.T": "T",
  "evolution.windowN": "Janela: {n} jogo(s) de {requested} pedidos ({total} elegíveis no total).",
  "evolution.window.partial":
    "Há menos jogos do que o tamanho da janela; os números usam apenas os jogos existentes.",
  "evolution.window.insufficient":
    "Menos de {min} jogos: amostra insuficiente para mostrar a janela.",
  "evolution.excluded":
    "{n} jogo(s) sem contagem de rondas ficaram de fora (nenhuma taxa por ronda pode ser calculada neles).",
  "evolution.sideOnlyRating":
    "Só o rating é registado por lado (CT/T); as restantes métricas não são medidas por lado.",
  "evolution.weaponNote":
    "A evolução por arma não é medida no histórico por jogo; veja armas e duelos por jogo em Confrontos.",
  "evolution.section.metrics": "Métricas da janela",
  "evolution.section.metrics.subtitle":
    "Valor da janela, consistência entre jogos e comparação com os jogos anteriores.",
  "evolution.col.metric": "Métrica",
  "evolution.col.window": "Janela",
  "evolution.col.consistency": "Consistência",
  "evolution.col.comparison": "Comparação",
  "evolution.method":
    "Método {version}. Taxas somadas por numerador e denominador. A consistência exige {consistency} jogos e não recebe rótulo. A comparação exige {compare} jogos em cada período e o mesmo método.",
  "evolution.section.chart": "Jogo a jogo",
  "evolution.section.chart.subtitle":
    "Valor de cada jogo da janela; jogos sem medição aparecem como lacuna, nunca como zero.",
  "evolution.chart.axis": "Eixo vertical: {unit}. Eixo horizontal: data do jogo.",
  "evolution.notMeasured": "não medido",
  "evolution.openRounds": "Ver rondas",
  "evolution.notCausal":
    "As variações entre períodos são descritivas: não indicam a causa (treino, mapa, adversário ou acaso).",
  "evolution.aggregation.POOLED_RATIO": "soma de numeradores / denominadores",
  "evolution.aggregation.MEAN_PER_MATCH": "média por jogo",
  "evolution.coverage": "medida em {n} de {total} jogos",
  "evolution.status.OK": "ok",
  "evolution.status.NO_SAMPLE": "não medido na janela",
  "evolution.status.INCOMPATIBLE_METHODS": "métodos diferentes na janela — não somados",
  "evolution.consistency.median": "mediana {v} (IQR {q1}–{q3})",
  "evolution.consistency.sd": "desvio padrão {sd} · CV {cv}",
  "evolution.consistency.insufficient": "amostra insuficiente ({n} de {min} jogos)",
  "evolution.comparison.n": "{recent} jogos recentes × {previous} anteriores",
  "evolution.comparison.OK": "ok",
  "evolution.comparison.INSUFFICIENT_SAMPLE":
    "amostra insuficiente (mínimo {min} jogos em cada período)",
  "evolution.comparison.INCOMPATIBLE_METHODS":
    "métodos diferentes entre os períodos — não comparável",
  "evolution.comparison.NO_PREVIOUS_PERIOD": "sem período anterior",
  "evolution.dna.title": "Player DNA",
  "evolution.dna.subtitle":
    "O DNA usa os seus próprios snapshots versionados e só aparece completo com amostra suficiente.",
  "evolution.dna.ready": "DNA pronto com {n} jogos (snapshot de {date}).",
  "evolution.dna.insufficient": "DNA com amostra insuficiente: {n} de {min} jogos.",
  "evolution.dna.open": "Abrir Player DNA",
  "evolution.metric.kd": "K/D",
  "evolution.metric.adr": "Dano por ronda (ADR)",
  "evolution.metric.kast": "KAST",
  "evolution.metric.hsPercent": "Headshot %",
  "evolution.metric.rating": "Rating",
  "evolution.metric.openingWinRate": "Aberturas ganhas",
  "evolution.metric.deathsPerRound": "Mortes por ronda",
  "evolution.metric.tradeKillsPerRound": "Abates de troca por ronda",
  "evolution.metric.clutchWinRate": "Clutches ganhos",
  "evolution.metric.flashAssistsPerRound": "Flash assists por ronda",
  "evolution.unit.RATIO": "razão (abates por morte)",
  "evolution.unit.PERCENT": "percentagem",
  "evolution.unit.PER_ROUND": "por ronda",
  "evolution.unit.DAMAGE_PER_ROUND": "dano por ronda",
  "evolution.unit.RATING": "rating",
};
