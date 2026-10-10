import { CONTRACT } from "./canonical_schema.mjs";
import { digest } from "./contracts.mjs";
import { compareObjects, compareTables, structuralSymmetry } from "./field_compare.mjs";

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
const FILTERED_TABLES = new Set(Object.keys(CONTRACT.domainRowFilters ?? {}));
/** True when a table that the contract filters does not carry a CLEAN status. */
export const domainFilterNotClean = (table) =>
  Boolean(table) &&
  typeof table === "object" &&
  FILTERED_TABLES.has(table.table) &&
  table.domainFilter?.status !== "CLEAN";
/**
 * Fail closed (rule R13): every summary of a filtered table found in this
 * evidence must say CLEAN. A missing status, an unknown status or VIOLATED all
 * block the domain.
 */
function domainFilterViolated(value) {
  if (!value || typeof value !== "object") return false;
  const tables = [value.table, value.grenades, value.ticks];
  if (Array.isArray(value)) for (const item of value) tables.push(item?.table);
  if (Array.isArray(value.events)) for (const item of value.events) tables.push(item?.table);
  return tables.some(domainFilterNotClean);
}
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
  // Contract rule R13 first: a table whose domain row filter is not CLEAN is
  // not valid evidence. This is checked before any self-declared
  // unavailability, and it holds even if both runtimes report the same thing.
  if (domainFilterViolated(artifact[evidenceKeys[field]])) return "BLOCKED";
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
  return [
    ...new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []),
  ].sort();
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
  // Diagnostics are supplemental: malformed/missing event evidence must not crash
  // the contract harness. Core parity still evaluates the original evidence shape.
  const pythonEventEvidence = Array.isArray(python.eventEvidence) ? python.eventEvidence : [];
  const wasmEventEvidence = Array.isArray(wasm.eventEvidence) ? wasm.eventEvidence : [];
  const pythonEvents = new Map(
    pythonEventEvidence.filter((x) => x?.eventName).map((x) => [x.eventName, x]),
  );
  const wasmEvents = new Map(
    wasmEventEvidence.filter((x) => x?.eventName).map((x) => [x.eventName, x]),
  );
  const pythonCallEvents = new Map(
    pythonCalls.filter((x) => x?.api === "parseEvent" && x.eventName).map((x) => [x.eventName, x]),
  );
  const wasmCallEvents = new Map(
    wasmCalls.filter((x) => x?.api === "parseEvent" && x.eventName).map((x) => [x.eventName, x]),
  );
  const eventNames = [
    ...new Set([
      ...pythonEvents.keys(),
      ...wasmEvents.keys(),
      ...pythonCallEvents.keys(),
      ...wasmCallEvents.keys(),
    ]),
  ];
  const events = eventNames.map((eventName) => {
    const pe = pythonEvents.get(eventName) ?? {};
    const we = wasmEvents.get(eventName) ?? {};
    const pc = pythonCallEvents.get(eventName) ?? {};
    const wc = wasmCallEvents.get(eventName) ?? {};
    const pythonFields = pe.table?.fields ?? pe.returnedFields ?? pc.returnedFields ?? [];
    const wasmFields = we.table?.fields ?? wc.returnedFields ?? we.returnedFields ?? [];
    const fieldDifference = difference(pythonFields, wasmFields);
    const pythonCount = pe.table?.rowCount ?? pe.count ?? pc.count ?? null;
    const wasmCount = we.table?.rowCount ?? we.count ?? wc.count ?? null;
    const pythonDigest = pe.table?.tableDigest ?? pe.fullDigest ?? pc.outputDigest ?? null;
    const wasmDigest = we.table?.tableDigest ?? we.fullDigest ?? wc.outputDigest ?? null;
    const requestDifference = {
      player: difference(
        pe.requestedPlayerFields ?? pc.requestedPlayerFields,
        we.requestedPlayerFields ?? wc.requestedPlayerFields,
      ),
      other: difference(
        pe.requestedOtherFields ?? pc.requestedOtherFields,
        we.requestedOtherFields ?? wc.requestedOtherFields,
      ),
    };
    const reasons = [];
    if (pythonCount !== wasmCount) reasons.push("ROW_COUNT_MISMATCH");
    if (pythonDigest !== wasmDigest) reasons.push("OUTPUT_DIGEST_MISMATCH");
    if (fieldDifference.python_only.length || fieldDifference.wasm_only.length)
      reasons.push("RETURNED_FIELD_SET_MISMATCH");
    if (
      requestDifference.player.python_only.length ||
      requestDifference.player.wasm_only.length ||
      requestDifference.other.python_only.length ||
      requestDifference.other.wasm_only.length
    )
      reasons.push("REQUEST_FIELD_SET_MISMATCH");
    if (!pythonEvents.has(eventName) || !wasmEvents.has(eventName))
      reasons.push("EVENT_EVIDENCE_MISSING");
    return {
      event_name: eventName,
      status: reasons.length ? "FAIL" : "PASS",
      reasons,
      python_count: pythonCount,
      wasm_count: wasmCount,
      python_digest: pythonDigest,
      wasm_digest: wasmDigest,
      returned_field_difference: fieldDifference,
      requested_field_difference: requestDifference,
      // Contract rule R12: fields deliberately not requested from either runtime.
      excluded_request_fields: {
        python: sortedStrings(pc.excludedRequestFields),
        wasm: sortedStrings(wc.excludedRequestFields),
      },
    };
  });
  const call = (calls, api) => calls.find((item) => item?.api === api) ?? null;
  const pc = call(pythonCalls, "parseGrenades");
  const wc = call(wasmCalls, "parseGrenades");
  const pt = call(pythonCalls, "parseTicks");
  const wt = call(wasmCalls, "parseTicks");
  const summarizeCall = (left, right, label) => {
    const fieldDifference = difference(left?.returnedFields, right?.returnedFields);
    const requestedFieldsEqual =
      JSON.stringify(left?.requestedFields ?? null) ===
      JSON.stringify(right?.requestedFields ?? null);
    const wantedTicksEqual =
      JSON.stringify(left?.wantedTicks ?? null) === JSON.stringify(right?.wantedTicks ?? null);
    const countsEqual = left && right && left.count === right.count;
    const digestsEqual = left && right && left.outputDigest === right.outputDigest;
    const returnedFieldsEqual =
      fieldDifference.python_only.length === 0 && fieldDifference.wasm_only.length === 0;
    const callContractEqual = label !== "parseTicks" || (requestedFieldsEqual && wantedTicksEqual);
    return {
      domain: label,
      status:
        countsEqual && digestsEqual && returnedFieldsEqual && callContractEqual ? "PASS" : "FAIL",
      python_count: left?.count ?? null,
      wasm_count: right?.count ?? null,
      python_digest: left?.outputDigest ?? null,
      wasm_digest: right?.outputDigest ?? null,
      returned_field_difference: fieldDifference,
      returned_fields: {
        python: sortedStrings(left?.returnedFields),
        wasm: sortedStrings(right?.returnedFields),
      },
      requested_fields:
        label === "parseTicks"
          ? {
              difference: difference(left?.requestedFields, right?.requestedFields),
              python_wanted_ticks: left?.wantedTicks ?? null,
              wasm_wanted_ticks: right?.wantedTicks ?? null,
              wanted_ticks_equal: wantedTicksEqual,
            }
          : undefined,
    };
  };
  const grenade = summarizeCall(pc, wc, "parseGrenades");
  const ticks = summarizeCall(pt, wt, "parseTicks");
  const firstDivergence =
    events.find((event) => event.status === "FAIL") ??
    [grenade, ticks].find((item) => item.status === "FAIL") ??
    null;
  return {
    schema_version: 1,
    evidence_policy: "SANITIZED_CALL_DIAGNOSTICS_ONLY_NO_RAW_RECORDS",
    event_count: events.length,
    event_pass_count: events.filter((event) => event.status === "PASS").length,
    event_fail_count: events.filter((event) => event.status === "FAIL").length,
    first_divergence: firstDivergence
      ? {
          domain: firstDivergence.event_name ?? firstDivergence.domain,
          reasons: firstDivergence.reasons ?? [firstDivergence.status],
        }
      : null,
    events,
    grenade,
    ticks,
    runtime_api_inventory: {
      python_api_names: sortedStrings(pythonCalls.map((item) => item.api)),
      wasm_api_names: sortedStrings(wasmCalls.map((item) => item.api)),
    },
  };
}
/** Canonical tables carried by one runtime artifact, keyed by table name. */
export function artifactTables(artifact) {
  const tables = {};
  const diagnostics = artifact?.tableDiagnostics ?? {};
  const add = (summary) => {
    if (summary && typeof summary === "object" && typeof summary.table === "string")
      tables[summary.table] = { summary, diagnostics: diagnostics[summary.table] ?? null };
  };
  for (const event of Array.isArray(artifact?.eventEvidence) ? artifact.eventEvidence : [])
    add(event?.table);
  add(artifact?.grenadeEvidence?.table);
  add(artifact?.tickDomainEvidence?.table);
  return tables;
}

