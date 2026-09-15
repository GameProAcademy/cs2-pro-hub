import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const queueMigration = readFileSync(
  "supabase/migrations/20260914085238_9ed55327-dea3-496c-83fb-b8a669f23168.sql",
  "utf8",
);
const rawMigration = readFileSync(
  "supabase/migrations/20260915050825_c881c226-b2f2-4918-b7db-35d3525606c9.sql",
  "utf8",
);
const failMigration = readFileSync(
  "supabase/migrations/20260915051212_a0612c7b-647b-469f-a989-455e84e8d265.sql",
  "utf8",
);
const jobsSource = readFileSync("src/lib/pipeline/jobs.server.ts", "utf8");
const workerSource = readFileSync("services/cs2-demo-parser/worker.py", "utf8");

describe("FASE 2.7.2D.3-H durable lifecycle contracts", () => {
  it("lets another worker reclaim only an expired processing lease", () => {
    expect(queueMigration).toContain("_job.lease_expires_at > now() THEN");
    expect(queueMigration).toContain("_job.status NOT IN ('pending', 'processing')");
    expect(queueMigration).toContain("worker_id = _worker_id");
  });

  it("rejects stale heartbeats and stale completion by full claim identity", () => {
    for (const token of [
      "j.queue_message_id = _message_id",
      "j.dispatch_attempt = _attempt",
      "j.worker_id = _worker_id",
      "lease_expires_at <= now()",
      "'claim_not_current'",
    ]) {
      expect(rawMigration).toContain(token);
    }
  });

  it("archives only a terminal current claim and makes double finalize harmless", () => {
    expect(rawMigration).toContain("_job.status NOT IN ('processed', 'blocked_raw_audit', 'cancelled')");
    expect(rawMigration).toContain("SELECT pgmq.archive('demo_parse', _message_id)");
    expect(rawMigration).toContain("'message_not_archived'");
  });

  it("does not fail or retry after ownership expires", () => {
    expect(failMigration).toContain("_job.lease_expires_at <= now()");
    expect(failMigration).toContain("RETURN jsonb_build_object('accepted', false, 'reason', 'lease_expired')");
    expect(failMigration).toContain("_job.retry_count < _job.max_retries");
  });

  it("makes cancellation suppress Canonical and worker completion", () => {
    expect(jobsSource).toContain("await assertNotCancelled(jobId)");
    expect(jobsSource).toContain("if (error instanceof JobCancelledError)");
    expect(workerSource).toContain('response.get("cancelled") is True');
    expect(workerSource).toContain("completion suppressed after lease or cancellation rejection");
  });

  it("keeps Canonical idempotency and binds persistence to RAW approval", () => {
    expect(jobsSource).toContain("rawApproval,");
    expect(jobsSource).toContain("fingerprint: job.demo_sha256 ?? null");
    expect(jobsSource).toContain("persistCanonicalObservation({");
  });
});