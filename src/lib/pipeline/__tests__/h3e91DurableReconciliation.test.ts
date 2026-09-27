import { beforeEach, describe, expect, it, vi } from "vitest";

import { reconcileDurableExecution } from "@/lib/pipeline/durableBridge.server";

const rpc = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());
const readLifecycle = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn(() => ({ eq })));
const eq = vi.hoisted(() => vi.fn(() => ({ eq, maybeSingle })));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc, from: vi.fn(() => ({ select })) },
}));
vi.mock("@/lib/pipeline/h3e91Lifecycle.server", () => ({
  readH3E91ExecutionLifecycle: readLifecycle,
}));

const input = {
  jobId: "11111111-1111-1111-1111-111111111111",
  messageId: 7,
  attempt: 2,
  workerId: "worker-1",
  executionId: "e92a9a08-6268-5322-9678-5e9f4fea1f20",
};

const boundJob = {
  queue_message_id: input.messageId,
  dispatch_attempt: input.attempt,
  worker_id: input.workerId,
  upload_id: "55555555-5555-5555-5555-555555555555",
  attempt_number: 1,
  match_id: "77777777-7777-5777-8777-777777777777",
  parser_name: "demoparser2",
  parser_version: "0.42.0",
  parser_revision: "git:synthetic",
  schema_version: 1,
};
const readyArtifact = {
  status: "ready",
  raw_status: "ready",
  audit_status: "approved",
  root_digest: "a".repeat(64),
};
const persistedHotResult = {
  match_id: boundJob.match_id,
  upload_id: boundJob.upload_id,
  source: "demo",
  source_contract_version: "1",
  source_version: "0.42.0",
  status: "complete",
};

const lifecycle = (value: string, outcome: string | null = null) => ({
  executionId: input.executionId,
  lifecycle: value,
  terminalEventId: outcome ? "33333333-3333-5333-8333-333333333333" : null,
  terminalOutcome: outcome,
  terminalEventAt: outcome ? "2026-09-26T05:12:00.000Z" : null,
  hasStarted: value === "STARTED" || value === "FINISHED" || value === "FAILED",
  hasTerminal: ["FINISHED", "FAILED", "ABORTED"].includes(value),
});

