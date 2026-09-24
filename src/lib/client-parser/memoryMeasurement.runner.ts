import {
  MEMORY_MEASUREMENT_TIMEOUT_MS,
  MemoryLabError,
  createSyntheticFixtureDescriptor,
  getMemoryMeasurementAvailability,
  isMemoryWorkerEvent,
  type MemoryMeasurementErrorCode,
  type MemoryMeasurementResult,
  type MemoryWorkerEvent,
  type MemoryWorkerLifecycleStage,
  type SyntheticFixtureDescriptor,
} from "./memoryMeasurement";

type MemoryPerformance = Performance & {
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
};

type WorkerLike = Pick<
  Worker,
  "postMessage" | "terminate" | "addEventListener" | "removeEventListener"
>;

export interface MemoryMeasurementRunOptions {
  repetition?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  stabilizationMs?: number;
  featureEnabled: boolean;
  dependencies?: {
    workerFactory?: () => WorkerLike;
    measureMemory?: () => Promise<{ bytes: number }>;
    wait?: (milliseconds: number) => Promise<void>;
    now?: () => number;
    randomUUID?: () => string;
    runtime?: () => string;
    capabilities?: Partial<{
      workerAvailable: boolean;
      fileApiAvailable: boolean;
      secureContext: boolean;
      crossOriginIsolated: boolean;
      apiAvailable: boolean;
    }>;
  };
}

export function browserMemoryMeasurementAvailability(featureEnabled: boolean) {
  const memoryPerformance = globalThis.performance as MemoryPerformance | undefined;
  return getMemoryMeasurementAvailability({
    featureEnabled,
    workerAvailable: typeof Worker !== "undefined",
    fileApiAvailable: typeof File !== "undefined" && typeof Blob !== "undefined",
    secureContext: globalThis.isSecureContext === true,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    apiAvailable: typeof memoryPerformance?.measureUserAgentSpecificMemory === "function",
  });
}