const keyList = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : null;

/**
 * Envelope symmetry (contract rule R11): semantic evidence objects must have
 * the same keys in both runtimes. Call metadata belongs in apiCalls. This is
 * the regression guard for one producer growing extra envelope keys.
 */
export function envelopeSymmetry(python, wasm) {
  const issues = [];
  const check = (path, left, right) => {
    const a = keyList(left);
    const b = keyList(right);
    if (JSON.stringify(a) !== JSON.stringify(b))
      issues.push({ path, python_keys: a, wasm_keys: b });
  };
  const events = (artifact) =>
    new Map(
      (Array.isArray(artifact?.eventEvidence) ? artifact.eventEvidence : [])
        .filter((item) => item?.eventName)
        .map((item) => [item.eventName, item]),
    );
  const pythonEvents = events(python);
  const wasmEvents = events(wasm);
  for (const name of [...new Set([...pythonEvents.keys(), ...wasmEvents.keys()])].sort())
    check(`eventEvidence[${name}]`, pythonEvents.get(name), wasmEvents.get(name));
  for (const key of [
    "grenadeEvidence",
    "tickDomainEvidence",
    "economyEvidence",
    "mapEvidence",
    "timingEvidence",
  ])
    check(key, python?.[key], wasm?.[key]);
  const shared = (artifact) => {
    const value = artifact?.normalizedResult;
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const { playerIdentity: _playerIdentity, ...rest } = value;
    return rest;
  };
  check("normalizedResult", shared(python), shared(wasm));
  return { symmetric: issues.length === 0, issues };
}

