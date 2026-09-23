import { HASH_CHUNK_BYTES, Sha256 } from "./sha256";

type HashRequest = { type: "hash"; file: File };
type HashResponse =
  | { type: "progress"; percent: number }
  | { type: "done"; sha256: string }
  | { type: "error"; code: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<HashRequest>) => void) | null;
  postMessage: (message: HashResponse) => void;
};

workerScope.onmessage = (event) => {
  if (event.data.type !== "hash") return;
  void hashFile(event.data.file);
};

async function hashFile(file: File): Promise<void> {
  try {
    const hasher = new Sha256();
    for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
      const end = Math.min(offset + HASH_CHUNK_BYTES, file.size);
      const chunk = await file.slice(offset, end).arrayBuffer();
      hasher.update(new Uint8Array(chunk));
      workerScope.postMessage({ type: "progress", percent: Math.round((end / file.size) * 100) });
    }
    workerScope.postMessage({ type: "done", sha256: hasher.hex() });
  } catch {
    workerScope.postMessage({ type: "error", code: "R5_FILE_HASH_FAILED" });
  }
}