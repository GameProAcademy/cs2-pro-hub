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
  // Rule R13: rows outside the domain are counted by class, never dropped
  // silently, and each must be explainable as the documented anomaly.
  const exclusionFacts = (item) => {
    const { rule: _rule, field: _field, ...facts } = item;
    return facts;
  };
  if (write && diagnostics.exclusions)
    vector.expectedExclusions = exclusionFacts(diagnostics.exclusions);
  if (diagnostics.exclusions) {
    assert.deepEqual(
      exclusionFacts(diagnostics.exclusions),
      vector.expectedExclusions,
      vector.name,
    );
    assert.equal(diagnostics.exclusions.rawRowCount, rows.length);
    assert.equal(summary.rowCount + diagnostics.exclusions.count, rows.length);
    assert.deepEqual(exclusionFacts(columnar.diagnostics.exclusions), vector.expectedExclusions);
    assert.equal(
      summary.domainFilter.status,
      diagnostics.exclusions.unclassifiedClassRows || diagnostics.exclusions.unexplainedRows
        ? "VIOLATED"
        : "CLEAN",
    );
    assert.equal(
      summary.domainFilter.status,
      vector.name.includes("VIOLATED") ? "VIOLATED" : "CLEAN",
    );
  } else {
    assert.equal(vector.expectedExclusions, undefined);
    assert.equal(summary.domainFilter, undefined);
    assert.equal(summary.rowCount, rows.length);
  }
}
if (write) writeFileSync(path, `${JSON.stringify(vectors, null, 2)}\n`);

// Rule R13 is fail-closed and scoped.
for (const bad of [
  { tick: 1, grenade_entity_id: 1 },
  { grenade_type: null, grenade_entity_id: 1 },
  { grenade_type: 7, grenade_entity_id: 1 },
])
  assert.throws(() => summarizeRows("grenades", [bad]), /DOMAIN_FILTER_FIELD_INVALID/);
// An excluded row without a usable entity id cannot be explained: abort.
for (const bad of [
  { grenade_type: "CKnife" },
  { grenade_type: "CKnife", grenade_entity_id: null },
  { grenade_type: "CKnife", grenade_entity_id: "8" },
  { grenade_type: "CKnife", grenade_entity_id: 1.5 },
])
  assert.throws(() => summarizeRows("grenades", [bad]), /DOMAIN_FILTER_ENTITY_ID_INVALID/);
{
  const grenade = (type, id, tick) => ({ grenade_type: type, grenade_entity_id: id, tick });
  // Known anomaly: non-grenade equipment class on an id that was a grenade before.
  const clean = summarizeRows("grenades", [
    grenade("CHEGrenade", 5, 1),
    grenade("CKnife", 5, 2),
    grenade("CWeaponGlock", 5, 3),
    grenade("CC4", 5, 4),
    grenade("CFlashbang", 6, 5),
  ]);
  assert.equal(clean.summary.rowCount, 2);
  assert.equal(clean.summary.domainFilter.status, "CLEAN");
  assert.deepEqual(clean.diagnostics.exclusions.byValue, { CC4: 1, CKnife: 1, CWeaponGlock: 1 });
  // The prior row must come BEFORE; a later grenade row does not explain it.
  const tooLate = summarizeRows("grenades", [grenade("CKnife", 5, 1), grenade("CHEGrenade", 5, 2)]);
  assert.equal(tooLate.summary.domainFilter.status, "VIOLATED");
  assert.equal(tooLate.diagnostics.exclusions.unexplainedRows, 1);
  // A class outside the anomaly allowlist is never excluded quietly, even on a
  // reused id, and "Player" classes are not grenades.
  for (const type of ["CChicken", "CPlantedC4", "CCSPlayerPawnGrenadeHolder", "CInferno"]) {
    const result = summarizeRows("grenades", [grenade("CHEGrenade", 5, 1), grenade(type, 5, 2)]);
    assert.equal(result.summary.domainFilter.status, "VIOLATED", type);
    assert.deepEqual(result.diagnostics.exclusions.unclassifiedByValue, { [type]: 1 });
  }
  // The status is part of the semantic summary: it changes the digest input.
  assert.notDeepEqual(clean.summary.domainFilter, tooLate.summary.domainFilter);
  // Tables without a declared filter are never filtered.
  const untouched = summarizeRows("event:weapon_fire", [grenade("CKnife", 5, 1)]);
  assert.equal(untouched.summary.rowCount, 1);
  assert.equal(untouched.diagnostics.exclusions, null);
  assert.equal(untouched.summary.domainFilter, undefined);
  // Every grenade class the pinned parser can emit as a projectile stays in the
  // domain; the filter is exactly the upstream predicate (entities.rs:388).
  for (const type of [
    "CSmokeGrenade",
    "CSmokeGrenadeProjectile",
    "CHEGrenade",
    "CHEGrenadeProjectile",
    "CFlashbang",
    "CFlashbangProjectile",
    "CMolotovGrenade",
    "CMolotovProjectile",
    "CIncendiaryGrenade",
    "CDecoyGrenade",
    "CDecoyProjectile",
    "CBaseCSGrenadeProjectile",
  ])
    assert.equal(summarizeRows("grenades", [grenade(type, 1, 1)]).summary.rowCount, 1, type);
  const filter = CONTRACT.domainRowFilters.grenades;
  assert.deepEqual(filter.includeAnySubstring, ["Projectile", "Grenade", "Flash"]);
  assert.deepEqual(filter.excludeAnySubstring, ["Player"]);
  assert.equal(filter.knownAnomaly.requirePriorDomainRowForEntityId, true);
  // No anomaly class may overlap the domain predicate.
  for (const name of [...filter.knownAnomaly.classExact, ...filter.knownAnomaly.classPrefixes])
    assert.equal(
      filter.includeAnySubstring.some((part) => name.includes(part)),
      false,
      name,
    );
}

console.log(
  `A9.1 canonical contract v${CANONICAL_CONTRACT_VERSION} JavaScript vector checks PASS (${vectors.values.length} values, ${vectors.tables.length} tables)`,
);
