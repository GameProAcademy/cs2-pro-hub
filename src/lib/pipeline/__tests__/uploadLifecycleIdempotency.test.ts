import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = [
  "supabase/migrations/20260915071655_b9115773-c9d6-408a-993d-c2c022530b92.sql",
  "supabase/migrations/20260915072009_eea13ab7-de20-4697-9428-b7c9e2391746.sql",
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const functionsSource = readFileSync("src/lib/pipeline.functions.ts", "utf8");
const clientSource = readFileSync("src/lib/pipeline/client.ts", "utf8");
const ingestPanelSource = readFileSync("src/components/pipeline/DemoIngestPanel.tsx", "utf8");
const historySource = readFileSync("src/components/pipeline/DemoHistory.tsx", "utf8");

describe("demo upload lifecycle idempotency", () => {
  it("serialises reservations by owner and hash", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("uploads_user_demo_sha_active_key");
  });

  it("creates a distinct upload and job for terminal or stale replacement", () => {
    expect(migration).toContain("_replacement_reason := 'stale'");
    expect(migration).toContain("_replacement_reason := 'failed'");
    expect(migration).toContain("_replacement_reason := 'cancelled'");
    expect(migration).toContain("INSERT INTO public.uploads");
    expect(migration).toContain("attempt_number, supersedes_job_id, replacement_reason");
  });

  it("keeps healthy and processed attempts idempotent", () => {
    expect(migration).toContain("_job.status IN ('pending', 'cancel_requested')");
    expect(migration).toContain("_job.status = 'processing' AND NOT _stale");
    expect(migration).toContain("AND j.status = 'processed'");
    expect(migration).not.toContain("ON CONFLICT (upload_id) DO UPDATE");
    expect(functionsSource).not.toContain(".upsert(\n        {\n          upload_id: upload.id");
  });

  it("fences stale workers and preserves retry count semantics", () => {
    expect(migration).toContain("_job.lease_expires_at < now()");
    expect(migration).toContain("COALESCE(_job.heartbeat_at, _job.started_at)");
    expect(migration).toContain("PERFORM pgmq.archive('demo_parse', _job.queue_message_id)");
    expect(migration).not.toContain("retry_count = 0");
    expect(functionsSource).toContain('if (job.status !== "failed")');
  });

  it("allows at most one replacement and keeps both directions of the relationship", () => {
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS demo_jobs_superseded_once_key");
    expect(migration).toContain("superseded_by_job_id = _job.id");
    expect(migration).toContain("ATTEMPT_ALREADY_SUPERSEDED");
  });

  it("keeps reservation and enqueue service-role only", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.enqueue_demo_job(uuid, uuid) FROM PUBLIC, anon, authenticated",
    );
  });

  it("distinguishes history query failures from an empty history", () => {
    expect(functionsSource).toContain(
      'if (jobsError) throw new Error("DEMO_HISTORY_QUERY_FAILED")',
    );
    expect(functionsSource).toContain(
      'if (matchesError) throw new Error("DEMO_HISTORY_MATCH_QUERY_FAILED")',
    );
    expect(ingestPanelSource).toContain("jobs.isError");
    expect(historySource).toContain("jobs.isError");
  });

  it("keeps the general history empty states free of upload actions", () => {
    expect(ingestPanelSource).toMatch(
      /<EmptyState\s+title=\{t\("pipeline\.history\.emptyTitle"\)\}\s+description=\{t\("pipeline\.history\.emptyBody"\)\}\s+\/>/,
    );
    expect(historySource).not.toContain('<Link to="/upload">');
    expect(ingestPanelSource).toContain('t("pipeline.corrupted.cta")');
  });

  it("preserves legacy unvalidated replacement reasons through server and client types", () => {
    expect(functionsSource).toContain('| "legacy_unvalidated"');
    expect(functionsSource).toContain('result["replacement_reason"] === "legacy_unvalidated"');
    expect(functionsSource).toContain('row.replacement_reason === "legacy_unvalidated"');
    expect(clientSource).toContain("type ReplacementReason");
  });
});
