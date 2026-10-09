import assert from "node:assert/strict";
import { getHeaderProbeBytes } from "./run_wasm_reference.mjs";

function writeVarint(bytes, offset, value) {
  while (value > 0x7f) {
    bytes[offset++] = (value & 0x7f) | 0x80;
    value >>>= 7;
  }
  bytes[offset++] = value;
  return offset;
}

const payload = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35]);
const fullDemo = new Uint8Array(16 + 3 + payload.length + 1 + 128);
fullDemo.set([0x50, 0x42, 0x44, 0x45, 0x4d, 0x53, 0x32, 0x00], 0); // PBDEMS2\0
let offset = 16;
offset = writeVarint(fullDemo, offset, 1); // DEM_FileHeader
offset = writeVarint(fullDemo, offset, 0); // tick
offset = writeVarint(fullDemo, offset, payload.length);
fullDemo.set(payload, offset);

const probe = getHeaderProbeBytes(fullDemo);
assert.equal(probe.byteLength, offset + payload.length + 1);
assert.ok(probe.byteLength < fullDemo.byteLength, "header probe must avoid copying the complete demo");
assert.deepEqual(Array.from(probe.subarray(offset, offset + payload.length)), Array.from(payload));

assert.throws(
  () => getHeaderProbeBytes(new Uint8Array(64)),
  /A91_DEM_HEADER_MAGIC_INVALID/
);

const compressedHeader = fullDemo.slice();
compressedHeader[16] = 0x41; // compressed DEM_FileHeader command
assert.throws(
  () => getHeaderProbeBytes(compressedHeader),
  /A91_HEADER_FRAME_UNSUPPORTED/
);

const truncated = fullDemo.slice(0, offset + payload.length);
assert.throws(
  () => getHeaderProbeBytes(truncated),
  /A91_HEADER_PREFIX_TRUNCATED/
);

process.stdout.write("A9.1 header-prefix regression tests PASS\n");
