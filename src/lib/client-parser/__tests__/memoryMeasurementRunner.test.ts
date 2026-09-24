import { describe, expect, it } from "vitest";
import { containsBinaryValue, createSyntheticFixtureDescriptor } from "../memoryMeasurement";
import { runSyntheticMemoryMeasurement } from "../memoryMeasurement.runner";

class FakeWorker {
  terminated = 0;
  removed = 0;
  private messageListeners = new Set<(event: MessageEvent<unknown>) => void>();
  private errorListeners = new Set<(event: ErrorEvent) => void>();

  constructor(private readonly behavior: "complete" | "hang" = "complete") {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "message") this.messageListeners.add(listener as (event: MessageEvent<unknown>) => void);
    if (type === "error") this.errorListeners.add(listener as (event: ErrorEvent) => void);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.removed += 1;
    if (type === "message") this.messageListeners.delete(listener as (event: MessageEvent<unknown>) => void);
    if (type === "error") this.errorListeners.delete(listener as (event: ErrorEvent) => void);
  }

  postMessage(command: unknown) {
    if (this.behavior === "hang") return;
    const requestId = (command as { requestId: string }).requestId;
    const fixture = (command as { fixture: File }).fixture;
    queueMicrotask(() => {
      this.emit({ type: "MATERIALIZATION_STARTED", requestId });
      this.emit({
        type: "MATERIALIZATION_COMPLETE",
        requestId,
        materializedByteLength: fixture.size,
        materializationDurationMs: 4,
      });
    });
  }

  terminate() {
    this.terminated += 1;
  }

  private emit(data: unknown) {
    for (const listener of this.messageListeners) listener({ data } as MessageEvent<unknown>);
  }
}

const capabilities = {
  workerAvailable: true,
  fileApiAvailable: true,
  secureContext: true,
  crossOriginIsolated: true,
  apiAvailable: true,
};

describe("synthetic memory measurement lifecycle", () => {
  it("returns metadata-only observations and always terminates the Worker", async () => {
    const worker = new FakeWorker();
    let sample = 100;
    const result = await runSyntheticMemoryMeasurement(
      createSyntheticFixtureDescriptor(16 * 1024 * 1024),
      {
        featureEnabled: true,
        stabilizationMs: 0,
        dependencies: {
          capabilities,
          workerFactory: () => worker,
          measureMemory: async () => ({ bytes: sample++ }),
          wait: async () => undefined,
          now: () => 10,
          randomUUID: () => "request",
          runtime: () => "test-runtime",
        },
      },
    );
    expect(result.status).toBe("OBSERVED");
    expect(result.materializedByteLength).toBe(16 * 1024 * 1024);
    expect(containsBinaryValue(result)).toBe(false);
    expect(worker.terminated).toBe(1);
    expect(worker.removed).toBeGreaterThanOrEqual(2);
  });

  it("times out fail-closed and terminates a hung Worker", async () => {
    const worker = new FakeWorker("hang");
    const result = await runSyntheticMemoryMeasurement(
      createSyntheticFixtureDescriptor(16 * 1024 * 1024),
      {
        featureEnabled: true,
        timeoutMs: 1,
        dependencies: {
          capabilities,
          workerFactory: () => worker,
          measureMemory: async () => ({ bytes: 100 }),
          wait: async () => undefined,
          randomUUID: () => "timeout",
        },
      },
    );
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("MATERIALIZATION_TIMEOUT");
    expect(worker.terminated).toBe(1);
    expect(worker.removed).toBeGreaterThanOrEqual(2);
  });

  it("cancels fail-closed and terminates the Worker", async () => {
    const worker = new FakeWorker("hang");
    const controller = new AbortController();
    const pending = runSyntheticMemoryMeasurement(
      createSyntheticFixtureDescriptor(16 * 1024 * 1024),
      {
        featureEnabled: true,
        signal: controller.signal,
        dependencies: {
          capabilities,
          workerFactory: () => worker,
          measureMemory: async () => ({ bytes: 100 }),
          wait: async () => undefined,
          randomUUID: () => "cancel",
        },
      },
    );
    queueMicrotask(() => controller.abort());
    const result = await pending;
    expect(result.status).toBe("CANCELLED");
    expect(result.errorCode).toBe("CANCELLED");
    expect(worker.terminated).toBe(1);
  });

  it("does not create a Worker when the feature is disabled", async () => {
    let created = false;
    const result = await runSyntheticMemoryMeasurement(
      createSyntheticFixtureDescriptor(16 * 1024 * 1024),
      {
        featureEnabled: false,
        dependencies: {
          capabilities,
          workerFactory: () => {
            created = true;
            return new FakeWorker();
          },
        },
      },
    );
    expect(result.status).toBe("NOT_RUN");
    expect(result.errorCode).toBe("FEATURE_DISABLED");
    expect(created).toBe(false);
  });
});