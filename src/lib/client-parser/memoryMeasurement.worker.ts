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
  postMessage: (message: MemoryWorkerEvent) => void;
};

scope.onmessage = (event) => {
  const command = event.data;
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

function isCommand(value: unknown): value is MemoryWorkerCommand {
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

async function materialize(command: MemoryWorkerCommand) {
  try {
    scope.postMessage({
      type: "MATERIALIZATION_STARTED",
      requestId: command.requestId,
    });
    const startedAt = performance.now();
    const fixture = createSyntheticFixture(command.descriptor);
    const buffer = await fixture.arrayBuffer();
    if (buffer.byteLength !== command.fixture.size) {
      scope.postMessage({
        type: "ERROR",
        requestId: command.requestId,
        code: "MATERIALIZATION_LENGTH_MISMATCH",
      });
      return;
    }
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
