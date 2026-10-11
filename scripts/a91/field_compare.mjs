// A9.1 field-level cross-runtime comparison (contract v1).
//
// Consumes the table summaries produced by canonical_schema.{mjs,py}. It never
// reads or emits row values: output is limited to field names, row indices,
// value classes, counts and SHA-256 digests, so it is safe for the bounded
// public report. Every divergence stays a FAIL; this module only explains it.
import { CONTRACT, canonicalizeValue } from "./canonical_schema.mjs";

const stableClasses = (classes) =>
  Object.fromEntries(CONTRACT.valueClasses.map((name) => [name, classes?.[name] ?? 0]));
const sameClasses = (left, right) =>
  CONTRACT.valueClasses.every((name) => (left?.[name] ?? 0) === (right?.[name] ?? 0));
const firstDifference = (left = [], right = []) => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) if (left[index] !== right[index]) return index;
  return null;
};

function firstSampleDivergence(field, pythonSamples = [], wasmSamples = []) {
  const length = Math.min(pythonSamples.length, wasmSamples.length);
  for (let row = 0; row < length; row += 1) {
    const python = canonicalizeValue(pythonSamples[row]?.[field], field);
    const wasm = canonicalizeValue(wasmSamples[row]?.[field], field);
    if (python.text !== wasm.text || python.cls !== wasm.cls)
      return { row, python_class: python.cls, wasm_class: wasm.cls };
  }
  return null;
}

/**
 * Compare one table. `python`/`wasm` are `{summary, diagnostics?}` or bare
 * summaries. Returns a sanitized verdict with one entry per field.
 */
