import assert from "node:assert/strict";
import { deriveDemoTickProbe } from "./run_wasm_reference.mjs";

function varint(value) {
  value >>>= 0;
  const out = [];
  while (value > 0x7f) {
    out.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  out.push(value);
  return out;
}

function frame(command, tick, payload = [0]) {
  return [...varint(command), ...varint(tick), ...varint(payload.length), ...payload];
}

function makeDemo() {
  const prefix = new Uint8Array(16);
  prefix.set([0x50, 0x42, 0x44, 0x45, 0x4d, 0x53, 0x32, 0x00], 0);
  prefix.set([2, 0, 0, 0], 8);
  const suffix = [
    ...frame(1, 0, [0x01, 0x02, 0x03]),
    ...frame(3, 100),
    ...frame(3, 200),
    ...frame(4, 0xffffffff, []),
  ];
  const bytes = new Uint8Array(prefix.length + suffix.length);
  bytes.set(prefix, 0);
  bytes.set(suffix, prefix.length);
  return bytes;
}

const demo = makeDemo();
const probe = deriveDemoTickProbe(demo);
assert.equal(probe.source, "DEM_FRAME_HEADER_SCAN");
assert.equal(probe.maxFrameTick, 200);
assert.deepEqual(probe.wantedTicks, [0, 100, 199]);
assert.equal(probe.frameCount, 4);
assert.equal(probe.authoritativeDomain, false);

assert.throws(
  () => deriveDemoTickProbe(new Uint8Array(64)),
  /A91_DEMO_FRAME_SCAN_INVALID/
);
assert.throws(
  () => deriveDemoTickProbe(demo.slice(0, -2)),
  /A91_DEMO_FRAME_SCAN_INVALID/
);

process.stdout.write("A9.1 WASM DEM tick-probe regression tests PASS\n");
