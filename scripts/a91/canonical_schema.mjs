// A9.1 canonical parity contract v1 — JavaScript implementation.
//
// This module and canonical_schema.py implement the SAME contract
// (canonical/contract.json) and are verified against the SAME vectors
// (canonical/vectors.json). Any change here must change the contract version
// and both implementations together. Laboratory tooling only: it carries no
// Canonical, Attempt 9 or production authority.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const CONTRACT = JSON.parse(
  readFileSync(new URL("./canonical/contract.json", import.meta.url), "utf8"),
);
export const CANONICAL_CONTRACT_VERSION = CONTRACT.canonicalContractVersion;
export const CANONICAL_CONTRACT_DIGEST = createHash("sha256")
  .update(readFileSync(new URL("./canonical/contract.json", import.meta.url)))
  .digest("hex");

const MAX_SAFE = 9007199254740991n;
const MAX_U64 = 18446744073709551615n;
const U64_TEXT = /^(?:0|[1-9][0-9]{0,19})$/;
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

export class CanonicalError extends Error {
  constructor(code, field) {
    super(`A91_CANONICAL_${code}${field ? `:${field}` : ""}`);
    this.code = code;
    this.field = field ?? null;
  }
}

export function isU64Field(field) {
  if (typeof field !== "string") return false;
  const { exact, suffix } = CONTRACT.u64DecimalFields;
  return exact.includes(field) || suffix.some((item) => field.endsWith(item));
}

/** RFC 8785 string serialization; lone surrogates fail closed. */
export function canonicalString(value, field) {
  if (typeof value !== "string") throw new CanonicalError("STRING_EXPECTED", field);
  if (!value.isWellFormed()) throw new CanonicalError("LONE_SURROGATE", field);
  return JSON.stringify(value);
}

function u64Text(value, field) {
  let text;
  if (typeof value === "bigint") text = value.toString(10);
  else if (typeof value === "string") text = value;
  else throw new CanonicalError("U64_PRECISION_LOST", field);
  if (!U64_TEXT.test(text) || BigInt(text) > MAX_U64)
    throw new CanonicalError("U64_INVALID", field);
  return text;
}

/**
 * Canonicalize one value. Returns { text, cls } where text is canonical JSON
 * and cls is one of CONTRACT.valueClasses. `observed` (optional) receives the
 * counters that only some runtimes can see (non-finite floats).
 */
export function canonicalizeValue(value, field, observed = null) {
  if (value === null || value === undefined) return { text: "null", cls: "null" };
  if (typeof value === "number" && !Number.isFinite(value)) {
    if (observed) observed.nonFinite = (observed.nonFinite ?? 0) + 1;
    return { text: "null", cls: "null" };
  }
  if (isU64Field(field) && typeof value !== "object") {
    if (typeof value === "boolean") throw new CanonicalError("U64_INVALID", field);
    return { text: JSON.stringify(u64Text(value, field)), cls: "u64" };
  }
  if (typeof value === "boolean") return { text: value ? "true" : "false", cls: "bool" };
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      if (!Number.isSafeInteger(value)) return { text: JSON.stringify(value), cls: "float" };
      return { text: value === 0 ? "0" : String(value), cls: "integer" };
    }
    return { text: JSON.stringify(value), cls: "float" };
  }
  if (typeof value === "bigint") {
    if (value > MAX_SAFE || value < -MAX_SAFE)
      throw new CanonicalError("UNREGISTERED_BIG_INTEGER", field);
    return { text: value.toString(10), cls: "integer" };
  }
  if (typeof value === "string") return { text: canonicalString(value, field), cls: "string" };
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const items = Array.from(value, (item) => canonicalizeValue(item, field, observed).text);
    return { text: `[${items.join(",")}]`, cls: "array" };
  }
  if (typeof value === "object") {
    const entries =
      Object.prototype.toString.call(value) === "[object Map]"
        ? Array.from(value.entries())
        : Object.entries(value);
    const parts = [];
    for (const [key, item] of entries) {
      if (typeof key !== "string") throw new CanonicalError("NON_STRING_KEY", field);
      parts.push([key, canonicalizeValue(item, key, observed).text]);
    }
    // Default JS string comparison is by UTF-16 code units (RFC 8785).
    parts.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
    for (let index = 1; index < parts.length; index += 1)
      if (parts[index][0] === parts[index - 1][0]) throw new CanonicalError("DUPLICATE_KEY", field);
    return {
      text: `{${parts.map(([key, text]) => `${canonicalString(key, field)}:${text}`).join(",")}}`,
      cls: "object",
    };
  }
  throw new CanonicalError("UNSUPPORTED_TYPE", field);
}

export const canonicalText = (value, field = null) => canonicalizeValue(value, field).text;
export const canonicalDigest = (value, field = null) => sha256(canonicalText(value, field));

