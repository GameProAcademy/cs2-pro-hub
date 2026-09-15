import { beforeEach, describe, expect, it, vi } from "vitest";

import { ME, syntheticParserOutput } from "@/lib/pipeline/__tests__/fixture";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { demoToCanonicalBundle } from "../adapters/demo.adapter";

const maybeSingle = vi.fn();
const rpc = vi.fn();
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  maybeSingle,
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn(() => query), rpc },
}));

const { CanonicalPersistenceError, persistCanonicalObservation } = await import(
  "../canonical.persistence.server"
);

const digest = "b".repeat(64);
const bundle = demoToCanonicalBundle({
  parsed: normalizeParserOutput(syntheticParserOutput),
  fingerprint: digest,
  targetSteamId: ME,
  internalPlayerId: "player-1",
  fetchedAt: "2026-01-02T03:04:05.000Z",
});

describe("Canonical RAW admission defense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a direct demo persistence call without explicit approval", async () => {
    await expect(persistCanonicalObservation({ bundle, uploadId: "upload-1" })).rejects.toMatchObject({
      code: "RAW_ADMISSION_REQUIRED",
    } satisfies Partial<InstanceType<typeof CanonicalPersistenceError>>);
    expect(maybeSingle).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects when persisted RAW evidence is blocked", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        raw_status: "BLOCKED",
        approved_for_canonical: false,
        audit_version: 1,
        deterministic_digest: digest,
      },
      error: null,
    });
    await expect(
      persistCanonicalObservation({
        bundle,
        uploadId: "upload-1",
        rawApproval: { approved: true, auditVersion: 1, evidenceDigest: digest },
      }),
    ).rejects.toMatchObject({ code: "RAW_ADMISSION_REQUIRED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows Canonical only when persisted approval, version, and digest match", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        raw_status: "PASS",
        approved_for_canonical: true,
        audit_version: 1,
        deterministic_digest: digest,
      },
      error: null,
    });
    rpc.mockResolvedValue({
      data: {
        match_id: "match-1",
        series_id: null,
        match_source_id: "source-1",
        created: true,
      },
      error: null,
    });
    await expect(
      persistCanonicalObservation({
        bundle,
        uploadId: "upload-1",
        rawApproval: { approved: true, auditVersion: 1, evidenceDigest: digest },
      }),
    ).resolves.toMatchObject({ matchId: "match-1", matchSourceId: "source-1" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});