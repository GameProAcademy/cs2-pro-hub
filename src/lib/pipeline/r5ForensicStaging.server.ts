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
    .maybeSingle();
  if (error) throw new Error(`R5_STAGING_LOOKUP_FAILED:${error.message}`);
  return data ? mapStagingRow(data) : null;
}

export async function prepareR5ForensicStaging(): Promise<R5ForensicStagingResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const expiresAt = new Date(Date.now() + R5_STAGING_TTL_HOURS * 3_600_000).toISOString();
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("r5_forensic_staging")
    .select(R5_SELECT)
    .eq("storage_path", R5_FORENSIC_STORAGE_PATH)
    .maybeSingle();
  if (lookupError) throw new Error(`R5_STAGING_LOOKUP_FAILED:${lookupError.message}`);

  let id = existing?.id;
  if (!id) {
    const { data, error } = await supabaseAdmin
      .from("r5_forensic_staging")
      .insert({
        release_id: R5_CANONICAL_RELEASE_ID,
        demo_sha256: R5_AUTHORIZED_DEM_SHA256,
        file_size: R5_AUTHORIZED_DEM_SIZE_BYTES,
        filename: R5_AUTHORIZED_DEM_FILENAME,
        bucket_id: R5_FORENSIC_STAGING_BUCKET,
        storage_path: R5_FORENSIC_STORAGE_PATH,
        source: R5_FORENSIC_SOURCE,
        expires_at: expiresAt,
      })
      .select(R5_SELECT)
      .single();
    if (error || !data) throw new Error(`R5_STAGING_CREATE_FAILED:${error?.message ?? "missing row"}`);
    return mapStagingRow(data);
  }
  if (!existing) throw new Error("R5_STAGING_NOT_FOUND");
  return mapStagingRow(existing);
}

export async function updateR5TransportState(
  stagingId: string,
  state: "started" | "completed" | "failed",
  errorCode?: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { data: current, error: lookupError } = await supabaseAdmin
    .from("r5_forensic_staging")
    .select("upload_attempt_count")
    .eq("id", stagingId)
    .eq("storage_path", R5_FORENSIC_STORAGE_PATH)
    .maybeSingle();
  if (lookupError || !current) throw new Error("R5_STAGING_NOT_FOUND");
  const changes =
    state === "started"
      ? {
          transport_status: "UPLOADING",
          upload_started_at: now,
          upload_attempt_count: current.upload_attempt_count + 1,
          last_error_code: null,
          last_error_message_safe: null,
        }
      : state === "completed"
        ? {
            transport_status: "UPLOADED_UNVERIFIED",
            upload_completed_at: now,
            bytes_uploaded: R5_AUTHORIZED_DEM_SIZE_BYTES,
            last_error_code: null,
            last_error_message_safe: null,
          }
        : {
            transport_status: "BLOCKED",
            last_error_code: errorCode ?? "R5_UPLOAD_FAILED",
            last_error_message_safe: errorCode ?? "R5_UPLOAD_FAILED",
          };
  const { error } = await supabaseAdmin
    .from("r5_forensic_staging")
    .update(changes)
    .eq("id", stagingId)
    .eq("storage_path", R5_FORENSIC_STORAGE_PATH);
  if (error) throw new Error(`R5_STAGING_STATE_FAILED:${error.message}`);
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

  const { error: verifyingError } = await supabaseAdmin
    .from("r5_forensic_staging")
    .update({ transport_status: "VERIFYING", verification_started_at: new Date().toISOString() })
    .eq("id", stagingId);
  if (verifyingError) throw new Error(`R5_STAGING_VERIFY_FAILED:${verifyingError.message}`);

  let response: Response;
  try {
    const signedUrl = await createDemoSignedUrlForBucketObject(row.bucket_id, row.storage_path);
    response = await fetch(signedUrl);
    if (!response.ok || !response.body) throw new Error("R5_DEM_OBJECT_MISSING");
  } catch (error) {
    await supabaseAdmin
      .from("r5_forensic_staging")
      .update({
        transport_status: "BLOCKED",
        status: "BLOCKED",
        bytes_readable: false,
        last_error_code: "R5_DEM_OBJECT_MISSING",
        blocked_reason: "R5_DEM_OBJECT_MISSING",
      })
      .eq("id", stagingId);
    throw error;
  }

  let observedSize = 0;
  const hashingStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body?.getReader();
      if (!reader) {
        controller.error(new Error("R5_OBJECT_UNREADABLE"));
        return;
      }
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
  const valid =
    observedSize === R5_AUTHORIZED_DEM_SIZE_BYTES && observedSha256 === R5_AUTHORIZED_DEM_SHA256;
  const digest = metadataDigest({
    bucketId: row.bucket_id,
    filename: R5_AUTHORIZED_DEM_FILENAME,
    releaseId: R5_CANONICAL_RELEASE_ID,
    sha256: observedSha256,
    size: observedSize,
    storagePath: row.storage_path,
  });
  const { error: updateError } = await supabaseAdmin
    .from("r5_forensic_staging")
    .update({
      status: valid ? "READY_FOR_EXECUTION" : "BLOCKED",
      transport_status: valid ? "READY_FOR_EXECUTION" : "BLOCKED",
      bytes_readable: true,
      bytes_verified_at: new Date().toISOString(),
      observed_sha256: observedSha256,
      observed_size: observedSize,
      metadata_digest: digest,
      blocked_reason: valid ? null : "CACHE_DEMO_IDENTITY_MISMATCH",
      last_error_code: valid
        ? null
        : observedSize !== R5_AUTHORIZED_DEM_SIZE_BYTES
          ? "R5_FILE_SIZE_MISMATCH"
          : "R5_FILE_HASH_MISMATCH",
    })
    .eq("id", stagingId);
  if (updateError) throw new Error(`R5_STAGING_VERIFY_FAILED:${updateError.message}`);

  const { data: gate, error: gateError } = await supabaseAdmin.rpc("r5_real_dem_access_gate", {
    _staging_id: stagingId,
  });
  if (gateError) throw new Error(`R5_ACCESS_GATE_FAILED:${gateError.message}`);
  return gate;
}