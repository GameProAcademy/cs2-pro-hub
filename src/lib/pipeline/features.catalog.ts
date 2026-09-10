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
 *   denominator        - the exact denominator the implementation divides by
 *   roundDenominated   - true when the denominator is DERIVED FROM THE MATCH
 *                        ROUND SET (`rounds_played`, or a round-derived
 *                        denominator such as `survivalRounds`), which means the
 *                        value is NULL under a partial parse
 *
 * FASE 2.7.1F — this catalogue documents the hardened 2.7.1D/E semantics, and
 * every `formula` states the real arithmetic, including the [0,1] clamp the
 * implementation applies:
 *  - round-denominated signals are NULL when coverage is incomplete
 *    (`partial_parse`), because "per observed round" is not "per round";
 *  - `survival_rate` divides by `survivalRounds` — the participated rounds whose
 *    survival is actually DETERMINABLE (playerSurvivedRound() decided true or
 *    false) — never by `rounds_played`. A round having ENDED does not by itself
 *    make that player's survival determinable;
 *  - directly observed counters and ratios over observed event counts stay
 *    numeric (an observed 0 is 0), so nothing is nulled indiscriminately;
 *  - NULL means unknown / not determinable; 0 means observed and truly zero.
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
  /** The exact denominator the implementation uses ("none" for counters/flags). */
  denominator: string;
  /**
   * FASE 2.7.1F — TRUE when the denominator is DERIVED FROM THE ROUND SET of the
   * match/player, so the value only represents the whole match under compatible
   * round coverage. This includes `rounds_played` AND round-derived denominators
   * such as `survivalRounds`; it is not restricted to `rounds_played`. Every
   * round-denominated feature is NULL under a partial parse.
   */
  roundDenominated: boolean;
}

const RATIO: [number, number] = [0, 1];

const PARTIAL_PARSE_NULL =
  "null under partial_parse (incomplete round coverage): the observed round set is not the match";

/** Round-denominated per-round rate scaled against a documented reference. */
const perRound = (what: string, reference: string): FeatureSpec => ({
  formula: `min(1, (${what} / rounds_played) / ${reference})`,
  unit: "rate",
  range: RATIO,
  direction: "up",
  meaning: `${what} per played round, scaled against a fixed reference of ${reference}`,
  nullBehavior: `null when rounds_played = 0, when the demo carried no such event class, and ${PARTIAL_PARSE_NULL}`,
  sampleRequirement:
    "complete round coverage plus the event class present; at least one played round",
  confidenceImpact:
    "thin samples keep the value but the match confidence stays low; partial coverage yields null instead of a low-confidence number",
  denominator: "rounds_played (requires complete coverage)",
  roundDenominated: true,
});

