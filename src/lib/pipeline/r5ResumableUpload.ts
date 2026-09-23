import { Upload } from "tus-js-client";

import {
  R5_AUTHORIZED_DEM_FILENAME,
  R5_AUTHORIZED_DEM_SHA256,
  R5_AUTHORIZED_DEM_SIZE_BYTES,
  R5_CANONICAL_RELEASE_ID,
  R5_FORENSIC_STAGING_BUCKET,
  R5_FORENSIC_STORAGE_PATH,
  R5_TUS_CHUNK_BYTES,
  R5_TUS_RETRY_DELAYS_MS,
} from "@/config/r5ForensicStaging";
import { supabase } from "@/integrations/supabase/client";
import { resumableStorageEndpoint } from "@/lib/pipeline/resumableUpload";

export interface R5UploadProgress {
  bytesSent: number;
  bytesTotal: number;
  percent: number;
  bytesRemaining: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
  retryCount: number;
  resumed: boolean;
}

export interface R5LocalFileEvidence {
  sha256: string;
  size: number;
}

export interface R5UploadResult {
  resumed: boolean;
  retryCount: number;
}

export function assertAuthorizedR5File(file: File): void {
  if (file.name !== R5_AUTHORIZED_DEM_FILENAME || !file.name.toLowerCase().endsWith(".dem")) {
    throw new Error("R5_FILE_NAME_MISMATCH");
  }
  if (file.size !== R5_AUTHORIZED_DEM_SIZE_BYTES) throw new Error("R5_FILE_SIZE_MISMATCH");
}

export async function verifyAuthorizedR5FileLocally(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<R5LocalFileEvidence> {
  assertAuthorizedR5File(file);
  const evidence = await new Promise<R5LocalFileEvidence>((resolve, reject) => {
    const worker = new Worker(new URL("./r5DemHash.worker.ts", import.meta.url), {
      type: "module",
    });
    let settled = false;
    const finish = (result: { evidence?: R5LocalFileEvidence; error?: Error }) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      if (result.error) reject(result.error);
      else if (result.evidence) resolve(result.evidence);
      else reject(new Error("R5_FILE_HASH_FAILED"));
    };
    const onAbort = () => finish({ error: new DOMException("Hash cancelled", "AbortError") });
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onerror = () => finish({ error: new Error("R5_FILE_HASH_FAILED") });
    worker.onmessage = (
      event: MessageEvent<{ type: string; percent?: number; sha256?: string; size?: number }>,
    ) => {
      if (event.data.type === "progress") onProgress?.(event.data.percent ?? 0);
      if (event.data.type === "done") {
        event.data.sha256 && event.data.size !== undefined
          ? finish({ evidence: { sha256: event.data.sha256, size: event.data.size } })
          : finish({ error: new Error("R5_FILE_HASH_FAILED") });
      }
      if (event.data.type === "error") finish({ error: new Error("R5_FILE_HASH_FAILED") });
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    worker.postMessage({ type: "hash", file });
  });
  if (evidence.sha256 !== R5_AUTHORIZED_DEM_SHA256) throw new Error("R5_FILE_HASH_MISMATCH");
  if (evidence.size !== R5_AUTHORIZED_DEM_SIZE_BYTES) throw new Error("R5_FILE_SIZE_MISMATCH");
  return evidence;
}

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("R5_NOT_MASTER_ADMIN");
  return token;
}

export async function uploadR5DemoResumably(
  file: File,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: R5UploadProgress) => void;
    onResume?: () => void;
    onRetry?: (retryCount: number) => void;
  } = {},
): Promise<R5UploadResult> {
  assertAuthorizedR5File(file);
  const baseUrl = import.meta.env["VITE_SUPABASE_URL"];
  if (!baseUrl) throw new Error("R5_UPLOAD_FAILED");
  const endpoint = resumableStorageEndpoint(baseUrl);
  const startedAt = performance.now();
  let retryCount = 0;
  let resumed = false;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      error ? reject(error) : resolve();
    };
    const upload = new Upload(file, {
      endpoint,
      chunkSize: R5_TUS_CHUNK_BYTES,
      retryDelays: [...R5_TUS_RETRY_DELAYS_MS],
      uploadDataDuringCreation: true,
      metadata: {
        releaseId: R5_CANONICAL_RELEASE_ID,
        sha256: R5_AUTHORIZED_DEM_SHA256,
        filename: R5_AUTHORIZED_DEM_FILENAME,
        bucketName: R5_FORENSIC_STAGING_BUCKET,
        // TUS objectName is relative to bucketName. Never send the bucket prefix.
        objectName: R5_FORENSIC_STORAGE_PATH,
        contentType: "application/octet-stream",
        cacheControl: "no-store",
      },
      headers: { "x-upsert": "false" },
      fingerprint: async () =>
        `r5-forensic:${R5_CANONICAL_RELEASE_ID}:${R5_AUTHORIZED_DEM_SHA256}:${R5_AUTHORIZED_DEM_FILENAME}:${R5_FORENSIC_STAGING_BUCKET}:${R5_FORENSIC_STORAGE_PATH}:${file.size}`,
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      onShouldRetry: () => {
        retryCount += 1;
        options.onRetry?.(retryCount);
        return true;
      },
      onBeforeRequest: async (request) =>
        request.setHeader("authorization", `Bearer ${await accessToken()}`),
      onProgress: (bytesSent, bytesTotal) => {
        const elapsedSeconds = Math.max((performance.now() - startedAt) / 1_000, 0.001);
        const bytesPerSecond = bytesSent / elapsedSeconds;
        const bytesRemaining = Math.max(bytesTotal - bytesSent, 0);
        options.onProgress?.({
          bytesSent,
          bytesTotal,
          percent: bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0,
          bytesRemaining,
          bytesPerSecond,
          etaSeconds: bytesPerSecond > 0 ? Math.ceil(bytesRemaining / bytesPerSecond) : null,
          retryCount,
          resumed,
        });
      },
      onError: () => finish(new Error("R5_UPLOAD_FAILED")),
      onSuccess: () => finish(),
    });
    const onAbort = () =>
      void upload
        .abort(false)
        .finally(() => finish(new DOMException("Upload cancelled", "AbortError")));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    void upload
      .findPreviousUploads()
      .then((previous) => {
        const resumable = previous.find(
          (candidate) =>
            candidate.uploadUrl != null &&
            candidate.size === file.size &&
            candidate.metadata["releaseId"] === R5_CANONICAL_RELEASE_ID &&
            candidate.metadata["sha256"] === R5_AUTHORIZED_DEM_SHA256 &&
            candidate.metadata["filename"] === R5_AUTHORIZED_DEM_FILENAME &&
            candidate.metadata["bucketName"] === R5_FORENSIC_STAGING_BUCKET &&
            candidate.metadata["objectName"] === R5_FORENSIC_STORAGE_PATH &&
            candidate.metadata["contentType"] === "application/octet-stream",
        );
        if (resumable) {
          resumed = true;
          upload.resumeFromPreviousUpload(resumable);
          options.onResume?.();
        }
        upload.start();
      })
      .catch(() => finish(new Error("R5_UPLOAD_FAILED")));
  });
  return { resumed, retryCount };
}
