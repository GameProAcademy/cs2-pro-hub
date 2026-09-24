/// <reference lib="webworker" />
import { CLIENT_DEMO_PARSER_CAPABILITY, readContiguousDemoInput } from "./clientParser.input";
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
  if (!isCommand(command)) return;
  void materialize(command);
};

function isCommand(value: unknown): value is MemoryWorkerCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  const descriptor = command["descriptor"] as Record<string, unknown> | undefined;
  return (
    command["type"] === "MEMORY_MEASUREMENT" &&
    typeof command["requestId"] === "string" &&
    command["fixture"] instanceof File &&
    descriptor?.["kind"] === "SYNTHETIC_MEMORY_FIXTURE" &&
    Number.isSafeInteger(descriptor["sizeBytes"]) &&
    descriptor["sizeBytes"] === command["fixture"].size &&
    Number(descriptor["sizeBytes"]) > 0 &&
    Number(descriptor["sizeBytes"]) <= MAX_SYNTHETIC_FIXTURE_BYTES &&
    command["fixture"].type === "application/x-gamepro-synthetic-memory-fixture"
  );
}

async function materialize(command: MemoryWorkerCommand) {
  try {
    scope.postMessage({ type: "MATERIALIZATION_STARTED", requestId: command.requestId });
    const startedAt = performance.now();
    const materialized = await readContiguousDemoInput(
      command.fixture,
      CLIENT_DEMO_PARSER_CAPABILITY,
    );
    const materializedByteLength = materialized.buffer.byteLength;
    const materializationDurationMs = performance.now() - startedAt;
    scope.postMessage({
      type: "MATERIALIZATION_COMPLETE",
      requestId: command.requestId,
      materializedByteLength,
      materializationDurationMs,
    });
  } catch {
    scope.postMessage({ type: "ERROR", requestId: command.requestId, code: "MATERIALIZATION_FAILED" });
  }
}
