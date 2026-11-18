import type { evolutionPtBR } from "./pt-BR";

export const evolutionEs: Record<keyof typeof evolutionPtBR, string> = {
  "nav.evolution": "Evolución",
  "evolution.eyebrow": "Evolución y consistencia",
  "evolution.title": "Tu evolución",
  "evolution.description":
    "Ventanas de tus últimas partidas, consistencia partida a partida y comparación con el período anterior. Todo es descriptivo y muestra cuántas partidas respaldan cada número.",
  "evolution.empty.title": "Aún no hay partidas",
  "evolution.empty.description": "Sube demos para seguir tu evolución.",
  "evolution.filter.window": "Ventana",
  "evolution.filter.windowN": "Últimas {n}",
  "evolution.filter.map": "Mapa",
  "evolution.filter.allMaps": "Todos los mapas",
  "evolution.filter.side": "Lado",
  "evolution.side.ALL": "Ambos",
  "evolution.side.CT": "CT",
  "evolution.side.T": "T",
  "evolution.windowN":
    "Ventana: {n} partida(s) de {requested} pedidas ({total} elegibles en total).",
  "evolution.window.partial":
    "Hay menos partidas que el tamaño de la ventana; los números usan solo las partidas existentes.",
  "evolution.window.insufficient":
    "Menos de {min} partidas: muestra insuficiente para mostrar la ventana.",
  "evolution.excluded":
    "{n} partida(s) sin recuento de rondas quedaron fuera (no se puede calcular ninguna tasa por ronda en ellas).",
  "evolution.sideOnlyRating":
    "Solo el rating se registra por lado (CT/T); las demás métricas no se miden por lado.",
  "evolution.weaponNote":
    "La evolución por arma no se mide en el historial por partida; mira armas y duelos por partida en Enfrentamientos.",
  "evolution.section.metrics": "Métricas de la ventana",
  "evolution.section.metrics.subtitle":
    "Valor de la ventana, consistencia entre partidas y comparación con las partidas anteriores.",
  "evolution.col.metric": "Métrica",
  "evolution.col.window": "Ventana",
  "evolution.col.consistency": "Consistencia",
  "evolution.col.comparison": "Comparación",
  "evolution.method":
    "Método {version}. Tasas sumadas por numerador y denominador. La consistencia exige {consistency} partidas y no recibe etiqueta. La comparación exige {compare} partidas en cada período y el mismo método.",
  "evolution.section.chart": "Partida a partida",
  "evolution.section.chart.subtitle":
    "Valor de cada partida de la ventana; las partidas sin medición son un hueco, nunca un cero.",
  "evolution.chart.axis": "Eje vertical: {unit}. Eje horizontal: fecha de la partida.",
  "evolution.notMeasured": "no medido",
  "evolution.openRounds": "Ver rondas",
  "evolution.notCausal":
    "Los cambios entre períodos son descriptivos: no indican la causa (entrenamiento, mapa, rivales o azar).",
  "evolution.aggregation.POOLED_RATIO": "suma de numeradores / denominadores",
  "evolution.aggregation.MEAN_PER_MATCH": "media por partida",
  "evolution.coverage": "medida en {n} de {total} partidas",
  "evolution.status.OK": "ok",
  "evolution.status.NO_SAMPLE": "no medido en la ventana",
  "evolution.status.INCOMPATIBLE_METHODS": "métodos distintos en la ventana — no sumados",
  "evolution.consistency.median": "mediana {v} (IQR {q1}–{q3})",
  "evolution.consistency.sd": "desviación estándar {sd} · CV {cv}",
  "evolution.consistency.insufficient": "muestra insuficiente ({n} de {min} partidas)",
  "evolution.comparison.n": "{recent} partidas recientes × {previous} anteriores",
  "evolution.comparison.OK": "ok",
  "evolution.comparison.INSUFFICIENT_SAMPLE":
    "muestra insuficiente (mínimo {min} partidas en cada período)",
  "evolution.comparison.INCOMPATIBLE_METHODS":
    "métodos distintos entre los períodos — no comparable",
  "evolution.comparison.NO_PREVIOUS_PERIOD": "sin período anterior",
  "evolution.dna.title": "Player DNA",
  "evolution.dna.subtitle":
    "El DNA usa sus propios snapshots versionados y solo se muestra completo con muestra suficiente.",
  "evolution.dna.ready": "DNA listo con {n} partidas (snapshot del {date}).",
  "evolution.dna.insufficient": "DNA con muestra insuficiente: {n} de {min} partidas.",
  "evolution.dna.open": "Abrir Player DNA",
  "evolution.metric.kd": "K/D",
  "evolution.metric.adr": "Daño por ronda (ADR)",
  "evolution.metric.kast": "KAST",
  "evolution.metric.hsPercent": "Headshot %",
  "evolution.metric.rating": "Rating",
  "evolution.metric.openingWinRate": "Aperturas ganadas",
  "evolution.metric.deathsPerRound": "Muertes por ronda",
  "evolution.metric.tradeKillsPerRound": "Bajas de intercambio por ronda",
  "evolution.metric.clutchWinRate": "Clutches ganados",
  "evolution.metric.flashAssistsPerRound": "Flash assists por ronda",
  "evolution.unit.RATIO": "razón (bajas por muerte)",
  "evolution.unit.PERCENT": "porcentaje",
  "evolution.unit.PER_ROUND": "por ronda",
  "evolution.unit.DAMAGE_PER_ROUND": "daño por ronda",
  "evolution.unit.RATING": "rating",
};
