import type { uxPtBR } from "./pt-BR";

export const uxEs: Record<keyof typeof uxPtBR, string> = {
  "common.notAvailable": "No disponible",
  "common.notAvailableHint": "Datos insuficientes",
  "glossary.title": "Glosario de métricas",
  "glossary.description": "Qué significa cada número y cómo lo calcula CS2 PRO.",
  "glossary.open": "¿Qué es {term}?",

  "glossary.kd.label": "K/D",
  "glossary.kd.short": "K/D",
  "glossary.kd.definition":
    "Bajas divididas entre muertes. En el promedio general sumamos las bajas y muertes de todas las partidas que tienen estos datos.",
  "glossary.adr.label": "ADR (daño medio por ronda)",
  "glossary.adr.short": "ADR",
  "glossary.adr.definition":
    "Daño causado a los enemigos dividido entre las rondas que jugaste. Solo aparece cuando la demo incluye los eventos de daño.",
  "glossary.kast.label": "KAST",
  "glossary.kast.short": "KAST",
  "glossary.kast.definition":
    "Porcentaje de rondas en las que hiciste una baja (K), diste una asistencia (A, incluidas las de flash), sobreviviste de forma comprobada (S) o fuiste vengado (T: un compañero mató a quien te mató en hasta {tradeWindow} s).",
  "glossary.hsPercent.label": "HS% (headshots)",
  "glossary.hsPercent.short": "HS%",
  "glossary.hsPercent.definition": "Porcentaje de tus bajas hechas con disparo a la cabeza.",
  "glossary.rating.label": "Rating de la partida",
  "glossary.rating.short": "Rating",
  "glossary.rating.definition":
    "Indicador relativo de una sola partida, calculado por CS2 PRO a partir de bajas por ronda, muertes por ronda y ADR. Un valor mayor indica un mejor desempeño en esa partida. No es el HLTV Rating ni el CS2 PRO Score.",
  "glossary.winRate.label": "Porcentaje de victorias",
  "glossary.winRate.short": "Victorias",
  "glossary.winRate.definition":
    "Victorias divididas entre las partidas con victoria o derrota. Los empates y las partidas sin resultado no cuentan.",
  "glossary.openingKills.label": "Bajas de apertura (entry)",
  "glossary.openingKills.short": "Apertura",
  "glossary.openingKills.definition":
    "Rondas en las que hiciste la primera baja de la ronda. Las rondas en las que no se puede saber el orden de las bajas quedan fuera.",
  "glossary.openingDeaths.label": "Muertes de apertura",
  "glossary.openingDeaths.short": "Muerte de apertura",
  "glossary.openingDeaths.definition":
    "Rondas en las que fuiste la primera muerte de la ronda. Las rondas en las que no se puede saber el orden de las bajas quedan fuera.",
  "glossary.tradeKills.label": "Trade kills",
  "glossary.tradeKills.short": "Trades",
  "glossary.tradeKills.definition":
    "Bajas en las que mataste a un enemigo que acababa de matar a un compañero tuyo, en hasta {tradeWindow} s, en la misma ronda.",
  "glossary.flashAssists.label": "Asistencias con flash",
  "glossary.flashAssists.short": "Flash assists",
  "glossary.flashAssists.definition":
    "Bajas de compañeros sobre una víctima que cegaste con una flash. Usamos la marca del propio juego; si la demo no la trae, cuenta tu flash si cegó a la víctima hasta {flashWindow} s antes de la baja.",
  "glossary.clutch.label": "Clutch",
  "glossary.clutch.short": "Clutch",
  "glossary.clutch.definition":
    "Situación en la que eres el último vivo de tu equipo contra uno o más enemigos vivos. Sin los eventos de bajas no se puede saber y el valor no está disponible.",
  "glossary.utility.label": "Utilidades",
  "glossary.utility.short": "Utility",
  "glossary.utility.definition": "Granadas: HE, flash, humo, molotov/incendiaria y señuelo.",
  "glossary.proScore.label": "CS2 PRO Score",
  "glossary.proScore.short": "PRO Score",
  "glossary.proScore.definition":
    "La nota general de desempeño de CS2 PRO. Todavía no se calcula: solo se mostrará cuando su fórmula, pesos y muestra mínima estén validados.",

  "real.proScoreContext.body":
    "El CS2 PRO Score todavía no se calcula. Solo aparecerá cuando su fórmula, sus pesos y la cantidad mínima de partidas estén validados, y nunca será una estimación.",
  "real.proScoreContext.instead":
    "Mientras tanto, sigue las métricas medidas en tus partidas en esta página. El rating de la tabla de partidas vale solo para cada partida y no reemplaza al CS2 PRO Score.",
  "real.proScore.where": "Más información en Rendimiento",
  "training.real.accessNote":
    "Las clases se abren en la plataforma de cursos GamePro (hub.gamepro.academy) en una nueva pestaña. El acceso a cada clase lo controla tu cuenta en esa plataforma, y tu progreso queda allí: CS2 PRO no sigue el progreso de las clases.",
};
