import { describe, expect, it, vi } from "vitest";
import { appExecutionRecorder } from "@/lib/pipeline/h3e91ExecutionRecorder.server";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));

const input = {
  jobId: "11111111-1111-1111-1111-111111111111",
  uploadId: "22222222-2222-2222-2222-222222222222",
  attemptNumber: 7,
  demoSha256: "a".repeat(64),
  fileSize: 520,
  parserName: "cs2",
  parserVersion: "0.42.0",
  parserRevision: "git:synthetic",
};

describe("APP controlled execution recorder", () => {
  it("reconstructs the same immutable execution and event IDs across process-level retry", async () => {
    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "response lost" } });
    rpc.mockResolvedValueOnce({ data: { status: "IDEMPOTENT_REPLAY" }, error: null });
    await expect(appExecutionRecorder(input)("EXECUTION_INTENT")).rejects.toMatchObject({
      code: "PARSER_UNAVAILABLE",
      detail: "H3E91_RECORDING_FAILED:UNAVAILABLE",
    });
    await expect(appExecutionRecorder(input)("EXECUTION_INTENT")).resolves.toBeUndefined();
    const first = rpc.mock.calls[0]?.[1];
    const replay = rpc.mock.calls[1]?.[1];
    expect(first).toBeDefined();
    expect(first).toEqual(replay);
    expect(first._event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first._demo_sha256).toBeNull();
    expect(first).not.toHaveProperty("_event_digest");
  });

  it("does not collide execution identity across uploads sharing job and attempt", async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { status: "INSERTED" }, error: null });

    const secondUpload = { ...input, uploadId: "33333333-3333-3333-3333-333333333333" };
    await appExecutionRecorder(input)("EXECUTION_INTENT");
    await appExecutionRecorder(secondUpload)("EXECUTION_INTENT");

    const first = rpc.mock.calls[0]?.[1];
    const second = rpc.mock.calls[1]?.[1];
    expect(first?._execution_id).toBeDefined();
    expect(second?._execution_id).toBeDefined();
    expect(first?._execution_id).not.toBe(second?._execution_id);
    expect(first?._correlation_id).not.toBe(second?._correlation_id);
  });

  it("fails closed on rejection and never sends a parser-success terminal implicitly", async () => {
    rpc.mockReset();
    rpc.mockResolvedValueOnce({
      data: { status: "REJECTED", code: "INVALID_TRANSITION" },
      error: null,
    });
    await expect(
      appExecutionRecorder(input)("EXECUTION_FINISHED", "PARSE_SUCCEEDED"),
    ).rejects.toMatchObject({
      code: "PARSER_UNAVAILABLE",
      detail: "H3E91_RECORDING_FAILED:INVALID_TRANSITION",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
