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

/**
 * Supabase recommends the direct Storage hostname for large TUS uploads.
 * Keep localhost/custom domains untouched so local development and explicit
 * deployments retain their configured origin.
 */
export function resumableStorageEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("STORAGE_ERROR");
  }

  const projectRefMatch = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  const origin = projectRefMatch
    ? `https://${projectRefMatch[1]}.storage.supabase.co`
    : url.origin;

  return `${origin}/storage/v1/upload/resumable`;
}

async function sessionAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    const detail = error?.message ? `AUTH_SESSION_ERROR: ${error.message}` : "AUTH_SESSION_ERROR: no active session";
    throw new Error(detail);
  }
  return token;
}

function redactDiagnostic(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .slice(0, 2_000);
}

function tusErrorDiagnostic(error: unknown, endpoint: string): string {
  const candidate = error as {
    message?: unknown;
    originalResponse?: {
      getStatus?: () => number;
      getBody?: () => string;
    };
  };
  const status = candidate.originalResponse?.getStatus?.();
  const body = candidate.originalResponse?.getBody?.();
  const message = candidate.message instanceof Error ? candidate.message.message : candidate.message;
  const parts = [
    `endpoint=${endpoint}`,
    status != null ? `http_status=${status}` : "http_status=unknown",
    body ? `response_body=${redactDiagnostic(body)}` : "response_body=empty",
    message ? `message=${redactDiagnostic(String(message))}` : "message=unknown",
  ];
  return parts.join("; ");
}

/** Uploads directly from the browser to the private demos bucket through TUS. */
export async function uploadDemoResumably(
  file: File,
  storagePath: string,
  options: ResumableUploadOptions = {},
): Promise<void> {
  const baseUrl = import.meta.env["VITE_SUPABASE_URL"];
  if (!baseUrl) throw new Error("STORAGE_ERROR: VITE_SUPABASE_URL is missing");
  if (options.signal?.aborted) throw new DOMException("Upload aborted", "AbortError");

  // Fail fast (and with a precise diagnostic) when there is no usable session.
  await sessionAccessToken();
  const endpoint = resumableStorageEndpoint(baseUrl);

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
      endpoint,
      chunkSize: TUS_CHUNK_BYTES,
      uploadDataDuringCreation: true,
      retryDelays: [...TUS_RETRY_DELAYS_MS],
      metadata: {
        bucketName: DEMO_BUCKET,
        objectName: storagePath,
        contentType: DEMO_CONTENT_TYPE,
        cacheControl: "3600",
      },
      // The Authorization header is set ONLY in onBeforeRequest. Declaring it here
      // as well makes the XHR layer call setRequestHeader("authorization", ...)
      // twice, and the browser then merges both values into
      // "Bearer <a>, Bearer <b>", which Storage rejects with
      // 400 / {"code":"AccessDenied","message":"Invalid Compact JWS"}.
      headers: {
        "x-upsert": "true",
      },
      fingerprint: async () => `cs2-demo:${DEMO_BUCKET}:${storagePath}`,
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      onBeforeRequest: async (request) => {
        request.setHeader("authorization", `Bearer ${await sessionAccessToken()}`);
      },
      onProgress: (bytesSent, bytesTotal) => options.onProgress?.({ bytesSent, bytesTotal }),
      onError: (error) => {
        const detail = tusErrorDiagnostic(error, endpoint);
        console.error("[CS2 DEMO TUS] upload failed", detail);
        finish("reject", new Error(`STORAGE_ERROR: ${detail}`));
      },
      onSuccess: () => finish("resolve"),
    });

    const onAbort = () => {
      void upload
        .abort(false)
        .finally(() => finish("reject", new DOMException("Upload aborted", "AbortError")));
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
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("[CS2 DEMO TUS] upload initialization failed", detail);
        finish("reject", new Error(`STORAGE_ERROR: ${redactDiagnostic(detail)}`));
      });
  });
}
