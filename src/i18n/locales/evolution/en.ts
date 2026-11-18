import type { evolutionPtBR } from "./pt-BR";

export const evolutionEn: Record<keyof typeof evolutionPtBR, string> = {
  "nav.evolution": "Evolution",
  "evolution.eyebrow": "Evolution & consistency",
  "evolution.title": "Your evolution",
  "evolution.description":
    "Windows of your latest matches, match-to-match consistency and comparison with the previous period. Everything is descriptive and shows how many matches back each number.",
  "evolution.empty.title": "No matches yet",
  "evolution.empty.description": "Upload demos to follow your evolution.",
  "evolution.filter.window": "Window",
  "evolution.filter.windowN": "Last {n}",
  "evolution.filter.map": "Map",
  "evolution.filter.allMaps": "All maps",
  "evolution.filter.side": "Side",
  "evolution.side.ALL": "Both",
  "evolution.side.CT": "CT",
  "evolution.side.T": "T",
  "evolution.windowN":
    "Window: {n} match(es) of {requested} requested ({total} eligible in total).",
  "evolution.window.partial":
    "There are fewer matches than the window size; the numbers use only the existing matches.",
  "evolution.window.insufficient":
    "Fewer than {min} matches: not enough sample to show the window.",
  "evolution.excluded":
    "{n} match(es) without a round count were left out (no per-round rate can be computed for them).",
  "evolution.sideOnlyRating":
    "Only the rating is stored per side (CT/T); the other metrics are not measured per side.",
  "evolution.weaponNote":
    "Evolution by weapon is not measured in the per-match history; see weapons and duels per match in Combat.",
  "evolution.section.metrics": "Window metrics",
  "evolution.section.metrics.subtitle":
    "Window value, match-to-match consistency and comparison with the previous matches.",
  "evolution.col.metric": "Metric",
  "evolution.col.window": "Window",
  "evolution.col.consistency": "Consistency",
  "evolution.col.comparison": "Comparison",
  "evolution.method":
    "Method {version}. Rates pooled from numerators and denominators. Consistency needs {consistency} matches and gets no label. A comparison needs {compare} matches in each period and the same method.",
  "evolution.section.chart": "Match by match",
  "evolution.section.chart.subtitle":
    "Value of each match in the window; matches without a measurement are a gap, never a zero.",
  "evolution.chart.axis": "Vertical axis: {unit}. Horizontal axis: match date.",
  "evolution.notMeasured": "not measured",
  "evolution.openRounds": "See rounds",
  "evolution.notCausal":
    "Changes between periods are descriptive: they do not tell the cause (training, map, opponents or chance).",
  "evolution.aggregation.POOLED_RATIO": "sum of numerators / denominators",
  "evolution.aggregation.MEAN_PER_MATCH": "mean per match",
  "evolution.coverage": "measured in {n} of {total} matches",
  "evolution.status.OK": "ok",
  "evolution.status.NO_SAMPLE": "not measured in the window",
  "evolution.status.INCOMPATIBLE_METHODS": "different methods in the window — not pooled",
  "evolution.consistency.median": "median {v} (IQR {q1}–{q3})",
  "evolution.consistency.sd": "standard deviation {sd} · CV {cv}",
  "evolution.consistency.insufficient": "not enough sample ({n} of {min} matches)",
  "evolution.comparison.n": "{recent} recent × {previous} previous matches",
  "evolution.comparison.OK": "ok",
  "evolution.comparison.INSUFFICIENT_SAMPLE":
    "not enough sample (at least {min} matches in each period)",
  "evolution.comparison.INCOMPATIBLE_METHODS":
    "different methods between the periods — not comparable",
  "evolution.comparison.NO_PREVIOUS_PERIOD": "no previous period",
  "evolution.dna.title": "Player DNA",
  "evolution.dna.subtitle":
    "The DNA uses its own versioned snapshots and is shown in full only with enough sample.",
  "evolution.dna.ready": "DNA ready with {n} matches (snapshot of {date}).",
  "evolution.dna.insufficient": "DNA with not enough sample: {n} of {min} matches.",
  "evolution.dna.open": "Open Player DNA",
  "evolution.metric.kd": "K/D",
  "evolution.metric.adr": "Damage per round (ADR)",
  "evolution.metric.kast": "KAST",
  "evolution.metric.hsPercent": "Headshot %",
  "evolution.metric.rating": "Rating",
  "evolution.metric.openingWinRate": "Opening duels won",
  "evolution.metric.deathsPerRound": "Deaths per round",
  "evolution.metric.tradeKillsPerRound": "Trade kills per round",
  "evolution.metric.clutchWinRate": "Clutches won",
  "evolution.metric.flashAssistsPerRound": "Flash assists per round",
  "evolution.unit.RATIO": "ratio (kills per death)",
  "evolution.unit.PERCENT": "percentage",
  "evolution.unit.PER_ROUND": "per round",
  "evolution.unit.DAMAGE_PER_ROUND": "damage per round",
  "evolution.unit.RATING": "rating",
};
