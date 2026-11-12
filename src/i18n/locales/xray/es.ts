import type { xrayPtBR } from "./pt-BR";

export const xrayEs: Record<keyof typeof xrayPtBR, string> = {
  "real.result.unresolved": "No determinado por la demo",
  "real.result.unresolvedNote":
    "Resultado y marcador: la demo no identificó el equipo de cada jugador, así que CS2 PRO no determina victoria ni derrota (limitación L04 de la admisión). No se estima ningún resultado.",
  "real.date.processed": "procesada el",
  "real.date.processedNote":
    "Fecha: las demos de CS2 no registran cuándo se jugó la partida. Si la partida no trae fecha propia, mostramos la fecha en que CS2 PRO la procesó.",
  "real.winRate.sample": "{wins} de {decided} partida(s) con resultado",
  "real.winRate.unresolved":
    "Ninguna de las {n} partida(s) tiene un resultado determinado por la demo",

  "real.dna.inFormation": "En formación",
  "real.dna.inFormationIndex": "Índice en formación ({matches} de {minimum} partidas)",
  "real.dna.radarInFormation":
    "El radar y los índices por dimensión aparecen a partir de {minimum} partidas. Las señales de abajo son reales.",
  "real.dna.history.title": "Evolución del Player DNA",
  "real.dna.history.description":
    "Cada fila es un snapshot guardado cuando cambiaron tus partidas. Los snapshots anteriores nunca se sobrescriben.",
  "real.dna.history.empty": "Todavía no hay snapshots guardados.",
  "real.dna.history.date": "Fecha",
  "real.dna.history.matches": "Partidas",
  "real.dna.history.state": "Estado",
  "real.dna.history.READY": "Muestra mínima alcanzada",
  "real.dna.history.INSUFFICIENT_SAMPLE": "En formación",
  "real.dna.dashboard.inFormation":
    "En formación: {matches} de {minimum} partidas para un perfil estable.",
  "real.dna.dashboard.ready": "Perfil con {matches} partidas y {observed} dimensiones observadas.",
  "real.dna.dashboard.empty": "Todavía no hay partidas con señales de Player DNA.",
  "real.dna.dashboard.noSnapshot":
    "Todavía no hay un perfil de Player DNA guardado. Abre Player DNA para ver tus señales.",
  "real.dna.open": "Ver Player DNA",

  "xray.sample":
    "Base: {matches} partida(s), {rounds} rondas jugadas. Resultado conocido en {decided} partida(s).",
  "xray.inFormation":
    "Rayos X en formación: {matches} de {minimum} partidas. Las observaciones son reales; las inferencias y recomendaciones aparecen con la muestra mínima.",
  "xray.empty": "Los Rayos X aparecen cuando haya al menos una partida procesada con tus datos.",
  "xray.layer.observed": "Observado",
  "xray.layer.observedHint": "Valores medidos en tus partidas, cada uno con su muestra.",
  "xray.layer.inference": "Inferencia",
  "xray.layer.inferenceHint":
    "Lectura de las observaciones según una regla documentada: las dimensiones del Player DNA con el índice más bajo, por debajo de {ceiling}/100.",
  "xray.layer.recommendation": "Recomendación",
  "xray.layer.recommendationHint":
    "Qué trabajar, enlazado con tu plan de entrenamiento. Aquí no se elige ninguna clase.",
  "xray.dim.aim_duels": "Puntería y duelos",
  "xray.dim.survival_positioning": "Supervivencia y posicionamiento",
  "xray.dim.utility": "Utilidades",
  "xray.dim.impact": "Impacto en la ronda",
  "xray.dim.consistency": "Consistencia",
  "xray.dim.decision": "Toma de decisiones",
  "xray.dim.notObserved": "Sin datos observados en esta dimensión.",
  "xray.status.NOT_MEASURED": "No medido",
  "xray.status.EXCLUDED_BY_ADMISSION": "Excluido por la admisión de la demo",
  "xray.inMatches": "en {n} partida(s)",
  "xray.dnaIndex": "Índice DNA",
  "xray.metric.kills": "Bajas",
  "xray.metric.deaths": "Muertes",
  "xray.metric.utilityDamage": "Daño con granadas",
  "xray.metric.clutchWins": "Clutches ganados",
  "xray.metric.ctRating": "Rating en el lado CT",
  "xray.metric.tRating": "Rating en el lado T",
  "xray.sides.title": "Lados CT y T",
  "xray.sides.description":
    "Rondas jugadas en cada lado y el rating de la partida limitado a esas rondas.",
  "xray.sides.ct": "CT",
  "xray.sides.t": "T",
  "xray.sides.rounds": "{n} rondas",
  "xray.roundContext.note":
    "Lado y resultado de cada una de tus rondas ({version}): el lado viene del registro de la ronda y el ganador solo se usa cuando la demo lo registra con dos observaciones coincidentes. El marcador y los equipos de la partida quedan fuera (limitación L04).",
  "xray.roundContext.outcome": "Rondas ganadas / perdidas",
  "xray.roundContext.outcomeValue": "{won} / {lost}",
  "xray.roundContext.outcomeUnknown": "{n} sin ganador registrado",
  "xray.roundContext.killsDeaths": "Bajas / muertes",
  "xray.roundContext.winRate": "Tasa de rondas ganadas",
  "xray.roundContext.kpr": "Bajas por ronda",
  "xray.roundContext.adr": "Daño por ronda",
  "xray.roundContext.insufficient":
    "{n} ronda(s) en este lado: las tasas aparecen a partir de {min}.",
  "xray.inference.item": "{dimension}: índice {index}/100 (por debajo de {ceiling})",
  "xray.inference.NO_DATA": "No hay partidas con señales de Player DNA.",
  "xray.inference.INSUFFICIENT_SAMPLE":
    "Sin inferencia: el Player DNA tiene {matches} de {minimum} partidas mínimas.",
  "xray.inference.NONE_BELOW_CEILING":
    "Ninguna dimensión observada está por debajo de {ceiling}/100.",
  "xray.recommendation.item": "Priorizar {dimension} en el entrenamiento.",
  "xray.recommendation.none": "Sin recomendación mientras no haya inferencia.",
  "xray.recommendation.open": "Abrir plan de entrenamiento",
  "xray.unsupported.title": "Lo que CS2 PRO todavía no mide",
  "xray.unsupported.enemiesFlashed":
    "Enemigos cegados: no se registraron eventos de ceguera por flash en estas partidas.",
  "xray.unsupported.positions":
    "Posiciones y mapa de calor (el parser lee coordenadas, pero aún no se guardan).",
  "xray.unsupported.economyClassification":
    "Clasificación de compra (eco, force, full): no hay un clasificador revisado.",
  "xray.unsupported.sideSplitKills": "Bajas y daño por lado (no se guardan por ronda).",
};