export function compareTables(pythonInput, wasmInput) {
  const python = pythonInput?.summary ?? pythonInput ?? null;
  const wasm = wasmInput?.summary ?? wasmInput ?? null;
  const pythonDiagnostics = pythonInput?.diagnostics ?? null;
  const wasmDiagnostics = wasmInput?.diagnostics ?? null;
  const table = python?.table ?? wasm?.table ?? null;
  if (!python || !wasm)
    return {
      table,
      status: "FAIL",
      divergence_classes: ["TABLE_PRESENCE"],
      python_present: Boolean(python),
      wasm_present: Boolean(wasm),
      fields: [],
    };
  if (python.canonicalContractVersion !== wasm.canonicalContractVersion)
    return {
      table,
      status: "BLOCKED",
      divergence_classes: ["CONTRACT_VERSION"],
      python_contract: python.canonicalContractVersion ?? null,
      wasm_contract: wasm.canonicalContractVersion ?? null,
      fields: [],
    };
  const rowCountEqual = python.rowCount === wasm.rowCount;
  const sequenceEqual = python.tableDigest === wasm.tableDigest;
  const multisetEqual = python.multisetDigest === wasm.multisetDigest;
  const names = [...new Set([...(python.fields ?? []), ...(wasm.fields ?? [])])].sort();
  const blockRows =
    pythonDiagnostics?.blockRows ?? wasmDiagnostics?.blockRows ?? CONTRACT.blockRows;
  const fields = names.map((field) => {
    const left = python.columns?.[field] ?? null;
    const right = wasm.columns?.[field] ?? null;
    const base = {
      field,
      python_present: Boolean(left),
      wasm_present: Boolean(right),
      python_classes: left ? stableClasses(left.classes) : null,
      wasm_classes: right ? stableClasses(right.classes) : null,
    };
    if (!left || !right) return { ...base, status: "FAIL", divergence: "FIELD_PRESENCE" };
    if (!rowCountEqual) {
      // Positional digests are meaningless across different row counts.
      return { ...base, status: "FAIL", divergence: "ROW_COUNT" };
    }
    if (left.digest === right.digest && sameClasses(left.classes, right.classes))
      return { ...base, status: "PASS", divergence: null };
    let divergence;
    if ((left.classes?.null ?? 0) !== (right.classes?.null ?? 0)) divergence = "NULLABILITY";
    else if (!sameClasses(left.classes, right.classes)) divergence = "TYPE";
    else divergence = multisetEqual ? "ROW_ORDER" : "VALUE";
    const block = firstDifference(
      pythonDiagnostics?.columnBlockDigests?.[field],
      wasmDiagnostics?.columnBlockDigests?.[field],
    );
    const sample = firstSampleDivergence(
      field,
      pythonDiagnostics?.samples,
      wasmDiagnostics?.samples,
    );
    return {
      ...base,
      status: "FAIL",
      divergence,
      first_divergent_row_range:
        block === null
          ? null
          : { from: block * blockRows, to: Math.min((block + 1) * blockRows, python.rowCount) - 1 },
      first_divergent_sample_row: sample,
    };
  });
  const classes = new Set(fields.map((item) => item.divergence).filter(Boolean));
  if (!rowCountEqual) classes.add("ROW_COUNT");
  if (rowCountEqual && !sequenceEqual && classes.size === 0)
    classes.add(multisetEqual ? "ROW_ORDER" : "VALUE");
  const verdict = {
    table,
    status: classes.size === 0 && sequenceEqual ? "PASS" : "FAIL",
    divergence_classes: [...classes].sort(),
    python_row_count: python.rowCount,
    wasm_row_count: wasm.rowCount,
    empty_in_both: python.rowCount === 0 && wasm.rowCount === 0,
    sequence_equal: sequenceEqual,
    multiset_equal: multisetEqual,
    field_count: names.length,
    field_pass_count: fields.filter((item) => item.status === "PASS").length,
    fields,
  };
  const breakdownFields = new Set([
    ...Object.keys(python.breakdown ?? {}),
    ...Object.keys(wasm.breakdown ?? {}),
  ]);
  if (breakdownFields.size) {
    // Category labels are engine class names (e.g. grenade entity classes),
    // not player data, and are capped by CONTRACT.maxCategoricalValues.
    verdict.breakdown = Object.fromEntries(
      [...breakdownFields].sort().map((field) => {
        const left = python.breakdown?.[field] ?? {};
        const right = wasm.breakdown?.[field] ?? {};
        return [
          field,
          [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().map((value) => ({
            value,
            python_count: left[value] ?? 0,
            wasm_count: right[value] ?? 0,
            equal: (left[value] ?? 0) === (right[value] ?? 0),
          })),
        ];
      }),
    );
  }
  return verdict;
}

/** Field-level comparison of two plain objects (e.g. the DEM header). */
export function compareObjects(name, python, wasm) {
  const valid = (value) => value && typeof value === "object" && !Array.isArray(value);
  if (!valid(python) || !valid(wasm))
    return { table: name, status: "FAIL", divergence_classes: ["TABLE_PRESENCE"], fields: [] };
  const names = [...new Set([...Object.keys(python), ...Object.keys(wasm)])].sort();
  const fields = names.map((field) => {
    const base = {
      field,
      python_present: Object.hasOwn(python, field),
      wasm_present: Object.hasOwn(wasm, field),
    };
    if (!base.python_present || !base.wasm_present)
      return { ...base, status: "FAIL", divergence: "FIELD_PRESENCE" };
    const left = canonicalizeValue(python[field], field);
    const right = canonicalizeValue(wasm[field], field);
    const typed = { ...base, python_class: left.cls, wasm_class: right.cls };
    if (left.text === right.text && left.cls === right.cls)
      return { ...typed, status: "PASS", divergence: null };
    const nullish = left.cls === "null" || right.cls === "null";
    return {
      ...typed,
      status: "FAIL",
      divergence: nullish ? "NULLABILITY" : left.cls !== right.cls ? "TYPE" : "VALUE",
    };
  });
  const classes = [...new Set(fields.map((item) => item.divergence).filter(Boolean))].sort();
  return {
    table: name,
    status: classes.length ? "FAIL" : "PASS",
    divergence_classes: classes,
    field_count: names.length,
    field_pass_count: fields.filter((item) => item.status === "PASS").length,
    fields,
  };
}

/**
 * Structural symmetry: both runtimes must emit the same table names and, per
 * table, the same field set. Anything else is reported, never ignored.
 */
export function structuralSymmetry(pythonTables = {}, wasmTables = {}) {
  const names = [...new Set([...Object.keys(pythonTables), ...Object.keys(wasmTables)])].sort();
  const issues = [];
  for (const name of names) {
    const python = pythonTables[name]?.summary ?? pythonTables[name];
    const wasm = wasmTables[name]?.summary ?? wasmTables[name];
    if (!python || !wasm) {
      issues.push({
        table: name,
        issue: "TABLE_PRESENCE",
        python: Boolean(python),
        wasm: Boolean(wasm),
      });
      continue;
    }
    const left = new Set(python.fields ?? []);
    const right = new Set(wasm.fields ?? []);
    const pythonOnly = [...left].filter((field) => !right.has(field)).sort();
    const wasmOnly = [...right].filter((field) => !left.has(field)).sort();
    if (pythonOnly.length || wasmOnly.length)
      issues.push({
        table: name,
        issue: "FIELD_PRESENCE",
        python_only: pythonOnly,
        wasm_only: wasmOnly,
      });
  }
  return { symmetric: issues.length === 0, table_count: names.length, issues };
}
