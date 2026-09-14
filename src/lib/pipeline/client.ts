/**
 * Browser-side demo ingestion flow.
 *
 * The browser NEVER parses the demo. It hashes the file (idempotency),
 * uploads it into the private bucket with the user's own session (RLS scoped to
 * `{user_id}/...`), enqueues the job and then polls the server for the status.
 */
import { MAX_DEMO_SIZE_BYTES, MIN_DEMO_SIZE_BYTES } from "@/config/pipeline";
import {
  createDemoUpload,
  enqueueDemoJob,
  getDemoJobStatus,
  type DemoJobView,
} from "@/lib/pipeline.functions";
import { sha256HexFromBlob } from "@/lib/pipeline/sha256";
import { uploadDemoResumably, type ResumableUploadOptions } from "@/lib/pipeline/resumableUpload";

export type ClientUploadError =
  | "DEMO_TOO_LARGE"
  | "DEMO_TOO_SMALL"
  | "INVALID_DEMO_FORMAT"
  | "STORAGE_ERROR"
  | "PROCESSING_ERROR";

export class DemoUploadError extends Error {
  constructor(
    readonly code: ClientUploadError,
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "DemoUploadError";
  }
}

export type DemoUploadState = "hashing" | "registering" | "uploading" | "completed";

export interface DemoUploadProgress {
  state: DemoUploadState;
  bytesSent: number;
  bytesTotal: number;
  percent: number;
}

export interface SubmitDemoOptions {
  signal?: AbortSignal;
  onProgress?: (progress: DemoUploadProgress) => void;
}

export type DuplicateStatus = "processed" | "pending" | "failed" | "cancelled" | null;

export interface SubmitDemoResult {
  jobId: string | null;
  duplicate: boolean;
  duplicateStatus: DuplicateStatus;
}

export interface SubmitDemoDependencies {
  hash(file: Blob): Promise<string>;
  create(input: { data: { fileName: string; fileSize: number; demoSha256: string } }): Promise<{
    uploadId: string;
    storagePath: string;
    duplicate: boolean;
    duplicateStatus: DuplicateStatus;
    existingJobId: string | null;
  }>;
  upload(file: File, storagePath: string, options: ResumableUploadOptions): Promise<void>;
  enqueue(input: { data: { uploadId: string } }): Promise<{ jobId: string }>;
}

const submitDemoDependencies: SubmitDemoDependencies = {
  hash: sha256Hex,
  create: createDemoUpload,
  upload: async (file, storagePath, options) => {
    await uploadDemoResumably(file, storagePath, options);
  },
  enqueue: enqueueDemoJob,
};

/**
 * FASE 2.7 — chunked hashing. `file.arrayBuffer()` would materialise up to
 * 1.5 GB in the tab and crash on exactly the demos this pipeline targets, so the
 * digest is accumulated chunk by chunk.
 */
export async function sha256Hex(file: Blob): Promise<string> {
  return sha256HexFromBlob(file);
}

/** Client-side pre-check. The server validates everything again. */
export function precheckDemo(file: File): void {
  if (!file.name.toLowerCase().endsWith(".dem")) throw new DemoUploadError("INVALID_DEMO_FORMAT");
  if (file.size < MIN_DEMO_SIZE_BYTES) throw new DemoUploadError("DEMO_TOO_SMALL");
  if (file.size > MAX_DEMO_SIZE_BYTES) throw new DemoUploadError("DEMO_TOO_LARGE");
}

export async function submitDemo(
  file: File,
  options: SubmitDemoOptions = {},
): Promise<SubmitDemoResult> {
  return submitDemoWithDependencies(file, options, submitDemoDependencies);
}

/** Testable orchestration seam; production always uses the dependencies above. */
export async function submitDemoWithDependencies(
  file: File,
  options: SubmitDemoOptions,
  dependencies: SubmitDemoDependencies,
): Promise<SubmitDemoResult> {
  precheckDemo(file);
  options.onProgress?.({ state: "hashing", bytesSent: 0, bytesTotal: file.size, percent: 0 });
  const demoSha256 = await dependencies.hash(file);

  options.onProgress?.({ state: "registering", bytesSent: 0, bytesTotal: file.size, percent: 0 });
  const slot = await dependencies.create({
    data: { fileName: file.name, fileSize: file.size, demoSha256 },
  });

  if (slot.duplicate && slot.duplicateStatus === "processed") {
    // A successfully processed demo is immutable from the user's perspective:
    // do not overwrite its storage object or create another job.
    options.onProgress?.({
      state: "completed",
      bytesSent: file.size,
      bytesTotal: file.size,
      percent: 100,
    });
    return {
      jobId: slot.existingJobId,
      duplicate: true,
      duplicateStatus: "processed",
    };
  }

  if (slot.duplicate && (slot.duplicateStatus === "failed" || slot.duplicateStatus === "cancelled")) {
    // FAILED/CANCELLED is intentionally retryable. Reuse the deterministic
    // storage path and the same demo_jobs row. The upload is replaced only for
    // a terminal unsuccessful attempt; processed/pending data is never touched.
    if (!slot.existingJobId) throw new DemoUploadError("PROCESSING_ERROR", "duplicate job missing");
    try {
      await dependencies.upload(file, slot.storagePath, {
        ...(options.signal ? { signal: options.signal } : {}),
        onProgress: ({ bytesSent, bytesTotal }) =>
          options.onProgress?.({
            state: "uploading",
            bytesSent,
            bytesTotal,
            percent: bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0,
          }),
      });
    } catch (error) {
      if (error instanceof DemoUploadError) throw error;
      throw new DemoUploadError(
        "STORAGE_ERROR",
        error instanceof Error ? error.message : String(error),
      );
    }

    // The server-side enqueue RPC atomically reactivates the existing failed or
    // cancelled job after the new bytes are safely in storage.
    const job = await dependencies.enqueue({ data: { uploadId: slot.uploadId } });
    options.onProgress?.({
      state: "completed",
      bytesSent: file.size,
      bytesTotal: file.size,
      percent: 100,
    });
    return {
      jobId: job.jobId || slot.existingJobId,
      duplicate: true,
      duplicateStatus: slot.duplicateStatus,
    };
  }

  if (slot.duplicate) {
    // Pending/processing duplicate: do not overwrite bytes or enqueue again.
    options.onProgress?.({
      state: "completed",
      bytesSent: file.size,
      bytesTotal: file.size,
      percent: 100,
    });
    return {
      jobId: slot.existingJobId,
      duplicate: true,
      duplicateStatus: slot.duplicateStatus,
    };
  }

  try {
    await dependencies.upload(file, slot.storagePath, {
      ...(options.signal ? { signal: options.signal } : {}),
      onProgress: ({ bytesSent, bytesTotal }) =>
        options.onProgress?.({
          state: "uploading",
          bytesSent,
          bytesTotal,
          percent: bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0,
        }),
    });
  } catch (error) {
    if (error instanceof DemoUploadError) throw error;
    throw new DemoUploadError(
      "STORAGE_ERROR",
      error instanceof Error ? error.message : String(error),
    );
  }

  const job = await dependencies.enqueue({ data: { uploadId: slot.uploadId } });
  options.onProgress?.({
    state: "completed",
    bytesSent: file.size,
    bytesTotal: file.size,
    percent: 100,
  });
  return { jobId: job.jobId, duplicate: false, duplicateStatus: null };
}

export async function pollJob(jobId: string): Promise<DemoJobView | null> {
  return getDemoJobStatus({ data: { jobId } });
}
