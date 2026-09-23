/// <reference lib="webworker" />
import { Sha256 } from "@/lib/pipeline/sha256";
import { LARGE_DEM_HASH_CHUNK_BYTES } from "./largeDemFeasibility";

type Request =
  { type: "HASH"; requestId: string; file: File } | { type: "CANCEL"; requestId: string };
type Response =
  | { type: "PROGRESS"; requestId: string; bytesRead: number; bytesTotal: number }
  | { type: "COMPLETE"; requestId: string; sha256: string; bytesRead: number }
  | { type: "CANCELLED"; requestId: string }
  | { type: "ERROR"; requestId: string };

const cancelled = new Set<string>();
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: Response) => void;
};

scope.onmessage = (event) => {
  if (event.data.type === "CANCEL") {
    cancelled.add(event.data.requestId);
    return;
  }
  void hash(event.data);
};

async function hash(request: Extract<Request, { type: "HASH" }>) {
  try {
    const hasher = new Sha256();
    for (let offset = 0; offset < request.file.size; offset += LARGE_DEM_HASH_CHUNK_BYTES) {
      if (cancelled.has(request.requestId)) {
        scope.postMessage({ type: "CANCELLED", requestId: request.requestId });
        return;
      }
      const end = Math.min(offset + LARGE_DEM_HASH_CHUNK_BYTES, request.file.size);
      hasher.update(new Uint8Array(await request.file.slice(offset, end).arrayBuffer()));
      scope.postMessage({
        type: "PROGRESS",
        requestId: request.requestId,
        bytesRead: end,
        bytesTotal: request.file.size,
      });
    }
    scope.postMessage({
      type: "COMPLETE",
      requestId: request.requestId,
      sha256: hasher.hex(),
      bytesRead: request.file.size,
    });
  } catch {
    scope.postMessage({ type: "ERROR", requestId: request.requestId });
  } finally {
    cancelled.delete(request.requestId);
  }
}
