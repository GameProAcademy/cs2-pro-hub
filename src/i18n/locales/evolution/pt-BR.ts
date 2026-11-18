/** PM4 / 4.2.8 — evolution and consistency (module G). */
export const evolutionPtBR = {
  "nav.evolution": "Evolução",
  "evolution.eyebrow": "Evolução e consistência",
  "evolution.title": "Sua evolução",
  "evolution.description":
    "Janelas das suas últimas partidas, consistência partida a partida e comparação com o período anterior. Tudo é descritivo e mostra quantas partidas sustentam cada número.",
  "evolution.empty.title": "Nenhuma partida ainda",
  "evolution.empty.description": "Envie demos para acompanhar sua evolução.",
  "evolution.filter.window": "Janela",
  "evolution.filter.windowN": "Últimas {n}",
  "evolution.filter.map": "Mapa",
  "evolution.filter.allMaps": "Todos os mapas",
  "evolution.filter.side": "Lado",
  "evolution.side.ALL": "Ambos",
  "evolution.side.CT": "CT",
  "evolution.side.T": "T",
  "evolution.windowN":
    "Janela: {n} partida(s) de {requested} pedidas ({total} elegíveis no total).",
  "evolution.window.partial":
    "Há menos partidas do que o tamanho da janela; os números usam só as partidas existentes.",
  "evolution.window.insufficient":
    "Menos de {min} partidas: amostra insuficiente para mostrar a janela.",
  "evolution.excluded":
    "{n} partida(s) sem contagem de rounds ficaram fora (nenhuma taxa por round pode ser calculada nelas).",
  "evolution.sideOnlyRating":
    "Somente o rating é registrado por lado (CT/T); as demais métricas não são medidas por lado.",
  "evolution.weaponNote":
    "Evolução por arma não é medida no histórico por partida; veja armas e duelos por partida em Confrontos.",
  "evolution.section.metrics": "Métricas da janela",
  "evolution.section.metrics.subtitle":
    "Valor da janela, consistência entre partidas e comparação com as partidas anteriores.",
  "evolution.col.metric": "Métrica",
  "evolution.col.window": "Janela",
  "evolution.col.consistency": "Consistência",
  "evolution.col.comparison": "Comparação",
  "evolution.method":
    "Método {version}. Taxas somadas por numerador e denominador. Consistência exige {consistency} partidas e não recebe rótulo. Comparação exige {compare} partidas em cada período e o mesmo método.",
  "evolution.section.chart": "Partida a partida",
  "evolution.section.chart.subtitle":
    "Valor de cada partida da janela; partidas sem medição aparecem como lacuna, nunca como zero.",
  "evolution.chart.axis": "Eixo vertical: {unit}. Eixo horizontal: data da partida.",
  "evolution.notMeasured": "não medido",
  "evolution.openRounds": "Ver rounds",
  "evolution.notCausal":
    "Variações entre períodos são descritivas: não indicam a causa (treino, mapa, adversário ou acaso).",
  "evolution.aggregation.POOLED_RATIO": "soma de numeradores / denominadores",
  "evolution.aggregation.MEAN_PER_MATCH": "média por partida",
  "evolution.coverage": "medida em {n} de {total} partidas",
  "evolution.status.OK": "ok",
  "evolution.status.NO_SAMPLE": "não medido na janela",
  "evolution.status.INCOMPATIBLE_METHODS": "métodos diferentes na janela — não somados",
  "evolution.consistency.median": "mediana {v} (IQR {q1}–{q3})",
  "evolution.consistency.sd": "desvio padrão {sd} · CV {cv}",
  "evolution.consistency.insufficient": "amostra insuficiente ({n} de {min} partidas)",
  "evolution.comparison.n": "{recent} partidas recentes × {previous} anteriores",
  "evolution.comparison.OK": "ok",
  "evolution.comparison.INSUFFICIENT_SAMPLE":
    "amostra insuficiente (mínimo {min} partidas em cada período)",
  "evolution.comparison.INCOMPATIBLE_METHODS":
    "métodos diferentes entre os períodos — não comparável",
  "evolution.comparison.NO_PREVIOUS_PERIOD": "sem período anterior",
  "evolution.dna.title": "Player DNA",
  "evolution.dna.subtitle":
    "O DNA usa seus próprios snapshots versionados e só aparece completo com amostra suficiente.",
  "evolution.dna.ready": "DNA pronto com {n} partidas (snapshot de {date}).",
  "evolution.dna.insufficient": "DNA com amostra insuficiente: {n} de {min} partidas.",
  "evolution.dna.open": "Abrir Player DNA",
  "evolution.metric.kd": "K/D",
  "evolution.metric.adr": "Dano por round (ADR)",
  "evolution.metric.kast": "KAST",
  "evolution.metric.hsPercent": "Headshot %",
  "evolution.metric.rating": "Rating",
  "evolution.metric.openingWinRate": "Aberturas vencidas",
  "evolution.metric.deathsPerRound": "Mortes por round",
  "evolution.metric.tradeKillsPerRound": "Abates de troca por round",
  "evolution.metric.clutchWinRate": "Clutches vencidos",
  "evolution.metric.flashAssistsPerRound": "Flash assists por round",
  "evolution.unit.RATIO": "razão (abates por morte)",
  "evolution.unit.PERCENT": "porcentagem",
  "evolution.unit.PER_ROUND": "por round",
  "evolution.unit.DAMAGE_PER_ROUND": "dano por round",
  "evolution.unit.RATING": "rating",
} as const;
