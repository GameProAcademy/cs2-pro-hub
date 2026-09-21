/**
 * Private demo storage helpers (server-only).
 *
 * Demos live in the private `demos` bucket under `{user_id}/{upload_id}.dem`
 * and are TEMPORARY: they are deleted after the retention window because only
 * the derived, normalised data is permanent.
 */
import { DEMO_BUCKET, DEMO_RETENTION_HOURS, FAILED_DEMO_RETENTION_HOURS } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";

const SIGNED_URL_TTL_SECONDS = 60 * 15;
export const RAW_EVIDENCE_BUCKET = "cs2-raw-evidence";

export function demoStoragePath(userId: string, uploadId: string): string {
  return `${userId}/${uploadId}.dem`;
}

export function retainUntil(success: boolean): string {
  const hours = success ? DEMO_RETENTION_HOURS : FAILED_DEMO_RETENTION_HOURS;
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

export async function createDemoSignedUrl(storagePath: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(DEMO_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new PipelineError("DEMO_NOT_FOUND", error?.message ?? "signed url unavailable");
  }
  return data.signedUrl;
}

export async function createRawEvidenceSignedUploadUrl(storagePath: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(RAW_EVIDENCE_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: true });
  if (error || !data?.signedUrl) {
    throw new PipelineError("PERSISTENCE_ERROR", error?.message ?? "raw upload url unavailable");
  }
  return data.signedUrl;
}

export async function uploadRawEvidenceManifest(storagePath: string, body: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage
    .from(RAW_EVIDENCE_BUCKET)
    .upload(storagePath, body, { contentType: "application/json", upsert: true });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
}

export async function rawEvidenceObjectSha256(storagePath: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(RAW_EVIDENCE_BUCKET)
    .download(storagePath);
  if (error || !data)
    throw new PipelineError("PERSISTENCE_ERROR", error?.message ?? "raw object unavailable");
  return sha256FromStream(data.stream() as ReadableStream<Uint8Array>);
}

export async function demoExists(storagePath: string): Promise<{ size: number } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const slash = storagePath.lastIndexOf("/");
  const folder = storagePath.slice(0, slash);
  const name = storagePath.slice(slash + 1);
  const { data, error } = await supabaseAdmin.storage.from(DEMO_BUCKET).list(folder, {
    search: name,
    limit: 100,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  const found = data?.find((entry) => entry.name === name);
  if (!found) return null;
  const size = Number((found.metadata as { size?: number } | null)?.size ?? 0);
  return { size };
}

export type DemoDeletionOutcome = "DELETE_VERIFIED" | "ALREADY_ABSENT";

export function assertDemoStoragePath(
  storagePath: string,
  userId: string,
  uploadId: string,
): void {
  if (storagePath !== demoStoragePath(userId, uploadId)) {
    throw new PipelineError("CLEANUP_ERROR", "PATH_OWNERSHIP_MISMATCH");
  }
}

/** Removes only an owned temporary DEM and proves physical absence afterwards. */
export async function deleteDemoVerified(
  storagePath: string,
  userId: string,
  uploadId: string,
): Promise<DemoDeletionOutcome> {
  assertDemoStoragePath(storagePath, userId, uploadId);
  const before = await demoExists(storagePath);
  if (!before) return "ALREADY_ABSENT";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage.from(DEMO_BUCKET).remove([storagePath]);
  if (error) throw new PipelineError("CLEANUP_ERROR", error.message);
  const after = await demoExists(storagePath);
  if (after) throw new PipelineError("CLEANUP_ERROR", "DELETE_NOT_VERIFIED");
  return "DELETE_VERIFIED";
}

/**
 * Incremental SHA-256 over a byte stream.
 *
 * Demos can reach 1.5 GB, so the file is NEVER materialised in memory:
 * `crypto.subtle.digest` (which requires the whole buffer) is deliberately not
 * used. Chunks are hashed as they arrive and discarded.
 */
export async function sha256FromStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return hash.digest("hex");
}

/**
 * Recomputes SHA-256 over the STORED bytes by streaming the private object
 * through a short-lived signed URL.
 *
 * The client-supplied hash is only an idempotency key; integrity is verified
 * server-side from the file actually present in the private bucket.
 */
export async function computeStoredDemoSha256(storagePath: string): Promise<string> {
  const signedUrl = await createDemoSignedUrl(storagePath);
  const response = await fetch(signedUrl);
  if (!response.ok || !response.body) {
    throw new PipelineError("DEMO_NOT_FOUND", `download failed (${response.status})`);
  }
  return sha256FromStream(response.body as ReadableStream<Uint8Array>);
}

/**
 * Verifies the stored bytes against the hash declared at submission time.
 * A mismatch is permanent corruption, never a transient failure.
 */
export function assertDemoIntegrity(storedSha256: string, declaredSha256: string | null): void {
  if (!declaredSha256) return;
  if (storedSha256.toLowerCase() !== declaredSha256.toLowerCase()) {
    throw new PipelineError("CORRUPTED_DEMO", "sha256 mismatch between upload and stored demo");
  }
}
