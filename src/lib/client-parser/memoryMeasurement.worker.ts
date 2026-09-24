/// <reference lib="webworker" />
import {
  MAX_SYNTHETIC_FIXTURE_BYTES,
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
  const fixture = command["fixture"] as
    | { size?: unknown; type?: unknown; arrayBuffer?: unknown }
    | undefined;
  return (
    command["type"] === "MEMORY_MEASUREMENT" &&
    typeof command["requestId"] === "string" &&
    typeof fixture?.size === "number" &&
    Number.isSafeInteger(fixture.size) &&
    fixture.size > 0 &&
    fixture.size <= MAX_SYNTHETIC_FIXTURE_BYTES &&
    typeof fixture?.type === "string" &&
    fixture.type === "application/x-gamepro-synthetic-memory-fixture" &&
    typeof fixture?.arrayBuffer === "function" &&
    descriptor?.["kind"] === "SYNTHETIC_MEMORY_FIXTURE" &&
    Number.isSafeInteger(descriptor["sizeBytes"]) &&
    descriptor["sizeBytes"] === fixture.size &&
    Number(descriptor["sizeBytes"]) > 0 &&
    Number(descriptor["sizeBytes"]) <= MAX_SYNTHETIC_FIXTURE_BYTES
  );
}

async function materialize(command: MemoryWorkerCommand) {
  try {
    scope.postMessage({ type: "MATERIALIZATION_STARTED", requestId: command.requestId });
    const startedAt = performance.now();
    const buffer = await command.fixture.arrayBuffer();
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
