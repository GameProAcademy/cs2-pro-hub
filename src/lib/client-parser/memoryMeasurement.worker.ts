/// <reference lib="webworker" />
import {
  MEMORY_LAB_FIXTURE_SIZES,
  MAX_SYNTHETIC_FIXTURE_BYTES,
  createSyntheticFixture,
  type MemoryWorkerCommand,
  type MemoryWorkerEvent,
} from "./memoryMeasurement";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onunhandledrejection: ((event: PromiseRejectionEvent) => void) | null;
  postMessage: (message: MemoryWorkerEvent) => void;
};

scope.onerror = () => {
  scope.postMessage({
    type: "ERROR",
    requestId: "runtime",
    code: "MATERIALIZATION_WORKER_ERROR",
    runtimeSignal: "ONERROR",
  });
};
scope.onunhandledrejection = () => {
  scope.postMessage({
    type: "ERROR",
    requestId: "runtime",
    code: "MATERIALIZATION_WORKER_ERROR",
    runtimeSignal: "UNHANDLED_REJECTION",
  });
};

scope.onmessage = (event) => {
  const command = event.data;
  if (isInitCommand(command)) {
    scope.postMessage({ type: "WORKER_READY" });
    return;
  }
  if (!isCommand(command)) {
    const requestId =
      command && typeof command === "object" && !Array.isArray(command)
        ? (command as Record<string, unknown>)["requestId"]
        : null;
    if (typeof requestId === "string") {
      scope.postMessage({
        type: "ERROR",
        requestId,
        code: "MATERIALIZATION_INVALID_COMMAND",
      });
    }
    return;
  }
  void materialize(command);
};

function isInitCommand(value: unknown): value is Extract<MemoryWorkerCommand, { type: "MEMORY_WORKER_INIT" }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  return command["type"] === "MEMORY_WORKER_INIT" && typeof command["requestId"] === "string";
}

function isCommand(value: unknown): value is Extract<MemoryWorkerCommand, { type: "MEMORY_MEASUREMENT" }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  const descriptor = command["descriptor"] as Record<string, unknown> | undefined;

  return (
    command["type"] === "MEMORY_MEASUREMENT" &&
    typeof command["requestId"] === "string" &&
    descriptor?.["kind"] === "SYNTHETIC_MEMORY_FIXTURE" &&
    Number.isSafeInteger(descriptor["sizeBytes"]) &&
    Number(descriptor["sizeBytes"]) > 0 &&
    Number(descriptor["sizeBytes"]) <= MAX_SYNTHETIC_FIXTURE_BYTES &&
    MEMORY_LAB_FIXTURE_SIZES.includes(descriptor["sizeBytes"] as number)
  );
}

async function materialize(command: Extract<MemoryWorkerCommand, { type: "MEMORY_MEASUREMENT" }>) {
  let stage: Extract<MemoryWorkerEvent, { type: "WORKER_STAGE" }>["stage"] = "COMMAND_RECEIVED";
  const startedAt = performance.now();
  try {
    postStage(command.requestId, stage);
    postStage(command.requestId, "MATERIALIZATION_STARTED");
    stage = "FILE_CREATION_STARTED";
    postStage(command.requestId, stage);
    const fixture = createSyntheticFixture(command.descriptor);
    stage = "FILE_CREATED";
    postStage(command.requestId, stage);
    stage = "ARRAYBUFFER_STARTED";
    postStage(command.requestId, stage);
    const buffer = await fixture.arrayBuffer();
    stage = "ARRAYBUFFER_COMPLETE";
    postStage(command.requestId, stage);
    if (buffer.byteLength !== command.descriptor.sizeBytes) {
      scope.postMessage({
        type: "ERROR",
        requestId: command.requestId,
        code: "MATERIALIZATION_LENGTH_MISMATCH",
      });
      return;
    }
    postStage(command.requestId, "MATERIALIZATION_COMPLETE");
    const materializationDurationMs = performance.now() - startedAt;
    scope.postMessage({
      type: "MATERIALIZATION_COMPLETE",
      requestId: command.requestId,
      materializedByteLength: buffer.byteLength,
      materializationDurationMs,
    });
  } catch {
    scope.postMessage({
      type: "ERROR",
      requestId: command.requestId,
      code: "MATERIALIZATION_READ_FAILED",
    });
  }
}

function postStage(
  requestId: string,
  stage: Extract<MemoryWorkerEvent, { type: "WORKER_STAGE" }>["stage"],
) {
  scope.postMessage({ type: "WORKER_STAGE", requestId, stage });
}
