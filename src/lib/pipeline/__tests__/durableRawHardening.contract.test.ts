import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  computeRawArtifactIntegrity,
  decideRawChunkRecovery,
  deriveRawArtifactAuditStatus,
  rawPrefix,
  validateDurableClaim,
} from "@/lib/pipeline/durableBridge.server";
import { rawArtifactApproval } from "@/lib/pipeline/rawArtifact.server";

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
const finalForensicMigration = readFileSync(
  "supabase/migrations/20260915064731_ab306b8a-bf75-43e7-9780-83e80b210ce8.sql",
  "utf8",
);
const jobsSource = readFileSync("src/lib/pipeline/jobs.server.ts", "utf8");
const workerSource = readFileSync("services/cs2-demo-parser/worker.py", "utf8");
const bridgeRouteSource = readFileSync("src/routes/api/public/pipeline-worker.$action.ts", "utf8");
const durableBridgeSource = readFileSync("src/lib/pipeline/durableBridge.server.ts", "utf8");
const jobsServerSource = readFileSync("src/lib/pipeline/jobs.server.ts", "utf8");
const claimMigration = readFileSync(
  "supabase/migrations/20260916103513_50aef18c-7978-412f-aefe-eca801eba0a6.sql",
  "utf8",
);

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

  it("persists unknown RAW material before blocking Canonical admission", () => {
    const persist = jobsSource.indexOf("const rawAudit = artifactCompletion");
    const block = jobsSource.indexOf("if (!rawAudit.approved)");
    const normalize = jobsSource.indexOf("const match = normalizeParserOutput(raw)");
    expect(persist).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(persist);
    expect(normalize).toBeGreaterThan(block);
  });

  it("bounds the complete payload while streaming rather than trusting content-length", () => {
    expect(bridgeRouteSource).toContain("request.body.getReader()");
    expect(bridgeRouteSource).toContain("size > DURABLE_HOT_HARD_MAX_BYTES");
    expect(bridgeRouteSource).toContain('error: "payload_too_large"');
    expect(bridgeRouteSource).toContain("complete_start bytes=");
    expect(bridgeRouteSource).toContain("complete_end bytes=");
  });

  it("separates dispatch attempt from the logical demo attempt", () => {
    expect(claimMigration).toContain("'user_id', _job.user_id");
    expect(claimMigration).toContain("'attempt_number', _job.attempt_number");
    expect(claimMigration).toContain("'attempt', _attempt");
    expect(durableBridgeSource).toContain("attempt_number: claim.attempt_number");
    expect(durableBridgeSource).toContain("job.dispatch_attempt !== input.attempt");
    expect(durableBridgeSource).toContain("rawPrefix(job.user_id, job.upload_id, job.attempt_number)");
    expect(jobsServerSource).toContain("attemptNumber: job.attempt_number");
    expect(jobsServerSource).not.toContain("attemptNumber: durableClaim?.attempt");
  });

  it("validates a complete claim and keeps logical and dispatch attempts distinct", () => {
    const claim = validateDurableClaim({
      status: "claimed", message_id: 14,
      job_id: "a31f5c25-b0d8-41ac-8225-27814cd1732a",
      upload_id: "b7d41ad7-b143-4a3a-ab80-ebfee2d2c043",
      user_id: "348b6f66-386d-48c4-bac1-7382ab12d7be",
      demo_sha256: "0caa7c9744deec106095895d2dacd19cbfdae689f99e29e0dd4d446b4ec8ae3d",
      attempt: 2, attempt_number: 5, schema_version: 1, file_size: 473748061,
      storage_path: "348b6f66-386d-48c4-bac1-7382ab12d7be/b7d41ad7-b143-4a3a-ab80-ebfee2d2c043.dem",
    });
    expect(claim).toMatchObject({ attempt: 2, attempt_number: 5 });
  });

  it.each(["user_id", "attempt_number"])("fails closed when claimed %s is missing", (field) => {
    const claim: Record<string, unknown> = {
      status: "claimed", message_id: 1,
      job_id: "a31f5c25-b0d8-41ac-8225-27814cd1732a",
      upload_id: "b7d41ad7-b143-4a3a-ab80-ebfee2d2c043",
      user_id: "348b6f66-386d-48c4-bac1-7382ab12d7be",
      demo_sha256: "0caa7c9744deec106095895d2dacd19cbfdae689f99e29e0dd4d446b4ec8ae3d",
      attempt: 0, attempt_number: 1, schema_version: 1, file_size: 1, storage_path: "u/f.dem",
    };
    delete claim[field];
    expect(() => validateDurableClaim(claim)).toThrowError(
      expect.objectContaining({ code: "PARSER_INVALID_RESPONSE", detail: "durable claim contract invalid" }),
    );
  });

  it("does not inspect claim fields for an empty queue response", () => {
    expect(validateDurableClaim({ status: "empty" })).toBeNull();
  });

  it("keeps technical retries on one logical RAW prefix", () => {
    expect(rawPrefix("user", "upload", 7)).toBe("user/upload/attempt-7");
    expect(rawPrefix("user", "upload", 7)).toBe("user/upload/attempt-7");
    expect(rawPrefix("user", "upload", 8)).toBe("user/upload/attempt-8");
  });

  it("keeps the APP as the final RAW audit authority", () => {
    const evidence = {
      raw_status: "PASS", raw_audit_status: "APPROVED", raw_block_reasons: [],
      gates: [{ gate: "RAW-EVIDENCE-01", status: "PASS" }],
      field_mappings: [{ raw_field: "event.tick", status: "MAPPED", reason_present: false }],
    };
    expect(deriveRawArtifactAuditStatus({ audit_status: "blocked", audit_evidence: evidence })).toBe("approved");
    expect(deriveRawArtifactAuditStatus({ audit_status: "approved" })).toBe("blocked");
    expect(deriveRawArtifactAuditStatus({ audit_status: "approved", audit_evidence: {
      ...evidence, gates: [{ gate: "RAW-EVIDENCE-01", status: "FAIL" }],
    } })).toBe("blocked");
    expect(deriveRawArtifactAuditStatus({ audit_status: "approved", audit_evidence: {
      ...evidence, field_mappings: [{ raw_field: "event.future", status: "UNMAPPED_BUT_AVAILABLE", reason_present: false }],
    } })).toBe("blocked");
  });

  it("fails closed on a broken physical chunk chain", () => {
    const sha = "a".repeat(64);
    try {
      computeRawArtifactIntegrity([
        { section: "events", chunk_index: 0, row_count: 1, byte_size: 10, sha256: sha,
          previous_chunk_sha256: "b".repeat(64) },
      ]);
      throw new Error("expected RAW chain validation to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "PARSER_INVALID_RESPONSE", detail: "RAW chain mismatch" });
    }
  });

  it("changes the root digest when a verified chunk digest changes", () => {
    const chunk = { section: "events", chunk_index: 0, row_count: 1, byte_size: 10,
      previous_chunk_sha256: null };
    const first = computeRawArtifactIntegrity([{ ...chunk, sha256: "a".repeat(64) }]);
    const second = computeRawArtifactIntegrity([{ ...chunk, sha256: "b".repeat(64) }]);
    expect(first.rootDigest).not.toBe(second.rootDigest);
  });

  it("reuses identical verified chunks and rewrites only matching incomplete chunks", () => {
    const incoming = { section: "events", chunk_index: 0, storage_path: "p/events/0.gz",
      first_row: 0, last_row: 0, row_count: 1, byte_size: 10, sha256: "a".repeat(64),
      previous_chunk_sha256: null };
    expect(decideRawChunkRecovery({ ...incoming, status: "verified" }, incoming)).toBe("reuse");
    expect(decideRawChunkRecovery({ ...incoming, status: "uploading" }, incoming)).toBe("rewrite");
    expect(decideRawChunkRecovery({ ...incoming, status: "failed" }, incoming)).toBe("rewrite");
    expect(() => decideRawChunkRecovery({ ...incoming, status: "failed", sha256: "b".repeat(64) }, incoming))
      .toThrowError(expect.objectContaining({ code: "PARSER_INVALID_RESPONSE" }));
  });

  it("requires reasons for every intentionally RAW-only or unmapped available field", () => {
    const base = { raw_status: "PASS", raw_audit_status: "APPROVED", raw_block_reasons: [],
      gates: [{ gate: "RAW", status: "PASS" }] };
    expect(deriveRawArtifactAuditStatus({ audit_evidence: { ...base,
      field_mappings: [{ raw_field: "x", status: "UNMAPPED_BUT_AVAILABLE", reason_present: false }] } })).toBe("blocked");
    expect(deriveRawArtifactAuditStatus({ audit_evidence: { ...base,
      field_mappings: [{ raw_field: "x", status: "UNMAPPED_BUT_AVAILABLE", reason_present: true }] } })).toBe("approved");
  });

  it("never constructs Canonical approval from a blocked decision", () => {
    try {
      rawArtifactApproval({ status: "BLOCKED", auditStatus: "BLOCKED", approved: false,
      auditVersion: 3, reasons: ["gate:RAW"], evidenceDigest: "a".repeat(64), forensicInventory: {} },
      "artifact");
      throw new Error("expected RAW admission to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "RAW_AUDIT_BLOCKED", detail: "gate:RAW" });
    }
  });

  it("binds the immutable audit decision to the evidence digest", () => {
    expect(finalForensicMigration).toContain("audited_evidence_digest = deterministic_digest");
    expect(finalForensicMigration).toContain("RAW_EVIDENCE_AND_AUDIT_DECISION_IMMUTABLE");
    expect(finalForensicMigration).toContain("RAW_EVIDENCE_IMMUTABLE_NO_DELETE");
    expect(finalForensicMigration).toContain("REVOKE UPDATE, DELETE, TRUNCATE");
  });
});