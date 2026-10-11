import { beforeEach, describe, expect, it, vi } from "vitest";

import { durableExecutionId, reconcileDurableExecution } from "@/lib/pipeline/durableBridge.server";

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
  // uuid5(NAMESPACE_URL, "h3e91:durable:<job>:1:<upload>:dispatch:2"), computed
  // with Python's uuid module: the worker and the bridge must agree.
  executionId: "bc77abbf-bd05-5091-b526-269c6bca2e16",
};
// Same job, dispatch 0: the identity that existed before dispatches had their own.
const DISPATCH_ZERO_EXECUTION_ID = "e92a9a08-6268-5322-9678-5e9f4fea1f20";

const boundJob = {
  queue_message_id: input.messageId,
  dispatch_attempt: input.attempt,
  worker_id: input.workerId,
  upload_id: "55555555-5555-5555-5555-555555555555",
  attempt_number: 1,
  demo_sha256: "b".repeat(64),
  match_id: "77777777-7777-5777-8777-777777777777",
  parser_name: "demoparser2",
  parser_version: "0.42.0",
  parser_revision: "git:synthetic",
  schema_version: 1,
};
const readyArtifact = {
  job_id: input.jobId,
  upload_id: boundJob.upload_id,
  attempt_number: boundJob.attempt_number,
  demo_sha256: boundJob.demo_sha256,
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

  it("gives every dispatch of a job its own execution identity and keeps dispatch 0 unchanged", () => {
    const id = (dispatch: number) =>
      durableExecutionId(input.jobId, boundJob.attempt_number, boundJob.upload_id, dispatch);
    expect(id(0)).toBe(DISPATCH_ZERO_EXECUTION_ID);
    expect(id(2)).toBe(input.executionId);
    expect(new Set([id(0), id(1), id(2), id(3)]).size).toBe(4);
    for (const invalid of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() => id(invalid)).toThrow();
  });

  it("refuses an execution identity that belongs to another dispatch of the same job", async () => {
    await expect(
      reconcileDurableExecution({ ...input, executionId: DISPATCH_ZERO_EXECUTION_ID }),
    ).resolves.toEqual({ status: "reconciliation_required", lifecycle: "UNKNOWN" });
    expect(readLifecycle).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["NONE", "INVALID"])(
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

  it.each(["INTENT_ONLY", "STARTED"])(
    "closes a redelivered dispatch left at %s instead of replaying its identity",
    async (state) => {
      readLifecycle.mockResolvedValueOnce(lifecycle(state));
      rpc.mockResolvedValueOnce({
        data: { accepted: true, status: "pending", retry: true },
        error: null,
      });
      await expect(reconcileDurableExecution(input)).resolves.toEqual({
        status: "dispatch_abandoned",
        lifecycle: state,
        queue: { accepted: true, status: "pending", retry: true },
      });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("abandon_demo_parse_dispatch", {
        _job_id: input.jobId,
        _message_id: input.messageId,
        _attempt: input.attempt,
        _worker_id: input.workerId,
        _lifecycle: state,
      });
    },
  );

  it.each([
    ["the first holder of the dispatch", "not_a_redelivery"],
    ["an expired lease", "lease_expired"],
    ["a superseded claim", "claim_not_current"],
    ["a pending cancellation", "cancellation_pending"],
  ])("does not report an abandoned dispatch for %s", async (_case, reason) => {
    readLifecycle.mockResolvedValueOnce(lifecycle("STARTED"));
    rpc.mockResolvedValueOnce({ data: { accepted: false, reason }, error: null });
    await expect(reconcileDurableExecution(input)).resolves.toEqual({
      status: "reconciliation_required",
      lifecycle: "STARTED",
    });
  });

  it("surfaces a database error while closing an abandoned dispatch", async () => {
    readLifecycle.mockResolvedValueOnce(lifecycle("STARTED"));
    rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    await expect(reconcileDurableExecution(input)).rejects.toMatchObject({
      code: "PERSISTENCE_ERROR",
    });
  });

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

  it("never fabricates completion for FINISHED when the result never committed: the dispatch is closed for a new execution", async () => {
    readLifecycle.mockResolvedValueOnce(lifecycle("FINISHED", "PARSE_SUCCEEDED"));
    maybeSingle.mockResolvedValueOnce({
      data: {
        status: "processing",
        ...boundJob,
      },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: { accepted: true, status: "pending", retry: true },
      error: null,
    });
    await expect(reconcileDurableExecution(input)).resolves.toMatchObject({
      status: "dispatch_abandoned",
      lifecycle: "FINISHED",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "abandon_demo_parse_dispatch",
      expect.objectContaining({ _lifecycle: "FINISHED" }),
    );
    expect(rpc).not.toHaveBeenCalledWith("finalize_demo_parse_message", expect.anything());
  });

  it.each([
    ["missing RAW artifact", null],
    ["incomplete RAW", { ...readyArtifact, status: "uploading" }],
    ["unverified digest", { ...readyArtifact, root_digest: null }],
    ["unapproved RAW", { ...readyArtifact, audit_status: "blocked" }],
    ["RAW for another job", { ...readyArtifact, job_id: "99999999-9999-5999-8999-999999999999" }],
    [
      "RAW for another upload",
      { ...readyArtifact, upload_id: "99999999-9999-5999-8999-999999999999" },
    ],
    ["RAW from another attempt", { ...readyArtifact, attempt_number: 2 }],
    ["RAW for another DEM", { ...readyArtifact, demo_sha256: "c".repeat(64) }],
    ["RAW with malformed digest", { ...readyArtifact, root_digest: "not-a-digest" }],
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
    ["mismatched HOT schema contract", {}, { ...persistedHotResult, source_contract_version: "2" }],
    ["mismatched HOT parser version", {}, { ...persistedHotResult, source_version: "0.41.0" }],
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
        expect.objectContaining({ _error_code: "WORKER_INTERRUPTED", _permanent: false }),
      );
    },
  );

  // A lost `fail` must be classified exactly like a delivered one.
  it.each([
    ["FAILED", "PARSE_TIMEOUT", false],
    ["FAILED", "PARSER_ERROR", false],
    ["FAILED", "CORRUPTED_DEMO", true],
    ["FAILED", "PAYLOAD_TOO_LARGE", true],
    ["ABORTED", "DOWNLOAD_ERROR", false],
    ["ABORTED", "HASH_MISMATCH", true],
    ["ABORTED", "LEASE_REJECTED", false],
  ])(
    "reconciles a lost failure report %s/%s with permanent=%s",
    async (state, outcome, permanent) => {
      readLifecycle.mockResolvedValueOnce(lifecycle(state, outcome));
      rpc.mockResolvedValueOnce({ data: { accepted: true }, error: null });
      await expect(reconcileDurableExecution(input)).resolves.toMatchObject({
        status: "queue_reconciled",
        lifecycle: state,
      });
      expect(rpc).toHaveBeenCalledWith(
        "fail_demo_parse_message",
        expect.objectContaining({ _error_code: outcome, _permanent: permanent }),
      );
    },
  );
});
