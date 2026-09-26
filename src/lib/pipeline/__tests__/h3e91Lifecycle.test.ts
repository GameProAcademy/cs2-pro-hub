import { beforeEach, describe, expect, it, vi } from "vitest";

import { readH3E91ExecutionLifecycle } from "@/lib/pipeline/h3e91Lifecycle.server";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));

const executionId = "11111111-1111-5111-8111-111111111111";

const state = {
  executionId,
  lifecycle: "FINISHED",
  terminalEventId: "22222222-2222-5222-8222-222222222222",
  terminalOutcome: "PARSE_SUCCEEDED",
  terminalCreatedAt: "2026-09-26T05:12:00.000Z",
  hasStarted: true,
  hasTerminal: true,
};

describe("H3E91 authoritative lifecycle reader", () => {
  beforeEach(() => rpc.mockReset());

  it.each(["NONE", "INTENT_ONLY", "STARTED", "FINISHED", "FAILED", "ABORTED", "INVALID"])(
    "accepts the minimal %s lifecycle projection",
    async (lifecycle) => {
      rpc.mockResolvedValueOnce({
        data: {
          ...state,
          lifecycle,
          terminalEventId: ["FINISHED", "FAILED", "ABORTED"].includes(lifecycle)
            ? state.terminalEventId
            : null,
          terminalOutcome: ["FINISHED", "FAILED", "ABORTED"].includes(lifecycle)
            ? state.terminalOutcome
            : null,
          terminalCreatedAt: ["FINISHED", "FAILED", "ABORTED"].includes(lifecycle)
            ? state.terminalCreatedAt
            : null,
          hasStarted: lifecycle === "STARTED" || lifecycle === "FINISHED" || lifecycle === "FAILED",
          hasTerminal: ["FINISHED", "FAILED", "ABORTED"].includes(lifecycle),
        },
        error: null,
      });

      await expect(readH3E91ExecutionLifecycle(executionId)).resolves.toMatchObject({ lifecycle });
      expect(rpc).toHaveBeenCalledWith("h3e91_read_execution_lifecycle", {
        _execution_id: executionId,
      });
    },
  );

  it.each([
    { data: null, error: { message: "database unavailable" } },
    { data: { ...state, parserOutput: { fabricated: true } }, error: null },
    { data: { ...state, lifecycle: "UNKNOWN" }, error: null },
  ])("fails closed on unavailable or non-minimal state", async (result) => {
    rpc.mockResolvedValueOnce(result);
    await expect(readH3E91ExecutionLifecycle(executionId)).rejects.toMatchObject({
      code: "PARSER_UNAVAILABLE",
    });
  });
});
