import type { benchmarksPtBR } from "./pt-BR";

export const benchmarksEs: Record<keyof typeof benchmarksPtBR, string> = {
  "benchmarks.title": "Comparación con profesionales",
  "benchmarks.subtitle": "Benchmarks profesionales (cs2.pro-benchmark.v1)",
  "benchmarks.unavailable.title": "No disponible.",
  "benchmarks.unavailable.body":
    "No hay una fuente de datos de jugadores profesionales de CS2 con licencia para este uso y calculada igual que tus métricas. Por eso no se muestra ni se estima ninguna media profesional.",
  "benchmarks.available": "{n} fuente(s) con licencia y comparable(s) disponible(s).",
  "benchmarks.rules":
    "Una fuente solo se usa con licencia verificada que permita mostrar datos derivados, recogida autorizada (nunca scraping), datos de CS2, el mismo método que tus métricas y al menos {min} partidas.",
  "benchmarks.audit": "Fuentes evaluadas y por qué no se usan",
  "benchmarks.finding.NO_LICENSE_FOUND": "no se encontró licencia para este uso",
  "benchmarks.finding.TERMS_RESTRICT_REUSE":
    "los términos restringen la reutilización de los datos",
  "benchmarks.finding.SCRAPED_ORIGIN": "datos obtenidos por scraping",
  "benchmarks.finding.NO_PRO_DATASET": "no ofrece un conjunto de datos profesionales",
  "benchmarks.finding.OWN_PLAYER_DATA_ONLY": "solo datos del propio jugador",
};
