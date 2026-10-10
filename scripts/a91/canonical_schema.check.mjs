// Shared-vector conformance for the JavaScript canonicalizer. The Python
// implementation runs the same file (test_canonical_schema.py); both must
// reproduce every expected text, class, error and table digest byte for byte.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { decode } from "./canonical_vectors.mjs";
import {
  CANONICAL_CONTRACT_VERSION,
  CONTRACT,
  CanonicalError,
  canonicalizeValue,
  summarizeColumns,
  summarizeRows,
} from "./canonical_schema.mjs";

const path = new URL("./canonical/vectors.json", import.meta.url);
const vectors = JSON.parse(readFileSync(path, "utf8"));
assert.equal(vectors.canonicalContractVersion, CANONICAL_CONTRACT_VERSION);
for (const vector of vectors.values) {
  const input = decode(vector.input);
  if (vector.error) {
    assert.throws(
      () => canonicalizeValue(input, vector.field),
      (error) => error instanceof CanonicalError && error.code === vector.error,
      vector.name,
    );
  } else {
    assert.deepEqual(
      canonicalizeValue(input, vector.field),
      { text: vector.text, cls: vector.cls },
      vector.name,
    );
  }
}

const write = process.argv.includes("--write-expected");
for (const vector of vectors.tables) {
  const rows = vector.rows.map(decode);
  const options = vector.blockRows ? { blockRows: vector.blockRows } : {};
  const { summary, diagnostics } = summarizeRows(vector.table, rows, options);
  if (write) vector.expected = summary;
  assert.deepEqual(summary, vector.expected, vector.name);
  // Column-major (struct of arrays) input must give the identical summary.
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const columns = Object.fromEntries(
    fields.map((field) => [field, rows.map((row) => (field in row ? row[field] : undefined))]),
  );
  const columnar = summarizeColumns(vector.table, columns, options);
  if (rows.length && fields.every((field) => field in rows[0]))
    assert.deepEqual(columnar.summary, summary, `${vector.name} (columnar)`);
  assert.equal(diagnostics.samples.length, Math.min(summary.rowCount, 256));
  // Rule R13: rows outside the domain are counted by value, never dropped silently.
  if (write && diagnostics.exclusions)
    vector.expectedExclusions = {
      count: diagnostics.exclusions.count,
      byValue: diagnostics.exclusions.byValue,
    };
  if (diagnostics.exclusions) {
    assert.deepEqual(
      { count: diagnostics.exclusions.count, byValue: diagnostics.exclusions.byValue },
      vector.expectedExclusions,
      `${vector.name} (exclusions)`,
    );
    assert.equal(summary.rowCount + diagnostics.exclusions.count, rows.length);
    assert.deepEqual(
      {
        count: columnar.diagnostics.exclusions.count,
        byValue: columnar.diagnostics.exclusions.byValue,
      },
      vector.expectedExclusions,
    );
  } else {
    assert.equal(vector.expectedExclusions, undefined);
    assert.equal(summary.rowCount, rows.length);
  }
}

// Rule R13 is fail-closed and scoped: a missing/non-string filter field aborts
// the table, and tables without a declared filter are never filtered.
for (const bad of [{ tick: 1 }, { grenade_type: null, tick: 1 }, { grenade_type: 7, tick: 1 }])
  assert.throws(() => summarizeRows("grenades", [bad]), /DOMAIN_FILTER_FIELD_INVALID/);
{
  const rows = [
    { grenade_type: "CKnife", tick: 1 },
    { grenade_type: "CCSPlayerPawnGrenadeHolder", tick: 2 },
    { grenade_type: "CFlashbang", tick: 3 },
  ];
  const filtered = summarizeRows("grenades", rows);
  assert.equal(filtered.summary.rowCount, 1);
  assert.deepEqual(filtered.diagnostics.exclusions.byValue, {
    CCSPlayerPawnGrenadeHolder: 1,
    CKnife: 1,
  });
  const untouched = summarizeRows("event:weapon_fire", rows);
  assert.equal(untouched.summary.rowCount, 3);
  assert.equal(untouched.diagnostics.exclusions, null);
  // The filter is exactly the contract's declaration (upstream entities.rs:388).
  assert.deepEqual(CONTRACT.domainRowFilters, {
    grenades: {
      field: "grenade_type",
      includeAnySubstring: ["Projectile", "Grenade", "Flash"],
      excludeAnySubstring: ["Player"],
      source: CONTRACT.domainRowFilters.grenades.source,
      excludedRowsReport: "COUNT_BY_VALUE_PER_RUNTIME",
    },
  });
}
if (write) writeFileSync(path, `${JSON.stringify(vectors, null, 2)}\n`);
console.log(
  `A9.1 canonical contract v${CANONICAL_CONTRACT_VERSION} JavaScript vector checks PASS (${vectors.values.length} values, ${vectors.tables.length} tables)`,
);
