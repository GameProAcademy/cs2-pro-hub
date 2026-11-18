/**
 * PM5 / Fase 4.2.10 — module J: professional benchmarks (`cs2.pro-benchmark.v1`). Pure.
 *
 * A comparison with professional players is shown ONLY from a source that is licensed for this
 * use AND comparable with the player's own numbers (CS2, same metric method, enough matches).
 * Every gate is explicit; a source that fails any of them is never used, and without a valid
 * source the state is `BENCHMARK_UNAVAILABLE` — no number is estimated, borrowed from general
 * knowledge or scraped.
 *
 * Audit (PM5): no CS2 professional dataset with a licence that allows derived display in this
 * product was found. The registry of licensed sources is therefore empty and the candidates
 * that were looked at are kept in `AUDITED_SOURCES` with the reason they were not used.
 * Adding a source = a reviewed code change with its licence reference; nothing is fetched at
 * runtime.
 */

export const BENCHMARK_VERSION = "cs2.pro-benchmark.v1";
/** The method the player's own metrics use (module G). A benchmark must be computed the same way. */
export const COMPARABLE_METHOD = "cs2.evolution.v1";
export const MIN_SOURCE_MATCHES = 30;

export type LicenseKind = "COMMERCIAL_AGREEMENT" | "OPEN_LICENSE" | "NONE" | "UNKNOWN";
export type Collection = "OFFICIAL_API" | "LICENSED_EXPORT" | "SCRAPED" | "UNKNOWN";

export interface BenchmarkSource {
  id: string;
  name: string;
  license: {
    kind: LicenseKind;
    /** Where the licence / agreement is recorded (contract id, licence URL). */
    reference: string | null;
    allowsDerivedDisplay: boolean;
    /** ISO date the licence was checked by a person. */
    verifiedAt: string | null;
  };
  game: "CS2" | "CSGO";
  collection: Collection;
  /** Metric method the source values were computed with. */
  methodVersion: string | null;
  sampleMatches: number;
  metrics: Array<{ key: string; value: number; matches: number }>;
}

export type RejectionReason =
  | "LICENSE_MISSING"
  | "DERIVED_DISPLAY_NOT_ALLOWED"
  | "LICENSE_NOT_VERIFIED"
  | "SCRAPED"
  | "NOT_CS2"
  | "METHOD_NOT_COMPARABLE"
  | "SAMPLE_TOO_SMALL";

export function validateSource(src: BenchmarkSource): {
  valid: boolean;
  reasons: RejectionReason[];
} {
  const reasons: RejectionReason[] = [];
  const licensed =
    src.license.kind === "COMMERCIAL_AGREEMENT" || src.license.kind === "OPEN_LICENSE";
  if (!licensed || !src.license.reference) reasons.push("LICENSE_MISSING");
  if (!src.license.allowsDerivedDisplay) reasons.push("DERIVED_DISPLAY_NOT_ALLOWED");
  if (!src.license.verifiedAt) reasons.push("LICENSE_NOT_VERIFIED");
  if (src.collection === "SCRAPED" || src.collection === "UNKNOWN") reasons.push("SCRAPED");
  if (src.game !== "CS2") reasons.push("NOT_CS2");
  if (src.methodVersion !== COMPARABLE_METHOD) reasons.push("METHOD_NOT_COMPARABLE");
  if (!(src.sampleMatches >= MIN_SOURCE_MATCHES)) reasons.push("SAMPLE_TOO_SMALL");
  return { valid: reasons.length === 0, reasons };
}

/** Licensed, comparable sources. Empty: none passed the PM5 audit. */
export const LICENSED_SOURCES: readonly BenchmarkSource[] = [];

export type AuditFinding =
  | "NO_LICENSE_FOUND"
  | "TERMS_RESTRICT_REUSE"
  | "SCRAPED_ORIGIN"
  | "NO_PRO_DATASET"
  | "OWN_PLAYER_DATA_ONLY";

/** Candidates looked at during the PM5 audit and why they are not used (no data copied). */
export const AUDITED_SOURCES: ReadonlyArray<{
  id: string;
  name: string;
  findings: AuditFinding[];
}> = [
  { id: "hltv", name: "HLTV.org", findings: ["NO_LICENSE_FOUND", "TERMS_RESTRICT_REUSE"] },
  {
    id: "kaggle-hltv",
    name: "Kaggle CS2 datasets derived from HLTV",
    findings: ["SCRAPED_ORIGIN", "NO_LICENSE_FOUND"],
  },
  { id: "faceit-data-api", name: "FACEIT Data API", findings: ["NO_PRO_DATASET"] },
  { id: "leetify", name: "Leetify", findings: ["NO_LICENSE_FOUND"] },
  {
    id: "steam-valve",
    name: "Valve / Steam Web API",
    findings: ["NO_PRO_DATASET", "OWN_PLAYER_DATA_ONLY"],
  },
];

export type BenchmarkComparison =
  | {
      state: "OK";
      metricKey: string;
      sourceId: string;
      sourceName: string;
      licenseReference: string;
      proValue: number;
      proMatches: number;
      playerValue: number;
      delta: number;
    }
  | {
      state: "BENCHMARK_UNAVAILABLE";
      metricKey: string;
      reason: "NO_LICENSED_SOURCE" | "METRIC_NOT_COVERED" | "PLAYER_VALUE_MISSING";
    };

export function compareToBenchmark(
  metricKey: string,
  playerValue: number | null,
  sources: readonly BenchmarkSource[] = LICENSED_SOURCES,
): BenchmarkComparison {
  const valid = sources.filter((s) => validateSource(s).valid);
  if (!valid.length)
    return { state: "BENCHMARK_UNAVAILABLE", metricKey, reason: "NO_LICENSED_SOURCE" };
  if (playerValue === null || !Number.isFinite(playerValue))
    return { state: "BENCHMARK_UNAVAILABLE", metricKey, reason: "PLAYER_VALUE_MISSING" };
  for (const s of valid) {
    const m = s.metrics.find((x) => x.key === metricKey && Number.isFinite(x.value));
    if (!m || m.matches < MIN_SOURCE_MATCHES) continue;
    return {
      state: "OK",
      metricKey,
      sourceId: s.id,
      sourceName: s.name,
      licenseReference: s.license.reference!,
      proValue: m.value,
      proMatches: m.matches,
      playerValue,
      delta: playerValue - m.value,
    };
  }
  return { state: "BENCHMARK_UNAVAILABLE", metricKey, reason: "METRIC_NOT_COVERED" };
}

export interface BenchmarkStatus {
  version: typeof BENCHMARK_VERSION;
  state: "AVAILABLE" | "BENCHMARK_UNAVAILABLE";
  licensedSources: number;
  audited: Array<{ id: string; name: string; findings: AuditFinding[] }>;
}

export function benchmarkStatus(
  sources: readonly BenchmarkSource[] = LICENSED_SOURCES,
): BenchmarkStatus {
  const n = sources.filter((s) => validateSource(s).valid).length;
  return {
    version: BENCHMARK_VERSION,
    state: n ? "AVAILABLE" : "BENCHMARK_UNAVAILABLE",
    licensedSources: n,
    audited: AUDITED_SOURCES.map((a) => ({ ...a, findings: [...a.findings] })),
  };
}
