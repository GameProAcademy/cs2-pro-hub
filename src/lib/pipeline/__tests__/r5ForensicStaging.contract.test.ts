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
const r52Migration = readFileSync(
  resolve("supabase/migrations/20260923012919_d1e69d4d-c42e-4b0e-b1c4-11d75a5febc7.sql"),
  "utf8",
);
const workflow = readFileSync(resolve(".github/workflows/quality-gates.yml"), "utf8");

describe("R5.1 forensic staging contract", () => {
  it("pins the one authorized Cache DEM identity", () => {
    expect(R5_AUTHORIZED_DEM_FILENAME).toBe("furia-vs-gamerlegion-m1-cache.dem");
    expect(R5_AUTHORIZED_DEM_SHA256).toBe(
      "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
    );
    expect(R5_AUTHORIZED_DEM_SIZE_BYTES).toBe(473_748_061);
    expect(R5_FORENSIC_STORAGE_PATH).toBe(
    `${R5_CANONICAL_RELEASE_ID}/${R5_AUTHORIZED_DEM_SHA256}.dem`,
  );
  expect(R5_FORENSIC_STORAGE_PATH).not.toMatch(
    new RegExp(`^${R5_FORENSIC_STAGING_BUCKET}/`),
  );
  });

  it("keeps staging independent from attempts, jobs and queues", () => {
    expect(migration).toContain("CREATE TABLE public.r5_forensic_staging");
    expect(migration).not.toMatch(/INSERT INTO public\.(uploads|demo_jobs)/);
    expect(migration).not.toMatch(/pgmq\.send|enqueue_demo_job|INSERT INTO public\.(?:uploads|demo_jobs)/);
    expect(server).not.toMatch(/\.from\(["'](?:uploads|demo_jobs)["']\)/);
  });

  it("is private, exact-identity and fail-closed", () => {
    expect(migration).toContain("ALTER TABLE public.r5_forensic_staging ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.r5_real_dem_access_gate(uuid) FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("ATTEMPT_9_ALREADY_EXISTS");
    expect(migration).toContain("CANONICAL_BASELINE_CHANGED");
    expect(migration).toContain("R5_STAGING_CLEANUP_OBSERVED");
    expect(migration).not.toMatch(/GRANT .* ON TABLE public\.r5_forensic_staging TO (?:anon|authenticated)/);
  });

  it("exposes staging only through an authenticated master-admin server function", () => {
    expect(functions).toContain("middleware([requireSupabaseAuth])");
    expect(functions).toContain('rpc("is_admin_master"');
    expect(server).toContain("createDemoSignedUrlForBucketObject");
    expect(server).toContain("sha256FromStream");
    expect(server).toContain("response.body?.getReader()");
    expect(server).not.toMatch(/\.storage\\s*\\.from\\([^\n]+\\)\\s*\\.download/);
  });

  it("uses resumable TUS transport with fixed destination, retry, progress and cancellation", () => {
    expect(resumable).toContain("bucketName: R5_FORENSIC_STAGING_BUCKET");
    expect(resumable).toContain("objectName: R5_FORENSIC_STORAGE_PATH");
    expect(resumable).toContain("// TUS objectName is relative to bucketName. Never send the bucket prefix.");
    expect(resumable).toContain('headers: { "x-upsert": "false" }');
    expect(resumable).toContain("findPreviousUploads()");
    expect(resumable).toContain("resumeFromPreviousUpload");
    expect(resumable).toContain("retryDelays");
    expect(resumable).toContain("upload.abort(false)");
  });

  it("preserves bounded-memory hashing on browser and server", () => {
    expect(resumable).toContain("file.slice(offset, end).arrayBuffer()");
    expect(resumable).not.toContain("file.arrayBuffer()");
    expect(resumable).not.toContain("crypto.subtle.digest");
    expect(server).toContain("response.body?.getReader()");
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

  it("preserves PostgreSQL setup for the concurrency harness", () => {
    expect(workflow).toContain("sudo apt-get install -y postgresql");
    expect(workflow).toContain('echo "$(pg_config --bindir)" >> "$GITHUB_PATH"');
  });
});