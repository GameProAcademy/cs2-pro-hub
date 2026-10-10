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
function comparableEvidence(artifact, field) {
  const value = artifact[evidenceKeys[field]] ?? null;
  if (field !== "game_state" || !value || typeof value !== "object" || Array.isArray(value))
    return value;
  // Player identity is an explicitly separate capability domain: Python has
  // parse_player_info while this WASM API does not. Exclude only that property
  // from aggregate game-state parity; player_identity remains NOT_COMPARABLE.
  const { playerIdentity: _playerIdentity, ...sharedState } = value;
  return sharedState;
}
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
    const pythonValue = comparableEvidence(python, field);
    const wasmValue = comparableEvidence(wasm, field);
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
        (typeof c.python_digest === "string" &&
          /^[0-9a-f]{64}$/.test(c.python_digest) &&
          typeof c.wasm_digest === "string" &&
          /^[0-9a-f]{64}$/.test(c.wasm_digest) &&
          !("python_value" in c) &&
          !("wasm_value" in c) &&
          c.comparability === "COMPARABLE" &&
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
function sortedStrings(values) {
  return [...new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : [])].sort();
}
function difference(left, right) {
  const a = sortedStrings(left);
  const b = sortedStrings(right);
  return {
    python_only: a.filter((value) => !b.includes(value)),
    wasm_only: b.filter((value) => !a.includes(value)),
  };
}
// Publish only names, counts, requested field names and SHA-256 digests.
// Raw rows/samples and player identifiers are deliberately excluded.
export function diagnoseRuntimeCalls(python, wasm) {
  const pythonCalls = Array.isArray(python.apiCalls) ? python.apiCalls : [];
  const wasmCalls = Array.isArray(wasm.apiCalls) ? wasm.apiCalls : [];
  const pythonEvents = new Map((python.eventEvidence ?? []).filter((x) => x?.eventName).map((x) => [x.eventName, x]));
  const wasmEvents = new Map((wasm.eventEvidence ?? []).filter((x) => x?.eventName).map((x) => [x.eventName, x]));
  const pythonCallEvents = new Map(pythonCalls.filter((x) => x?.api === "parseEvent" && x.eventName).map((x) => [x.eventName, x]));
  const wasmCallEvents = new Map(wasmCalls.filter((x) => x?.api === "parseEvent" && x.eventName).map((x) => [x.eventName, x]));
  const eventNames = [...new Set([...pythonEvents.keys(), ...wasmEvents.keys(), ...pythonCallEvents.keys(), ...wasmCallEvents.keys()])];
  const events = eventNames.map((eventName) => {
    const pe = pythonEvents.get(eventName) ?? {};
    const we = wasmEvents.get(eventName) ?? {};
    const pc = pythonCallEvents.get(eventName) ?? {};
    const wc = wasmCallEvents.get(eventName) ?? {};
    const pythonFields = pe.returnedFields ?? pc.returnedFields ?? [];
    const wasmFields = wc.returnedFields ?? we.returnedFields ?? [];
    const fieldDifference = difference(pythonFields, wasmFields);
    const pythonCount = pe.count ?? pc.count ?? null;
    const wasmCount = we.count ?? wc.count ?? null;
    const pythonDigest = pe.fullDigest ?? pc.outputDigest ?? null;
    const wasmDigest = we.fullDigest ?? wc.outputDigest ?? null;
    const requestDifference = {
      player: difference(pe.requestedPlayerFields ?? pc.requestedPlayerFields, we.requestedPlayerFields ?? wc.requestedPlayerFields),
      other: difference(pe.requestedOtherFields ?? pc.requestedOtherFields, we.requestedOtherFields ?? wc.requestedOtherFields),
    };
    const reasons = [];
    if (pythonCount !== wasmCount) reasons.push("ROW_COUNT_MISMATCH");
    if (pythonDigest !== wasmDigest) reasons.push("OUTPUT_DIGEST_MISMATCH");
    if (fieldDifference.python_only.length || fieldDifference.wasm_only.length) reasons.push("RETURNED_FIELD_SET_MISMATCH");
    if (requestDifference.player.python_only.length || requestDifference.player.wasm_only.length ||
        requestDifference.other.python_only.length || requestDifference.other.wasm_only.length) reasons.push("REQUEST_FIELD_SET_MISMATCH");
    if (!pythonEvents.has(eventName) || !wasmEvents.has(eventName)) reasons.push("EVENT_EVIDENCE_MISSING");
    return {
      event_name: eventName, status: reasons.length ? "FAIL" : "PASS", reasons,
      python_count: pythonCount, wasm_count: wasmCount,
      python_digest: pythonDigest, wasm_digest: wasmDigest,
      returned_field_difference: fieldDifference, requested_field_difference: requestDifference,
    };
  });
  const call = (calls, api) => calls.find((item) => item?.api === api) ?? null;
  const pc = call(pythonCalls, "parseGrenades");
  const wc = call(wasmCalls, "parseGrenades");
  const pt = call(pythonCalls, "parseTicks");
  const wt = call(wasmCalls, "parseTicks");
  const summarizeCall = (left, right, label) => ({
    domain: label,
    status: left && right && left.count === right.count && left.outputDigest === right.outputDigest && (label !== "parseTicks" || (JSON.stringify(left.requestedFields ?? null) === JSON.stringify(right.requestedFields ?? null) && JSON.stringify(left.wantedTicks ?? null) === JSON.stringify(right.wantedTicks ?? null))) ? "PASS" : "FAIL",
    python_count: left?.count ?? null, wasm_count: right?.count ?? null,
    python_digest: left?.outputDigest ?? null, wasm_digest: right?.outputDigest ?? null,
    requested_fields: label === "parseTicks" ? {
      difference: difference(left?.requestedFields, right?.requestedFields),
      python_wanted_ticks: left?.wantedTicks ?? null, wasm_wanted_ticks: right?.wantedTicks ?? null,
      wanted_ticks_equal: JSON.stringify(left?.wantedTicks ?? null) === JSON.stringify(right?.wantedTicks ?? null),
    } : undefined,
  });
  const grenade = summarizeCall(pc, wc, "parseGrenades");
  const ticks = summarizeCall(pt, wt, "parseTicks");
  const firstDivergence = events.find((event) => event.status === "FAIL") ?? [grenade, ticks].find((item) => item.status === "FAIL") ?? null;
  return {
    schema_version: 1,
    evidence_policy: "SANITIZED_CALL_DIAGNOSTICS_ONLY_NO_RAW_RECORDS",
    event_count: events.length,
    event_pass_count: events.filter((event) => event.status === "PASS").length,
    event_fail_count: events.filter((event) => event.status === "FAIL").length,
    first_divergence: firstDivergence ? { domain: firstDivergence.event_name ?? firstDivergence.domain, reasons: firstDivergence.reasons ?? [firstDivergence.status] } : null,
    events,
    grenade: grenade,
    ticks,
    runtime_api_inventory: {
      python_api_names: sortedStrings(pythonCalls.map((item) => item.api)),
      wasm_api_names: sortedStrings(wasmCalls.map((item) => item.api)),
    },
  };
}
export function parityReport(python, wasm, sha) {
  const comparisons = compareDomains(python, wasm);
  return {
    schema_version: 4,
    status: validParityComparisons(comparisons) ? "PASS" : "FAIL",
    demo_sha256: sha,
    comparisons,
    ...summarize(comparisons),
    semantic_diagnostics: diagnoseRuntimeCalls(python, wasm),
    parity_digest: digest(comparisons),
    canonical_authorization: false,
    evidencePolicy: "DIGEST_ONLY_PUBLIC_PARITY;SANITIZED_CALL_DIAGNOSTICS;RAW_RUNTIME_EVIDENCE_PRIVATE",
  };
}
