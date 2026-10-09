import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { digest, stable } from "./contracts.mjs";

// Python's json.dumps and ECMAScript JSON.stringify differ for valid numeric
// values (for example 1.0 vs 1 and exponent formatting). The parity contract
// is evaluated in JavaScript, so seal the Python artifact's normalized-result
// digest with the exact same canonicalizer used by the decision gate.
const path = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !path.endsWith(".json")) {
  throw new Error("RESULT_DIGEST_INPUT_INVALID");
}
const value = JSON.parse(readFileSync(path, "utf8"));
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
value.normalizedResultDigest = resultDigest;
value.resultDigest = resultDigest;
const output = resolve(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
writeFileSync(output, stable(value) + "\n", { mode: 0o600 });
renameSync(output, path);
