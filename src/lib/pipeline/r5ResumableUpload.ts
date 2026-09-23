import { Upload } from "tus-js-client";

import {
  R5_AUTHORIZED_DEM_FILENAME,
  R5_AUTHORIZED_DEM_SHA256,
  R5_AUTHORIZED_DEM_SIZE_BYTES,
  R5_FORENSIC_STAGING_BUCKET,
  R5_FORENSIC_STORAGE_PATH,
  R5_TUS_CHUNK_BYTES,
  R5_TUS_RETRY_DELAYS_MS,
} from "@/config/r5ForensicStaging";
import { supabase } from "@/integrations/supabase/client";
import { resumableStorageEndpoint } from "@/lib/pipeline/resumableUpload";
import { HASH_CHUNK_BYTES, Sha256 } from "@/lib/pipeline/sha256";

export interface R5UploadProgress {
  bytesSent: number;
  bytesTotal: number;
  percent: number;
  bytesRemaining: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
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
): Promise<void> {
  assertAuthorizedR5File(file);
  const hasher = new Sha256();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
    const end = Math.min(offset + HASH_CHUNK_BYTES, file.size);
    hasher.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
    onProgress?.(Math.round((end / file.size) * 100));
  }
  if (hasher.hex() !== R5_AUTHORIZED_DEM_SHA256) throw new Error("R5_FILE_HASH_MISMATCH");
}

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("R5_NOT_MASTER_ADMIN");
  return token;
}

export async function uploadR5DemoResumably(
  file: File,
  options: { signal?: AbortSignal; onProgress?: (progress: R5UploadProgress) => void } = {},
): Promise<void> {
  assertAuthorizedR5File(file);
  const baseUrl = import.meta.env["VITE_SUPABASE_URL"];
  if (!baseUrl) throw new Error("R5_UPLOAD_FAILED");
  const endpoint = resumableStorageEndpoint(baseUrl);
  const startedAt = performance.now();

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
        bucketName: R5_FORENSIC_STAGING_BUCKET,
        // TUS objectName is relative to bucketName. Never send the bucket prefix.
        objectName: R5_FORENSIC_STORAGE_PATH,
        contentType: "application/octet-stream",
        cacheControl: "no-store",
      },
      headers: { "x-upsert": "false" },
      fingerprint: async () =>
        `r5-forensic:${R5_FORENSIC_STAGING_BUCKET}:${R5_FORENSIC_STORAGE_PATH}:${file.size}`,
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
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
          (candidate) => candidate.uploadUrl != null && candidate.size === file.size,
        );
        if (resumable) upload.resumeFromPreviousUpload(resumable);
        upload.start();
      })
      .catch(() => finish(new Error("R5_UPLOAD_FAILED")));
  });
}