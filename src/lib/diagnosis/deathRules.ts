/**
 * PM2 Fase 4.2.3 — `cs2.death-rules.v1`: versioned, explainable diagnosis rules over
 * `cs2.death-context.v1`. A rule never calls a death an error; it reports what the data shows.
 *
 * Rules that need data the product does not persist (teammate positions, trajectories, line of
 * sight) are catalogued as NOT_SUPPORTED with what they would require — they are never inferred
 * from distance or proximity.
 */
import type { DeathContext } from "./deathContext";

export const DEATH_RULES_VERSION = "cs2.death-rules.v1";

export type RuleOutcome = "MATCH" | "NO_MATCH" | "INCONCLUSIVE";

export interface DeathRule {
  id: string;
  version: typeof DEATH_RULES_VERSION;
  provenance: "DERIVED" | "NOT_SUPPORTED";
  /** Context fields the rule needs. */
  requires: readonly string[];
  /** i18n key prefix: `<key>.title`, `<key>.body`. */
  i18nKey: string;
  limitations: string;
  evaluate?: (ctx: DeathContext) => RuleOutcome;
}

const applicable = (ctx: DeathContext) => ctx.kind === "ENEMY_KILL" && ctx.round.valid;

export const DEATH_RULES: readonly DeathRule[] = [
  {
    id: "TRADE_NOT_OBSERVED",
    version: DEATH_RULES_VERSION,
    provenance: "DERIVED",
    requires: ["trade"],
    i18nKey: "diagnosis.rule.trade_not_observed",
    limitations:
      "Only kills recorded in the same round within the pipeline trade window count. It does not say whether a trade was possible or attempted.",
    evaluate: (ctx) => {
      if (
        !applicable(ctx) ||
        ctx.trade.status === "NOT_MEASURED" ||
        ctx.trade.status === "NOT_APPLICABLE"
      )
        return "INCONCLUSIVE";
      return ctx.trade.status === "NOT_OBSERVED" ? "MATCH" : "NO_MATCH";
    },
  },
  {
    id: "OPENING_DEATH",
    version: DEATH_RULES_VERSION,
    provenance: "DERIVED",
    requires: ["round.openingDeath"],
    i18nKey: "diagnosis.rule.opening_death",
    limitations:
      "First recorded kill of the round. Simultaneous kills on the same tick are ordered by event id, not causality.",
    evaluate: (ctx) => {
      if (!applicable(ctx) || ctx.round.openingDeath.value === null) return "INCONCLUSIVE";
      return ctx.round.openingDeath.value ? "MATCH" : "NO_MATCH";
    },
  },
  {
    id: "NUMERIC_DISADVANTAGE",
    version: DEATH_RULES_VERSION,
    provenance: "DERIVED",
    requires: ["alive.teammates", "alive.enemies"],
    i18nKey: "diagnosis.rule.numeric_disadvantage",
    limitations:
      "Alive counts come from the kill sequence and the round roster; deaths on the same tick are not counted as earlier.",
    evaluate: (ctx) => {
      const own = ctx.alive.teammates.value;
      const opp = ctx.alive.enemies.value;
      if (!applicable(ctx) || own === null || opp === null) return "INCONCLUSIVE";
      return own < opp ? "MATCH" : "NO_MATCH";
    },
  },
  {
    id: "POST_PLANT_DEATH",
    version: DEATH_RULES_VERSION,
    provenance: "DERIVED",
    requires: ["round.bombPlantedBeforeDeath"],
    i18nKey: "diagnosis.rule.post_plant_death",
    limitations: "Context only: the bomb was planted before this death in the same round.",
    evaluate: (ctx) => {
      const v = ctx.round.bombPlantedBeforeDeath.value;
      if (!applicable(ctx) || v === null) return "INCONCLUSIVE";
      return v ? "MATCH" : "NO_MATCH";
    },
  },
  ...(
    [
      [
        "POSSIBLE_EXPOSURE",
        "exposure",
        ["enemy_positions_over_time", "map_geometry_or_visibility"],
      ],
      ["POSSIBLE_ISOLATION", "isolation", ["teammate_positions_at_death"]],
      ["RE_PEEK", "re_peek", ["victim_trajectory", "prior_contact_events"]],
      [
        "ROTATION_TIMING",
        "rotation_timing",
        ["victim_trajectory", "round_objective_state_over_time"],
      ],
    ] as const
  ).map(([id, key, requires]): DeathRule => ({
    id,
    version: DEATH_RULES_VERSION,
    provenance: "NOT_SUPPORTED",
    requires,
    i18nKey: `diagnosis.rule.${key}`,
    limitations: "Not evaluated: the product does not persist the data this rule needs.",
  })),
];

export interface RuleResult {
  ruleId: string;
  version: typeof DEATH_RULES_VERSION;
  outcome: RuleOutcome | "NOT_SUPPORTED";
}

export function evaluateDeathRules(ctx: DeathContext): RuleResult[] {
  return DEATH_RULES.map((rule) => ({
    ruleId: rule.id,
    version: DEATH_RULES_VERSION,
    outcome: rule.evaluate ? rule.evaluate(ctx) : "NOT_SUPPORTED",
  }));
}

/** Minimum evidence before a rule match is presented as a recurring pattern (never one death). */
export const PATTERN_POLICY = { minDeaths: 10, minMatches: 3, minOccurrences: 4 } as const;

export interface PatternSummary {
  ruleId: string;
  version: typeof DEATH_RULES_VERSION;
  occurrences: number;
  evaluatedDeaths: number;
  matches: number;
  status: "RECURRENT" | "INSUFFICIENT_SAMPLE" | "NOT_SUPPORTED";
  /** Up to 5 supporting events (refs only). */
  examples: DeathContext["ref"][];
}

/**
 * Recurrence across matches. Deaths from matches the integrity gate refused are excluded; deaths
 * whose rule outcome is INCONCLUSIVE are not counted in the denominator.
 */
export function aggregateDeathPatterns(contexts: DeathContext[]): PatternSummary[] {
  const usable = contexts.filter((c) => c.integrity.eligible !== false);
  return DEATH_RULES.map((rule) => {
    if (!rule.evaluate)
      return {
        ruleId: rule.id,
        version: DEATH_RULES_VERSION,
        occurrences: 0,
        evaluatedDeaths: 0,
        matches: 0,
        status: "NOT_SUPPORTED" as const,
        examples: [],
      };
    const evaluated = usable
      .map((c) => ({ c, o: rule.evaluate!(c) }))
      .filter((x) => x.o !== "INCONCLUSIVE");
    const hits = evaluated.filter((x) => x.o === "MATCH");
    const matches = new Set(hits.map((x) => x.c.ref.matchId)).size;
    const evaluatedMatches = new Set(evaluated.map((x) => x.c.ref.matchId)).size;
    const recurrent =
      evaluated.length >= PATTERN_POLICY.minDeaths &&
      evaluatedMatches >= PATTERN_POLICY.minMatches &&
      hits.length >= PATTERN_POLICY.minOccurrences &&
      matches >= 2;
    return {
      ruleId: rule.id,
      version: DEATH_RULES_VERSION,
      occurrences: hits.length,
      evaluatedDeaths: evaluated.length,
      matches,
      status: recurrent ? ("RECURRENT" as const) : ("INSUFFICIENT_SAMPLE" as const),
      examples: hits.slice(0, 5).map((x) => x.c.ref),
    };
  });
}