const emptyClasses = () => Object.fromEntries(CONTRACT.valueClasses.map((name) => [name, 0]));
const NULL_LINE = "null";

/**
 * Streaming, bounded-memory table summary. Rows are fed one at a time in
 * parser emission order; nothing but one block (CONTRACT.blockRows) of
 * canonical cell text and CONTRACT.sampleRows sample rows is retained.
 */
const sortedCounts = (map) =>
  Object.fromEntries(
    Array.from(map.entries()).sort((left, right) =>
      left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0,
    ),
  );

export class TableAccumulator {
  constructor(name, options = {}) {
    this.name = name;
    this.blockRows = options.blockRows ?? CONTRACT.blockRows;
    this.sampleRows = options.sampleRows ?? CONTRACT.sampleRows;
    this.breakdownFields = CONTRACT.categoricalBreakdown[name] ?? [];
    this.rowCount = 0;
    this.columns = new Map();
    this.rowHashes = [];
    this.rowBlockDigests = [];
    this.multiset = 0n;
    this.samples = [];
    this.observed = { absent: 0, nonFinite: 0 };
    this.breakdown = Object.fromEntries(this.breakdownFields.map((field) => [field, new Map()]));
    this.rowFilter = CONTRACT.domainRowFilters?.[name] ?? null;
    this.excluded = new Map();
    this.excludedCount = 0;
    // Rule R13 layer 3: evidence that an excluded row is the known anomaly.
    this.domainEntityIds = new Set();
    this.unclassified = new Map();
    this.unclassifiedCount = 0;
    this.unexplainedCount = 0;
    this.finished = false;
  }