export const FEATURE_CATALOG: Record<string, Record<string, FeatureSpec>> = {
  aim: {
    hs_rate: {
      formula: "min(1, hs_percent / 100)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of kills that were headshots",
      nullBehavior: "null when kill events are unavailable or the player had no kills",
      sampleRequirement: "kill-event evidence and at least one kill",
      confidenceImpact:
        "unstable below ~10 kills; survives partial parse (denominator is observed kills)",
      denominator: "kills (observed event count)",
      roundDenominated: false,
    },
    kills_per_round: {
      formula: "min(1, kills / rounds_played)",
      unit: "rate",
      range: RATIO,
      direction: "up",
      meaning: "kill output per round",
      nullBehavior: `null when rounds_played = 0, when kill events are unavailable, and ${PARTIAL_PARSE_NULL}`,
      sampleRequirement: "kill-event evidence and complete round coverage",
      confidenceImpact:
        "clamped at 1.0; single-match value only; null instead of a value under partial coverage",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
    },
    damage_per_round: {
      formula: "min(1, adr / 100), adr = damage_given / rounds_played",
      unit: "rate",
      range: RATIO,
      direction: "up",
      meaning: "damage output per round, scaled against a 100 ADR reference",
      nullBehavior: `null when damage events are unavailable, when rounds_played = 0, and ${PARTIAL_PARSE_NULL}`,
      sampleRequirement: "damage-event evidence and complete round coverage",
      confidenceImpact: "null under partial coverage instead of a per-observed-round value",
      denominator: "rounds_played (via adr; requires complete coverage)",
      roundDenominated: true,
    },
    damage_efficiency: {
      formula: "min(1, (damage_dealt / damage_taken) / 2)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "damage dealt against damage received",
      nullBehavior: "null when damage events are unavailable or damage taken was not reported",
      sampleRequirement: "both damage directions present in the demo",
      confidenceImpact: "null whenever damage events are incomplete",
      denominator: "damage_taken (observed amount)",
      roundDenominated: false,
    },
  },
  dueling: {
    opening_success: {
      formula: "min(1, opening_success / opening_attempts)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of opening duels the player won",
      nullBehavior: "null when kill events are unavailable or the player took no opening duel",
      sampleRequirement: "kill-event evidence with determinable opening duels",
      confidenceImpact: "very noisy below 5 duels",
      denominator: "opening_attempts (observed event count)",
      roundDenominated: false,
    },
    opening_participation: {
      formula: "min(1, opening_attempts / rounds_played)",
      unit: "rate",
      range: RATIO,
      direction: "neutral",
      meaning: "how often the player was in the first duel — a role trait, not a quality",
      nullBehavior: `null when rounds_played = 0, when kill events are unavailable, and ${PARTIAL_PARSE_NULL}`,
      sampleRequirement: "kill-event evidence and complete round coverage",
      confidenceImpact: "stable from ~10 rounds; null under partial coverage",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
    },
    trade_kill_share: {
      formula: "min(1, trade_kills / kills)",
      unit: "ratio",
      range: RATIO,
      direction: "neutral",
      meaning: "share of the player's kills that answered a teammate's death",
      nullBehavior:
        "null when kill events or event timings are unavailable, or the player had no kills",
      sampleRequirement: "kill events with timestamps",
      confidenceImpact:
        "depends on the configured trade window; denominator is observed kills, so partial parse keeps it",
      denominator: "kills (observed event count)",
      roundDenominated: false,
    },
    kd_balance: {
      formula: "min(1, kills / (kills + deaths))",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "0.5 means as many kills as deaths",
      nullBehavior:
        "null when kill events are unavailable, or neither kills nor deaths were observed",
      sampleRequirement: "kill-event evidence with at least one kill or death",
      confidenceImpact: "single-match value only",
      denominator: "kills + deaths (observed event counts)",
      roundDenominated: false,
    },
  },
  survivability: {
    survival_rate: {
      formula: "1 - min(1, deaths / survivalRounds)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning:
        "share of the DETERMINABLE participated rounds the player did not die in; rounds whose survival cannot be established are excluded, never counted as survived",
      nullBehavior:
        "null when survivalRounds is null — no participated round whose survival is determinable, or partial_parse / incomplete round coverage. Null means not determinable, not zero survival",
      sampleRequirement:
        "kill-event evidence plus at least one participated round with round-end evidence AND enough round evidence for playerSurvivedRound() to decide (complete coverage)",
      confidenceImpact:
        "derived from death events and positive survival evidence only; the absence of a death event is never read as survival, and indeterminable rounds lower confidence by yielding null",
      denominator: "survivalRounds (participated rounds with determinable survival)",
      roundDenominated: true,
    },
    early_death_rate: {
      formula: "min(1, early_deaths / deaths)",
      unit: "ratio",
      range: RATIO,
      direction: "down",
      meaning: "share of the player's deaths that happened in the early window",
      nullBehavior: "null when kill events or timings are unavailable, or the player did not die",
      sampleRequirement: "death events with timestamps",
      confidenceImpact: "needs event timestamps; null when timings are missing",
      denominator: "deaths (observed event count)",
      roundDenominated: false,
    },
    early_death_avoidance: {
      formula: "1 - min(1, early_deaths / deaths)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "explicit complement of early_death_rate",
      nullBehavior: "null exactly when early_death_rate is null",
      sampleRequirement: "death events with timestamps",
      confidenceImpact: "same as early_death_rate",
      denominator: "deaths (observed event count)",
      roundDenominated: false,
    },
    untraded_death_rate: {
      formula: "min(1, untraded_deaths / deaths)",
      unit: "ratio",
      range: RATIO,
      direction: "down",
      meaning: "share of deaths no teammate answered inside the trade window",
      nullBehavior: "null when kill events or timings are unavailable, or the player did not die",
      sampleRequirement: "death events with timestamps",
      confidenceImpact: "depends on the configured trade window",
      denominator: "deaths (observed event count)",
      roundDenominated: false,
    },
    damage_taken_per_round: {
      formula: "min(1, (damage_taken / rounds_played) / 120)",
      unit: "rate",
      range: RATIO,
      direction: "down",
      meaning: "damage absorbed per round, scaled against 120",
      nullBehavior: `null when damage events are unavailable, when rounds_played = 0, and ${PARTIAL_PARSE_NULL}`,
      sampleRequirement: "damage events present and complete round coverage",
      confidenceImpact: "null whenever damage events or round coverage are incomplete",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
    },
  },
  positioning: {
    traded_death_rate: {
      formula: "min(1, trade_deaths / deaths)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of deaths a teammate traded back",
      nullBehavior: "null when kill events or timings are unavailable, or the player did not die",
      sampleRequirement: "death events with timestamps",
      confidenceImpact: "depends on the configured trade window",
      denominator: "deaths (observed event count)",
      roundDenominated: false,
    },
    first_death_rate: {
      formula: "min(1, first_deaths / rounds_played)",
      unit: "ratio",
      range: RATIO,
      direction: "down",
      meaning: "share of played rounds in which the player was the first death",
      nullBehavior: `null when rounds_played = 0, when kill events are unavailable, and ${PARTIAL_PARSE_NULL}`,
      sampleRequirement: "kill-event evidence and complete round coverage",
      confidenceImpact: "stable from ~10 rounds; null under partial coverage",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
    },
    first_death_avoidance: {
      formula: "1 - min(1, first_deaths / rounds_played)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "explicit complement of first_death_rate",
      nullBehavior: `null exactly when first_death_rate is null, which includes ${PARTIAL_PARSE_NULL}`,
      sampleRequirement: "kill-event evidence and complete round coverage",
      confidenceImpact: "same as first_death_rate",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
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
      denominator: "none (not derivable)",
      roundDenominated: false,
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
      formula: "min(1, kast_percent / 100), kast_percent = 100 * kast_rounds / rounds_played",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "rounds with a kill, assist, proven survival or trade",
      nullBehavior:
        "null when no round carried enough evidence and under partial_parse / incomplete round coverage; never 0 for unknown",
      sampleRequirement: "complete round coverage with kill/damage/round_end evidence per round",
      confidenceImpact: "absence of a death event is never read as survival",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
    },
    early_death_free_rate: {
      formula: "1 - min(1, early_deaths / rounds_played)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of played rounds without an early death (round-denominated)",
      nullBehavior: `null when rounds_played = 0, when kill events or timings are unavailable, and ${PARTIAL_PARSE_NULL}`,
      sampleRequirement: "death events with timestamps and complete round coverage",
      confidenceImpact: "needs event timestamps; null under partial coverage",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
    },
    opening_discipline: {
      formula: "min(1, first_kills / opening_attempts)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "conversion of the duels the player chose to take",
      nullBehavior: "null when kill events are unavailable or the player took no opening duel",
      sampleRequirement: "at least one determinable opening duel",
      confidenceImpact: "very noisy below 5 duels",
      denominator: "opening_attempts (observed event count)",
      roundDenominated: false,
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
      denominator: "none (configuration)",
      roundDenominated: false,
    },
  },
  teamplay: {
    assists_per_round: perRound("assists", "0.35"),
    flash_assist_share: {
      formula: "min(1, flash_assists / assists)",
      unit: "ratio",
      range: RATIO,
      direction: "neutral",
      meaning: "share of assists that came from flashes",
      nullBehavior: "null when kill or utility events are unavailable, or the player had no assist",
      sampleRequirement: "at least one assist plus utility-event evidence",
      confidenceImpact: "flash credit uses the configured flash window",
      denominator: "assists (observed event count)",
      roundDenominated: false,
    },
    trade_participation: {
      formula: "min(1, trade_kills / rounds_played)",
      unit: "rate",
      range: RATIO,
      direction: "up",
      meaning: "how often the player traded a teammate back",
      nullBehavior: `null when rounds_played = 0, when kill events or timings are unavailable, and ${PARTIAL_PARSE_NULL}`,
      sampleRequirement: "kill events with timestamps and complete round coverage",
      confidenceImpact: "depends on the configured trade window; null under partial coverage",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
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
      denominator: "none (not derivable without economy data)",
      roundDenominated: false,
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
      denominator: "none (not derivable without economy data)",
      roundDenominated: false,
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
      denominator: "none (coverage flag)",
      roundDenominated: false,
    },
  },
  clutch: {
    clutch_win_rate: {
      formula: "min(1, clutch_wins / clutch_attempts)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "share of clutch situations converted",
      nullBehavior: "null when kill events are unavailable or the player faced no clutch",
      sampleRequirement: "at least one determinable clutch attempt",
      confidenceImpact: "single-match value is nearly anecdotal",
      denominator: "clutch_attempts (observed situation count)",
      roundDenominated: false,
    },
    clutch_frequency: {
      formula: "min(1, clutch_attempts / rounds_played)",
      unit: "rate",
      range: RATIO,
      direction: "neutral",
      meaning: "how often the player was left alone — a situation, not a quality",
      nullBehavior: `null when rounds_played = 0, when kill events are unavailable, and ${PARTIAL_PARSE_NULL}`,
      sampleRequirement: "kill-event evidence and complete round coverage",
      confidenceImpact: "null under partial coverage rather than a per-observed-round value",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
    },
    multi_kill_rate: {
      formula: "min(1, multi_kills / rounds_played)",
      unit: "rate",
      range: RATIO,
      direction: "up",
      meaning: "rounds with two or more kills",
      nullBehavior: `null when rounds_played = 0, when kill events are unavailable, and ${PARTIAL_PARSE_NULL}`,
      sampleRequirement: "kill-event evidence and complete round coverage",
      confidenceImpact: "single-match value only; null under partial coverage",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
    },
  },
  consistency: {
    side_balance: {
      formula: "max(0, min(1, 1 - |ct_rating - t_rating|))",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "how close CT and T output were",
      nullBehavior: "null when either side rating is missing (which includes incomplete coverage)",
      sampleRequirement: "rounds played on both sides with event coverage",
      confidenceImpact: "meaningless when one side has very few rounds",
      denominator: "none (difference of two ratings)",
      roundDenominated: false,
    },
    rating: {
      formula:
        "min(1, source_rating / 1.6), source_rating = 0.45*(kills/rounds_played / 0.70) + 0.25*(1 - deaths/rounds_played / 0.75) + 0.30*(damage/rounds_played / 80)",
      unit: "ratio",
      range: RATIO,
      direction: "up",
      meaning: "scaled source rating — NOT the CS2 PRO Score",
      nullBehavior:
        "null when the rating could not be computed: missing kill/damage evidence, or partial_parse / incomplete round coverage",
      sampleRequirement: "kill and damage evidence over a complete round set",
      confidenceImpact: "must never be used as a substitute for an unmeasured dimension",
      denominator: "rounds_played (requires complete coverage)",
      roundDenominated: true,
    },
    sample_rounds: {
      formula: "rounds_played",
      unit: "count",
      range: "unbounded",
      direction: "neutral",
      meaning: "sample size behind every other signal in this match",
      nullBehavior: "never null: it is an observed count, and 0 means zero participated rounds",
      sampleRequirement: "none",
      confidenceImpact: "the primary down-weighting signal for the whole match",
      denominator: "none (observed counter)",
      roundDenominated: false,
    },
  },
};

/** Direction lookup used by tests and by future consumers of the signals. */
export function featureDirection(dimension: string, feature: string): FeatureDirection | null {
  return FEATURE_CATALOG[dimension]?.[feature]?.direction ?? null;
}
