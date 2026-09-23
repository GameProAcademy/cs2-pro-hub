export interface LargeDemHashProgress {
  bytesRead: number;
  bytesTotal: number;
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
    worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
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
