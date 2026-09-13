import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260913073216_abbc55db-52b3-4ab0-ae31-5928cb95d1d0.sql",
  "utf8",
);
const functionsSource = readFileSync("src/lib/pipeline.functions.ts", "utf8");

describe("demo upload lifecycle idempotency", () => {
  it("serialises reservations by owner and hash", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("uploads_user_demo_sha_active_key");
  });

  it("excludes cancelled uploads so reupload creates a new upload and job", () => {
    expect(migration).toContain("AND status <> 'cancelled'");
    expect(migration).toContain("INSERT INTO public.uploads");
    expect(migration).toContain("_upload_id, _user_id, 'demo', 'manual'");
  });

  it("never resurrects cancelled or cancel-requested jobs", () => {
    expect(migration).toContain("IF _job.status IN ('pending', 'processing')");
    expect(migration).toContain("RAISE EXCEPTION 'JOB_NOT_ENQUEUEABLE'");
    expect(migration).not.toContain("ON CONFLICT (upload_id) DO UPDATE");
    expect(functionsSource).not.toContain('.upsert(\n        {\n          upload_id: upload.id');
  });

  it("keeps processed and failed jobs terminal during normal enqueue", () => {
    expect(migration).toContain("_job.status = 'processed' OR _upload.status = 'processed'");
    expect(migration).toContain("_job.status = 'failed' OR _upload.status = 'failed'");
    expect(functionsSource).toContain('if (job.status !== "failed")');
  });

  it("keeps reservation and enqueue service-role only", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.enqueue_demo_job(uuid, uuid) FROM PUBLIC, anon, authenticated",
    );
  });
});