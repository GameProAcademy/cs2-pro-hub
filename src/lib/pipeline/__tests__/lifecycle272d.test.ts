import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260913071601_44b688fb-9d7a-4a30-8eaa-a8d0cd4901bf.sql",
  "utf8",
);
const jobsSource = readFileSync("src/lib/pipeline/jobs.server.ts", "utf8");

describe("FASE 2.7.2D lifecycle finalization", () => {
  it("locks a processing job before the projection commit", () => {
    const projection = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.persist_demo_projection"),
    );
    expect(projection).toContain("WHERE j.id = _job_id AND j.status = 'processing'");
    expect(projection).toContain("FOR UPDATE");
    expect(projection).toContain("DEMO_JOB_NOT_FINALIZABLE");
  });

  it("commits projection and processed state in the same transaction", () => {
    expect(migration).toContain("INSERT INTO public.match_metrics");
    expect(migration).toContain("INSERT INTO public.match_features");
    expect(migration).toContain("status = 'processed', stage = 'done'");
    expect(jobsSource).toContain("jobResult: finalResult");
  });

  it("does not overwrite cancellation from the generic failure path", () => {
    expect(jobsSource).toContain('.eq("status", "processing")');
    expect(jobsSource).toContain("if (!failedRows || failedRows.length === 0)");
    expect(jobsSource).toContain("await finishCancellation(jobId, job.storage_path)");
  });

  it("never requeues a cancelled job after attachment", () => {
    expect(migration).toContain("status NOT IN ('processing', 'cancel_requested', 'cancelled')");
  });

  it("keeps sensitive lifecycle functions service-role only", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.finish_demo_job_processed(uuid, jsonb) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.finish_demo_job_processed(uuid, jsonb) TO service_role",
    );
  });
});
