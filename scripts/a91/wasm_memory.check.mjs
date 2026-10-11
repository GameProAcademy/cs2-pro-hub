// Artifact-independent regression checks for the P1 WASM memory remediation.
// Everything here runs without a WASM binary or a DEM file.
import assert from "node:assert/strict";
import { summarizeRows } from "./canonical_schema.mjs";
import {
  FIXTURE,
  PUBLIC_FIXTURE,
  decide,
  digest,
  fixtureProfile,
  locks,
  validateMetadata,
} from "./contracts.mjs";
import { createTelemetry, failureEvidence } from "./diagnostics.mjs";
import {
  WASM_MEMORY_BUDGET_BYTES,
  WASM_PAGE_BYTES,
  decodeMemoryProbe,
  normalizeEventRows,
  normalizeWasmValue,
  summarizeColumnTable,
  summarizeEventRows,
} from "./run_wasm_reference.mjs";

const HARD_LIMIT = 65536 * WASM_PAGE_BYTES;

// 1. Streaming event summary == the previous copy-everything pipeline.
{
  const row = (index, name = "weapon_fire") =>
    new Map([
      ["event_name", name],
      ["tick", index * 7],
      ["user_steamid", "76561198012345679"],
      ["user_name", index % 3 === 0 ? null : `p${index % 5}`],
      ["weapon", "weapon_ak47"],
      ["silenced", index % 2 === 0],
      ...(index % 4 === 0 ? [] : [["user_X", index * 0.125]]),
    ]);
  const rows = Array.from({ length: 9000 }, (_, index) => row(index));
  const streamed = summarizeEventRows("event:weapon_fire", rows, "weapon_fire");
  const copied = summarizeRows(
    "event:weapon_fire",
    normalizeEventRows(normalizeWasmValue(rows), "weapon_fire"),
  );
  assert.deepEqual(streamed.summary, copied.summary);
  assert.deepEqual(streamed.diagnostics, copied.diagnostics);
  assert.equal(streamed.summary.rowCount, 9000);
  assert.ok(!streamed.summary.fields.includes("event_name"));
  // Plain-object rows (serializer configured for objects) are equivalent too.
  const objects = rows.map((item) => Object.fromEntries(item));
  assert.equal(
    summarizeEventRows("event:weapon_fire", objects, "weapon_fire").summary.tableDigest,
    streamed.summary.tableDigest,
  );
  // Rule R10 stays fail-closed: one foreign row poisons the table.
  const poisoned = rows.slice(0, 10).concat([row(11, "player_death")]);
  assert.throws(
    () => summarizeEventRows("event:weapon_fire", poisoned, "weapon_fire"),
    /A91_WASM_EVENT_NAME_MISMATCH/,
  );
  assert.throws(
    () => summarizeEventRows("event:weapon_fire", [42], "weapon_fire"),
    /A91_WASM_EVENT_ROW_INVALID/,
  );
  assert.throws(
    () => summarizeEventRows("event:weapon_fire", {}, "weapon_fire"),
    /A91_WASM_EVENT_SHAPE_INVALID/,
  );
}

// 2. Column-major grenade table == row-major table, including null/absent,
//    u64 identifiers and float coordinates.
{
  const count = 10000;
  const kinds = ["CSmokeGrenadeProjectile", "CSmokeGrenade", "CFlashbang"];
  const rows = [];
  const columns = new Map(
    ["grenade_entity_id", "grenade_type", "name", "steamid", "tick", "x", "y", "z"].map((key) => [
      key,
      [],
    ]),
  );
  for (let index = 0; index < count; index += 1) {
    const projectile = index % 3 === 0;
    const full = {
      grenade_entity_id: index % 512,
      grenade_type: kinds[index % 3],
      name: `player${index % 10}`,
      steamid: String(76561198012345679n + BigInt(index % 10)),
      tick: Math.floor(index / 40),
      x: projectile ? index * 0.25 : null,
      y: projectile ? index * 0.25 + 1.5 : null,
      z: projectile ? index * 0.25 - 3 : null,
    };
    for (const [key, value] of Object.entries(full)) columns.get(key).push(value);
    // The row-major wrapper omits None (serde_wasm_bindgen -> undefined).
    rows.push(
      new Map(
        Object.entries(full).map(([key, value]) => [key, value === null ? undefined : value]),
      ),
    );
  }
  const columnar = summarizeColumnTable("grenades", columns);
  const rowMajor = summarizeRows("grenades", rows);
  assert.deepEqual(columnar.summary, rowMajor.summary);
  assert.equal(columnar.summary.rowCount, count);
  // A single changed cell must change the digest (the comparison stays strict).
  columns.get("x")[3] = 0.75000001;
  assert.notEqual(
    summarizeColumnTable("grenades", columns).summary.tableDigest,
    rowMajor.summary.tableDigest,
  );
  assert.throws(() => summarizeColumnTable("grenades", [1, 2]), /A91_WASM_TABLE_SHAPE_INVALID/);
  assert.throws(
    () => summarizeColumnTable("grenades", new Map([["tick", "not-a-column"]])),
    /A91_WASM_TABLE_SHAPE_INVALID/,
  );
  assert.throws(
    () =>
      summarizeColumnTable(
        "grenades",
        new Map([
          ["tick", [1, 2]],
          ["x", [1]],
        ]),
      ),
    /COLUMN_LENGTH_MISMATCH/,
  );
}

