import { performance } from "node:perf_hooks";
import { sha, locks } from "./contracts.mjs";

export const FAILURE_CODES = new Set([
  "WASM_RUNTIME_RESOURCE_FAILURE", "WASM_MEMORY_ALLOCATION_FAILURE", "WASM_RUNTIME_TRAP",
  "WASM_PARSE_FAILURE", "WASM_PRIVATE_EVIDENCE_TOO_LARGE", "WASM_ARTIFACT_IDENTITY_MISMATCH",
  "UNSUPPORTED_WASM_API", "CATALOG_MISMATCH", "CONTRACT_MISMATCH", "PARSER_IDENTITY_MISMATCH",
  "A91_DEM_STRUCTURE_INVALID", "A91_DEM_SHA256_MISMATCH", "A91_DEM_SIZE_MISMATCH",
  "AUTHORIZATION_MISMATCH", "MISSING_DEM", "WRONG_DEM_EXTENSION", "ARTIFACT_SECURITY_FAILURE",
  "A91_RUNTIME_RESOURCE_FAILURE",
]);
export function classifyWasmError(error, parsing = false) {
  if (FAILURE_CODES.has(error?.message)) return error.message;
  const name = error?.name ?? error?.constructor?.name;
  const message = typeof error?.message === "string" ? error.message : "";
  if (/out of memory|allocation fail|memory (?:grow|allocation)|cannot allocate/i.test(message))
    return "WASM_MEMORY_ALLOCATION_FAILURE";
  if (error instanceof RangeError || name === "RangeError") return "WASM_RUNTIME_RESOURCE_FAILURE";
  if (error instanceof WebAssembly.RuntimeError || name === "RuntimeError") return "WASM_RUNTIME_TRAP";
  return parsing ? "WASM_PARSE_FAILURE" : "A91_RUNTIME_RESOURCE_FAILURE";
}
export function createTelemetry() {
  const executionTimeline = [];
  const memoryPeaks = { peakRss: 0, peakHeapUsed: 0, peakExternal: 0, peakArrayBuffers: 0 };
  let stage = "before_validate";
  let failedStage = null;
  function snapshot(name, startedAt = performance.now()) {
    const memory = process.memoryUsage();
    for (const [peak, field] of Object.entries({ peakRss: "rss", peakHeapUsed: "heapUsed", peakExternal: "external", peakArrayBuffers: "arrayBuffers" }))
      memoryPeaks[peak] = Math.max(memoryPeaks[peak], memory[field]);
    executionTimeline.push({ stage: name, startedAt, durationMs: performance.now() - startedAt, memory });
  }
  function step(name, operation, parsing = false) {
    const startedAt = performance.now();
    try {
      const value = operation();
      stage = `after_${name}`;
      snapshot(stage, startedAt);
      return value;
    } catch (error) {
      failedStage = name;
      snapshot(`failed_${name}`, startedAt);
      // Attach only bounded, normalized diagnostics; no raw exception crosses the boundary.
      const failure = new Error(classifyWasmError(error, parsing));
      failure.diagnostics = { stage, failedStage, executionTimeline, memoryPeaks };
      throw failure;
    }
  }
  return { snapshot, step, evidence: () => ({ stage, failedStage, executionTimeline, memoryPeaks }) };
}
export function failureEvidence(error) {
  return { status: "FAIL", reason: classifyWasmError(error), ...locks,
    ...(error?.diagnostics ?? { stage: "before_validate", failedStage: "validate" }),
    errorDigest: sha(String(error?.message ?? "UNKNOWN_ERROR")) };
}