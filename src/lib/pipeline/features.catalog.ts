/**
 * FASE 2.7 — semantic catalogue of every feature the pipeline emits.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Features are the signals a future Pro Score / DNA / Diagnosis layer will read.
 * A signal whose NAME does not match its FORMULA silently inverts every decision
 * built on top of it. So each feature declares, in one place:
 *
 *   formula            - the exact expression that produces it
 *   unit               - ratio | rate | seconds | count | flag
 *   range              - the interval it may occupy
 *   direction          - "up" (higher is better), "down" (lower is better) or
 *                        "neutral" (descriptive, not a quality judgement)
 *   meaning            - plain reading of the number
 *   nullBehavior       - exactly when the value is null (absence, never 0)
 *   sampleRequirement  - the evidence needed for the value to be meaningful
 *   confidenceImpact   - how a partial parse / thin sample should be treated
 *
 * NOTHING in this catalogue implements a score, a weight or a ranking. It is
 * documentation that the test suite enforces against the real implementation.
 */

export type FeatureDirection = "up" | "down" | "neutral";
export type FeatureUnit = "ratio" | "rate" | "seconds" | "count" | "flag";

export interface FeatureSpec {
  formula: string;
  unit: FeatureUnit;
  range: [number, number] | "unbounded";
  direction: FeatureDirection;
  meaning: string;
  nullBehavior: string;
  sampleRequirement: string;
  confidenceImpact: string;
}

const RATIO: [number, number] = [0, 1];

const perRound = (what: string, reference: string): FeatureSpec => ({
  formula: `min(1, (${what} / rounds_played) / ${reference})`,
  unit: "rate",
  range: RATIO,
  direction: "up",
  meaning: `${what} per played round, scaled against a fixed reference of ${reference}`,
  nullBehavior: "null when rounds_played = 0 or the demo carried no such event",
  sampleRequirement: "at least one played round with the event class present",
  confidenceImpact: "thin samples keep the value but the match confidence stays low",
});