  /** Rule R13: true when the row belongs to the domain; excluded rows are counted. */
  #admit(entries) {
    const filter = this.rowFilter;
    if (!filter) return true;
    let value;
    let entityId;
    for (const [field, item] of entries) {
      if (field === filter.field) value = item;
      if (field === filter.entityIdField) entityId = item;
    }
    if (typeof value !== "string")
      throw new CanonicalError("DOMAIN_FILTER_FIELD_INVALID", this.name);
    const inDomain =
      filter.includeAnySubstring.some((part) => value.includes(part)) &&
      !filter.excludeAnySubstring.some((part) => value.includes(part));
    if (inDomain) {
      if (Number.isSafeInteger(entityId)) this.domainEntityIds.add(entityId);
      return true;
    }
    // Outside the domain: accepted only as the documented anomaly.
    if (!Number.isSafeInteger(entityId))
      throw new CanonicalError("DOMAIN_FILTER_ENTITY_ID_INVALID", this.name);
    const anomaly = filter.knownAnomaly;
    const knownClass =
      anomaly.classExact.includes(value) ||
      anomaly.classPrefixes.some((prefix) => value.startsWith(prefix));
    if (!knownClass) {
      this.unclassified.set(value, (this.unclassified.get(value) ?? 0) + 1);
      this.unclassifiedCount += 1;
    }
    if (anomaly.requirePriorDomainRowForEntityId && !this.domainEntityIds.has(entityId))
      this.unexplainedCount += 1;
    this.excluded.set(value, (this.excluded.get(value) ?? 0) + 1);
    this.excludedCount += 1;
    if (this.excluded.size > CONTRACT.maxCategoricalValues)
      throw new CanonicalError("CATEGORICAL_OVERFLOW", filter.field);
    return false;
  }

  #column(field) {
    let column = this.columns.get(field);
    if (!column) {
      const inBlock = this.rowCount % this.blockRows;
      column = {
        classes: emptyClasses(),
        cells: new Array(inBlock).fill(NULL_LINE),
        blockDigests: new Array(this.rowBlockDigests.length).fill(null),
        firstRow: this.rowCount,
      };
      // Rows seen before this field first appeared count as null (rule R8).
      column.classes.null += this.rowCount;
      this.observed.absent += this.rowCount;
      this.columns.set(field, column);
    }
    return column;
  }

  addRow(row) {
    if (this.finished) throw new CanonicalError("TABLE_FINISHED", this.name);
    const entries =
      Object.prototype.toString.call(row) === "[object Map]"
        ? Array.from(row.entries())
        : row && typeof row === "object" && !Array.isArray(row)
          ? Object.entries(row)
          : null;
    if (!entries) throw new CanonicalError("ROW_SHAPE_INVALID", this.name);
    if (!this.#admit(entries)) return;
    const seen = new Set();
    const parts = [];
    const sample = this.samples.length < this.sampleRows ? {} : null;
    for (const [field, value] of entries) {
      if (typeof field !== "string") throw new CanonicalError("NON_STRING_KEY", this.name);
      if (seen.has(field)) throw new CanonicalError("DUPLICATE_KEY", field);
      seen.add(field);
      const { text, cls } = canonicalizeValue(value, field, this.observed);
      const column = this.#column(field);
      column.classes[cls] += 1;
      column.cells.push(text);
      if (cls !== "null") parts.push([field, text]);
      if (sample) sample[field] = JSON.parse(text);
      const counts = this.breakdown[field];
      if (counts) {
        const key = cls === "null" ? "\u0000null" : cls === "string" ? value : text;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (counts.size > CONTRACT.maxCategoricalValues)
          throw new CanonicalError("CATEGORICAL_OVERFLOW", field);
      }
    }
    for (const [field, column] of this.columns) {
      if (seen.has(field)) continue;
      column.classes.null += 1;
      column.cells.push(NULL_LINE);
      this.observed.absent += 1;
    }
    parts.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
    const rowHash = sha256(
      `{${parts.map(([field, text]) => `${JSON.stringify(field)}:${text}`).join(",")}}`,
    );
    this.rowHashes.push(rowHash);
    this.multiset = (this.multiset + BigInt(`0x${rowHash}`)) & ((1n << 256n) - 1n);
    if (sample) this.samples.push(sample);
    this.rowCount += 1;
    if (this.rowCount % this.blockRows === 0) this.#flush();
  }

  #flush() {
    if (this.rowHashes.length === 0) return;
    this.rowBlockDigests.push(sha256(this.rowHashes.join("")));
    this.rowHashes = [];
    for (const column of this.columns.values()) {
      column.blockDigests.push(sha256(column.cells.join("\n")));
      column.cells = [];
    }
  }

  finish() {
    if (this.finished) throw new CanonicalError("TABLE_FINISHED", this.name);
    this.#flush();
    this.finished = true;
    const allNullBlock = sha256(new Array(this.blockRows).fill(NULL_LINE).join("\n"));
    const fields = Array.from(this.columns.keys()).sort();
    const columns = {};
    const columnBlockDigests = {};
    for (const field of fields) {
      const column = this.columns.get(field);
      const blocks = column.blockDigests.map((value) => value ?? allNullBlock);
      columnBlockDigests[field] = blocks;
      columns[field] = { digest: sha256(blocks.join("")), classes: column.classes };
    }
    const summary = {
      canonicalContractVersion: CANONICAL_CONTRACT_VERSION,
      table: this.name,
      rowCount: this.rowCount,
      fields,
      tableDigest: sha256(this.rowBlockDigests.join("")),
      multisetDigest: this.multiset.toString(16).padStart(64, "0"),
      columns,
    };
    if (this.rowFilter)
      // Semantic on purpose: a violated filter must change the digest and is
      // read by the comparator, which blocks the domain. Status only; the
      // per-runtime counts stay in diagnostics.
      summary.domainFilter = {
        rule: "R13_DOMAIN_ROW_FILTER",
        status: this.unclassifiedCount || this.unexplainedCount ? "VIOLATED" : "CLEAN",
      };
    if (this.breakdownFields.length) {
      summary.breakdown = Object.fromEntries(
        this.breakdownFields.map((field) => [
          field,
          Object.fromEntries(
            Array.from(this.breakdown[field].entries())
              .map(([key, count]) => [key === "\u0000null" ? "null" : key, count])
              .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0)),
          ),
        ]),
      );
    }
    return {
      summary,
      // Private diagnostics: never part of semantic digests or public reports.
      diagnostics: {
        blockRows: this.blockRows,
        rowBlockDigests: this.rowBlockDigests,
        columnBlockDigests,
        samples: this.samples,
        observed: this.observed,
        // Rule R13: counts only (parser class names), published by the parity report.
        exclusions: this.rowFilter
          ? {
              rule: "R13_DOMAIN_ROW_FILTER",
              field: this.rowFilter.field,
              rawRowCount: this.rowCount + this.excludedCount,
              count: this.excludedCount,
              byValue: sortedCounts(this.excluded),
              unclassifiedClassRows: this.unclassifiedCount,
              unclassifiedByValue: sortedCounts(this.unclassified),
              unexplainedRows: this.unexplainedCount,
            }
          : null,
      },
    };
  }
}

/** Convenience for small, already-materialized tables and for tests. */
export function summarizeRows(name, rows, options = {}) {
  const accumulator = new TableAccumulator(name, options);
  for (const row of rows) accumulator.addRow(row);
  return accumulator.finish();
}

/**
 * Column-major entry point (struct of arrays). `columns` maps field -> array
 * (or typed array) of equal length; rows are fed without building row objects
 * beyond one transient object per row.
 */
export function summarizeColumns(name, columns, options = {}) {
  const fields = Object.keys(columns);
  const length = fields.length ? columns[fields[0]].length : 0;
  for (const field of fields)
    if (columns[field].length !== length) throw new CanonicalError("COLUMN_LENGTH_MISMATCH", field);
  const accumulator = new TableAccumulator(name, options);
  const row = {};
  for (let index = 0; index < length; index += 1) {
    for (const field of fields) row[field] = columns[field][index];
    accumulator.addRow(row);
  }
  return accumulator.finish();
}
