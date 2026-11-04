import type { xrayPtBR } from "./pt-BR";

export const xrayEn: Record<keyof typeof xrayPtBR, string> = {
  "real.result.unresolved": "Not determined by the demo",
  "real.result.unresolvedNote":
    "Result and score: the demo did not identify each player's team, so CS2 PRO does not determine a win or a loss (admission limitation L04). No result is estimated.",
  "real.date.processed": "processed on",
  "real.date.processedNote":
    "Date: CS2 demos do not record when the match was played. When a match has no date of its own, we show the date CS2 PRO processed it.",
  "real.winRate.sample": "{wins} of {decided} match(es) with a result",
  "real.winRate.unresolved": "None of the {n} match(es) has a result determined by the demo",

  "real.dna.inFormation": "Still forming",
  "real.dna.inFormationIndex": "Index still forming ({matches} of {minimum} matches)",
  "real.dna.radarInFormation":
    "The radar and the per-dimension indexes appear from {minimum} matches. The signals below are real.",
  "real.dna.history.title": "Player DNA over time",
  "real.dna.history.description":
    "Each row is a snapshot saved when your matches changed. Older snapshots are never overwritten.",
  "real.dna.history.empty": "No saved snapshots yet.",
  "real.dna.history.date": "Date",
  "real.dna.history.matches": "Matches",
  "real.dna.history.state": "State",
  "real.dna.history.READY": "Minimum sample reached",
  "real.dna.history.INSUFFICIENT_SAMPLE": "Still forming",
  "real.dna.dashboard.inFormation":
    "Still forming: {matches} of {minimum} matches for a stable profile.",
  "real.dna.dashboard.ready": "Profile from {matches} matches with {observed} observed dimensions.",
  "real.dna.dashboard.empty": "No matches with Player DNA signals yet.",
  "real.dna.open": "Open Player DNA",

  "xray.sample":
    "Based on {matches} match(es), {rounds} rounds played. Result known for {decided} match(es).",
  "xray.inFormation":
    "X-ray still forming: {matches} of {minimum} matches. Observations are real; inferences and recommendations appear once the minimum sample is reached.",
  "xray.empty": "The X-ray appears once at least one processed match carries your data.",
  "xray.layer.observed": "Observed",
  "xray.layer.observedHint": "Values measured in your matches, each with its sample.",
  "xray.layer.inference": "Inference",
  "xray.layer.inferenceHint":
    "A reading of the observations by one documented rule: the Player DNA dimensions with the lowest index, below {ceiling}/100.",
  "xray.layer.recommendation": "Recommendation",
  "xray.layer.recommendationHint":
    "What to work on, linked to your training plan. No lesson is picked here.",
  "xray.dim.aim_duels": "Aim and duels",
  "xray.dim.survival_positioning": "Survival and positioning",
  "xray.dim.utility": "Utility",
  "xray.dim.impact": "Round impact",
  "xray.dim.consistency": "Consistency",
  "xray.dim.decision": "Decision making",
  "xray.dim.notObserved": "No observed data in this dimension.",
  "xray.status.NOT_MEASURED": "Not measured",
  "xray.status.EXCLUDED_BY_ADMISSION": "Excluded by the demo's admission",
  "xray.inMatches": "in {n} match(es)",
  "xray.dnaIndex": "DNA index",
  "xray.metric.kills": "Kills",
  "xray.metric.deaths": "Deaths",
  "xray.metric.utilityDamage": "Grenade damage",
  "xray.metric.clutchWins": "Clutches won",
  "xray.metric.ctRating": "Rating on CT side",
  "xray.metric.tRating": "Rating on T side",
  "xray.sides.title": "CT and T sides",
  "xray.sides.description":
    "Rounds played on each side and the match rating restricted to those rounds. Kills and damage per side are not stored per round yet.",
  "xray.sides.ct": "CT",
  "xray.sides.t": "T",
  "xray.sides.rounds": "{n} rounds",
  "xray.inference.item": "{dimension}: index {index}/100 (below {ceiling})",
  "xray.inference.NO_DATA": "No matches with Player DNA signals.",
  "xray.inference.INSUFFICIENT_SAMPLE":
    "No inference: Player DNA has {matches} of the {minimum} minimum matches.",
  "xray.inference.NONE_BELOW_CEILING": "No observed dimension is below {ceiling}/100.",
  "xray.recommendation.item": "Prioritize {dimension} in training.",
  "xray.recommendation.none": "No recommendation without an inference.",
  "xray.recommendation.open": "Open training plan",
  "xray.unsupported.title": "What CS2 PRO does not measure yet",
  "xray.unsupported.enemiesFlashed": "Enemies flashed (demos do not record who was blinded).",
  "xray.unsupported.positions": "Positions and heatmaps (coordinates are not extracted).",
  "xray.unsupported.economyClassification":
    "Buy classification (eco, force, full) — no reviewed classifier.",
  "xray.unsupported.sideSplitKills": "Kills and damage per side (not stored per round).",
};
