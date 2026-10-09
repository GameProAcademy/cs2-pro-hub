import assert from "node:assert/strict";
import { canonicalizeInventory } from "./run_wasm_reference.mjs";

for (const api of ["listGameEvents", "listUpdatedFields"]) {
  const first = canonicalizeInventory(api, ["weapon_fire", "round_end", "player_death"]);
  const second = canonicalizeInventory(api, ["player_death", "weapon_fire", "round_end"]);
  assert.deepEqual(first, ["player_death", "round_end", "weapon_fire"]);
  assert.deepEqual(second, first);
}
const passthrough = [{ tick: 1 }, { tick: 2 }];
assert.equal(canonicalizeInventory("parseTicks", passthrough), passthrough);
assert.throws(
  () => canonicalizeInventory("listGameEvents", ["valid", 42]),
  /WASM_INVENTORY_SHAPE_INVALID/,
);

console.log("A9.1 inventory determinism regression checks PASS");
