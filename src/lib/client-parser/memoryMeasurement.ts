import { CLIENT_DEMO_MAX_BYTES } from "./clientParser.types";

export const MEMORY_LAB_FIXTURE_SIZES = [16, 32, 64, 96, 128].map(
  (mib) => mib * 1024 * 1024,
) as readonly number[];
export const MAX_SYNTHETIC_FIXTURE_BYTES = CLIENT_DEMO_MAX_BYTES;
export const MEMORY_MEASUREMENT_TIMEOUT_MS = 60_000;

export type MemoryMeasurementAvailability =
  | "AVAILABLE"
  | "FEATURE_DISABLED"
  | "API_UNAVAILABLE"
  | "NOT_CROSS_ORIGIN_ISOLATED"
  | "NOT_SECURE_CONTEXT"
  | "WORKER_UNAVAILABLE"
  | "FILE_API_UNAVAILABLE";
export type MemoryMeasurementErrorCode =
  | "MEMORY_API_UNAVAILABLE"
  | "NOT_CROSS_ORIGIN_ISOLATED"
  | "NOT_SECURE_CONTEXT"
  | "WORKER_UNAVAILABLE"
  | "FEATURE_DISABLED"
  | "FIXTURE_TOO_LARGE"
  | "FIXTURE_CREATION_FAILED"
  | "MATERIALIZATION_FAILED"
  | "MATERIALIZATION_WORKER_ERROR"
  | "MATERIALIZATION_INVALID_COMMAND"
  | "MATERIALIZATION_READ_FAILED"
  | "MATERIALIZATION_LENGTH_MISMATCH"
  | "MATERIALIZATION_TIMEOUT"
  | "MEASUREMENT_FAILED"
  | "CLEANUP_MEASUREMENT_FAILED"
  | "CANCELLED"
  | "UNKNOWN_ERROR";
export type MemoryMeasurementStatus = "OBSERVED" | "NOT_RUN" | "FAILED" | "CANCELLED";
export type CleanupStatus =
  "CLEANUP_OBSERVED" | "CLEANUP_MEASUREMENT_UNAVAILABLE" | "CLEANUP_NOT_RUN" | "FAILED";

export interface SyntheticFixtureDescriptor {
  kind: "SYNTHETIC_MEMORY_FIXTURE";
  sizeBytes: number;
}

export interface MemoryMeasurementResult {
  status: MemoryMeasurementStatus;
  evidenceClass: readonly [
    "SYNTHETIC_FIXTURE",
    "NO_REAL_DEM",
    "NOT_SUPPORT_CLAIM",
    "OBSERVED_BROWSER_MEMORY",
  ];
  fixtureSizeBytes: number;
  repetition: number;
  timestamp: string;
  baselineBytes: number | null;
  postFixtureBytes: number | null;
  preMaterializationBytes: number | null;
  postMaterializationBytes: number | null;
  postCleanupBytes: number | null;
  observedPeakBytes: number | null;
  peakDeltaBytes: number | null;
  observedCleanupDeltaBytes: number | null;
  materializationDurationMs: number | null;
  workerDurationMs: number | null;
  materializedByteLength: number | null;
  measurementCount: number;
  cleanupStatus: CleanupStatus;
  crossOriginIsolated: boolean;
  secureContext: boolean;
  apiAvailable: boolean;
  errorCode: MemoryMeasurementErrorCode | null;
  errorMessageSanitized: string | null;
  runtime: { userAgent: string };
}

export type MemoryWorkerCommand = {
  type: "MEMORY_MEASUREMENT";
  requestId: string;
  descriptor: SyntheticFixtureDescriptor;
};
export type MemoryWorkerEvent =
  | { type: "MATERIALIZATION_STARTED"; requestId: string }
  | {
      type: "MATERIALIZATION_COMPLETE";
      requestId: string;
      materializedByteLength: number;
      materializationDurationMs: number;
    }
  | {
      type: "ERROR";
      requestId: string;
      code:
        | "MATERIALIZATION_FAILED"
        | "MATERIALIZATION_WORKER_ERROR"
        | "MATERIALIZATION_INVALID_COMMAND"
        | "MATERIALIZATION_READ_FAILED"
        | "MATERIALIZATION_LENGTH_MISMATCH";
    };

export function createSyntheticFixtureDescriptor(sizeBytes: number): SyntheticFixtureDescriptor {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_SYNTHETIC_FIXTURE_BYTES)
    throw new MemoryLabError("FIXTURE_TOO_LARGE");
  if (!MEMORY_LAB_FIXTURE_SIZES.includes(sizeBytes)) throw new MemoryLabError("FIXTURE_TOO_LARGE");
  return { kind: "SYNTHETIC_MEMORY_FIXTURE", sizeBytes };
}

export function createSyntheticFixture(descriptor: SyntheticFixtureDescriptor): File {
  const validated = createSyntheticFixtureDescriptor(descriptor.sizeBytes);
  if (descriptor.kind !== "SYNTHETIC_MEMORY_FIXTURE")
    throw new MemoryLabError("FIXTURE_CREATION_FAILED");
  try {
    const bytes = new Uint8Array(validated.sizeBytes);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31 + 17) & 0xff;
    return new File([bytes], `synthetic-memory-${validated.sizeBytes}.bin`, {
      type: "application/x-gamepro-synthetic-memory-fixture",
      lastModified: 0,
    });
  } catch {
    throw new MemoryLabError("FIXTURE_CREATION_FAILED");
  }
}

export function getMemoryMeasurementAvailability(input: {
  featureEnabled: boolean;
  workerAvailable: boolean;
  fileApiAvailable: boolean;
  secureContext: boolean;
  crossOriginIsolated: boolean;
  apiAvailable: boolean;
}): MemoryMeasurementAvailability {
  if (!input.featureEnabled) return "FEATURE_DISABLED";
  if (!input.workerAvailable) return "WORKER_UNAVAILABLE";
  if (!input.fileApiAvailable) return "FILE_API_UNAVAILABLE";
  if (!input.secureContext) return "NOT_SECURE_CONTEXT";
  if (!input.crossOriginIsolated) return "NOT_CROSS_ORIGIN_ISOLATED";
  if (!input.apiAvailable) return "API_UNAVAILABLE";
  return "AVAILABLE";
}

export function isMemoryWorkerEvent(value: unknown): value is MemoryWorkerEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (typeof event["requestId"] !== "string" || typeof event["type"] !== "string") return false;
  if (event["type"] === "MATERIALIZATION_STARTED") return true;
  if (event["type"] === "ERROR")
    return (
      event["code"] === "MATERIALIZATION_FAILED" ||
      event["code"] === "MATERIALIZATION_INVALID_COMMAND" ||
      event["code"] === "MATERIALIZATION_READ_FAILED" ||
      event["code"] === "MATERIALIZATION_LENGTH_MISMATCH"
    );
  return (
    event["type"] === "MATERIALIZATION_COMPLETE" &&
    Number.isSafeInteger(event["materializedByteLength"]) &&
    (event["materializedByteLength"] as number) >= 0 &&
    Number.isFinite(event["materializationDurationMs"]) &&
    (event["materializationDurationMs"] as number) >= 0
  );
}

export function containsBinaryValue(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((entry) => containsBinaryValue(entry, seen));
}

export class MemoryLabError extends Error {
  constructor(readonly code: MemoryMeasurementErrorCode) {
    super(code);
    this.name = "MemoryLabError";
  }
}