// 3. Probe decoding: fixed stage labels, bytes derived from pages.
{
  assert.equal(decodeMemoryProbe(null), null);
  assert.equal(decodeMemoryProbe(new Uint32Array(3)), null);
  const trap = decodeMemoryProbe(Uint32Array.from([2, 4550843, 65536, 7300, 41000, 0, 0]));
  assert.deepEqual(trap, {
    lastStage: "parsed_columns_built",
    rows: 4550843,
    bytesNow: HARD_LIMIT,
    bytesAfterInputCopy: 7300 * WASM_PAGE_BYTES,
    bytesAfterParse: 41000 * WASM_PAGE_BYTES,
    bytesAfterRowMaterialization: null,
    bytesAfterSerialization: null,
  });
  assert.equal(decodeMemoryProbe(Uint32Array.from([99, 0, 0, 0, 0, 0, 0])).lastStage, "unknown");
  assert.ok(WASM_MEMORY_BUDGET_BYTES < HARD_LIMIT);
}

// 4. A budget overrun is its own classified reason and carries the probe;
//    it is not folded into a generic trap or resource failure.
{
  const telemetry = createTelemetry();
  const probe = decodeMemoryProbe(Uint32Array.from([5, 10, 50000, 100, 200, 0, 50000]));
  let failure;
  try {
    telemetry.step(
      "parse_grenades",
      () => {
        const error = new Error("WASM_MEMORY_BUDGET_EXCEEDED");
        error.wasmMemoryBytesBefore = 1;
        error.wasmMemoryBytesAfter = 50000 * WASM_PAGE_BYTES;
        error.wasmProbe = probe;
        throw error;
      },
      true,
    );
  } catch (error) {
    failure = failureEvidence(error);
  }
  assert.equal(failure.reason, "WASM_MEMORY_BUDGET_EXCEEDED");
  assert.equal(failure.failedStage, "parse_grenades");
  assert.deepEqual(failure.wasmProbe, probe);
  assert.equal(failure.wasmMemoryBytesAfter, 50000 * WASM_PAGE_BYTES);
}

// 5. The public fixture is a separate authorization profile that can never
//    satisfy the real gate decision.
{
  assert.equal(fixtureProfile(FIXTURE.authorizationRef).testFixtureOnly, false);
  const profile = fixtureProfile(PUBLIC_FIXTURE.authorizationRef);
  assert.equal(profile.testFixtureOnly, true);
  assert.equal(profile.executionKind, "PUBLIC_FIXTURE_FULL_FILE");
  assert.throws(() => fixtureProfile("anything-else"), /AUTHORIZATION_MISMATCH/);
  // Profiles do not mix: public bytes under the real reference are rejected.
  assert.throws(
    () =>
      validateMetadata(
        PUBLIC_FIXTURE.filename,
        PUBLIC_FIXTURE.sizeBytes,
        PUBLIC_FIXTURE.sha256,
        FIXTURE.authorizationRef,
      ),
    /AUTHORIZATION_MISMATCH/,
  );
  assert.throws(
    () =>
      validateMetadata(
        FIXTURE.filename,
        FIXTURE.sizeBytes,
        FIXTURE.sha256,
        PUBLIC_FIXTURE.authorizationRef,
      ),
    /AUTHORIZATION_MISMATCH/,
  );
  validateMetadata(
    PUBLIC_FIXTURE.filename,
    PUBLIC_FIXTURE.sizeBytes,
    PUBLIC_FIXTURE.sha256,
    PUBLIC_FIXTURE.authorizationRef,
  );
  const normalizedResult = { value: 1 };
  const run = (runtime, index, overrides) => ({
    ...locks,
    runtime,
    runId: `public-${index}`,
    status: "SUCCEEDED",
    executionKind: "REAL_DEM_FULL_FILE",
    test_fixture_only: false,
    demoSha256: FIXTURE.sha256,
    demoSizeBytes: FIXTURE.sizeBytes,
    normalizedResult,
    normalizedResultDigest: digest(normalizedResult),
    resultDigest: digest(normalizedResult),
    ...overrides,
  });
  const cases = [
    { test_fixture_only: true },
    { executionKind: profile.executionKind },
    { demoSha256: PUBLIC_FIXTURE.sha256 },
    { demoSizeBytes: PUBLIC_FIXTURE.sizeBytes },
  ];
  for (const overrides of cases) {
    const runs = ["PYTHON", "PYTHON", "WASM", "WASM"].map((runtime, index) =>
      run(runtime, index, overrides),
    );
    const decision = decide(runs, null, null, { provenance: {} }, {});
    assert.equal(decision.status, "FAIL");
    assert.equal(decision.reason, "REAL_EXECUTION_NOT_PROVEN");
    assert.equal(decision.canonicalAuthorization, false);
  }
}

console.log("A9.1 WASM memory remediation checks PASS");