export async function runSyntheticMemoryMeasurement(
  descriptor: SyntheticFixtureDescriptor,
  options: MemoryMeasurementRunOptions,
): Promise<MemoryMeasurementResult> {
  const validated = createSyntheticFixtureDescriptor(descriptor.sizeBytes);
  if (descriptor.kind !== validated.kind) throw new MemoryLabError("FIXTURE_CREATION_FAILED");
  const dependencies = options.dependencies;
  const memoryPerformance = globalThis.performance as MemoryPerformance | undefined;
  const measureMemory =
    dependencies?.measureMemory ??
    (() => {
      const measurement = memoryPerformance?.measureUserAgentSpecificMemory;
      if (!measurement) throw new MemoryLabError("MEMORY_API_UNAVAILABLE");
      return measurement.call(memoryPerformance);
    });
  const capabilities = {
    workerAvailable: dependencies?.capabilities?.workerAvailable ?? typeof Worker !== "undefined",
    fileApiAvailable:
      dependencies?.capabilities?.fileApiAvailable ??
      (typeof File !== "undefined" && typeof Blob !== "undefined"),
    secureContext: dependencies?.capabilities?.secureContext ?? globalThis.isSecureContext === true,
    crossOriginIsolated:
      dependencies?.capabilities?.crossOriginIsolated ?? globalThis.crossOriginIsolated === true,
    apiAvailable:
      dependencies?.capabilities?.apiAvailable ??
      typeof memoryPerformance?.measureUserAgentSpecificMemory === "function",
  };
  const availability = getMemoryMeasurementAvailability({
    featureEnabled: options.featureEnabled,
    ...capabilities,
  });
  const common = {
    evidenceClass: [
      "SYNTHETIC_FIXTURE",
      "NO_REAL_DEM",
      "NOT_SUPPORT_CLAIM",
      "OBSERVED_BROWSER_MEMORY",
    ] as const,
    fixtureSizeBytes: descriptor.sizeBytes,
    repetition: Math.min(3, Math.max(1, options.repetition ?? 1)),
    timestamp: new Date().toISOString(),
    crossOriginIsolated: capabilities.crossOriginIsolated,
    secureContext: capabilities.secureContext,
    apiAvailable: capabilities.apiAvailable,
    runtime: {
      userAgent: dependencies?.runtime?.() ?? globalThis.navigator?.userAgent ?? "unknown",
    },
  };
  if (availability !== "AVAILABLE")
    return unavailableResult(common, availabilityToError(availability));

  const wait =
    dependencies?.wait ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = dependencies?.now ?? (() => performance.now());
  const workerFactory =
    dependencies?.workerFactory ??
    (() =>
      new Worker(new URL("./memoryMeasurement.worker.ts", import.meta.url), {
        type: "module",
        name: "gamepro-browser-memory-lab",
      }));
  const requestId = dependencies?.randomUUID?.() ?? crypto.randomUUID();
  const timeoutMs = Math.min(
    MEMORY_MEASUREMENT_TIMEOUT_MS,
    Math.max(1, options.timeoutMs ?? MEMORY_MEASUREMENT_TIMEOUT_MS),
  );
  let measurementCount = 0;
  const sample = async () => {
    const measured = await measureMemory();
    if (!Number.isFinite(measured.bytes) || measured.bytes < 0)
      throw new MemoryLabError("MEASUREMENT_FAILED");
    measurementCount += 1;
    return measured.bytes;
  };

  await wait(0);
  let baselineBytes: number | null = null;
  let postFixtureBytes: number | null = null;
  let preMaterializationBytes: number | null = null;
  let postMaterializationBytes: number | null = null;
  let postCleanupBytes: number | null = null;
  let workerLifecycleStage: MemoryWorkerLifecycleStage | null = null;
  let workerRuntimeSignal: "ERROR_EVENT" | "ONERROR" | "UNHANDLED_REJECTION" | null = null;
  let workerBootstrapProbe: "PASS" | "FAIL" | "NOT_RUN" = "NOT_RUN";
  let moduleWorkerBootstrapProbe: "PASS" | "FAIL" | "NOT_RUN" = "NOT_RUN";
  let worker: WorkerLike | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let abortHandler: (() => void) | null = null;
  const startedAt = now();

  try {
    baselineBytes = await sample();
    postFixtureBytes = await sample();
    preMaterializationBytes = await sample();

    workerBootstrapProbe = await runWorkerBootstrapProbe();
    moduleWorkerBootstrapProbe = await runModuleWorkerBootstrapProbe();
    worker = workerFactory();
    workerLifecycleStage = "CREATED";

    const materialized = await new Promise<
      Extract<MemoryWorkerEvent, { type: "MATERIALIZATION_COMPLETE" }>
    >((resolve, reject) => {
      let settled = false;
      let commandPosted = false;
      const finish = (
        error?: MemoryLabError,
        event?: Extract<MemoryWorkerEvent, { type: "MATERIALIZATION_COMPLETE" }>,
      ) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if (abortHandler) options.signal?.removeEventListener("abort", abortHandler);
        worker?.removeEventListener("message", onMessage);
        worker?.removeEventListener("error", onError);
        worker?.removeEventListener("messageerror", onMessageError);
        if (error) reject(error);
        else if (event) resolve(event);
        else reject(new MemoryLabError("UNKNOWN_ERROR"));
      };

      const onError = () => {
        workerRuntimeSignal ??= "ERROR_EVENT";
        finish(new MemoryLabError("MATERIALIZATION_WORKER_ERROR"));
      };

      const onMessageError = () => {
        workerRuntimeSignal ??= "ERROR_EVENT";
        workerLifecycleStage = "MESSAGE_ERROR";
        finish(new MemoryLabError("MATERIALIZATION_MESSAGE_ERROR"));
      };

      const onMessage = (message: MessageEvent<unknown>) => {
        if (!isMemoryWorkerEvent(message.data)) {
          finish(new MemoryLabError("MATERIALIZATION_FAILED"));
          return;
        }

        if (message.data.type === "WORKER_READY") {
          workerLifecycleStage = "READY";
          if (commandPosted) return;
          commandPosted = true;
          worker?.postMessage({
            type: "MEMORY_MEASUREMENT",
            requestId,
            descriptor: validated,
          });
          return;
        }

        if (message.data.type === "ERROR" && message.data.runtimeSignal) {
          workerRuntimeSignal ??= message.data.runtimeSignal;
          finish(new MemoryLabError(message.data.code));
          return;
        }

        if (message.data.requestId !== requestId) {
          finish(new MemoryLabError("MATERIALIZATION_FAILED"));
          return;
        }

        if (message.data.type === "WORKER_STAGE") {
          workerLifecycleStage = message.data.stage;
          return;
        }

        if (message.data.type === "MATERIALIZATION_STARTED") {
          workerLifecycleStage = "MATERIALIZATION_STARTED";
          return;
        }

        if (message.data.type === "MATERIALIZATION_COMPLETE") {
          workerLifecycleStage = "MATERIALIZATION_COMPLETE";
          finish(undefined, message.data);
          return;
        }

        if (message.data.type === "ERROR") {
          finish(new MemoryLabError(message.data.code));
        }
      };

      abortHandler = () => finish(new MemoryLabError("CANCELLED"));
      worker?.addEventListener("message", onMessage);
      worker?.addEventListener("error", onError);
      worker?.addEventListener("messageerror", onMessageError);
      worker?.postMessage({ type: "MEMORY_WORKER_INIT", requestId });
      options.signal?.addEventListener("abort", abortHandler, { once: true });
      timeout = setTimeout(() => finish(new MemoryLabError("MATERIALIZATION_TIMEOUT")), timeoutMs);

      if (options.signal?.aborted) {
        abortHandler();
      }
    });

    postMaterializationBytes = await sample();
    worker.terminate();
    worker = null;
    await wait(options.stabilizationMs ?? 250);
    try {
      postCleanupBytes = await sample();
    } catch {
      postCleanupBytes = null;
    }
    const observed = [postFixtureBytes, preMaterializationBytes, postMaterializationBytes].filter(
      (value): value is number => value !== null,
    );
    const observedPeakBytes = observed.length > 0 ? Math.max(...observed) : null;
    const observedCleanupDeltaBytes =
      postCleanupBytes === null || baselineBytes === null ? null : postCleanupBytes - baselineBytes;
    return {
      ...common,
      status: "OBSERVED",
      baselineBytes,
      postFixtureBytes,
      preMaterializationBytes,
      postMaterializationBytes,
      postCleanupBytes,
      observedPeakBytes,
      peakDeltaBytes: observedPeakBytes === null ? null : observedPeakBytes - baselineBytes,
      observedCleanupDeltaBytes,
      materializationDurationMs: materialized.materializationDurationMs,
      workerDurationMs: now() - startedAt,
      materializedByteLength: materialized.materializedByteLength,
      measurementCount,
      cleanupStatus:
        postCleanupBytes === null ? "CLEANUP_MEASUREMENT_UNAVAILABLE" : "CLEANUP_OBSERVED",
      errorCode: null,
      errorMessageSanitized: null,
      workerLifecycleStage,
      workerRuntimeSignal,
      workerBootstrapProbe,
      moduleWorkerBootstrapProbe,
    };
  } catch (reason) {
    const error = reason instanceof MemoryLabError ? reason : new MemoryLabError("UNKNOWN_ERROR");
    return {
      ...unavailableResult(common, error.code),
      status: error.code === "CANCELLED" ? "CANCELLED" : "FAILED",
      baselineBytes,
      postFixtureBytes,
      preMaterializationBytes,
      postMaterializationBytes,
      measurementCount,
      workerDurationMs: now() - startedAt,
      cleanupStatus: "FAILED",
      workerLifecycleStage,
      workerRuntimeSignal,
      workerBootstrapProbe,
      moduleWorkerBootstrapProbe,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortHandler) options.signal?.removeEventListener("abort", abortHandler);
    worker?.terminate();
    worker = null;
  }
}

