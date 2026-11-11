/** CS2 PRO Score (pro-score-v1) — en. */
export const scoreEn = {
  "score.of100": "{score} / 100",
  "score.loading": "Calculating…",
  "score.state.EMPTY": "No processed matches yet. Upload a demo to start.",
  "score.state.INSUFFICIENT_SAMPLE":
    "Not calculated yet: {matches} of {minimum} complete matches. No value is estimated.",
  "score.state.INSUFFICIENT_COVERAGE":
    "Not calculated yet: only {coverage}% of the Score's weight was measured in your matches (minimum {min}%).",
  "score.basis":
    "Calculated from {matches} complete match(es) and {rounds} rounds. Method {version}.",
  "score.partialExcluded": "{n} partially read match(es) were left out of the calculation.",
  "score.confidence.label": "Sample confidence",
  "score.confidence.PROVISIONAL":
    "Provisional (fewer than {moderate} rounds): the value can still move a lot with new matches",
  "score.confidence.MODERATE": "Moderate ({moderate} to {high} rounds)",
  "score.confidence.HIGH": "High ({high} rounds or more)",
  "score.coverage": "Coverage: {coverage}% of the weight measured",
  "score.notPercentile":
    "It is an absolute CS2 PRO index. It is not a percentile or a comparison with other players, and 50 does not mean “average”.",
  "score.details": "See how it is calculated",
  "score.components.title": "How your Score is formed",
  "score.col.component": "Component",
  "score.col.value": "Your value",
  "score.col.sample": "Sample",
  "score.col.weight": "Weight",
  "score.col.points": "Points",
  "score.c.round_contribution": "KAST (round contribution)",
  "score.c.damage": "Damage per round (ADR ÷ 100)",
  "score.c.kills": "Kills per round",
  "score.c.duel_balance": "Kill and death balance",
  "score.c.survival": "Survival",
  "score.c.opening": "Opening duels won",
  "score.c.clutch": "Clutches won",
  "score.unavailable.NOT_OBSERVED": "Not measured: left out",
  "score.unavailable.THIN_SAMPLE": "Fewer than {min} events: left out",
  "score.sample.rounds": "{n} rounds",
  "score.sample.opening_duels": "{n} duel(s)",
  "score.sample.clutches": "{n} clutch(es)",
  "score.method":
    "Weighted mean of seven performance signals measured in your complete matches, pooling every match weighted by its own sample. A component that was not measured does not become zero: it leaves the calculation and its weight is redistributed. With fewer than {minimum} complete matches or less than {minCoverage}% coverage, the Score is not shown. The weights are a design decision of this version, not a statistical fit.",
  "score.dnaDifference":
    "The Score summarises performance. Player DNA describes your style and patterns; style signals do not enter the Score.",
} as const;
