export interface LargeDemHashProgress {
  bytesRead: number;
  bytesTotal: number;
}

export type LargeDemHashWorkerEvent =
  | { type: "PROGRESS"; requestId: string; bytesRead: number; bytesTotal: number }
  | { type: "COMPLETE"; requestId: string; sha256: string; bytesRead: number }
  | { type: "CANCELLED"; requestId: string }
  | { type: "ERROR"; requestId: string };

export function isLargeDemHashWorkerEvent(value: unknown): value is LargeDemHashWorkerEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (typeof event["requestId"] !== "string" || typeof event["type"] !== "string") return false;
  if (event["type"] === "PROGRESS")
    return Number.isFinite(event["bytesRead"]) && Number.isFinite(event["bytesTotal"]);
  if (event["type"] === "COMPLETE")
    return (
      Number.isFinite(event["bytesRead"]) &&
      typeof event["sha256"] === "string" &&
      /^[0-9a-f]{64}$/.test(event["sha256"])
    );
  return event["type"] === "CANCELLED" || event["type"] === "ERROR";
}

export function hashLargeDemInWorker(
  file: File,
  options: { signal?: AbortSignal; onProgress?: (progress: LargeDemHashProgress) => void } = {},
): Promise<{ sha256: string; bytesRead: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./largeDemHash.worker.ts", import.meta.url), {
      type: "module",
      name: "gamepro-large-dem-hash",
    });
    const requestId = crypto.randomUUID();
    let settled = false;
    const finish = (error?: Error, result?: { sha256: string; bytesRead: number }) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error("LARGE_DEM_HASH_FAILED"));
    };
    const abort = () => {
      worker.postMessage({ type: "CANCEL", requestId });
      finish(new DOMException("Hash cancelled", "AbortError"));
    };
    worker.onerror = () => finish(new Error("LARGE_DEM_HASH_FAILED"));
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (!isLargeDemHashWorkerEvent(event.data)) {
        finish(new Error("LARGE_DEM_HASH_FAILED"));
        return;
      }
      if (event.data["requestId"] !== requestId) return;
      if (event.data["type"] === "PROGRESS")
        options.onProgress?.({
          bytesRead: Number(event.data["bytesRead"]),
          bytesTotal: Number(event.data["bytesTotal"]),
        });
      if (event.data["type"] === "COMPLETE")
        finish(undefined, {
          sha256: String(event.data["sha256"]),
          bytesRead: Number(event.data["bytesRead"]),
        });
      if (event.data["type"] === "CANCELLED")
        finish(new DOMException("Hash cancelled", "AbortError"));
      if (event.data["type"] === "ERROR") finish(new Error("LARGE_DEM_HASH_FAILED"));
    };
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage({ type: "HASH", requestId, file });
  });
}