async function runModuleWorkerBootstrapProbe(): Promise<"PASS" | "FAIL"> {
  if (typeof Worker === "undefined") return "FAIL";
  let worker: Worker | null = null;
  try {
    worker = new Worker(
      new URL("./memoryMeasurement.module-bootstrap.worker.ts", import.meta.url),
      { type: "module", name: "gamepro-memory-module-bootstrap-probe" },
    );
    return await new Promise<"PASS" | "FAIL">((resolve) => {
      let settled = false;
      const finish = (status: "PASS" | "FAIL") => {
        if (settled) return;
        settled = true;
        worker?.removeEventListener("message", onMessage);
        worker?.removeEventListener("error", onError);
        resolve(status);
      };
      const onMessage = (event: MessageEvent<unknown>) => {
        finish(event.data === "GAMEPRO_MEMORY_MODULE_BOOTSTRAP_READY" ? "PASS" : "FAIL");
      };
      const onError = () => finish("FAIL");
      worker?.addEventListener("message", onMessage);
      worker?.addEventListener("error", onError);
      setTimeout(() => finish("FAIL"), 2_000);
    });
  } catch {
    return "FAIL";
  } finally {
    worker?.terminate();
  }
}

async function runWorkerBootstrapProbe(): Promise<"PASS" | "FAIL"> {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    return "FAIL";
  }

  let worker: Worker | null = null;
  let url: string | null = null;

  try {
    const script = 'self.postMessage("GAMEPRO_MEMORY_WORKER_BOOTSTRAP_READY");';
    url = URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
    worker = new Worker(url);

    return await new Promise<"PASS" | "FAIL">((resolve) => {
      let settled = false;
      const finish = (status: "PASS" | "FAIL") => {
        if (settled) return;
        settled = true;
        worker?.removeEventListener("message", onMessage);
        worker?.removeEventListener("error", onError);
        resolve(status);
      };
      const onMessage = (event: MessageEvent<unknown>) => {
        finish(event.data === "GAMEPRO_MEMORY_WORKER_BOOTSTRAP_READY" ? "PASS" : "FAIL");
      };
      const onError = () => finish("FAIL");
      worker?.addEventListener("message", onMessage);
      worker?.addEventListener("error", onError);
      setTimeout(() => finish("FAIL"), 2_000);
    });
  } catch {
    return "FAIL";
  } finally {
    worker?.terminate();
    if (url !== null) URL.revokeObjectURL(url);
  }
}

