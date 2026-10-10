// Evaluates the automatic PUBLIC-FIXTURE regression gate.
//
// This is NOT the A9.1 gate. It runs on the public upstream test demo, its
// artifacts are test_fixture_only, and its report hard-codes every
// authorization lock to false. It exists to catch regressions of the harness
// and of the WASM memory remediation before anyone spends a manual run on the
// real demo.
//
// Output policy: counts, byte figures, digests, fixed labels and booleans only.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { summarizeRows } from "./canonical_schema.mjs";
import { PUBLIC_FIXTURE, decide, locks, sanitizeReport, sha } from "./contracts.mjs";
import {
  WASM_MEMORY_BUDGET_BYTES,
  WASM_PAGE_BYTES,
  decodeMemoryProbe,
  instantiateParser,
  loadPinnedArtifact,
  summarizeColumnTable,
} from "./run_wasm_reference.mjs";

const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const json = (path) => JSON.parse(readFileSync(resolve(path), "utf8"));
const work = resolve(arg("--work"));
const expectations = json(arg("--expectations"));
const surface = json("docs/client-parser/upstream-surface-manifest.json");
const manifest = json(arg("--wasm-manifest"));
const runs = ["python_run_1.json", "python_run_2.json", "wasm_run_1.json", "wasm_run_2.json"].map(
  (name) => json(resolve(work, name)),
);
const parity = json(resolve(work, "parity_report.json"));
const determinism = json(resolve(work, "determinism_report.json"));
const [python1, python2, wasm1, wasm2] = runs;

const checks = [];
const check = (name, pass, detail = {}) =>
  checks.push({ name, status: pass ? "PASS" : "FAIL", ...detail });
const sameSet = (left, right) =>
  left.length === right.length && [...left].sort().join("\n") === [...right].sort().join("\n");
const gc = () => typeof globalThis.gc === "function" && globalThis.gc();

// 1. The four runs are what they claim to be.
check(
  "runs_are_public_fixture_only",
  runs.every(
    (run) =>
      run.status === "SUCCEEDED" &&
      run.test_fixture_only === true &&
      run.executionKind === "PUBLIC_FIXTURE_FULL_FILE" &&
      run.demoSha256 === PUBLIC_FIXTURE.sha256 &&
      run.demoSizeBytes === PUBLIC_FIXTURE.sizeBytes,
  ),
);

// 2. The real gate decision can never be satisfied by these runs.
const realDecision = decide(runs, parity, determinism, surface, manifest);
check(
  "real_gate_decision_stays_locked",
  realDecision.status === "FAIL" &&
    realDecision.reason === "REAL_EXECUTION_NOT_PROVEN" &&
    Object.keys(locks).every((key) => realDecision[key] === false),
  { decision: realDecision.status, reason: realDecision.reason },
);

// 3. Determinism inside each runtime.
check(
  "python_deterministic",
  determinism.pythonDeterministic === true &&
    python1.normalizedResultDigest === python2.normalizedResultDigest,
);
check(
  "wasm_deterministic",
  determinism.wasmDeterministic === true &&
    wasm1.normalizedResultDigest === wasm2.normalizedResultDigest,
);

// 4. Cross-runtime comparison: strict ratchet. The set of diverging domains and
//    tables must be EXACTLY the documented one. A new divergence fails; a
//    divergence that disappears also fails until the expectation is updated in
//    review. Parity itself is reported as measured, never upgraded.
const diagnostics = parity.field_diagnostics;
const failingDomains = parity.comparisons.filter((c) => c.status === "FAIL").map((c) => c.field);
const failingTables = diagnostics.tables.filter((t) => t.status !== "PASS").map((t) => t.table);
const notComparable = parity.comparisons
  .filter((c) => c.status === "NOT_COMPARABLE")
  .map((c) => c.field);
