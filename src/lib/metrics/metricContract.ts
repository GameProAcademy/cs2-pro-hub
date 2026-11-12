/**
 * Fase 4.2 — entrega 4.2.1 (contratos e cobertura das métricas): `metric-contract-v1`.
 *
 * The specification's provenance taxonomy (original §4) and metric envelope, plus the release
 * matrix that says, for every metric the product shows today and every metric the 4.2 deliveries
 * propose, whether it can be released and why not. Pure: it describes and adapts, it computes no
 * statistic. Existing producers (`canonicalMetrics.ts`, `playerDna.ts`, `proScore.ts`,
 * `roundContext.ts`) keep their own contracts (`xray-v1`, `coach-context-v1`); this module maps
 * them onto the common envelope without renaming any consumed field.
 */
import { CANONICAL_METRICS, type CanonicalMetric } from "@/lib/metrics/canonicalMetrics";
import type { XRayObservation } from "@/lib/diagnostics/xray";

export const METRIC_CONTRACT_VERSION = "metric-contract-v1";

/** Original §4, verbatim order. */
export const METRIC_STATUSES = [
  "OBSERVED",
  "DERIVED",
  "INFERRED",
  "NOT_OBSERVED",
  "NOT_MEASURED",
  "INSUFFICIENT_SAMPLE",
  "UNAVAILABLE",
] as const;
export type MetricStatus = (typeof METRIC_STATUSES)[number];

/** Statuses that may carry a value; every other status carries `value: null`. */
export const VALUED_STATUSES: readonly MetricStatus[] = ["OBSERVED", "DERIVED", "INFERRED"];

export interface EvidenceRef {
  matchId: string;
  round?: number;
  tick?: number;
}

/** Original §4 "campo de métrica recomendado". */
export interface MetricEnvelope {
  metric_key: string;
  value: number | null;
  unit: string;
  status: MetricStatus;
  provenance_method: string;
  /** Denominator and its unit (e.g. 63 rounds, 3 matches); null when there is none. */
  sample_size: { n: number; unit: string } | null;
  /** Eligible units actually measured / eligible units; null when not defined for the metric. */
  coverage: { measured: number; eligible: number } | null;
  /** Only when calibrated — nothing in the product is calibrated today, so always null. */
  confidence: null;
  evidence_refs: EvidenceRef[];
  schema_version: typeof METRIC_CONTRACT_VERSION;
}

export class MetricEnvelopeError extends Error {}

/** Builds an envelope and enforces the invariants the specification makes verifiable. */
export function envelope(e: Omit<MetricEnvelope, "schema_version" | "confidence">): MetricEnvelope {
  if (!(METRIC_STATUSES as readonly string[]).includes(e.status))
    throw new MetricEnvelopeError(`unknown_status:${e.status}`);
  const valued = VALUED_STATUSES.includes(e.status);
  // Null ≠ zero: a status without a value must not carry one, and a valued status needs one.
  if (!valued && e.value !== null)
    throw new MetricEnvelopeError(`value_without_measure:${e.metric_key}`);
  if (valued && (e.value === null || !Number.isFinite(e.value)))
    throw new MetricEnvelopeError(`measure_without_value:${e.metric_key}`);
  if (e.coverage && (e.coverage.measured < 0 || e.coverage.measured > e.coverage.eligible))
    throw new MetricEnvelopeError(`coverage_out_of_range:${e.metric_key}`);
  // A percentage needs a positive denominator (original §4.1).
  if (valued && e.unit === "percent" && !(e.sample_size && e.sample_size.n > 0))
    throw new MetricEnvelopeError(`percent_without_denominator:${e.metric_key}`);
  return { ...e, confidence: null, schema_version: METRIC_CONTRACT_VERSION };
}

/**
 * Adapter: an `xray-v1` observation as an envelope. MEASURED counts are OBSERVED, measured ratios
 * and means are DERIVED; NOT_MEASURED stays NOT_MEASURED; EXCLUDED_BY_ADMISSION is UNAVAILABLE
 * (an admission limitation removed the source). Value, numerator and denominator are unchanged.
 */
