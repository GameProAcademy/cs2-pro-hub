import { describe, expect, it } from "vitest";
import { containsBinaryValue, createSyntheticFixtureDescriptor } from "../memoryMeasurement";
import { runSyntheticMemoryMeasurement } from "../memoryMeasurement.runner";

type WorkerBehavior =
  "complete" | "hang" | "error-event" | "worker-error" | "malformed" | "wrong-request";

class FakeWorker {
  terminated = 0;
  removed = 0;
  posted = 0;
  private messageListeners = new Set<(event: MessageEvent<unknown>) => void>();
  private errorListeners = new Set<(event: ErrorEvent) => void>();

  constructor(
    private readonly behavior: WorkerBehavior = "complete",
    private readonly lifecycle: string[] = [],
  ) {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "message")
      this.messageListeners.add(listener as (event: MessageEvent<unknown>) => void);
    if (type === "error") this.errorListeners.add(listener as (event: ErrorEvent) => void);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.removed += 1;
    if (type === "message")
      this.messageListeners.delete(listener as (event: MessageEvent<unknown>) => void);
    if (type === "error") this.errorListeners.delete(listener as (event: ErrorEvent) => void);
  }

  postMessage(command: unknown) {
    this.posted += 1;
    this.lifecycle.push("postMessage");
    if (this.behavior === "hang") return;
    const requestId = (command as { requestId: string }).requestId;
    const fixture = (command as { fixture: File }).fixture;
    queueMicrotask(() => {
      if (this.behavior === "worker-error") {
        for (const listener of this.errorListeners) listener({ type: "error" } as ErrorEvent);
        return;
      }
      if (this.behavior === "malformed") {
        this.emit({ type: "MATERIALIZATION_COMPLETE", requestId, materializedByteLength: -1 });
        return;
      }
      if (this.behavior === "wrong-request") {
        this.emit({
          type: "MATERIALIZATION_COMPLETE",
          requestId: "another-request",
          materializedByteLength: fixture.size,
          materializationDurationMs: 4,
        });
        return;
      }
      this.emit({ type: "MATERIALIZATION_STARTED", requestId });
      this.lifecycle.push("started");
      if (this.behavior === "error-event") {
        this.emit({ type: "ERROR", requestId, code: "MATERIALIZATION_FAILED" });
        return;
      }
      this.emit({
        type: "MATERIALIZATION_COMPLETE",
        requestId,
        materializedByteLength: fixture.size,
        materializationDurationMs: 4,
      });
      this.lifecycle.push("complete");
    });
  }

  terminate() {
    this.terminated += 1;
    this.lifecycle.push("terminate");
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

const descriptor = createSyntheticFixtureDescriptor(16 * 1024 * 1024);

function optionsFor(
  worker: FakeWorker,
  measureMemory: () => Promise<{ bytes: number }>,
  lifecycle: string[] = [],
) {
  return {
    featureEnabled: true,
    stabilizationMs: 0,
    dependencies: {
      capabilities,
      workerFactory: () => {
        lifecycle.push("workerCreated");
        return worker;
      },
      measureMemory,
      wait: async () => {
        lifecycle.push("wait");
      },
      now: () => 10,
      randomUUID: () => "request",
      runtime: () => "test-runtime",
    },
  } as const;
}

describe("synthetic memory measurement lifecycle", () => {
  it("uses a deterministic lifecycle and only samples after completion", async () => {
    const lifecycle: string[] = [];
    const worker = new FakeWorker("complete", lifecycle);
    const samples = [100, 130, 145, 220, 110];
    const result = await runSyntheticMemoryMeasurement(descriptor, {
      ...optionsFor(
        worker,
        async () => {
          lifecycle.push(`sample:${samples[0]}`);
          return { bytes: samples.shift() ?? 0 };
        },
        lifecycle,
      ),
    });
    expect(result.status).toBe("OBSERVED");
    expect(result.baselineBytes).toBe(100);
    expect(result.postFixtureBytes).toBe(130);
    expect(result.preMaterializationBytes).toBe(145);
    expect(result.postMaterializationBytes).toBe(220);
    expect(result.postCleanupBytes).toBe(110);
    expect(result.observedPeakBytes).toBe(220);
    expect(result.peakDeltaBytes).toBe(120);
    expect(result.observedCleanupDeltaBytes).toBe(10);
    expect(result.cleanupStatus).toBe("CLEANUP_OBSERVED");
    expect(result.measurementCount).toBe(5);
    expect(result.materializedByteLength).toBe(16 * 1024 * 1024);
    expect(containsBinaryValue(result)).toBe(false);
    expect(worker.terminated).toBe(1);
    expect(worker.removed).toBeGreaterThanOrEqual(2);
    expect(lifecycle.indexOf("complete")).toBeLessThan(lifecycle.indexOf("sample:220"));
    expect(lifecycle.indexOf("sample:220")).toBeLessThan(lifecycle.indexOf("terminate"));
  });

  it("waits for a delayed post-materialization sample without an in-flight race", async () => {
    const lifecycle: string[] = [];
    const worker = new FakeWorker("complete", lifecycle);
    let call = 0;
    const result = await runSyntheticMemoryMeasurement(
      descriptor,
      optionsFor(
        worker,
        async () => {
          call += 1;
          if (call === 4) await Promise.resolve();
          lifecycle.push(`resolved:${call}`);
          return { bytes: call === 4 ? 220 : 100 + call };
        },
        lifecycle,
      ),
    );
    expect(result.postMaterializationBytes).toBe(220);
    expect(lifecycle.indexOf("complete")).toBeLessThan(lifecycle.indexOf("resolved:4"));
    expect(result).not.toHaveProperty("observedMaterializationBytes");
  });

  it.each([
    [150, 50],
    [80, -20],
  ])("records cleanup %i as a neutral observed delta", async (postCleanup, expectedDelta) => {
    const samples = [100, 130, 145, 220, postCleanup];
    const worker = new FakeWorker();
    const result = await runSyntheticMemoryMeasurement(
      descriptor,
      optionsFor(worker, async () => ({ bytes: samples.shift() ?? 0 })),
    );
    expect(result.observedCleanupDeltaBytes).toBe(expectedDelta);
    expect(result.cleanupStatus).toBe("CLEANUP_OBSERVED");
  });

  it("keeps an observed run when only the cleanup sample is unavailable", async () => {
    let call = 0;
    const worker = new FakeWorker();
    const result = await runSyntheticMemoryMeasurement(
      descriptor,
      optionsFor(worker, async () => {
        call += 1;
        if (call === 5) throw new Error("unavailable");
        return { bytes: 100 + call };
      }),
    );
    expect(result.status).toBe("OBSERVED");
    expect(result.postCleanupBytes).toBeNull();
    expect(result.observedCleanupDeltaBytes).toBeNull();
    expect(result.cleanupStatus).toBe("CLEANUP_MEASUREMENT_UNAVAILABLE");
  });

  it("times out fail-closed and terminates a hung Worker", async () => {
    const worker = new FakeWorker("hang");
    const result = await runSyntheticMemoryMeasurement(descriptor, {
      featureEnabled: true,
      timeoutMs: 1,
      dependencies: {
        capabilities,
        workerFactory: () => worker,
        measureMemory: async () => ({ bytes: 100 }),
        wait: async () => undefined,
        randomUUID: () => "timeout",
      },
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("MATERIALIZATION_TIMEOUT");
    expect(worker.terminated).toBe(1);
    expect(worker.removed).toBeGreaterThanOrEqual(2);
  });

  it("cancels fail-closed and terminates the Worker", async () => {
    const worker = new FakeWorker("hang");
    const controller = new AbortController();
    const pending = runSyntheticMemoryMeasurement(descriptor, {
      featureEnabled: true,
      signal: controller.signal,
      dependencies: {
        capabilities,
        workerFactory: () => worker,
        measureMemory: async () => ({ bytes: 100 }),
        wait: async () => undefined,
        randomUUID: () => "cancel",
      },
    });
    queueMicrotask(() => controller.abort());
    const result = await pending;
    expect(result.status).toBe("CANCELLED");
    expect(result.errorCode).toBe("CANCELLED");
    expect(worker.terminated).toBe(1);
    expect(worker.removed).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["error-event", "MATERIALIZATION_FAILED"],
    ["worker-error", "MATERIALIZATION_FAILED"],
    ["malformed", "MATERIALIZATION_FAILED"],
    ["wrong-request", "MATERIALIZATION_FAILED"],
  ] as const)("fails closed for %s and terminates the Worker", async (behavior, code) => {
    const worker = new FakeWorker(behavior);
    const result = await runSyntheticMemoryMeasurement(
      descriptor,
      optionsFor(worker, async () => ({ bytes: 100 })),
    );
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe(code);
    expect(worker.terminated).toBe(1);
    expect(worker.removed).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["apiAvailable", "MEMORY_API_UNAVAILABLE"],
    ["secureContext", "NOT_SECURE_CONTEXT"],
    ["crossOriginIsolated", "NOT_CROSS_ORIGIN_ISOLATED"],
    ["workerAvailable", "WORKER_UNAVAILABLE"],
  ] as const)("does not create a Worker when %s is unavailable", async (key, code) => {
    let created = false;
    const result = await runSyntheticMemoryMeasurement(descriptor, {
      featureEnabled: true,
      dependencies: {
        capabilities: { ...capabilities, [key]: false },
        workerFactory: () => {
          created = true;
          return new FakeWorker();
        },
      },
    });
    expect(result.status).toBe("NOT_RUN");
    expect(result.errorCode).toBe(code);
    expect(created).toBe(false);
  });

  it("does not create a Worker when the feature is disabled", async () => {
    let created = false;
    const result = await runSyntheticMemoryMeasurement(descriptor, {
      featureEnabled: false,
      dependencies: {
        capabilities,
        workerFactory: () => {
          created = true;
          return new FakeWorker();
        },
      },
    });
    expect(result.status).toBe("NOT_RUN");
    expect(result.errorCode).toBe("FEATURE_DISABLED");
    expect(created).toBe(false);
  });
});
