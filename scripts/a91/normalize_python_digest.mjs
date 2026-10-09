import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { digest } from "./contracts.mjs";

// Python's json.dumps and ECMAScript JSON.stringify differ for valid numeric
// values (for example 1.0 vs 1 and exponent formatting). The parity contract
// is evaluated in JavaScript, so seal the Python artifact's normalized-result
// digest with the exact same canonicalizer used by the decision gate.
// Preserve the original JSON bytes except for the two digest strings: re-
// serializing the entire artifact in JavaScript could round integers above
// Number.MAX_SAFE_INTEGER and corrupt the evidence being attested.
const path = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !path.endsWith(".json")) {
  throw new Error("RESULT_DIGEST_INPUT_INVALID");
}
const raw = readFileSync(path, "utf8");
const value = JSON.parse(raw);
if (
  value?.runtime !== "PYTHON" ||
  value?.status !== "SUCCEEDED" ||
  !value.normalizedResult ||
  typeof value.normalizedResult !== "object" ||
  Array.isArray(value.normalizedResult)
) {
  throw new Error("RESULT_DIGEST_INPUT_INVALID");
}
const resultDigest = digest(value.normalizedResult);
if (!/^[0-9a-f]{64}$/.test(resultDigest)) {
  throw new Error("RESULT_DIGEST_INVALID");
}
let updated = raw;
for (const key of ["normalizedResultDigest", "resultDigest"]) {
  const pattern = new RegExp(`("${key}"\\s*:\\s*")[0-9a-f]{64}(")`);
  const matches = updated.match(pattern);
  if (!matches || updated.match(new RegExp(`"${key}"\\s*:` , "g"))?.length !== 1) {
    throw new Error("RESULT_DIGEST_INPUT_INVALID");
  }
  updated = updated.replace(pattern, `$1${resultDigest}$2`);
}
const output = resolve(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
writeFileSync(output, updated, { mode: 0o600 });
renameSync(output, path);