describe("durable execution reconciliation", () => {
  beforeEach(() => {
    rpc.mockReset();
    maybeSingle.mockReset();
    readLifecycle.mockReset();
    maybeSingle.mockResolvedValue({ data: { ...boundJob, status: "processing" }, error: null });
  });

  it.each(["NONE", "INTENT_ONLY", "STARTED", "INVALID"])(
    "keeps %s fail-closed without touching queue state",
    async (state) => {
      readLifecycle.mockResolvedValueOnce(lifecycle(state));
      await expect(reconcileDurableExecution(input)).resolves.toEqual({
        status: "reconciliation_required",
        lifecycle: state,
      });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("acknowledges a persisted FINISHED only when the job already has an authoritative result", async () => {
    readLifecycle.mockResolvedValueOnce(lifecycle("FINISHED", "PARSE_SUCCEEDED"));
    maybeSingle.mockResolvedValueOnce({
      data: {
        status: "processed",
        ...boundJob,
      },
      error: null,
    });
    maybeSingle.mockResolvedValueOnce({ data: readyArtifact, error: null });
    maybeSingle.mockResolvedValueOnce({ data: persistedHotResult, error: null });
    rpc.mockResolvedValueOnce({ data: { acknowledged: true }, error: null });

    await expect(reconcileDurableExecution(input)).resolves.toMatchObject({
      status: "queue_reconciled",
      lifecycle: "FINISHED",
    });
    expect(rpc).toHaveBeenCalledWith("finalize_demo_parse_message", {
      _job_id: input.jobId,
      _message_id: input.messageId,
      _attempt: input.attempt,
      _worker_id: input.workerId,
    });
  });

  it("never fabricates completion for FINISHED when persisted job output is absent", async () => {
    readLifecycle.mockResolvedValueOnce(lifecycle("FINISHED", "PARSE_SUCCEEDED"));
    maybeSingle.mockResolvedValueOnce({
      data: {
        status: "processing",
        ...boundJob,
      },
      error: null,
    });
    await expect(reconcileDurableExecution(input)).resolves.toEqual({
      status: "reconciliation_required",
      lifecycle: "FINISHED",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing RAW artifact", null],
    ["incomplete RAW", { ...readyArtifact, status: "uploading" }],
    ["unverified digest", { ...readyArtifact, root_digest: null }],
    ["unapproved RAW", { ...readyArtifact, audit_status: "blocked" }],
  ])("does not archive a processed job with %s", async (_reason, artifact) => {
    readLifecycle.mockResolvedValueOnce(lifecycle("FINISHED", "PARSE_SUCCEEDED"));
    maybeSingle.mockResolvedValueOnce({ data: { ...boundJob, status: "processed" }, error: null });
    maybeSingle.mockResolvedValueOnce({ data: artifact, error: null });
    await expect(reconcileDurableExecution(input)).resolves.toEqual({
      status: "reconciliation_required",
      lifecycle: "FINISHED",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not treat a cancelled job as successful FINISHED output", async () => {
    readLifecycle.mockResolvedValueOnce(lifecycle("FINISHED", "PARSE_SUCCEEDED"));
    maybeSingle.mockResolvedValueOnce({ data: { ...boundJob, status: "cancelled" }, error: null });
    await expect(reconcileDurableExecution(input)).resolves.toEqual({
      status: "reconciliation_required",
      lifecycle: "FINISHED",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing match identity", { match_id: null }, persistedHotResult],
    ["missing parser revision", { parser_revision: null }, persistedHotResult],
    ["missing schema version", { schema_version: null }, persistedHotResult],
    ["missing persisted HOT result", {}, null],
    [
      "stale persisted HOT result",
      {},
      { ...persistedHotResult, match_id: "88888888-8888-5888-8888-888888888888" },
    ],
    ["partial persisted HOT result", {}, { ...persistedHotResult, status: "incomplete" }],
  ])("does not archive a processed job with %s", async (_case, changedJob, persistedResult) => {
    readLifecycle.mockResolvedValueOnce(lifecycle("FINISHED", "PARSE_SUCCEEDED"));
    maybeSingle.mockResolvedValueOnce({
      data: { ...boundJob, status: "processed", ...changedJob },
      error: null,
    });
    maybeSingle.mockResolvedValueOnce({ data: readyArtifact, error: null });
    if (Object.keys(changedJob).length === 0) {
      maybeSingle.mockResolvedValueOnce({ data: persistedResult, error: null });
    }
    await expect(reconcileDurableExecution(input)).resolves.toEqual({
      status: "reconciliation_required",
      lifecycle: "FINISHED",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("permits the explicit blocked RAW exception without a HOT result", async () => {
    readLifecycle.mockResolvedValueOnce(lifecycle("FINISHED", "RAW_AUDIT_BLOCKED"));
    maybeSingle.mockResolvedValueOnce({
      data: { ...boundJob, status: "blocked_raw_audit" },
      error: null,
    });
    maybeSingle.mockResolvedValueOnce({
      data: { ...readyArtifact, audit_status: "blocked" },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: { acknowledged: true }, error: null });
    await expect(reconcileDurableExecution(input)).resolves.toMatchObject({
      status: "queue_reconciled",
      lifecycle: "FINISHED",
    });
  });

  it.each([
    ["expired lease", { acknowledged: false, reason: "lease_expired" }],
    ["stale claim", { acknowledged: false, reason: "claim_not_current" }],
    ["missing queue message", { acknowledged: false, reason: "message_not_archived" }],
    ["malformed acknowledgement", null],
  ])("does not claim FINISHED recovery after %s", async (_case, result) => {
    readLifecycle.mockResolvedValueOnce(lifecycle("FINISHED", "PARSE_SUCCEEDED"));
    maybeSingle.mockResolvedValueOnce({
      data: {
        status: "processed",
        ...boundJob,
      },
      error: null,
    });
    maybeSingle.mockResolvedValueOnce({ data: readyArtifact, error: null });
    maybeSingle.mockResolvedValueOnce({ data: persistedHotResult, error: null });
    rpc.mockResolvedValueOnce({ data: result, error: null });
    await expect(reconcileDurableExecution(input)).resolves.toEqual({
      status: "reconciliation_required",
      lifecycle: "FINISHED",
    });
  });

  it.each(["FAILED", "ABORTED"])(
    "does not claim %s recovery after a stale lease",
    async (state) => {
      readLifecycle.mockResolvedValueOnce(lifecycle(state, "WORKER_INTERRUPTED"));
      maybeSingle.mockResolvedValueOnce({
        data: {
          status: "processing",
          ...boundJob,
        },
        error: null,
      });
      rpc.mockResolvedValueOnce({
        data: { accepted: false, reason: "lease_expired" },
        error: null,
      });
      await expect(reconcileDurableExecution(input)).resolves.toEqual({
        status: "reconciliation_required",
        lifecycle: state,
      });
    },
  );

  it("rejects a lifecycle response for a different execution", async () => {
    readLifecycle.mockResolvedValueOnce({
      ...lifecycle("FINISHED", "PARSE_SUCCEEDED"),
      executionId: "44444444-4444-5444-8444-444444444444",
    });
    await expect(reconcileDurableExecution(input)).rejects.toMatchObject({
      code: "PARSER_UNAVAILABLE",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["different upload", { upload_id: "66666666-6666-6666-6666-666666666666" }],
    ["different attempt", { attempt_number: 2 }],
    ["different queue message", { queue_message_id: 8 }],
    ["different worker", { worker_id: "worker-2" }],
  ])("refuses reconciliation for %s", async (_case, changed) => {
    maybeSingle.mockReset();
    maybeSingle.mockResolvedValueOnce({
      data: { ...boundJob, status: "processed", ...changed },
      error: null,
    });
    await expect(reconcileDurableExecution(input)).resolves.toEqual({
      status: "reconciliation_required",
      lifecycle: "UNKNOWN",
    });
    expect(readLifecycle).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["FAILED", "ABORTED"])(
    "reconciles %s through queue failure without another terminal",
    async (state) => {
      readLifecycle.mockResolvedValueOnce(lifecycle(state, "WORKER_INTERRUPTED"));
      maybeSingle.mockResolvedValueOnce({
        data: {
          status: "processing",
          ...boundJob,
        },
        error: null,
      });
      rpc.mockResolvedValueOnce({ data: { accepted: true }, error: null });
      await expect(reconcileDurableExecution(input)).resolves.toMatchObject({
        status: "queue_reconciled",
        lifecycle: state,
      });
      expect(rpc).toHaveBeenCalledWith(
        "fail_demo_parse_message",
        expect.objectContaining({ _error_code: "WORKER_INTERRUPTED" }),
      );
    },
  );
});
