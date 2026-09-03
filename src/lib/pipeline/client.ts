/**
 * Browser-side demo ingestion flow.
 *
 * The browser NEVER parses the demo. It hashes the file (idempotency),
 * uploads it into the private bucket with the user's own session (RLS scoped to
 * `{user_id}/...`), enqueues the job and then polls the server for the status.
 */
import { DEMO_BUCKET, MAX_DEMO_SIZE_BYTES, MIN_DEMO_SIZE_BYTES } from "@/config/pipeline";
import { supabase } from "@/integrations/supabase/client";
import {
  createDemoUpload,
  enqueueDemoJob,
  getDemoJobStatus,
  type DemoJobView,
} from "@/lib/pipeline.functions";

export type ClientUploadError =
  | "DEMO_TOO_LARGE"
  | "DEMO_TOO_SMALL"
  | "INVALID_DEMO_FORMAT"
  | "STORAGE_ERROR"
  | "PROCESSING_ERROR";

export class DemoUploadError extends Error {
  constructor(readonly code: ClientUploadError) {
    super(code);
    this.name = "DemoUploadError";
  }
}

export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Client-side pre-check. The server validates everything again. */
export function precheckDemo(file: File): void {
  if (!file.name.toLowerCase().endsWith(".dem")) throw new DemoUploadError("INVALID_DEMO_FORMAT");
  if (file.size < MIN_DEMO_SIZE_BYTES) throw new DemoUploadError("DEMO_TOO_SMALL");
  if (file.size > MAX_DEMO_SIZE_BYTES) throw new DemoUploadError("DEMO_TOO_LARGE");
}

export async function submitDemo(
  file: File,
): Promise<{ jobId: string | null; duplicate: boolean }> {
  precheckDemo(file);
  const demoSha256 = await sha256Hex(file);

  const slot = await createDemoUpload({
    data: { fileName: file.name, fileSize: file.size, demoSha256 },
  });

  // A demo already processed keeps its permanent derived data: it is never
  // re-uploaded or re-processed (the temporary file may no longer exist).
  if (slot.duplicateStatus === "processed") {
    return { jobId: slot.existingJobId, duplicate: true };
  }

  const { error } = await supabase.storage.from(DEMO_BUCKET).upload(slot.storagePath, file, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (error) throw new DemoUploadError("STORAGE_ERROR");

  const job = await enqueueDemoJob({ data: { uploadId: slot.uploadId } });
  return { jobId: job.jobId, duplicate: slot.duplicate };
}

export async function pollJob(jobId: string): Promise<DemoJobView | null> {
  return getDemoJobStatus({ data: { jobId } });
}
