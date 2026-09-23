import { createHash } from "node:crypto";

import {
  R5_AUTHORIZED_DEM_FILENAME,
  R5_AUTHORIZED_DEM_SHA256,
  R5_AUTHORIZED_DEM_SIZE_BYTES,
  R5_CANONICAL_RELEASE_ID,
  R5_FORENSIC_SOURCE,
  R5_FORENSIC_STAGING_BUCKET,
  R5_FORENSIC_STORAGE_PATH,
  R5_STAGING_TTL_HOURS,
} from "@/config/r5ForensicStaging";
import { sha256FromStream } from "@/lib/pipeline/storage.server";

export interface R5ForensicStagingResult {
  id: string;
  status: string;
  expiresAt: string;
  path: string;
  bucket: string;
  observedSha256: string | null;
  observedSize: number | null;
  bytesReadable: boolean;
  bytesUploaded: number;
  uploadAttemptCount: number;
  lastErrorCode: string | null;
}

function metadataDigest(value: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(value, Object.keys(value).sort()))
    .digest("hex");
}


async function createDemoSignedUrlForBucketObject(bucketId: string, storagePath: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from(bucketId).createSignedUrl(storagePath, 60 * 15);
  if (error || !data?.signedUrl) throw new Error("R5_DEM_OBJECT_MISSING");
  return data.signedUrl;
}

const R5_SELECT =
  "id, status, transport_status, expires_at, observed_sha256, observed_size, bytes_readable, bytes_uploaded, upload_attempt_count, last_error_code";

function mapStagingRow(row: {
  id: string;
  transport_status: string;
  expires_at: string;
  observed_sha256: string | null;
  observed_size: number | null;
  bytes_readable: boolean;
  bytes_uploaded: number;
  upload_attempt_count: number;
  last_error_code: string | null;
}): R5ForensicStagingResult {
  return {
    id: row.id,
    status: row.transport_status,
    expiresAt: row.expires_at,
    path: R5_FORENSIC_STORAGE_PATH,
    bucket: R5_FORENSIC_STAGING_BUCKET,
    observedSha256: row.observed_sha256,
    observedSize: row.observed_size,
    bytesReadable: row.bytes_readable,
    bytesUploaded: row.bytes_uploaded,
    uploadAttemptCount: row.upload_attempt_count,
    lastErrorCode: row.last_error_code,
  };
}

export async function getR5ForensicStaging(): Promise<R5ForensicStagingResult | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("r5_forensic_staging")
    .select(R5_SELECT)
    .eq("storage_path", R5_FORENSIC_STORAGE_PATH)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`R5_STAGING_LOOKUP_FAILED:${error.message}`);
  return data ? mapStagingRow(data) : null;
}

export async function prepareR5ForensicStaging(): Promise<R5ForensicStagingResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("prepare_r5_forensic_staging");
  if (error || !data) throw new Error(`R5_STAGING_CREATE_FAILED:${error?.message ?? "missing row"}`);
  return mapStagingRow(data);
}

export async function updateR5TransportState(
  stagingId: string,
  state: "started" | "completed" | "cancelled" | "failed",
  errorCode?: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("transition_r5_forensic_upload", {
    _staging_id: stagingId,
    _action: state,
    ...(errorCode === undefined ? {} : { _error_code: errorCode }),
  });
  if (error) throw new Error(`R5_STAGING_STATE_FAILED:${error.message}`);
}

export async function updateR5TransportProgress(stagingId: string, bytesUploaded: number): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("record_r5_forensic_progress", {
    _staging_id: stagingId,
    _bytes_uploaded: bytesUploaded,
  });
  if (error) throw new Error(`R5_STAGING_PROGRESS_FAILED:${error.message}`);
}

export async function verifyR5ForensicStaging(stagingId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error: rowError } = await supabaseAdmin
    .from("r5_forensic_staging")
    .select("id, bucket_id, storage_path, release_id, filename, demo_sha256, file_size, expires_at")
    .eq("id", stagingId)
    .maybeSingle();
  if (rowError || !row) throw new Error("R5_STAGING_NOT_FOUND");
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new Error("R5_STAGING_EXPIRED");
  if (row.bucket_id !== R5_FORENSIC_STAGING_BUCKET) throw new Error("R5_BUCKET_MISMATCH");
  if (row.storage_path !== R5_FORENSIC_STORAGE_PATH) throw new Error("R5_PATH_MISMATCH");
  if (row.release_id !== R5_CANONICAL_RELEASE_ID) throw new Error("R5_RELEASE_MISMATCH");
  if (row.filename !== R5_AUTHORIZED_DEM_FILENAME) throw new Error("R5_FILE_NAME_MISMATCH");
  if (row.demo_sha256 !== R5_AUTHORIZED_DEM_SHA256) throw new Error("R5_FILE_HASH_MISMATCH");
  if (row.file_size !== R5_AUTHORIZED_DEM_SIZE_BYTES) throw new Error("R5_FILE_SIZE_MISMATCH");

  const { error: verifyingError } = await supabaseAdmin.rpc("transition_r5_forensic_verification", {
    _staging_id: stagingId,
    _action: "started",
  });
  if (verifyingError) throw new Error(`R5_STAGING_VERIFY_FAILED:${verifyingError.message}`);

  try {
    const signedUrl = await createDemoSignedUrlForBucketObject(row.bucket_id, row.storage_path);
    const response = await fetch(signedUrl);
    if (!response.ok || !response.body) throw new Error("R5_DEM_OBJECT_MISSING");
    let observedSize = 0;
    const hashingStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = response.body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              observedSize += value.byteLength;
              controller.enqueue(value);
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });
    const observedSha256 = await sha256FromStream(hashingStream);
    if (observedSize !== R5_AUTHORIZED_DEM_SIZE_BYTES) throw new Error("R5_FILE_SIZE_MISMATCH");
    if (observedSha256 !== R5_AUTHORIZED_DEM_SHA256) throw new Error("R5_FILE_HASH_MISMATCH");
    const digest = metadataDigest({
      bucketId: row.bucket_id,
      filename: R5_AUTHORIZED_DEM_FILENAME,
      releaseId: R5_CANONICAL_RELEASE_ID,
      sha256: observedSha256,
      size: observedSize,
      storagePath: row.storage_path,
    });
    const { error: verifiedError } = await supabaseAdmin.rpc("transition_r5_forensic_verification", {
      _staging_id: stagingId,
      _action: "verified",
      _observed_size: observedSize,
      _observed_sha256: observedSha256,
      _metadata_digest: digest,
    });
    if (verifiedError) throw new Error(`R5_STAGING_VERIFY_FAILED:${verifiedError.message}`);
  } catch (error) {
    const code = error instanceof Error ? (error.message.split(":", 1)[0] ?? "R5_VERIFICATION_FAILED") : "R5_VERIFICATION_FAILED";
    await supabaseAdmin.rpc("transition_r5_forensic_verification", {
      _staging_id: stagingId,
      _action: "failed",
      _error_code: code,
    });
    throw error;
  }

  const { data: gate, error: gateError } = await supabaseAdmin.rpc("r5_real_dem_access_gate", {
    _staging_id: stagingId,
  });
  if (gateError) throw new Error(`R5_ACCESS_GATE_FAILED:${gateError.message}`);
  return gate;
}