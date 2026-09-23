import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  R5_AUTHORIZED_DEM_FILENAME,
  R5_AUTHORIZED_DEM_SHA256,
  R5_AUTHORIZED_DEM_SIZE_BYTES,
  R5_CANONICAL_RELEASE_ID,
  R5_FORENSIC_STAGING_BUCKET,
  R5_FORENSIC_STORAGE_PATH,
} from "@/config/r5ForensicStaging";

const migration = readFileSync(
  resolve("supabase/migrations/20260923011001_f6872c0a-bb8d-49d4-844d-96da9b2bdb54.sql"),
  "utf8",
);
const functions = readFileSync(resolve("src/lib/r5ForensicStaging.functions.ts"), "utf8");
const server = readFileSync(resolve("src/lib/pipeline/r5ForensicStaging.server.ts"), "utf8");
const resumable = readFileSync(resolve("src/lib/pipeline/r5ResumableUpload.ts"), "utf8");
const hashWorker = readFileSync(resolve("src/lib/pipeline/r5DemHash.worker.ts"), "utf8");
const r52Migration = readFileSync(
  resolve("supabase/migrations/20260923012919_d1e69d4d-c42e-4b0e-b1c4-11d75a5febc7.sql"),
  "utf8",
);
const pathMigration = readFileSync(
  resolve("supabase/migrations/20260923015032_f6c180fc-fa4c-4175-872a-7f73973c521c.sql"),
  "utf8",
);
const stateMigration = readFileSync(
  resolve("supabase/migrations/20260923014908_d8bbbb89-cbf3-4dc6-96ea-5184b8377097.sql"),
  "utf8",
);
const semanticsMigration = readFileSync(
  resolve("supabase/migrations/20260923020000_r5_storage_path_semantics.sql"),
  "utf8",
);
const shaCorrectionMigration = readFileSync(
  resolve("supabase/migrations/20260923023058_94927a9d-31d5-47f4-8935-ccc9e7f2ac56.sql"),
  "utf8",
);
const lifecycleMigration = readFileSync(
  resolve("supabase/migrations/20260923023228_b55a6705-84a5-4ff9-b178-5e6510afeb22.sql"),
  "utf8",
);
const r56Migration = readFileSync(
  resolve("supabase/migrations/20260923041600_da71ec8d-ad69-4233-b80d-b221da8e8b42.sql"),
  "utf8",
);
const workflow = readFileSync(resolve(".github/workflows/quality-gates.yml"), "utf8");