check("field_comparison_ran", diagnostics.table_count > 0 && diagnostics.field_count > 0, {
  tables: diagnostics.table_count,
  fields: diagnostics.field_count,
});
check(
  "canonical_contract_identical",
  diagnostics.canonical_contract.equal === true &&
    diagnostics.envelope_symmetry.symmetric === true &&
    diagnostics.structural_symmetry.symmetric === true,
);
check("diverging_domains_match_ratchet", sameSet(failingDomains, expectations.divergingDomains), {
  observed: failingDomains.sort(),
  expected: [...expectations.divergingDomains].sort(),
});
check("diverging_tables_match_ratchet", sameSet(failingTables, expectations.divergingTables), {
  observed: failingTables.sort(),
  expected: [...expectations.divergingTables].sort(),
});
check(
  "not_comparable_domains_match_ratchet",
  sameSet(notComparable, expectations.notComparableDomains),
  { observed: notComparable.sort(), expected: [...expectations.notComparableDomains].sort() },
);
// Contract rule R13: what the grenade row filter kept out must be exactly the
// measured, documented set. Another class or another count fails.
const exclusions = parity.contract_exclusions ?? [];
const grenadeExclusion = exclusions.find((item) => item.table === "grenades");
const expectedExclusion = expectations.contractExclusions.grenades;
check(
  "contract_exclusions_match_ratchet",
  exclusions.length === 1 &&
    grenadeExclusion?.python_excluded_rows === expectedExclusion.pythonExcludedRows &&
    grenadeExclusion?.wasm_excluded_rows === expectedExclusion.wasmExcludedRows &&
    grenadeExclusion?.python_domain_rows === expectedExclusion.domainRows &&
    grenadeExclusion?.wasm_domain_rows === expectedExclusion.domainRows &&
    sameSet(Object.keys(grenadeExclusion.python_excluded_by_class), expectedExclusion.classes) &&
    sameSet(Object.keys(grenadeExclusion.wasm_excluded_by_class), expectedExclusion.classes),
  { observed: exclusions },
);
check(
  "parity_status_is_reported_not_forced",
  parity.status === (failingDomains.length ? "FAIL" : "PASS"),
  { parityStatus: parity.status },
);

// 5. Memory and time limits of the production path of the harness.
const memory = wasm1.wasmMemoryEvidence;
const grenadeCall = memory?.calls.find((call) => call.api === "parseGrenades");
check(
  "wasm_memory_within_fixture_limit",
  [wasm1, wasm2].every(
    (run) => run.wasmMemoryEvidence?.peakBytes <= expectations.limits.wasmPeakBytes,
  ),
  { peakBytes: memory?.peakBytes ?? null, limitBytes: expectations.limits.wasmPeakBytes },
);
check(
  "grenades_use_column_major_path",
  memory?.grenadeOutput === "COLUMN_MAJOR" &&
    memory?.instancePerCall === true &&
    grenadeCall?.probe?.lastStage === "serialized_to_js" &&
    grenadeCall?.probe?.bytesAfterRowMaterialization === null,
  { probe: grenadeCall?.probe ?? null },
);
check(
  "run_durations_within_limit",
  runs.every((run) => run.durationMs <= expectations.limits.runDurationMs),
  {
    durationsMs: runs.map((run) => Math.round(run.durationMs)),
    limitMs: expectations.limits.runDurationMs,
  },
);

// 6. Equivalence on the fixture itself: the original row-major export and the
//    column-major export of the SAME artifact yield the same canonical table.
const artifact = loadPinnedArtifact(surface, manifest, arg("--wasm-dir"));
const bytes = readFileSync(resolve(arg("--demo")));
if (sha(bytes) !== PUBLIC_FIXTURE.sha256) throw new Error("A91_DEM_SHA256_MISMATCH");
const measure = (exportName, summarize) => {
  const { parser, wasmExports } = instantiateParser(artifact);
  const started = performance.now();
  const table = summarize(parser[exportName](bytes));
  return {
    summary: table.summary,
    figures: {
      wasmBytes: wasmExports.memory.buffer.byteLength,
      probe: decodeMemoryProbe(parser.a91MemoryProbe()),
      durationMs: Math.round(performance.now() - started),
    },
  };
};
const rowMajor = measure("parseGrenades", (value) => summarizeRows("grenades", value));
gc();
const columnMajor = measure("parseGrenadesColumns", (value) =>
  summarizeColumnTable("grenades", value),
);
gc();
check(
  "row_major_and_column_major_are_equivalent",
  rowMajor.summary.tableDigest === columnMajor.summary.tableDigest &&
    rowMajor.summary.rowCount === columnMajor.summary.rowCount &&
    JSON.stringify(rowMajor.summary) === JSON.stringify(columnMajor.summary) &&
    columnMajor.summary.tableDigest === wasm1.grenadeEvidence.table.tableDigest,
  { rows: columnMajor.summary.rowCount, tableDigest: columnMajor.summary.tableDigest },
);
check(
  "column_major_uses_less_wasm_memory",
  columnMajor.figures.wasmBytes < rowMajor.figures.wasmBytes,
  {
    rowMajor: rowMajor.figures,
    columnMajor: columnMajor.figures,
  },
);

