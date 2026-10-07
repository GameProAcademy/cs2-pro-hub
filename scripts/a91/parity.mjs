import { digest } from "./contracts.mjs";

export const DOMAINS = Object.freeze([
  "header",
  "map",
  "tickrate",
  "playback_ticks",
  "players",
  "player_identity",
  "events",
  "rounds",
  "grenades",
  "bomb",
  "damage",
  "deaths",
  "weapons",
  "economy",
  "tick_properties",
  "game_state",
]);
const evidenceKeys = {
  header: "headerEvidence",
  map: "mapEvidence",
  tickrate: "timingEvidence",
  playback_ticks: "timingEvidence",
  players: "playerInventory",
  player_identity: "playerInventory",
  events: "eventEvidence",
  rounds: "roundEvidence",
  grenades: "grenadeEvidence",
  bomb: "bombEvidence",
  damage: "damageEvidence",
  deaths: "deathEvidence",
  weapons: "weaponEvidence",
  economy: "economyEvidence",
  tick_properties: "tickDomainEvidence",
  game_state: "normalizedResult",
};
// Only explicit runtime-specific absence is a capability exemption. Unknown
// declarations and failed parses cannot be used to waive a required comparison.
// The uploadable parity report intentionally stores digests, not raw evidence.
// Raw runtime evidence remains private to the isolated job and is never
// published as a GitHub artifact. This prevents DEM-contained URLs or other
// sensitive strings from crossing the artifact boundary while preserving an
// independently reproducible equality decision.
function availability(artifact, field, runtime) {
  const declared = artifact.domainAvailability?.[field];
  if (declared === `NOT_AVAILABLE_ON_${runtime}`) return declared;
  if (declared && declared !== "AVAILABLE") return "BLOCKED";
  const value = artifact[evidenceKeys[field]];
  if (value?.status === "PARSE_FAILED" || value?.status === "FAILED") return "BLOCKED";
  return value === undefined || value === null ? "MISSING" : "AVAILABLE";
}
export function compareDomains(python, wasm) {
  return DOMAINS.map((field) => {
    const pythonValue = python[evidenceKeys[field]] ?? null;
    const wasmValue = wasm[evidenceKeys[field]] ?? null;
    const pythonAvailability = availability(python, field, "PYTHON");
    const wasmAvailability = availability(wasm, field, "WASM");
    const available = { python: pythonAvailability, wasm: wasmAvailability };
    const base = {
      field,
      availability: available,
      python_digest: digest(pythonValue),
      wasm_digest: digest(wasmValue),
    };
    if (Object.values(available).includes("BLOCKED"))
      return {
        ...base,
        comparability: "BLOCKED",
        status: "BLOCKED",
        equal: null,
        mismatch_reason: "INVALID_OR_FAILED_DOMAIN_EVIDENCE",
      };
    if (
      pythonAvailability.startsWith("NOT_AVAILABLE_ON_") &&
      wasmAvailability.startsWith("NOT_AVAILABLE_ON_")
    )
      return {
        ...base,
        comparability: "BLOCKED",
        status: "BLOCKED",
        equal: null,
        mismatch_reason: "BOTH_RUNTIMES_UNAVAILABLE",
      };
    // A missing counterpart must not be concealed by the other runtime's absence.
    if (Object.values(available).includes("MISSING"))
      return {
        ...base,
        comparability: "NOT_RUN",
        status: "FAIL",
        equal: false,
        mismatch_reason: "MISSING_DOMAIN_EVIDENCE",
      };
    const absence = Object.values(available).filter((a) => a.startsWith("NOT_AVAILABLE_ON_"));
    if (absence.length)
      return {
        ...base,
        comparability: "NOT_COMPARABLE",
        status: "NOT_COMPARABLE",
        equal: null,
        mismatch_reason: absence.join("+"),
      };
    const equal = base.python_digest === base.wasm_digest;
    return {
      ...base,
      comparability: "COMPARABLE",
      status: equal ? "PASS" : "FAIL",
      equal,
      mismatch_reason: equal ? null : "SEMANTIC_MISMATCH",
    };
  });
}
export function summarize(comparisons) {
  const members = (status) =>
    comparisons
      .filter((c) => c.status === status)
      .map((c) => ({
        field: c.field,
        reason: c.mismatch_reason ?? "SEMANTIC_EQUALITY",
        status: c.status,
      }));
  const comparable = comparisons.filter((c) => c.comparability === "COMPARABLE");
  return {
    comparablePassCount: comparable.filter((c) => c.status === "PASS").length,
    comparableFailCount: comparable.filter((c) => c.status === "FAIL").length,
    notComparableCount: members("NOT_COMPARABLE").length,
    notRunCount: comparisons.filter((c) => c.comparability === "NOT_RUN" || c.status === "NOT_RUN")
      .length,
    blockedCount: members("BLOCKED").length,
    crossRuntimeComparableDomains: comparable.map((c) => ({
      field: c.field,
      status: c.status,
      reason: c.mismatch_reason ?? "SEMANTIC_EQUALITY",
    })),
    crossRuntimeNotComparableDomains: members("NOT_COMPARABLE"),
    crossRuntimeBlockedDomains: members("BLOCKED"),
    crossRuntimeNotRunDomains: comparisons
      .filter((c) => c.comparability === "NOT_RUN" || c.status === "NOT_RUN")
      .map((c) => ({ field: c.field, status: c.status, reason: c.mismatch_reason })),
    // Domain-level accounting; no field-level coverage is invented.
    crossRuntimeComparableFieldCount: null,
    crossRuntimeComparableFieldCountReason: "FIELD_LEVEL_COMPARISON_NOT_IMPLEMENTED",
  };
}
export function validParityComparisons(comparisons) {
  return (
    Array.isArray(comparisons) &&
    comparisons.length === DOMAINS.length &&
    new Set(comparisons.map((c) => c.field)).size === DOMAINS.length &&
    DOMAINS.every((field) => comparisons.some((c) => c.field === field)) &&
    comparisons.some((c) => c.comparability === "COMPARABLE") &&
    comparisons.every(
      (c) =>
        typeof c.python_digest === "string" &&
        /^[0-9a-f]{64}$/.test(c.python_digest) &&
        typeof c.wasm_digest === "string" &&
        /^[0-9a-f]{64}$/.test(c.wasm_digest) &&
        !("python_value" in c) &&
        !("wasm_value" in c) &&
        (c.comparability === "COMPARABLE" &&
          c.status === "PASS" &&
          c.equal === true &&
          c.mismatch_reason === null &&
          c.availability?.python === "AVAILABLE" &&
          c.availability?.wasm === "AVAILABLE") ||
        (c.comparability === "NOT_COMPARABLE" &&
          c.status === "NOT_COMPARABLE" &&
          c.equal === null &&
          ["NOT_AVAILABLE_ON_WASM", "NOT_AVAILABLE_ON_PYTHON"].includes(c.mismatch_reason) &&
          Object.values(c.availability ?? {}).some((a) => a.startsWith("NOT_AVAILABLE_ON_")) &&
          !Object.values(c.availability ?? {}).every((a) => a.startsWith("NOT_AVAILABLE_ON_"))),
    )
  );
}
export function parityReport(python, wasm, sha) {
  const comparisons = compareDomains(python, wasm);
  return {
    schema_version: 3,
    status: validParityComparisons(comparisons) ? "PASS" : "FAIL",
    demo_sha256: sha,
    comparisons,
    ...summarize(comparisons),
    parity_digest: digest(comparisons),
    canonical_authorization: false,
    evidencePolicy: "DIGEST_ONLY_PUBLIC_PARITY;RAW_RUNTIME_EVIDENCE_PRIVATE",
  };
}
