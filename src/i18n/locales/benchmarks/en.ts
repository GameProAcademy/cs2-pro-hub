import type { benchmarksPtBR } from "./pt-BR";

export const benchmarksEn: Record<keyof typeof benchmarksPtBR, string> = {
  "benchmarks.title": "Comparison with professionals",
  "benchmarks.subtitle": "Professional benchmarks (cs2.pro-benchmark.v1)",
  "benchmarks.unavailable.title": "Unavailable.",
  "benchmarks.unavailable.body":
    "There is no CS2 professional data source licensed for this use and computed the same way as your metrics. So no professional average is shown or estimated.",
  "benchmarks.available": "{n} licensed, comparable source(s) available.",
  "benchmarks.rules":
    "A source is used only with a verified licence allowing derived display, authorised collection (never scraping), CS2 data, the same method as your metrics and at least {min} matches.",
  "benchmarks.audit": "Sources reviewed and why they are not used",
  "benchmarks.finding.NO_LICENSE_FOUND": "no licence for this use found",
  "benchmarks.finding.TERMS_RESTRICT_REUSE": "the terms restrict reuse of the data",
  "benchmarks.finding.SCRAPED_ORIGIN": "data collected by scraping",
  "benchmarks.finding.NO_PRO_DATASET": "offers no professional dataset",
  "benchmarks.finding.OWN_PLAYER_DATA_ONLY": "own player data only",
};