export function fromObservation(o: XRayObservation): MetricEnvelope {
  const spec = CANONICAL_METRICS.find((m) => m.id === o.metric);
  if (!spec) throw new MetricEnvelopeError(`unknown_canonical_metric:${o.metric}`);
  const status: MetricStatus =
    o.status === "MEASURED"
      ? spec.aggregation === "sum"
        ? "OBSERVED"
        : "DERIVED"
      : o.status === "EXCLUDED_BY_ADMISSION"
        ? "UNAVAILABLE"
        : "NOT_MEASURED";
  return envelope({
    metric_key: `match.${o.metric}`,
    value: status === "OBSERVED" || status === "DERIVED" ? o.value : null,
    unit: spec.unit,
    status,
    provenance_method: `${spec.source} · ${spec.aggregation} · ${spec.formula}`,
    sample_size:
      o.denominator !== null
        ? { n: o.denominator, unit: spec.denominator }
        : o.matches > 0
          ? { n: o.matches, unit: "matches" }
          : null,
    coverage: null,
    evidence_refs: [],
  });
}

// ------------------------------------------------------------------ release matrix

/** Original §24 step 7 ("matriz de liberação"). */
export type ReleaseStatus =
  | "SUPPORTED"
  | "PARTIAL"
  | "NOT_MEASURED"
  | "INSUFFICIENT_SAMPLE"
  | "UNAVAILABLE"
  | "BLOCKED_PROVENANCE";

/** Why a metric is not (fully) released. */
export type ReleaseBlocker =
  | "L02_TICK_DOMAIN"
  | "L03_USERCMD"
  | "L04_MATCH_RESULT"
  | "POSITIONS_NOT_PERSISTED"
  | "SHOOTER_NOT_ATTRIBUTED"
  | "NO_BUY_CLASSIFIER"
  | "HEURISTIC_ATTRIBUTION"
  | "NO_LICENSED_DATASET"
  | "SAMPLE_VOLUME"
  | "NOT_IMPLEMENTED";

