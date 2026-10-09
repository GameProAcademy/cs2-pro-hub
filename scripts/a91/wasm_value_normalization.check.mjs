import assert from "node:assert/strict";
import vm from "node:vm";
import { normalizeWasmValue } from "./run_wasm_reference.mjs";

const foreignContext = vm.createContext({});
const input = vm.runInContext(
  'new Map([["tick", 123], ["event_name", "player_death"], ["nested", new Map([["attacker_name", "player-a"], ["damage", 87]])], ["rows", [new Map([["x", 1.5], ["y", 2.5]])]]])',
  foreignContext,
);

const actual = normalizeWasmValue(input);
assert.deepEqual(actual, {
  tick: 123,
  event_name: "player_death",
  nested: { attacker_name: "player-a", damage: 87 },
  rows: [{ x: 1.5, y: 2.5 }],
});
assert.deepEqual(
  normalizeWasmValue([new Map([["map_name", "de_cache"]])]),
  [{ map_name: "de_cache" }],
);
assert.deepEqual(
  normalizeWasmValue(new Map([["missing_field", undefined]])),
  { missing_field: null },
);
assert.equal(normalizeWasmValue(undefined), null);
assert.equal(normalizeWasmValue(null), null);
assert.equal(normalizeWasmValue("value"), "value");
assert.deepEqual(normalizeWasmValue(new Uint8Array([1, 2, 3])), [1, 2, 3]);

process.stdout.write("A91_WASM_MAP_NORMALIZATION_PASS\\n");
