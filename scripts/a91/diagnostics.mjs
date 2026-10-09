import { performance } from "node:perf_hooks";
import { sha, locks } from "./contracts.mjs";

export const FAILURE_CODES = new Set([
  "WASM_RUNTIME_RESOURCE_FAILURE",
  "WASM_MEMORY_ALLOCATION_FAILURE",
  "WASM_RUNTIME_TRAP",
  "WASM_PARSE_FAILURE",
  "A91_DEMO_FRAME_SCAN_INVALID",
  "A91_TICK_PROBE_RANGE_MISSING",
  "A91_TICK_PROBE_EMPTY",
  "WASM_PRIVATE_EVIDENCE_TOO_LARGE",
  "WASM_ARTIFACT_IDENTITY_MISMATCH",
  "UNSUPPORTED_WASM_API",
  "CATALOG_MISMATCH",
  "CONTRACT_MISMATCH",
  "PARSER_IDENTITY_MISMATCH",
  "A91_DEM_STRUCTURE_INVALID",
  "A91_DEM_SHA256_MISMATCH",
  "A91_DEM_SIZE_MISMATCH",
  "AUTHORIZATION_MISMATCH",
  "MISSING_DEM",
  "WRONG_DEM_EXTENSION",
  "ARTIFACT_SECURITY_FAILURE",
  "A91_RUNTIME_RESOURCE_FAILURE",
]);
function trapDetail(error) {
  const name = error?.name ?? error?.constructor?.name ?? "Error";
  const message = typeof error?.message === "string" ? error.message : "";
  const normalized = message.trim().toLowerCase();
  if (/out of memory|memory allocation|cannot allocate|allocation failed/.test(normalized))
    return "memory_allocation";
  if (/out of bounds|bounds check/.test(normalized)) return "out_of_bounds";
  if (/unreachable/.test(normalized)) return "unreachable";
  if (/stack overflow|call stack|stack exhausted/.test(normalized)) return "stack_overflow";
  if (/divide by zero/.test(normalized)) return "divide_by_zero";
  if (/integer overflow/.test(normalized)) return "integer_overflow";
  if (name === "RuntimeError" || error instanceof WebAssembly.RuntimeError) return "runtime_error_other";
  return null;
}
function classifyWasmErrorDetail(error, parsing = false) {
  if (FAILURE_CODES.has(error?.message))
    return { reason: error.message, trapDetail: null };
  const name = error?.name ?? error?.constructor?.name;
  const message = typeof error?.message === "string" ? error.message : "";
  if (/out of memory|allocation fail|memory (?:grow|allocation)|cannot allocate/i.test(message))
    return { reason: "WASM_MEMORY_ALLOCATION_FAILURE", trapDetail: "memory_allocation" };
  if (error instanceof RangeError || name === "RangeError")
    return { reason: "WASM_RUNTIME_RESOURCE_FAILURE", trapDetail: "range_error" };
  if (error instanceof WebAssembly.RuntimeError || name === "RuntimeError")
    return { reason: "WASM_RUNTIME_TRAP", trapDetail: trapDetail(error) };
  return { reason: parsing ? "WASM_PARSE_FAILURE" : "A91_RUNTIME_RESOURCE_FAILURE", trapDetail: null };
}
export function classifyWasmError(error, parsing = false) {
  return classifyWasmErrorDetail(error, parsing).reason;
}
export function createTelemetry() {
  const executionTimeline = [];
  const memoryPeaks = { peakRss: 0, peakHeapUsed: 0, peakExternal: 0, peakArrayBuffers: 0 };
  let stage = "before_validate";
  let failedStage = null;
  function snapshot(name, startedAt = performance.now()) {
    const memory = process.memoryUsage();
    for (const [peak, field] of Object.entries({
      peakRss: "rss",
      peakHeapUsed: "heapUsed",
      peakExternal: "external",
      peakArrayBuffers: "arrayBuffers",
    }))
      memoryPeaks[peak] = Math.max(memoryPeaks[peak], memory[field]);
    executionTimeline.push({
      stage: name,
      startedAt,
      durationMs: performance.now() - startedAt,
      memory,
    });
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
      // The original RuntimeError text is never emitted. Only a small allowlisted
      // classification, a digest, and bounded runtime identity are retained.
      const detail = classifyWasmErrorDetail(error, parsing);
      const failure = new Error(detail.reason);
      failure.diagnostics = {
        stage,
        failedStage,
        executionTimeline,
        memoryPeaks,
        trapDetail: detail.trapDetail,
        errorName: error?.name ?? error?.constructor?.name ?? "Error",
        errorMessageDigest: sha(String(error?.message ?? "UNKNOWN_ERROR")),
        wasmMemoryBytesBefore: error?.wasmMemoryBytesBefore ?? null,
        wasmMemoryBytesAfter: error?.wasmMemoryBytesAfter ?? null,
      };
      throw failure;
    }
  }
  return {
    snapshot,
    step,
    evidence: () => ({ stage, failedStage, executionTimeline, memoryPeaks }),
  };
}
export function failureEvidence(error) {
  return {
    status: "FAIL",
    reason: classifyWasmError(error),
    trapDetail: error?.diagnostics?.trapDetail ?? null,
    errorName: error?.diagnostics?.errorName ?? null,
    errorMessageDigest: error?.diagnostics?.errorMessageDigest ?? null,
    wasmMemoryBytesBefore: error?.diagnostics?.wasmMemoryBytesBefore ?? null,
    wasmMemoryBytesAfter: error?.diagnostics?.wasmMemoryBytesAfter ?? null,
    ...locks,
    ...(error?.diagnostics ?? { stage: "before_validate", failedStage: "validate" }),
    errorDigest: sha(String(error?.message ?? "UNKNOWN_ERROR")),
  };
}
