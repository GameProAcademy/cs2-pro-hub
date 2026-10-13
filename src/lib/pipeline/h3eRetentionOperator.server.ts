/**
 * H.3-E retention operator (server-only): resolves exactly the two objects that keep
 * `retention_guard` failing, through the official Storage API, and nothing else.
 *
 * - The cancelled job whose DEM survived the pre-G.6 cleanup is deleted through the
 *   official G.6 path (claim -> verified Storage delete -> finish), only while the
 *   official reference fixture (r5-forensic-staging) is proven present and intact.
 * - The 1 KB orphan probe object is deleted by its exact path, only while no job or
 *   upload references it and its size is the observed one; absence is re-read after.
 *
 * Both targets are fixed in code; the route cannot be pointed at any other object.
 */
import { DEMO_BUCKET } from "@/config/pipeline";
import {
  R5_AUTHORIZED_DEM_SHA256,
  R5_AUTHORIZED_DEM_SIZE_BYTES,
  R5_FORENSIC_STAGING_BUCKET,
  R5_FORENSIC_STORAGE_PATH,
} from "@/config/r5ForensicStaging";

export const RETENTION_TARGET_JOB_ID = "f736b6da-7677-4989-abec-05bc8d368002";
export const RETENTION_ORPHAN_PATH = "7a680ca4-dbb5-4506-9aea-ebcbdf5bf6e1/probe-appflow.dem";
export const RETENTION_ORPHAN_SIZE = 1024;

export type RetentionAction = "inspect" | "delete_mismatched_job_object" | "delete_orphan_object";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Size of one object read from the Storage API listing, or null when absent. */
export async function storageObjectSize(bucket: string, path: string): Promise<number | null> {
  const db = await admin();
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await db.storage.from(bucket).list(folder, { search: name, limit: 100 });
  if (error) throw new Error("STORAGE_LIST_FAILED");
  const found = (data ?? []).find((entry) => entry.name === name);
  if (!found) return null;
  return Number((found.metadata as { size?: number } | null)?.size ?? -1);
}

export type FixtureState = {
  registered: boolean;
  identityVerified: boolean;
  objectPresent: boolean;
  sizeMatches: boolean;
  preserved: boolean;
};

/** The official reference fixture: its registry row and its physical object. */
export async function referenceFixtureState(): Promise<FixtureState> {
  const db = await admin();
  const { data, error } = await db
    .from("r5_forensic_staging")
    .select(
      "demo_sha256, observed_sha256, observed_size, file_size, bytes_readable, deleted_at, bucket_id",
    )
    .eq("storage_path", R5_FORENSIC_STORAGE_PATH)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("FIXTURE_LOOKUP_FAILED");
  const row = data as {
    demo_sha256: string | null;
    observed_sha256: string | null;
    observed_size: number | null;
    file_size: number | null;
    bytes_readable: boolean | null;
    deleted_at: string | null;
    bucket_id: string | null;
  } | null;
  const identityVerified =
    !!row &&
    row.bucket_id === R5_FORENSIC_STAGING_BUCKET &&
    row.demo_sha256 === R5_AUTHORIZED_DEM_SHA256 &&
    row.observed_sha256 === R5_AUTHORIZED_DEM_SHA256 &&
    Number(row.observed_size) === R5_AUTHORIZED_DEM_SIZE_BYTES &&
    Number(row.file_size) === R5_AUTHORIZED_DEM_SIZE_BYTES &&
    row.bytes_readable === true &&
    row.deleted_at === null;
  const size = await storageObjectSize(R5_FORENSIC_STAGING_BUCKET, R5_FORENSIC_STORAGE_PATH);
  const objectPresent = size !== null;
  const sizeMatches = size === R5_AUTHORIZED_DEM_SIZE_BYTES;
  return {
    registered: !!row,
    identityVerified,
    objectPresent,
    sizeMatches,
    preserved: identityVerified && objectPresent && sizeMatches,
  };
}

async function referencesTo(path: string): Promise<number> {
  const db = await admin();
  const jobs = await db
    .from("demo_jobs")
    .select("id", { count: "exact", head: true })
    .eq("storage_path", path);
  const uploads = await db
    .from("uploads")
    .select("id", { count: "exact", head: true })
    .eq("storage_path", path);
  if (jobs.error || uploads.error) throw new Error("REFERENCE_LOOKUP_FAILED");
  return (jobs.count ?? 0) + (uploads.count ?? 0);
}

