import { describe, expect, it } from "vitest";
import {
  MAX_SYNTHETIC_FIXTURE_BYTES,
  MEMORY_LAB_FIXTURE_SIZES,
  MemoryLabError,
  containsBinaryValue,
  createSyntheticFixture,
  createSyntheticFixtureDescriptor,
  getMemoryMeasurementAvailability,
  isMemoryWorkerEvent,
} from "../memoryMeasurement";
import { createBrowserMemoryDiagnosticReport } from "../memoryMeasurementReport";

describe("controlled browser memory measurement contracts", () => {
  const available = {
    featureEnabled: true,
    workerAvailable: true,
    fileApiAvailable: true,
    secureContext: true,
    crossOriginIsolated: true,
    apiAvailable: true,
  };

  it.each([
    ["featureEnabled", "FEATURE_DISABLED"],
    ["workerAvailable", "WORKER_UNAVAILABLE"],
    ["fileApiAvailable", "FILE_API_UNAVAILABLE"],
    ["secureContext", "NOT_SECURE_CONTEXT"],
    ["crossOriginIsolated", "NOT_CROSS_ORIGIN_ISOLATED"],
    ["apiAvailable", "API_UNAVAILABLE"],
  ] as const)("fails closed when %s is false", (key, expected) => {
    expect(getMemoryMeasurementAvailability({ ...available, [key]: false })).toBe(expected);
  });

  it.each(MEMORY_LAB_FIXTURE_SIZES)("accepts the approved synthetic size %i", (size) => {
    expect(createSyntheticFixtureDescriptor(size)).toEqual({
      kind: "SYNTHETIC_MEMORY_FIXTURE",
      sizeBytes: size,
    });
  });

  it.each([
    MAX_SYNTHETIC_FIXTURE_BYTES + 1,
    256 * 1024 * 1024,
    300 * 1024 * 1024,
    400 * 1024 * 1024,
    500 * 1024 * 1024,
    473_748_061,
  ])("rejects disallowed size %i without allocating it", (size) => {
    expect(() => createSyntheticFixtureDescriptor(size)).toThrowError(MemoryLabError);
  });

  it("creates deterministic metadata and content for the smallest approved fixture", async () => {
    const descriptor = createSyntheticFixtureDescriptor(16 * 1024 * 1024);
    const first = createSyntheticFixture(descriptor);
    const second = createSyntheticFixture(descriptor);
    expect(first.name).toBe(second.name);
    expect(first.size).toBe(descriptor.sizeBytes);
    expect(new Uint8Array(await first.slice(0, 32).arrayBuffer())).toEqual(
      new Uint8Array(await second.slice(0, 32).arrayBuffer()),
    );
  });

  it("validates worker events fail-closed", () => {
    expect(isMemoryWorkerEvent({ type: "MATERIALIZATION_STARTED", requestId: "r" })).toBe(true);
    expect(isMemoryWorkerEvent({ type: "MATERIALIZATION_COMPLETE", requestId: "r", materializedByteLength: 1, materializationDurationMs: 1 })).toBe(true);
    expect(isMemoryWorkerEvent({ type: "MATERIALIZATION_COMPLETE", requestId: "r", materializedByteLength: "1", materializationDurationMs: 1 })).toBe(false);
    expect(isMemoryWorkerEvent({ type: "ERROR", requestId: "r", code: "RAW_BYTES" })).toBe(false);
  });

  it("keeps report schema metadata-only", () => {
    const report = createBrowserMemoryDiagnosticReport([]);
    expect(report.measurementStatus).toBe("NOT_RUN");
    expect(report.classification).toEqual(["EXPERIMENTAL", "DIAGNOSTIC_ONLY", "NON_PRODUCTION", "NO_REAL_DEM"]);
    expect(containsBinaryValue(report)).toBe(false);
  });
});