export const FEATURE_CATALOG: Record<string, Record<string, FeatureSpec>> = {
  aim: {
    hs_rate: {
      formula: "hs_percent / 100",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of kills that were headshots",
      nullBehavior: "null when the demo reported no kills for the player",
      sampleRequirement: "at least one kill",
      confidenceImpact: "unstable below ~10 kills",
    },
    kills_per_round: {
      formula: "kills / rounds_played",
      unit: "rate",
      range: RATIO,
      direction: "up",
      meaning: "kill output per round",
      nullBehavior: "null when rounds_played = 0",
      sampleRequirement: "at least one played round",
      confidenceImpact: "clamped at 1.0; single-match value only",
    },
    damage_per_round: perRound("damage", "100 ADR"),
    damage_efficiency: {
      formula: "min(1, (damage_dealt / damage_taken) / 2)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "damage dealt against damage received",
      nullBehavior: "null when damage taken was not reported",
      sampleRequirement: "both damage directions present in the demo",
      confidenceImpact: "null whenever damage events are incomplete",
    },
  },
  dueling: {
    opening_success: {
      formula: "opening_success / opening_attempts",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of opening duels the player won",
      nullBehavior: "null when the player took no opening duel",
      sampleRequirement: "at least one opening duel",
      confidenceImpact: "very noisy below 5 duels",
    },
    opening_participation: {
      formula: "opening_attempts / rounds_played",
      unit: "rate",
      range: RATIO,
      direction: "neutral",
      meaning: "how often the player was in the first duel — a role trait, not a quality",
      nullBehavior: "null when rounds_played = 0",
      sampleRequirement: "at least one played round",
      confidenceImpact: "stable from ~10 rounds",
    },
    trade_kill_share: {
      formula: "trade_kills / kills",
      unit: "ratio",
      range: RATIO,
      direction: "neutral",
      meaning: "share of the player's kills that answered a teammate's death",
      nullBehavior: "null when the player had no kills",
      sampleRequirement: "at least one kill",
      confidenceImpact: "depends on the configured trade window",
    },
    kd_balance: {
      formula: "kills / (kills + deaths)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "0.5 means as many kills as deaths",
      nullBehavior: "null when neither kills nor deaths were reported",
      sampleRequirement: "at least one kill or death",
      confidenceImpact: "single-match value only",
    },
  },
  survivability: {
    survival_rate: {
      formula: "1 - deaths / rounds_played",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of played rounds the player did not die in",
      nullBehavior: "null when rounds_played = 0",
      sampleRequirement: "at least one played round",
      confidenceImpact: "derived from death events only, never from missing evidence",
    },
    early_death_rate: {
      formula: "early_deaths / deaths",
      unit: "ratio",
      range: RATIO,
      direction: "down",
      meaning: "share of the player's deaths that happened in the early window",
      nullBehavior: "null when the player did not die",
      sampleRequirement: "at least one death",
      confidenceImpact: "needs event timestamps; null when timings are missing",
    },
    early_death_avoidance: {
      formula: "1 - early_deaths / deaths",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "explicit complement of early_death_rate",
      nullBehavior: "null when the player did not die",
      sampleRequirement: "at least one death",
      confidenceImpact: "same as early_death_rate",
    },
    untraded_death_rate: {
      formula: "untraded_deaths / deaths",
      unit: "ratio",
      range: RATIO,
      direction: "down",
      meaning: "share of deaths no teammate answered inside the trade window",
      nullBehavior: "null when the player did not die",
      sampleRequirement: "at least one death",
      confidenceImpact: "depends on the configured trade window",
    },
    damage_taken_per_round: {
      formula: "min(1, (damage_taken / rounds_played) / 120)",
      unit: "rate",
      range: RATIO,
      direction: "down",
      meaning: "damage absorbed per round, scaled against 120",
      nullBehavior: "null when damage taken was not reported or rounds_played = 0",
      sampleRequirement: "damage events present",
      confidenceImpact: "null whenever damage events are incomplete",
    },
  },
  positioning: {
    traded_death_rate: {
      formula: "trade_deaths / deaths",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of deaths a teammate traded back",
      nullBehavior: "null when the player did not die",
      sampleRequirement: "at least one death",
      confidenceImpact: "depends on the configured trade window",
    },
    first_death_rate: {
      formula: "first_deaths / rounds_played",
      unit: "ratio",
      range: RATIO,
      direction: "down",
      meaning: "share of played rounds in which the player was the first death",
      nullBehavior: "null when rounds_played = 0",
      sampleRequirement: "at least one played round",
      confidenceImpact: "stable from ~10 rounds",
    },
    first_death_avoidance: {
      formula: "1 - first_deaths / rounds_played",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "explicit complement of first_death_rate",
      nullBehavior: "null when rounds_played = 0",
      sampleRequirement: "at least one played round",
      confidenceImpact: "same as first_death_rate",
    },
    map_spread: {
      formula: "not derivable from the current parser contract",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "spatial spread of the player's activity",
      nullBehavior: "always null: positional sampling is not part of the contract",
      sampleRequirement: "continuous position samples",
      confidenceImpact: "never contributes while null",
    },
  },
  utility: {
    utility_damage_per_round: perRound("utility_damage", "12"),
    flash_assists_per_round: perRound("flash_assists", "0.4"),
    enemies_flashed_per_round: perRound("enemies_flashed", "1.2"),
    grenades_per_round: perRound("grenades_used", "2.5"),
  },
  decision_making: {
    kast: {
      formula: "kast / 100",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "rounds with a kill, assist, proven survival or trade",
      nullBehavior: "null when no round carried enough evidence",
      sampleRequirement: "rounds with event coverage",
      confidenceImpact: "absence of a death event is never read as survival",
    },
    early_death_free_rate: {
      formula: "1 - early_deaths / rounds_played",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of played rounds without an early death (round-denominated)",
      nullBehavior: "null when rounds_played = 0",
      sampleRequirement: "at least one played round",
      confidenceImpact: "needs event timestamps",
    },
    opening_discipline: {
      formula: "first_kills / opening_attempts",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "conversion of the duels the player chose to take",
      nullBehavior: "null when the player took no opening duel",
      sampleRequirement: "at least one opening duel",
      confidenceImpact: "very noisy below 5 duels",
    },
    early_window_seconds: {
      formula: "EARLY_DEATH_SECONDS (configuration)",
      unit: "seconds",
      range: "unbounded",
      direction: "neutral",
      meaning: "the window the early-death signals were computed with",
      nullBehavior: "never null: it is configuration, not measurement",
      sampleRequirement: "none",
      confidenceImpact: "none",
    },
  },
  teamplay: {
    assists_per_round: perRound("assists", "0.35"),
    flash_assist_share: {
      formula: "flash_assists / assists",
      unit: "ratio",
      range: RATIO,
      direction: "neutral",
      meaning: "share of assists that came from flashes",
      nullBehavior: "null when the player had no assist",
      sampleRequirement: "at least one assist",
      confidenceImpact: "flash credit uses the configured flash window",
    },
    trade_participation: {
      formula: "trade_kills / rounds_played",
      unit: "rate",
      range: RATIO,
      direction: "up",
      meaning: "how often the player traded a teammate back",
      nullBehavior: "null when rounds_played = 0",
      sampleRequirement: "at least one played round",
      confidenceImpact: "depends on the configured trade window",
    },
  },
  economy: {
    buy_discipline: {
      formula: "requires money_start / money_end / equipment_value / buy context",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "how well buys matched the round context",
      nullBehavior: "null whenever real economy data is absent — damage is NOT a proxy",
      sampleRequirement: "per-round economy fields present",
      confidenceImpact: "never contributes while null",
    },
    damage_per_dollar: {
      formula: "requires equipment_value per round",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "damage produced per dollar invested",
      nullBehavior: "null whenever real economy data is absent",
      sampleRequirement: "per-round equipment value present",
      confidenceImpact: "never contributes while null",
    },
    economy_data_available: {
      formula: "1 when any round carried economy fields, else 0",
      unit: "flag",
      range: RATIO,
      direction: "neutral",
      meaning: "factual coverage flag, not a performance signal",
      nullBehavior: "never null: it states presence, not amount",
      sampleRequirement: "none",
      confidenceImpact: "0 means every economy feature above is null",
    },
  },
  clutch: {
    clutch_win_rate: {
      formula: "clutch_wins / clutch_attempts",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of clutch situations converted",
      nullBehavior: "null when the player faced no clutch",
      sampleRequirement: "at least one clutch attempt",
      confidenceImpact: "single-match value is nearly anecdotal",
    },
    clutch_frequency: {
      formula: "clutch_attempts / rounds_played",
      unit: "rate",
      range: RATIO,
      direction: "neutral",
      meaning: "how often the player was left alone — a situation, not a quality",
      nullBehavior: "null when rounds_played = 0",
      sampleRequirement: "at least one played round",
      confidenceImpact: "none",
    },
    multi_kill_rate: {
      formula: "multi_kills / rounds_played",
      unit: "rate",
      range: RATIO,
      direction: "up",
      meaning: "rounds with two or more kills",
      nullBehavior: "null when rounds_played = 0",
      sampleRequirement: "at least one played round",
      confidenceImpact: "single-match value only",
    },
  },
  consistency: {
    side_balance: {
      formula: "1 - |ct_rating - t_rating|",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "how close CT and T output were",
      nullBehavior: "null when either side rating is missing",
      sampleRequirement: "rounds played on both sides",
      confidenceImpact: "meaningless when one side has very few rounds",
    },
    rating: {
      formula: "min(1, source_rating / 1.6)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "scaled source rating — NOT the CS2 PRO Score",
      nullBehavior: "null when the rating could not be computed",
      sampleRequirement: "rounds with event coverage",
      confidenceImpact: "must never be used as a substitute for an unmeasured dimension",
    },
    sample_rounds: {
      formula: "rounds_played",
      unit: "count",
      range: "unbounded",
      direction: "neutral",
      meaning: "sample size behind every other signal in this match",
      nullBehavior: "never null: it is a count",
      sampleRequirement: "none",
      confidenceImpact: "the primary down-weighting signal for the whole match",
    },
  },
};

/** Direction lookup used by tests and by future consumers of the signals. */
export function featureDirection(dimension: string, feature: string): FeatureDirection | null {
  return FEATURE_CATALOG[dimension]?.[feature]?.direction ?? null;
}