function availabilityToError(
  availability: Exclude<ReturnType<typeof getMemoryMeasurementAvailability>, "AVAILABLE">,
): MemoryMeasurementErrorCode {
  const errors = {
    FEATURE_DISABLED: "FEATURE_DISABLED",
    WORKER_UNAVAILABLE: "WORKER_UNAVAILABLE",
    FILE_API_UNAVAILABLE: "FIXTURE_CREATION_FAILED",
    NOT_SECURE_CONTEXT: "NOT_SECURE_CONTEXT",
    NOT_CROSS_ORIGIN_ISOLATED: "NOT_CROSS_ORIGIN_ISOLATED",
    API_UNAVAILABLE: "MEMORY_API_UNAVAILABLE",
  } as const;
  return errors[availability];
}

function unavailableResult(
  common: Pick<
    MemoryMeasurementResult,
    | "evidenceClass"
    | "fixtureSizeBytes"
    | "repetition"
    | "timestamp"
    | "crossOriginIsolated"
    | "secureContext"
    | "apiAvailable"
    | "runtime"
  >,
  code: MemoryMeasurementErrorCode,
): MemoryMeasurementResult {
  return {
    ...common,
    status: "NOT_RUN",
    baselineBytes: null,
    postFixtureBytes: null,
    preMaterializationBytes: null,
    postMaterializationBytes: null,
    postCleanupBytes: null,
    observedPeakBytes: null,
    peakDeltaBytes: null,
    observedCleanupDeltaBytes: null,
    materializationDurationMs: null,
    workerDurationMs: null,
    materializedByteLength: null,
    measurementCount: 0,
    cleanupStatus: "CLEANUP_NOT_RUN",
    errorCode: code,
    errorMessageSanitized: code,
    workerLifecycleStage: null,
    workerRuntimeSignal: null,
    workerBootstrapProbe: "NOT_RUN",
  };
}
