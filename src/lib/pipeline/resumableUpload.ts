import { Upload } from "tus-js-client";

import { DEMO_BUCKET, DEMO_CONTENT_TYPE } from "@/config/pipeline";
import { supabase } from "@/integrations/supabase/client";

export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
export const TUS_RETRY_DELAYS_MS = [0, 3_000, 5_000, 10_000, 20_000] as const;

export interface ResumableUploadProgress {
  bytesSent: number;
  bytesTotal: number;
}

export interface ResumableUploadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ResumableUploadProgress) => void;
}

export function resumableStorageEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("STORAGE_ERROR");
  }
  return `${url.origin}/storage/v1/upload/resumable`;
}

async function sessionAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("STORAGE_ERROR");
  return token;
}

/** Uploads directly from the browser to the private demos bucket through TUS. */
export async function uploadDemoResumably(
  file: File,
  storagePath: string,
  options: ResumableUploadOptions = {},
): Promise<void> {
  const baseUrl = import.meta.env["VITE_SUPABASE_URL"];
  if (!baseUrl) throw new Error("STORAGE_ERROR");
  if (options.signal?.aborted) throw new DOMException("Upload aborted", "AbortError");

  const initialToken = await sessionAccessToken();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (result: "resolve" | "reject", error?: Error) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      if (result === "resolve") resolve();
      else reject(error ?? new Error("STORAGE_ERROR"));
    };

    const upload = new Upload(file, {
      endpoint: resumableStorageEndpoint(baseUrl),
      chunkSize: TUS_CHUNK_BYTES,
      retryDelays: [...TUS_RETRY_DELAYS_MS],
      metadata: {
        bucketName: DEMO_BUCKET,
        objectName: storagePath,
        contentType: DEMO_CONTENT_TYPE,
        cacheControl: "3600",
      },
      headers: {
        authorization: `Bearer ${initialToken}`,
        "x-upsert": "true",
      },
      fingerprint: async () => `cs2-demo:${DEMO_BUCKET}:${storagePath}`,
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      onBeforeRequest: async (request) => {
        request.setHeader("authorization", `Bearer ${await sessionAccessToken()}`);
      },
      onProgress: (bytesSent, bytesTotal) => options.onProgress?.({ bytesSent, bytesTotal }),
      onError: () => finish("reject", new Error("STORAGE_ERROR")),
      onSuccess: () => finish("resolve"),
    });

    const onAbort = () => {
      void upload.abort(false).finally(() =>
        finish("reject", new DOMException("Upload aborted", "AbortError")),
      );
    };
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
      .catch(() => finish("reject", new Error("STORAGE_ERROR")));
  });
}