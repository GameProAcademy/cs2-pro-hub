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
  uploadToken: string;
  path: string;
}

function metadataDigest(value: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(value, Object.keys(value).sort()))
    .digest("hex");
}

export async function prepareR5ForensicStaging(): Promise<R5ForensicStagingResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const expiresAt = new Date(Date.now() + R5_STAGING_TTL_HOURS * 3_600_000).toISOString();
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("r5_forensic_staging")
    .select("id, status, expires_at")
    .eq("storage_path", R5_FORENSIC_STORAGE_PATH)
    .maybeSingle();
  if (lookupError) throw new Error(`R5_STAGING_LOOKUP_FAILED:${lookupError.message}`);

  let id = existing?.id;
  let status = existing?.status ?? "NOT_READY";
  let effectiveExpiry = existing?.expires_at ?? expiresAt;
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
      .select("id, status, expires_at")
      .single();
    if (error || !data) throw new Error(`R5_STAGING_CREATE_FAILED:${error?.message ?? "missing row"}`);
    id = data.id;
    status = data.status;
    effectiveExpiry = data.expires_at;
  }

  const { data: upload, error: uploadError } = await supabaseAdmin.storage
    .from(R5_FORENSIC_STAGING_BUCKET)
    .createSignedUploadUrl(R5_FORENSIC_STORAGE_PATH, { upsert: false });
  if (uploadError || !upload?.token) {
    throw new Error(`R5_STAGING_SIGNED_UPLOAD_FAILED:${uploadError?.message ?? "missing token"}`);
  }
  return { id, status, expiresAt: effectiveExpiry, uploadToken: upload.token, path: upload.path };
}

export async function verifyR5ForensicStaging(stagingId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error: rowError } = await supabaseAdmin
    .from("r5_forensic_staging")
    .select("id, bucket_id, storage_path, expires_at")
    .eq("id", stagingId)
    .maybeSingle();
  if (rowError || !row) throw new Error("R5_STAGING_NOT_FOUND");
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new Error("R5_STAGING_EXPIRED");

  const { data: blob, error: downloadError } = await supabaseAdmin.storage
    .from(row.bucket_id)
    .download(row.storage_path);
  if (downloadError || !blob) throw new Error("R5_DEM_OBJECT_MISSING");
  const observedSize = blob.size;
  const observedSha256 = await sha256FromStream(blob.stream() as ReadableStream<Uint8Array>);
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
      bytes_readable: true,
      bytes_verified_at: new Date().toISOString(),
      observed_sha256: observedSha256,
      observed_size: observedSize,
      metadata_digest: digest,
      blocked_reason: valid ? null : "CACHE_DEMO_IDENTITY_MISMATCH",
    })
    .eq("id", stagingId);
  if (updateError) throw new Error(`R5_STAGING_VERIFY_FAILED:${updateError.message}`);

  const { data: gate, error: gateError } = await supabaseAdmin.rpc("r5_real_dem_access_gate", {
    _staging_id: stagingId,
  });
  if (gateError) throw new Error(`R5_ACCESS_GATE_FAILED:${gateError.message}`);
  return gate;
}