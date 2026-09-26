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
  executionId: "22222222-2222-5222-8222-222222222222",
};

const lifecycle = (value: string, outcome: string | null = null) => ({
  executionId: input.executionId,
  lifecycle: value,
  terminalEventId: outcome ? "33333333-3333-5333-8333-333333333333" : null,
  terminalOutcome: outcome,
  terminalCreatedAt: outcome ? "2026-09-26T05:12:00.000Z" : null,
  hasStarted: value === "STARTED" || value === "FINISHED" || value === "FAILED",
  hasTerminal: ["FINISHED", "FAILED", "ABORTED"].includes(value),
});

describe("durable execution reconciliation", () => {
  beforeEach(() => {
    rpc.mockReset();
    maybeSingle.mockReset();
    readLifecycle.mockReset();
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
        queue_message_id: input.messageId,
        dispatch_attempt: input.attempt,
        worker_id: input.workerId,
      },
      error: null,
    });
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
        queue_message_id: input.messageId,
        dispatch_attempt: input.attempt,
        worker_id: input.workerId,
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
    ["expired lease", { acknowledged: false, reason: "lease_expired" }],
    ["stale claim", { acknowledged: false, reason: "claim_not_current" }],
    ["missing queue message", { acknowledged: false, reason: "message_not_archived" }],
    ["malformed acknowledgement", null],
  ])("does not claim FINISHED recovery after %s", async (_case, result) => {
    readLifecycle.mockResolvedValueOnce(lifecycle("FINISHED", "PARSE_SUCCEEDED"));
    maybeSingle.mockResolvedValueOnce({
      data: {
        status: "processed",
        queue_message_id: input.messageId,
        dispatch_attempt: input.attempt,
        worker_id: input.workerId,
      },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: result, error: null });
    await expect(reconcileDurableExecution(input)).resolves.toEqual({
      status: "reconciliation_required",
      lifecycle: "FINISHED",
    });
  });

  it.each(["FAILED", "ABORTED"])("does not claim %s recovery after a stale lease", async (state) => {
    readLifecycle.mockResolvedValueOnce(lifecycle(state, "WORKER_INTERRUPTED"));
    maybeSingle.mockResolvedValueOnce({
      data: {
        status: "processing",
        queue_message_id: input.messageId,
        dispatch_attempt: input.attempt,
        worker_id: input.workerId,
      },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: { accepted: false, reason: "lease_expired" }, error: null });
    await expect(reconcileDurableExecution(input)).resolves.toEqual({
      status: "reconciliation_required",
      lifecycle: state,
    });
  });

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

  it.each(["FAILED", "ABORTED"])(
    "reconciles %s through queue failure without another terminal",
    async (state) => {
      readLifecycle.mockResolvedValueOnce(lifecycle(state, "WORKER_INTERRUPTED"));
      maybeSingle.mockResolvedValueOnce({
        data: {
          status: "processing",
          queue_message_id: input.messageId,
          dispatch_attempt: input.attempt,
          worker_id: input.workerId,
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