export interface ReleaseEntry {
  metric_key: string;
  /** 4.2 delivery that owns it (original §8), or "current" for what the product shows today. */
  delivery: "current" | `4.2.${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;
  release: ReleaseStatus;
  blockers: ReleaseBlocker[];
  /** Where the evidence for the decision is (file, table, document section). */
  evidence: string;
}

const current = (m: CanonicalMetric): ReleaseEntry => ({
  metric_key: `match.${m.id}`,
  delivery: "current",
  release: m.id === "winRate" ? "UNAVAILABLE" : "SUPPORTED",
  blockers: m.id === "winRate" ? ["L04_MATCH_RESULT"] : [],
  evidence:
    m.id === "winRate"
      ? "docs/ADMISSION_CONTRACT_V3.md (L04)"
      : `canonicalMetrics.ts → ${m.source}`,
});

export const RELEASE_MATRIX: readonly ReleaseEntry[] = [
  ...CANONICAL_METRICS.map(current),
  {
    metric_key: "dna.dna-weighted-v2",
    delivery: "current",
    release: "SUPPORTED",
    blockers: [],
    evidence: "src/lib/playerDna.ts; methodology §3",
  },
  {
    metric_key: "dna.economy",
    delivery: "current",
    release: "NOT_MEASURED",
    blockers: ["NO_BUY_CLASSIFIER"],
    evidence: "features.catalog.ts economy.* not derivable; round_players.buy_context empty",
  },
  {
    metric_key: "score.pro-score-v1",
    delivery: "current",
    release: "SUPPORTED",
    blockers: [],
    evidence: "src/lib/proScore.ts; docs/reference/PRO_SCORE.md",
  },
  {
    metric_key: "round_context.side_rounds_won",
    delivery: "current",
    release: "SUPPORTED",
    blockers: [],
    evidence:
      "src/lib/roundContext.ts; docs/reference/ROUND_CONTEXT.md (validated against eliminations)",
  },
  {
    metric_key: "round_context.side_kills_damage",
    delivery: "current",
    release: "SUPPORTED",
    blockers: [],
    evidence: "src/lib/roundContext.ts (CT+T = match totals)",
  },
  {
    metric_key: "match.result_and_score",
    delivery: "current",
    release: "UNAVAILABLE",
    blockers: ["L04_MATCH_RESULT"],
    evidence: "docs/ADMISSION_CONTRACT_V3.md (L04)",
  },
  // Original §4 table — proposed 4.2 metrics.
  {
    metric_key: "spatial.death_heatmap",
    delivery: "4.2.2",
    release: "NOT_MEASURED",
    blockers: ["POSITIONS_NOT_PERSISTED"],
    evidence: "persistence.server.ts stores position counts only; mapping §5 4.2.2",
  },
  {
    metric_key: "spatial.kill_heatmap",
    delivery: "4.2.2",
    release: "NOT_MEASURED",
    blockers: ["POSITIONS_NOT_PERSISTED"],
    evidence: "mapping §5 4.2.2",
  },
  {
    metric_key: "spatial.density",
    delivery: "4.2.2",
    release: "NOT_MEASURED",
    blockers: ["POSITIONS_NOT_PERSISTED", "L02_TICK_DOMAIN"],
    evidence: "ADMISSION_CONTRACT_V3 L02: no positioning/exposure metrics",
  },
  {
    metric_key: "combat.duels_by_weapon_distance",
    delivery: "4.2.5",
    release: "PARTIAL",
    blockers: ["NOT_IMPLEMENTED"],
    evidence: "round_events.distance and weapon on every kill; panel not built",
  },
  {
    metric_key: "aim.first_bullet",
    delivery: "4.2.5",
    release: "NOT_MEASURED",
    blockers: ["L03_USERCMD", "SHOOTER_NOT_ATTRIBUTED"],
    evidence: "L03; weapon_fire has no actor (0/16892)",
  },
  {
    metric_key: "aim.spray",
    delivery: "4.2.5",
    release: "NOT_MEASURED",
    blockers: ["L03_USERCMD", "SHOOTER_NOT_ATTRIBUTED"],
    evidence: "ADMISSION_CONTRACT_V3 L03 (usercmd unavailable)",
  },
  {
    metric_key: "aim.crosshair_placement",
    delivery: "4.2.5",
    release: "NOT_MEASURED",
    blockers: ["L03_USERCMD", "POSITIONS_NOT_PERSISTED"],
    evidence: "L03; original §11.5 forbids inferring angle from position",
  },
  {
    metric_key: "movement.counter_strafe",
    delivery: "4.2.5",
    release: "NOT_MEASURED",
    blockers: ["L03_USERCMD", "L02_TICK_DOMAIN"],
    evidence: "L02, L03",
  },
  {
    metric_key: "utility.flash_affected",
    delivery: "4.2.6",
    release: "NOT_MEASURED",
    blockers: ["NOT_IMPLEMENTED"],
    evidence: "enemiesFlashed not observed in production matches",
  },
  {
    metric_key: "utility.flash_assist",
    delivery: "4.2.6",
    release: "PARTIAL",
    blockers: ["HEURISTIC_ATTRIBUTION"],
    evidence: "metrics.ts: game flag, else temporal attribution (FLASH_ASSIST_WINDOW_SECONDS = 3)",
  },
  {
    metric_key: "economy.equipment_value",
    delivery: "4.2.7",
    release: "PARTIAL",
    blockers: ["NO_BUY_CLASSIFIER"],
    evidence: "round_players.money_start/equipment_value 969/970 rows; buy_context empty",
  },
  {
    metric_key: "impact.trade",
    delivery: "4.2.7",
    release: "SUPPORTED",
    blockers: [],
    evidence: "TRADE_WINDOW_SECONDS = 5 (src/config/pipeline.ts)",
  },
  {
    metric_key: "impact.numerical_advantage",
    delivery: "4.2.7",
    release: "PARTIAL",
    blockers: ["NOT_IMPLEMENTED"],
    evidence: "kills × round_players.side; round winner side validated",
  },
  {
    metric_key: "evolution.trend",
    delivery: "4.2.8",
    release: "INSUFFICIENT_SAMPLE",
    blockers: ["SAMPLE_VOLUME"],
    evidence: "≤ 3 matches per player in production",
  },
  {
    metric_key: "pro.benchmark",
    delivery: "4.2.10",
    release: "UNAVAILABLE",
    blockers: ["NO_LICENSED_DATASET"],
    evidence: "original §11.7",
  },
];

export function releaseEntry(key: string): ReleaseEntry | undefined {
  return RELEASE_MATRIX.find((e) => e.metric_key === key);
}
