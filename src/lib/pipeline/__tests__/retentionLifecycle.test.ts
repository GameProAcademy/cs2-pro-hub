import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEMO_CLEANUP_CLAIM_SECONDS,
  DEMO_CLEANUP_AUTHORITY,
  DEMO_CLEANUP_EXECUTION_ENABLED,
  DEMO_RETENTION_HOURS,
  DEMO_RETENTION_POLICY_VERSION,
  FAILED_DEMO_RETENTION_HOURS,
} from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import { assertDemoStoragePath, demoStoragePath } from "@/lib/pipeline/storage.server";

const migration = [
  "supabase/migrations/20260921055331_3b3c9cb0-0872-49be-9693-1e60aa6d51c7.sql",
  "supabase/migrations/20260921055439_ca002969-0569-4016-9fd1-9b0959e2616a.sql",
  "supabase/migrations/20260921055555_202993af-f5e4-4908-bc94-54882472b68d.sql",
  "supabase/migrations/20260921055737_d98f6d41-6db2-4d89-8d13-22cfdf2d51c6.sql",
  "supabase/migrations/20260921065045_3e6e67cc-9bef-4405-9ed1-a4d334874526.sql",
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const jobs = readFileSync("src/lib/pipeline/jobs.server.ts", "utf8");
const storage = readFileSync("src/lib/pipeline/storage.server.ts", "utf8");
const cron = readFileSync("src/routes/api/public/pipeline-cron.ts", "utf8");
const admin = readFileSync("src/lib/pipeline-admin.functions.ts", "utf8");
const pipelineFunctions = readFileSync("src/lib/pipeline.functions.ts", "utf8");

describe("G.6 DEM retention and verified deletion A-Q", () => {
  it("A-C versions exact success/failure windows", () => {
    expect(DEMO_RETENTION_POLICY_VERSION).toBe("demo-retention-v1");
    expect(DEMO_RETENTION_HOURS).toBe(24);
    expect(FAILED_DEMO_RETENTION_HOURS).toBe(72);
    expect(DEMO_CLEANUP_CLAIM_SECONDS).toBe(300);
    expect(migration).toContain("NEW.finished_at + interval '24 hours'");
    expect(migration).toContain("NEW.finished_at + interval '72 hours'");
  });

  it("D-E allows only terminal jobs after retention", () => {
    expect(migration).toContain("'JOB_NOT_TERMINAL'");
    expect(migration).toContain("'RETENTION_ACTIVE'");
    expect(migration).toContain("'RETENTION_MISSING'");
    expect(migration).toContain("status IN ('processed','failed','blocked_raw_audit','cancelled')");
  });

  it("F-G blocks active workers and serializes cleanup", () => {
    expect(migration).toContain("'ACTIVE_WORKER_OR_LEASE'");
    expect(migration).toContain("'CLEANUP_ALREADY_CLAIMED'");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("cleanup_claim_expires_at");
  });

  it("H blocks retry after deletion and during a live cleanup claim", () => {
    expect(migration).toContain("RAISE EXCEPTION 'DEMO_EXPIRED'");
    expect(migration).toContain("RAISE EXCEPTION 'DEMO_CLEANUP_IN_PROGRESS'");
    expect(migration).toContain("NEW.cleanup_claim_token := NULL");
  });

  it("I-J enforces path ownership and cancellation eligibility", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const uploadId = "22222222-2222-4222-8222-222222222222";
    const path = demoStoragePath(userId, uploadId);
    expect(() => assertDemoStoragePath(path, userId, uploadId)).not.toThrow();
    expect(() => assertDemoStoragePath(`${userId}/other.dem`, userId, uploadId)).toThrow(
      PipelineError,
    );
    expect(migration).toContain("NEW.retain_until := NEW.finished_at");
  });

  it("K-L requires post-delete verification and idempotent absence", () => {
    expect(storage).toContain('return "ALREADY_ABSENT"');
    expect(storage).toContain('throw new PipelineError("CLEANUP_ERROR", "DELETE_NOT_VERIFIED")');
    expect(storage).toContain('return "DELETE_VERIFIED"');
    expect(jobs).toContain('"finish_demo_cleanup_verified"');
  });

  it("M records failures without marking physical deletion", () => {
    expect(migration).toContain("storage_deleted_at = NULL, storage_delete_verified_at = NULL");
    expect(migration).toContain(
      "'DELETE_FAILED','DELETE_NOT_VERIFIED','DELETE_VERIFICATION_FAILED'",
    );
    expect(jobs).toContain("summary.failed += 1");
  });

  it("N detects legacy metadata mismatch", () => {
    expect(migration).toContain(
      "storage_deleted_at IS NOT NULL AND _job.storage_delete_verified_at IS NULL",
    );
    expect(migration).toContain("'DELETION_METADATA_MISMATCH'");
  });

  it("O classifies orphan objects conservatively without deleting them", () => {
    expect(migration).toContain("public.get_demo_orphan_report");
    expect(migration).toContain("'CONSERVATIVE_RETENTION_ACTIVE'");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
  });

  it("P preserves historical rows, hashes, RAW and Canonical data", () => {
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\./i);
    expect(migration).not.toContain("UPDATE public.uploads");
    expect(migration).not.toContain("UPDATE public.raw_");
    expect(migration).not.toContain("UPDATE public.matches");
    expect(migration).not.toContain("demo_sha256 = NULL");
  });

  it("Q keeps all cleanup RPCs service-role only with a safe search path", () => {
    for (const name of [
      "evaluate_demo_deletion_gate",
      "claim_demo_cleanup_jobs",
      "claim_demo_cleanup_job",
      "finish_demo_cleanup_verified",
      "fail_demo_cleanup",
      "get_demo_retention_metrics",
      "get_demo_orphan_report",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${name}`);
    }
    expect(migration.match(/SET search_path = ''/g)?.length).toBeGreaterThanOrEqual(7);
  });
});

describe("G.6-R legacy shutdown and single authority R-T", () => {
  it("R disables every automatic and administrative deletion trigger", () => {
    expect(DEMO_CLEANUP_AUTHORITY).toBe("G6_VERIFIED_DELETE_ONLY");
    expect(DEMO_CLEANUP_EXECUTION_ENABLED).toBe(false);
    expect(cron).not.toContain("cleanupExpiredDemos(");
    expect(admin).not.toContain("cleanupExpiredDemos(");
    expect(pipelineFunctions).not.toContain("cleanupExpiredDemos(");
    expect(jobs.match(/cleanupExpiredDemos\(5\)/g)).toBeNull();
  });

  it("S records the database authority as service-role-only and fail-closed", () => {
    expect(migration).toContain("public.get_demo_cleanup_authority()");
    expect(migration).toContain("'authority', 'G6_VERIFIED_DELETE_ONLY'");
    expect(migration).toContain("'execution_enabled', false");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_demo_cleanup_authority() FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_demo_cleanup_authority() TO service_role",
    );
  });

  it("T preserves quarantine/backfill and mismatch evidence without deleting Storage", () => {
    expect(migration).toContain("GREATEST(j.retain_until, now() + interval '24 hours')");
    expect(migration).toContain("WHEN storage_deleted_at IS NOT NULL THEN 'DELETION_METADATA_MISMATCH'");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(migration).not.toMatch(/storage\.from\([^)]*\)\.remove/i);
    expect(storage.match(/\.remove\(\[storagePath\]\)/g)).toHaveLength(1);
  });
});
