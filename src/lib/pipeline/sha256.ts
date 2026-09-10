/**
 * FASE 2.7 — INCREMENTAL SHA-256 (browser-safe, no full-file buffering).
 *
 * WebCrypto (`crypto.subtle.digest`) is one-shot: it needs the WHOLE file in
 * memory at once. A CS2 demo can reach 1.5 GB, so `file.arrayBuffer()` would
 * crash the tab on real matches — exactly the files this pipeline exists for.
 *
 * This is therefore a straight, dependency-free implementation of FIPS 180-4
 * SHA-256 with an incremental `update()`, so the file is read chunk by chunk and
 * only one chunk is ever resident.
 *
 * The hash produced in the browser is ONLY an idempotency key. Data integrity is
 * proved server-side by re-hashing the stored bytes (`computeStoredDemoSha256`).
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** Streaming SHA-256 accumulator. */
export class Sha256 {
  private h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private buffer = new Uint8Array(64);
  private bufferLength = 0;
  private byteCount = 0;
  private readonly w = new Uint32Array(64);

  update(chunk: Uint8Array): this {
    this.byteCount += chunk.byteLength;
    let offset = 0;

    if (this.bufferLength > 0) {
      const need = 64 - this.bufferLength;
      const take = Math.min(need, chunk.byteLength);
      this.buffer.set(chunk.subarray(0, take), this.bufferLength);
      this.bufferLength += take;
      offset = take;
      if (this.bufferLength === 64) {
        this.compress(this.buffer, 0);
        this.bufferLength = 0;
      }
    }

    while (chunk.byteLength - offset >= 64) {
      this.compress(chunk, offset);
      offset += 64;
    }

    if (offset < chunk.byteLength) {
      this.buffer.set(chunk.subarray(offset), 0);
      this.bufferLength = chunk.byteLength - offset;
    }
    return this;
  }

  hex(): string {
    const bitLength = this.byteCount * 8;
    const tail = new Uint8Array(this.bufferLength + 72);
    tail.set(this.buffer.subarray(0, this.bufferLength), 0);
    tail[this.bufferLength] = 0x80;
    let padded = this.bufferLength + 1;
    while (padded % 64 !== 56) padded += 1;
    const view = new DataView(tail.buffer, tail.byteOffset, padded + 8);
    // JS numbers hold the bit length exactly up to 2^53, far above 1.5 GB.
    view.setUint32(padded, Math.floor(bitLength / 0x100000000));
    view.setUint32(padded + 4, bitLength >>> 0);
    for (let i = 0; i < padded + 8; i += 64) this.compress(tail, i);

    let out = "";
    for (let i = 0; i < 8; i += 1) out += this.h[i]!.toString(16).padStart(8, "0");
    return out;
  }

  private compress(block: Uint8Array, offset: number): void {
    const w = this.w;
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      w[i] =
        ((block[j]! << 24) | (block[j + 1]! << 16) | (block[j + 2]! << 8) | block[j + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = [
      this.h[0]!,
      this.h[1]!,
      this.h[2]!,
      this.h[3]!,
      this.h[4]!,
      this.h[5]!,
      this.h[6]!,
      this.h[7]!,
    ];

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    this.h[0] = (this.h[0]! + a) >>> 0;
    this.h[1] = (this.h[1]! + b) >>> 0;
    this.h[2] = (this.h[2]! + c) >>> 0;
    this.h[3] = (this.h[3]! + d) >>> 0;
    this.h[4] = (this.h[4]! + e) >>> 0;
    this.h[5] = (this.h[5]! + f) >>> 0;
    this.h[6] = (this.h[6]! + g) >>> 0;
    this.h[7] = (this.h[7]! + h) >>> 0;
  }
}

/** Chunk size used when hashing a Blob incrementally (8 MB). */
export const HASH_CHUNK_BYTES = 8 * 1024 * 1024;

/** Hashes a Blob/File without ever holding more than one chunk in memory. */
export async function sha256HexFromBlob(
  blob: Blob,
  chunkBytes: number = HASH_CHUNK_BYTES,
): Promise<string> {
  const hasher = new Sha256();
  for (let offset = 0; offset < blob.size; offset += chunkBytes) {
    const slice = blob.slice(offset, Math.min(offset + chunkBytes, blob.size));
    hasher.update(new Uint8Array(await slice.arrayBuffer()));
  }
  return hasher.hex();
}