// 7. Root-cause regression at the size of the real demo, with synthetic data:
//    the row-major path must still hit the wasm32 4 GiB ceiling inside
//    row materialization, and the column-major path must stay under budget.
//    Synthetic rows prove the memory model only; they prove nothing about the
//    real demo's content.
const synthetic = expectations.syntheticScale;
const runSynthetic = (columns) => {
  const { parser, wasmExports } = instantiateParser(artifact);
  const outcome = { completed: false, errorName: null, errorMessageDigest: null };
  try {
    const value = parser.a91SyntheticGrenadeTable(synthetic.rows, synthetic.ballastBytes, columns);
    outcome.completed = true;
    if (columns) outcome.rows = summarizeColumnTable("grenades", value).summary.rowCount;
  } catch (error) {
    outcome.errorName = error?.name ?? "Error";
    outcome.errorMessageDigest = sha(String(error?.message ?? ""));
  }
  outcome.wasmBytes = wasmExports.memory.buffer.byteLength;
  outcome.probe = decodeMemoryProbe(parser.a91MemoryProbe());
  return outcome;
};
const HARD_LIMIT = 65536 * WASM_PAGE_BYTES;
const syntheticColumns = runSynthetic(true);
gc();
const syntheticRows = runSynthetic(false);
gc();
check(
  "synthetic_row_major_reproduces_4gib_trap",
  syntheticRows.completed === false &&
    syntheticRows.errorName === "RuntimeError" &&
    syntheticRows.errorMessageDigest === sha("unreachable") &&
    syntheticRows.wasmBytes === HARD_LIMIT &&
    syntheticRows.probe?.lastStage === "parsed_columns_built",
  syntheticRows,
);
check(
  "synthetic_column_major_stays_within_budget",
  syntheticColumns.completed === true &&
    syntheticColumns.rows === synthetic.rows &&
    syntheticColumns.wasmBytes <= WASM_MEMORY_BUDGET_BYTES &&
    syntheticColumns.wasmBytes <= expectations.limits.syntheticColumnMajorBytes,
  { ...syntheticColumns, budgetBytes: WASM_MEMORY_BUDGET_BYTES },
);

const failed = checks.filter((item) => item.status !== "PASS");
const report = {
  schema_version: 1,
  gate: "A9.1_PUBLIC_FIXTURE_REGRESSION",
  status: failed.length ? "FAIL" : "PASS",
  // Fixed declarations: this gate authorizes nothing.
  ...locks,
  test_fixture_only: true,
  proves_real_demo: false,
  fixture: PUBLIC_FIXTURE,
  wasmArtifact: {
    bindingSha256: manifest.binding.sha256,
    wasmSha256: manifest.wasm.sha256,
    sourceCommit: manifest.sourceCommit,
  },
  parity: {
    status: parity.status,
    comparablePassCount: parity.comparablePassCount,
    comparableFailCount: parity.comparableFailCount,
    notComparableCount: parity.notComparableCount,
    tableCount: diagnostics.table_count,
    tablePassCount: diagnostics.table_pass_count,
    emptyInBothTableCount: diagnostics.empty_in_both_table_count,
    fieldCount: diagnostics.field_count,
    fieldPassCount: diagnostics.field_pass_count,
    contractExclusions: exclusions,
    divergingDomains: failingDomains.sort(),
    divergingTables: diagnostics.tables
      .filter((table) => table.status !== "PASS")
      .map((table) => ({
        table: table.table,
        divergenceClasses: table.divergence_classes,
        pythonRowCount: table.python_row_count,
        wasmRowCount: table.wasm_row_count,
      })),
  },
  determinism: {
    status: determinism.status,
    pythonDigest: python1.normalizedResultDigest,
    wasmDigest: wasm1.normalizedResultDigest,
  },
  wasmMemoryByApi: Object.fromEntries(
    [...new Set((memory?.calls ?? []).map((call) => call.api))].map((api) => [
      api,
      Math.max(...memory.calls.filter((call) => call.api === api).map((call) => call.finalBytes)),
    ]),
  ),
  checks,
  failedChecks: failed.map((item) => item.name),
};
writeFileSync(resolve(arg("--output")), sanitizeReport(report));
for (const item of checks) console.log(`A91_PUBLIC_FIXTURE_CHECK ${item.name}=${item.status}`);
console.log(`A91_PUBLIC_FIXTURE_GATE=${report.status} (test fixture only; authorizes nothing)`);
process.exitCode = failed.length ? 1 : 0;
