// Decoder for the tagged inputs of canonical/vectors.json and
// canonical/shared_fixture.json (JavaScript side). See vectors.json
// "inputEncoding" for the meaning of each tag.
const ABSENT = Symbol("absent");

/** Decode a tagged vector input into this runtime's NATIVE carrier. */
export function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    if (typeof value.$ === "string") {
      if (value.$ === "u64") return value.v; // WASM hands 64-bit ids over as decimal strings
      if (value.$ === "bigint") return BigInt(value.v);
      if (value.$ === "f64" || value.$ === "lossy_u64") return Number(value.v);
      if (value.$ === "undefined") return undefined;
      if (value.$ === "absent") return ABSENT;
      throw new Error(`unknown vector tag ${value.$}`);
    }
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, decode(item)])
        .filter(([, item]) => item !== ABSENT),
    );
  }
  return value;
}
