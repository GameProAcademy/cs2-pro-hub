// Cross-runtime contract check (no parser, no DEM, no network).
//
// The Python evidence is built by shared_fixture_python.py with the real
// Python producer functions and Python-native carriers; the WASM-side evidence
// is built here with the real JavaScript producer functions and the carriers
// the WASM wrapper hands over (Map rows, decimal-string 64-bit ids, undefined
// for None, an event_name discriminator on event rows). Identical semantics
// must PASS; every intentional divergence must FAIL with the right class and
// field. A comparator that cannot fail these cases is not a gate.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_CONTRACT_DIGEST,
  CANONICAL_CONTRACT_VERSION,
  summarizeRows,
} from "./canonical_schema.mjs";
import { decode } from "./canonical_vectors.mjs";
import { DOMAINS, parityReport } from "./parity.mjs";
import {
  buildSemanticEvidence,
  normalizeEventRows,
  normalizeWasmValue,
} from "./run_wasm_reference.mjs";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const fixture = JSON.parse(readFileSync(here("./canonical/shared_fixture.json"), "utf8"));
const SHA = "0".repeat(64);
const clone = (value) => JSON.parse(JSON.stringify(value));

function pythonArtifact(mutation = null) {
  const args = [here("./shared_fixture_python.py")];
  if (mutation) args.push(JSON.stringify(mutation));
  const result = spawnSync("python3", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

/** Shape rows the way serde-wasm-bindgen delivers them. */
function wasmRows(rows, eventName = null) {
  return rows.map((row) => {
    const map = new Map();
    for (const [key, value] of Object.entries(decode(row)))
      map.set(key, typeof value === "number" && Number.isNaN(value) ? undefined : value);
    if (eventName) map.set("event_name", eventName);
    return map;
  });
}

function wasmArtifact(source = fixture, mutate = null) {
  const diagnostics = {};
  const table = (name, rows, eventName = null) => {
    let normalized = normalizeWasmValue(wasmRows(rows, eventName));
    if (eventName) normalized = normalizeEventRows(normalized, eventName);
    const result = summarizeRows(name, normalized);
    diagnostics[name] = result.diagnostics;
    return result.summary;
  };
  const events = Object.entries(source.events).map(([eventName, rows]) => ({
    eventName,
    status: "SUCCEEDED",
    table: table(`event:${eventName}`, rows, eventName),
  }));
  const grenades = table("grenades", source.grenades);
  const ticks = table("ticks", source.ticks);
  const artifact = {
    runtime: "WASM",
    canonicalContract: { version: CANONICAL_CONTRACT_VERSION, digest: CANONICAL_CONTRACT_DIGEST },
    ...buildSemanticEvidence({
      header: source.header,
      events,
      grenades,
      ticks,
      tickProbe: source.tickProbe,
      requestedFields: source.requestedFields,
      wantedTicks: source.tickProbe.wantedTicks,
    }),
    playerInventory: { status: "NOT_AVAILABLE_ON_WASM" },
    domainAvailability: {
      players: "NOT_AVAILABLE_ON_WASM",
      player_identity: "NOT_AVAILABLE_ON_WASM",
    },
    tableDiagnostics: diagnostics,
    normalizedResult: {
      header: source.header,
      events,
      grenades,
      ticks,
      playerIdentity: { status: "NOT_AVAILABLE_ON_WASM" },
    },
  };
  if (mutate) mutate(artifact);
  return artifact;
}

const python = pythonArtifact();
const domainStatus = (report) =>
  Object.fromEntries(report.comparisons.map((c) => [c.field, c.status]));
const tableVerdict = (report, name) =>
  report.field_diagnostics.tables.find((item) => item.table === name);
const fieldVerdict = (report, table, field) =>
  tableVerdict(report, table).fields.find((item) => item.field === field);

// 1) Identical semantics, different native carriers: everything comparable passes.
{
  const report = parityReport(python, wasmArtifact(), SHA);
  assert.equal(report.status, "PASS", JSON.stringify(report.field_diagnostics.first_divergence));
  const statuses = domainStatus(report);
  for (const domain of DOMAINS) {
    const expected = ["players", "player_identity"].includes(domain) ? "NOT_COMPARABLE" : "PASS";
    assert.equal(statuses[domain], expected, domain);
  }
  assert.equal(report.field_diagnostics.envelope_symmetry.symmetric, true);
  assert.equal(report.field_diagnostics.structural_symmetry.symmetric, true);
  assert.equal(report.field_diagnostics.canonical_contract.equal, true);
  assert.equal(report.field_diagnostics.table_fail_count, 0);
  assert.equal(report.field_diagnostics.empty_in_both_table_count, 1); // bomb_planted
  assert.equal(
    report.crossRuntimeComparableFieldCount,
    report.crossRuntimeComparableFieldPassCount,
  );
  assert.ok(report.crossRuntimeComparableFieldCount > 30);
  // The public report must not leak row values: only names, classes, counts, digests.
  const text = JSON.stringify(report);
  for (const secret of [
    "76561198012345679",
    "76561198012345680",
    "alpha",
    "bravo",
    "charlie",
    "ak47",
  ])
    assert.equal(text.includes(secret), false, `public report leaks ${secret}`);
}

// 2) Key order inside rows is irrelevant.
{
  const source = clone(fixture);
  source.ticks = source.ticks.map((row) => Object.fromEntries(Object.entries(row).reverse()));
  assert.equal(parityReport(python, wasmArtifact(source), SHA).status, "PASS");
}

// 3) Every intentional divergence fails, in the right place, for the right reason.
const cases = [
  {
    name: "Steam ID off by one (the precision-loss failure mode)",
    mutate: (s) => (s.ticks[0].steamid = { $: "u64", v: "76561198012345680" }),
    table: "ticks",
    field: "steamid",
    divergence: "VALUE",
    domains: ["tick_properties", "game_state"],
  },
  {
    name: "null versus zero",
    mutate: (s) => (s.ticks[2].health = null),
    table: "ticks",
    field: "health",
    divergence: "NULLABILITY",
    domains: ["tick_properties", "game_state"],
  },
  {
    name: "zero versus null in an economy field",
    mutate: (s) => (s.ticks[2].balance = null),
    table: "ticks",
    field: "balance",
    divergence: "NULLABILITY",
    domains: ["economy", "tick_properties", "game_state"],
  },
  {
    name: "string versus number",
    mutate: (s) => (s.events.player_death[0].dmg_health = "100"),
    table: "event:player_death",
    field: "dmg_health",
    divergence: "TYPE",
    domains: ["events", "deaths", "game_state"],
  },
  {
    name: "float rounding",
    mutate: (s) => (s.grenades[0].x = { $: "f64", v: "-388.87500000000006" }),
    table: "grenades",
    field: "x",
    divergence: "VALUE",
    domains: ["grenades", "game_state"],
  },
  {
    name: "empty string versus null",
    mutate: (s) => (s.events.player_death[1].weapon = null),
    table: "event:player_death",
    field: "weapon",
    divergence: "NULLABILITY",
    domains: ["events", "deaths", "game_state"],
  },
  {
    name: "rows out of order",
    mutate: (s) => s.events.weapon_fire.reverse(),
    table: "event:weapon_fire",
    field: "tick",
    divergence: "ROW_ORDER",
    domains: ["events", "weapons", "game_state"],
  },
  {
    name: "one of two identical rows missing",
    mutate: (s) => s.events.player_hurt.splice(1, 1),
    table: "event:player_hurt",
    field: "dmg_health",
    divergence: "ROW_COUNT",
    domains: ["events", "damage", "game_state"],
  },
  {
    name: "extra field in one runtime",
    mutate: (s) => s.events.round_end.forEach((row) => (row.legacy = 1)),
    table: "event:round_end",
    field: "legacy",
    divergence: "FIELD_PRESENCE",
    domains: ["events", "rounds", "game_state"],
  },
  {
    name: "field missing from the whole table versus present-with-null",
    mutate: (s) => s.events.player_death.forEach((row) => delete row.assister_name),
    table: "event:player_death",
    field: "assister_name",
    divergence: "FIELD_PRESENCE",
    domains: ["events", "deaths", "game_state"],
  },
  {
    name: "empty list versus null",
    mutate: (s) => (s.events.round_start[0].timelimit = []),
    table: "event:round_start",
    field: "timelimit",
    divergence: "TYPE",
    domains: ["events", "rounds", "game_state"],
  },
  {
    name: "empty table versus one row",
    mutate: (s) => s.events.bomb_planted.push({ tick: 300, site: 1 }),
    table: "event:bomb_planted",
    field: "tick",
    divergence: "FIELD_PRESENCE",
    domains: ["events", "bomb", "game_state"],
  },
];
for (const item of cases) {
  const source = clone(fixture);
  item.mutate(source);
  const report = parityReport(python, wasmArtifact(source), SHA);
  assert.equal(report.status, "FAIL", item.name);
  const statuses = domainStatus(report);
  for (const domain of item.domains)
    assert.equal(statuses[domain], "FAIL", `${item.name}: ${domain}`);
  for (const domain of ["header", "map", "tickrate", "playback_ticks"])
    assert.equal(statuses[domain], "PASS", `${item.name}: ${domain} must be unaffected`);
  const verdict = fieldVerdict(report, item.table, item.field);
  assert.ok(verdict, `${item.name}: field verdict missing`);
  assert.equal(verdict.status, "FAIL", item.name);
  assert.equal(verdict.divergence, item.divergence, item.name);
  assert.equal(report.field_diagnostics.first_divergence.table, item.table, item.name);
}

// 4) Header divergence is reported per key.
{
  const source = clone(fixture);
  source.header.map_name = "de_other";
  const report = parityReport(python, wasmArtifact(source), SHA);
  assert.equal(domainStatus(report).header, "FAIL");
  assert.equal(domainStatus(report).map, "FAIL");
  const key = report.field_diagnostics.header.fields.find((item) => item.field === "map_name");
  assert.equal(key.divergence, "VALUE");
}

// 5) An event row tagged with the wrong event fails closed before comparison.
assert.throws(
  () =>
    summarizeRows(
      "event:x",
      normalizeEventRows(normalizeWasmValue(wasmRows([{ tick: 1 }], "other")), "x"),
    ),
  /A91_WASM_EVENT_NAME_MISMATCH/,
);

// 6) Regression guard for commit 3941fae: call metadata inside the semantic
//    envelope of ONE runtime. Rows are identical, yet the gate must fail AND say why.
{
  const report = parityReport(
    pythonArtifact({ pythonEnvelopeExtraKey: true }),
    wasmArtifact(),
    SHA,
  );
  assert.equal(report.status, "FAIL");
  assert.equal(report.field_diagnostics.envelope_symmetry.symmetric, false);
  assert.equal(report.field_diagnostics.table_fail_count, 0); // the data is equal; the envelope is not
  assert.ok(
    report.field_diagnostics.envelope_symmetry.issues.every(
      (issue) =>
        issue.python_keys.includes("requestedPlayerFields") &&
        !issue.wasm_keys.includes("requestedPlayerFields"),
    ),
  );
}

// 7) Different contract versions are BLOCKED, never compared.
{
  const report = parityReport(
    python,
    wasmArtifact(fixture, (artifact) => {
      artifact.grenadeEvidence.table = {
        ...artifact.grenadeEvidence.table,
        canonicalContractVersion: 2,
      };
    }),
    SHA,
  );
  assert.equal(report.status, "FAIL");
  assert.equal(tableVerdict(report, "grenades").status, "BLOCKED");
}

console.log(
  `A9.1 cross-runtime contract checks PASS (${cases.length} intentional divergences detected, contract v${CANONICAL_CONTRACT_VERSION})`,
);