describe("R5 forensic staging contract", () => {
  it("pins the one authorized Cache DEM identity", () => {
    expect(R5_AUTHORIZED_DEM_FILENAME).toBe("furia-vs-gamerlegion-m1-cache.dem");
    expect(R5_AUTHORIZED_DEM_SHA256).toBe(
      "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
    );
    expect(R5_AUTHORIZED_DEM_SHA256).toHaveLength(64);
    expect(R5_AUTHORIZED_DEM_SIZE_BYTES).toBe(473_748_061);
    expect(R5_FORENSIC_STORAGE_PATH).toBe(
      `${R5_CANONICAL_RELEASE_ID}/${R5_AUTHORIZED_DEM_SHA256}.dem`,
    );
    expect(R5_FORENSIC_STORAGE_PATH).not.toMatch(new RegExp(`^${R5_FORENSIC_STAGING_BUCKET}/`));
  });

  it("keeps staging independent from attempts, jobs and queues", () => {
    expect(migration).toContain("CREATE TABLE public.r5_forensic_staging");
    expect(migration).not.toMatch(/INSERT INTO public\.(uploads|demo_jobs)/);
    expect(migration).not.toMatch(
      /pgmq\.send|enqueue_demo_job|INSERT INTO public\.(?:uploads|demo_jobs)/,
    );
    expect(server).not.toMatch(/\.from\(["'](?:uploads|demo_jobs)["']\)/);
  });

  it("is private, exact-identity and fail-closed", () => {
    expect(migration).toContain("ALTER TABLE public.r5_forensic_staging ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.r5_real_dem_access_gate(uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("ATTEMPT_9_ALREADY_EXISTS");
    expect(migration).toContain("CANONICAL_BASELINE_CHANGED");
    expect(migration).toContain("R5_STAGING_CLEANUP_OBSERVED");
    expect(migration).not.toMatch(
      /GRANT .* ON TABLE public\.r5_forensic_staging TO (?:anon|authenticated)/,
    );
  });

  it("exposes staging only through an authenticated master-admin server function", () => {
    expect(functions).toContain("middleware([requireSupabaseAuth])");
    expect(functions).toContain('rpc("is_admin_master"');
    expect(server).toContain("createDemoSignedUrlForBucketObject");
    expect(server).toContain("sha256FromStream");
    expect(server).toContain("responseBody.getReader()");
    expect(server).not.toMatch(/\.storage\\s*\\.from\\([^\n]+\\)\\s*\\.download/);
  });

  it("uses resumable TUS transport with fixed destination, retry, progress and cancellation", () => {
    expect(resumable).toContain("bucketName: R5_FORENSIC_STAGING_BUCKET");
    expect(resumable).toContain("objectName: R5_FORENSIC_STORAGE_PATH");
    expect(resumable).toContain(
      "// TUS objectName is relative to bucketName. Never send the bucket prefix.",
    );
    expect(resumable).toContain('headers: { "x-upsert": "false" }');
    expect(resumable).toContain("findPreviousUploads()");
    expect(resumable).toContain("resumeFromPreviousUpload");
    expect(resumable).toContain("retryDelays");
    expect(resumable).toMatch(/upload\s*\.abort\(false\)/);
    expect(resumable).toContain('candidate.metadata["bucketName"] === R5_FORENSIC_STAGING_BUCKET');
    expect(resumable).toContain('candidate.metadata["objectName"] === R5_FORENSIC_STORAGE_PATH');
  });

  it("preserves bounded-memory hashing on browser and server", () => {
    expect(resumable).toContain('new Worker(new URL("./r5DemHash.worker.ts", import.meta.url)');
    expect(hashWorker).toContain("file.slice(offset, end).arrayBuffer()");
    expect(hashWorker).not.toContain("file.arrayBuffer()");
    expect(hashWorker).not.toContain("crypto.subtle.digest");
    expect(server).toContain("responseBody.getReader()");
    expect(server).toContain("sha256FromStream(hashingStream)");
    expect(server).not.toMatch(/\.storage\s*\.from\([^\n]+\)\s*\.download/);
    expect(server).not.toContain("response.arrayBuffer()");
  });

  it("keeps execution and Attempt 9 authorization fail-closed", () => {
    expect(r52Migration).toContain("CREATE OR REPLACE FUNCTION public.r5_real_dem_execution_gate");
    expect(r52Migration).toContain("R5_CURRENT_RUNTIME_PROVENANCE_NOT_VERIFIED");
    expect(r52Migration).toContain("CREATE OR REPLACE FUNCTION public.assert_attempt_9_authorized");
    expect(r52Migration).toContain("R5_ATTEMPT_9_NOT_AUTHORIZED");
    expect(r52Migration).not.toMatch(/INSERT INTO public\.(uploads|demo_jobs|matches)/);
  });

  it("uses one relative path and atomic service-only transitions", () => {
    expect(pathMigration).toContain("DROP CONSTRAINT IF EXISTS r5_forensic_staging_path_check");
    expect(pathMigration).not.toContain("29b00dd4d");
    expect(server).toContain('rpc("transition_r5_forensic_upload"');
    expect(stateMigration).toContain("FOR UPDATE");
    expect(stateMigration).toContain("R5_PREMATURE_READY_FOR_EXECUTION");
  });

  it("applies the official SHA correction without rewriting historical migrations", () => {
    expect(semanticsMigration).toContain(
      "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d",
    );
    expect(shaCorrectionMigration).toContain(R5_AUTHORIZED_DEM_SHA256);
    expect(shaCorrectionMigration).not.toContain("29b00dd4d");
    expect(shaCorrectionMigration).toContain("r5_real_dem_access_gate");
    expect(shaCorrectionMigration).toContain("transition_r5_forensic_upload");
  });

  it("preserves expired history and permits only one active or ready slot", () => {
    expect(lifecycleMigration).toContain(
      "DROP CONSTRAINT IF EXISTS r5_forensic_staging_storage_path_key",
    );
    expect(lifecycleMigration).toContain("r5_forensic_staging_active_path_key");
    expect(lifecycleMigration).toContain("WHERE transport_status <> 'EXPIRED'");
    expect(lifecycleMigration).toContain("r5_forensic_staging_ready_path_key");
    expect(lifecycleMigration).toContain("pg_advisory_xact_lock");
    expect(lifecycleMigration).toContain("R5_EXPIRED_OBJECT_REMAINS");
    expect(lifecycleMigration).toContain("R5_STAGING_EXPIRED");
    expect(lifecycleMigration).not.toMatch(/DELETE FROM public\.r5_forensic_staging/);
    expect(server).toContain('rpc("prepare_r5_forensic_staging"');
  });

  it("records upload progress, exact verify events and gate outcomes", () => {
    expect(functions).toContain("R5_UPLOAD_PROGRESS");
    expect(functions).toContain("R5_VERIFY_STARTED");
    expect(functions).toContain("R5_VERIFY_COMPLETED");
    expect(functions).toContain("R5_VERIFY_FAILED");
    expect(functions).toContain("R5_GATE_READY");
    expect(functions).toContain("R5_GATE_BLOCKED");
    expect(functions).toContain("R5_UPLOAD_CANCELLED");
    expect(functions).toContain("bytesUploaded");
    expect(functions).not.toContain("R5_VERIFICATION_STARTED");
  });

  it("uses the applied R5.6 migration for atomic progress, cancellation and verification", () => {
    expect(r56Migration).toContain("record_r5_forensic_progress");
    expect(r56Migration).toContain("transition_r5_forensic_verification");
    expect(r56Migration).toContain("_action='cancelled'");
    expect(r56Migration).toContain("R5_UPLOAD_CANCELLED");
    expect(r56Migration).toContain("R5_CANONICAL_BASELINE_CHANGED");
    expect(r56Migration).toContain("R5_UNEXPECTED_EXECUTION_EVIDENCE");
    expect(r56Migration).not.toMatch(/INSERT INTO public\.(uploads|demo_jobs|matches)/);
  });

  it("returns observed local evidence and records strict resume telemetry", () => {
    expect(hashWorker).toContain('type: "done", sha256: hasher.hex(), size: file.size');
    expect(resumable).toContain("Promise<R5LocalFileEvidence>");
    expect(resumable).toContain("Promise<R5UploadResult>");
    expect(resumable).toContain("onShouldRetry");
    expect(resumable).toContain("options.onResume?.()");
  });

  it("preserves PostgreSQL setup for the concurrency harness", () => {
    expect(workflow).toContain("sudo apt-get install -y postgresql");
    expect(workflow).toContain('echo "$(pg_config --bindir)" >> "$GITHUB_PATH"');
  });
});
