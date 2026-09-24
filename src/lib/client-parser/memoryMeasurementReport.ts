import type { MemoryMeasurementResult } from "./memoryMeasurement";

export interface BrowserMemoryDiagnosticReport {
  reportType: "CONTIGUOUS_INPUT_MATERIALIZATION_MEMORY";
  classification: readonly ["EXPERIMENTAL", "DIAGNOSTIC_ONLY", "NON_PRODUCTION", "NO_REAL_DEM"];
  generatedAt: string;
  measurementStatus: "OBSERVED" | "NOT_RUN";
  results: readonly MemoryMeasurementResult[];
}

export function createBrowserMemoryDiagnosticReport(
  results: readonly MemoryMeasurementResult[],
): BrowserMemoryDiagnosticReport {
  return {
    reportType: "CONTIGUOUS_INPUT_MATERIALIZATION_MEMORY",
    classification: ["EXPERIMENTAL", "DIAGNOSTIC_ONLY", "NON_PRODUCTION", "NO_REAL_DEM"],
    generatedAt: new Date().toISOString(),
    measurementStatus: results.some((result) => result.status === "OBSERVED")
      ? "OBSERVED"
      : "NOT_RUN",
    results: results.map((result) => ({ ...result })),
  };
}

export function serializeBrowserMemoryDiagnosticReport(
  results: readonly MemoryMeasurementResult[],
): string {
  return JSON.stringify(createBrowserMemoryDiagnosticReport(results), null, 2);
}