const safeClassCounts = (byValue) => {
  // Shape filter, not an allowlist: only strings shaped like a parser entity
  // class name (C + letter + word characters) are published as keys; anything
  // else, including all-digit strings, is folded into OTHER.
  const counts = {};
  for (const [key, count] of Object.entries(byValue ?? {})) {
    const name = /^C[A-Za-z][A-Za-z0-9_]{0,61}$/.test(key) ? key : "OTHER";
    counts[name] = (counts[name] ?? 0) + count;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
};

/**
 * RAW OUTPUT diagnostics (contract rule R13, layer 1). For every table with a
 * domain row filter: what each runtime actually returned, what was kept as the
 * semantic domain and what was set aside as the known anomaly. This is an
 * independent diagnostic. It never feeds the parity status: semantic parity is
 * decided on domain rows only, and a difference in raw output stays visible
 * here as DIVERGENT instead of being folded into a PASS or a FAIL.
 */
export function rawOutputDiagnostics(python, wasm) {
  const pythonTables = artifactTables(python);
  const wasmTables = artifactTables(wasm);
  const names = [...new Set([...Object.keys(pythonTables), ...Object.keys(wasmTables)])].sort();
  const tables = [];
  for (const name of names) {
    const left = pythonTables[name]?.diagnostics?.exclusions ?? null;
    const right = wasmTables[name]?.diagnostics?.exclusions ?? null;
    if (!left && !right) continue;
    const side = (item, table) => ({
      raw_rows: item?.rawRowCount ?? null,
      domain_rows: table?.summary?.rowCount ?? null,
      excluded_rows: item?.count ?? null,
      excluded_by_class: item ? safeClassCounts(item.byValue) : null,
      unclassified_class_rows: item?.unclassifiedClassRows ?? null,
      unclassified_by_class: item ? safeClassCounts(item.unclassifiedByValue) : null,
      rows_without_prior_domain_row: item?.unexplainedRows ?? null,
      excluded_rows_digest: item?.excludedRowsDigest ?? null,
      domain_filter_status: table?.summary?.domainFilter?.status ?? null,
    });
    const pythonSide = side(left, pythonTables[name]);
    const wasmSide = side(right, wasmTables[name]);
    tables.push({
      table: name,
      rule: "R13_DOMAIN_ROW_FILTER",
      raw_rows_equal:
        pythonSide.raw_rows !== null &&
        pythonSide.raw_rows === wasmSide.raw_rows &&
        JSON.stringify(pythonSide.excluded_by_class) === JSON.stringify(wasmSide.excluded_by_class),
      python: pythonSide,
      wasm: wasmSide,
    });
  }
  return {
    schema_version: 1,
    scope: "RAW_PARSER_OUTPUT_NOT_A_PARITY_DIMENSION",
    status: !tables.length
      ? "NOT_APPLICABLE"
      : tables.every((item) => item.raw_rows_equal)
        ? "EQUAL"
        : "DIVERGENT",
    tables,
  };
}

/**
 * Field-level diagnostics for every canonical table plus the header. Output is
 * sanitized by construction: field names, classes, counts, row indices and
 * digests only. It explains a FAIL; it can never turn one into a PASS.
 */
export function diagnoseFields(python, wasm) {
  const pythonTables = artifactTables(python);
  const wasmTables = artifactTables(wasm);
  const names = [...new Set([...Object.keys(pythonTables), ...Object.keys(wasmTables)])].sort();
  const tables = names.map((name) => {
    const verdict = compareTables(pythonTables[name], wasmTables[name]);
    const notClean = [pythonTables[name]?.summary, wasmTables[name]?.summary].some(
      domainFilterNotClean,
    );
    return notClean
      ? {
          ...verdict,
          status: "BLOCKED",
          divergence_classes: [
            ...new Set([...(verdict.divergence_classes ?? []), "DOMAIN_FILTER"]),
          ],
        }
      : verdict;
  });
  const header = compareObjects("header", python?.headerEvidence, wasm?.headerEvidence);
  const all = [header, ...tables];
  const failing = all.filter((item) => item.status !== "PASS");
  const firstField = failing[0]?.fields?.find((item) => item.status !== "PASS") ?? null;
  return {
    schema_version: 1,
    evidence_policy: "FIELD_NAMES_CLASSES_COUNTS_INDICES_DIGESTS_ONLY_NO_VALUES",
    canonical_contract: {
      python: python?.canonicalContract ?? null,
      wasm: wasm?.canonicalContract ?? null,
      equal:
        Boolean(python?.canonicalContract?.digest) &&
        python?.canonicalContract?.digest === wasm?.canonicalContract?.digest &&
        python?.canonicalContract?.version === wasm?.canonicalContract?.version,
    },
    envelope_symmetry: envelopeSymmetry(python, wasm),
    structural_symmetry: structuralSymmetry(pythonTables, wasmTables),
    table_count: tables.length,
    table_pass_count: tables.filter((item) => item.status === "PASS").length,
    table_fail_count: tables.filter((item) => item.status !== "PASS").length,
    // A table with zero rows in both runtimes is equal but proves nothing.
    empty_in_both_table_count: tables.filter((item) => item.empty_in_both).length,
    field_count: all.reduce((total, item) => total + (item.field_count ?? 0), 0),
    field_pass_count: all.reduce((total, item) => total + (item.field_pass_count ?? 0), 0),
    first_divergence: failing.length
      ? {
          table: failing[0].table,
          divergence_classes: failing[0].divergence_classes,
          field: firstField?.field ?? null,
          divergence: firstField?.divergence ?? null,
          sample_row: firstField?.first_divergent_sample_row ?? null,
        }
      : null,
    header,
    tables,
  };
}

export function parityReport(python, wasm, sha) {
  const comparisons = compareDomains(python, wasm);
  const fieldDiagnostics = diagnoseFields(python, wasm);
  return {
    schema_version: 6,
    status: validParityComparisons(comparisons) ? "PASS" : "FAIL",
    demo_sha256: sha,
    comparisons,
    ...summarize(comparisons),
    crossRuntimeComparableFieldCount: fieldDiagnostics.field_count,
    crossRuntimeComparableFieldPassCount: fieldDiagnostics.field_pass_count,
    crossRuntimeComparableFieldCountReason: null,
    field_diagnostics: fieldDiagnostics,
    raw_output_diagnostics: rawOutputDiagnostics(python, wasm),
    semantic_diagnostics: diagnoseRuntimeCalls(python, wasm),
    parity_digest: digest(comparisons),
    canonical_authorization: false,
    evidencePolicy:
      "DIGEST_ONLY_PUBLIC_PARITY;SANITIZED_CALL_DIAGNOSTICS;RAW_RUNTIME_EVIDENCE_PRIVATE",
  };
}