async function jobRow() {
  const db = await admin();
  const { data, error } = await db
    .from("demo_jobs")
    .select(
      "id, status, cleanup_error, storage_path, storage_deleted_at, storage_delete_verified_at",
    )
    .eq("id", RETENTION_TARGET_JOB_ID)
    .maybeSingle();
  if (error) throw new Error("JOB_LOOKUP_FAILED");
  return data as {
    status: string;
    cleanup_error: string | null;
    storage_path: string | null;
    storage_deleted_at: string | null;
    storage_delete_verified_at: string | null;
  } | null;
}

export async function inspectRetention() {
  const job = await jobRow();
  const jobObjectSize = job?.storage_path
    ? await storageObjectSize(DEMO_BUCKET, job.storage_path)
    : null;
  const orphanSize = await storageObjectSize(DEMO_BUCKET, RETENTION_ORPHAN_PATH);
  return {
    fixture: await referenceFixtureState(),
    job: job && {
      status: job.status,
      cleanupError: job.cleanup_error,
      deleteVerified: job.storage_delete_verified_at !== null,
      objectPresent: jobObjectSize !== null,
      objectSize: jobObjectSize,
    },
    orphan: {
      objectPresent: orphanSize !== null,
      objectSize: orphanSize,
      references: await referencesTo(RETENTION_ORPHAN_PATH),
    },
  };
}

export async function runRetentionAction(
  action: RetentionAction,
): Promise<Record<string, unknown>> {
  if (action === "inspect") return { action, ...(await inspectRetention()) };

  const before = await referenceFixtureState();
  if (!before.preserved) return { action, outcome: "REFUSED_FIXTURE_NOT_PROVEN", fixture: before };

  if (action === "delete_mismatched_job_object") {
    const { cleanupDemoJobVerified } = await import("@/lib/pipeline/jobs.server");
    let outcome: string;
    try {
      outcome =
        (await cleanupDemoJobVerified(RETENTION_TARGET_JOB_ID)) === "verified"
          ? "DELETE_VERIFIED"
          : "ALREADY_ABSENT";
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN";
      // Codes only (claim reasons, DELETE_NOT_VERIFIED); never a path or a secret.
      outcome = `FAILED:${message.replace(/[^A-Z0-9_:]/g, "").slice(0, 80)}`;
    }
    const after = await inspectRetention();
    return { action, outcome, job: after.job, fixture: after.fixture };
  }

  const references = await referencesTo(RETENTION_ORPHAN_PATH);
  const size = await storageObjectSize(DEMO_BUCKET, RETENTION_ORPHAN_PATH);
  if (references !== 0) return { action, outcome: "REFUSED_ORPHAN_IS_REFERENCED", references };
  if (size === null) {
    return { action, outcome: "ALREADY_ABSENT_CONFIRMED", fixture: await referenceFixtureState() };
  }
  if (size !== RETENTION_ORPHAN_SIZE)
    return { action, outcome: "REFUSED_ORPHAN_IDENTITY_CHANGED", size };
  const db = await admin();
  const { error } = await db.storage.from(DEMO_BUCKET).remove([RETENTION_ORPHAN_PATH]);
  if (error) return { action, outcome: "FAILED:STORAGE_REMOVE" };
  const remaining = await storageObjectSize(DEMO_BUCKET, RETENTION_ORPHAN_PATH);
  return {
    action,
    outcome: remaining === null ? "PHYSICAL_DELETION_CONFIRMED" : "DELETE_NOT_VERIFIED",
    fixture: await referenceFixtureState(),
  };
}

/** Short-lived signed URL of the official reference fixture, after re-proving its identity. */
export async function signReferenceFixture(seconds = 1800) {
  const fixture = await referenceFixtureState();
  if (!fixture.preserved) return { ok: false as const, fixture };
  const db = await admin();
  const { data, error } = await db.storage
    .from(R5_FORENSIC_STAGING_BUCKET)
    .createSignedUrl(R5_FORENSIC_STORAGE_PATH, seconds);
  if (error || !data?.signedUrl) return { ok: false as const, fixture };
  return {
    ok: true as const,
    url: data.signedUrl,
    sha256: R5_AUTHORIZED_DEM_SHA256,
    sizeBytes: R5_AUTHORIZED_DEM_SIZE_BYTES,
    expiresInSeconds: seconds,
  };
}
