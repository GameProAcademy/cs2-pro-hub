import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rawArtifactSha256, stableRawArtifactJson } from "@/lib/pipeline/rawArtifactContract";
import { handleH3ERawAuditReasons } from "@/routes/api/public/h3e-raw-audit-reasons";

const SECRET = "synthetic-transport-secret-for-tests-only-0123456789";
const JOB = "4b5e3530-0f7b-49f6-af8a-68ab2470f3f0";
const state: { artifact: Record<string, unknown> | null; manifest: Record<string, unknown> } = {
  artifact: null,
  manifest: {},
};

vi.mock("@/integrations/supabase/client.server", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    order: self,
    limit: self,
    maybeSingle: async () => ({ data: state.artifact, error: null }),
  });
  return {
    supabaseAdmin: {
      from: () => chain,
      storage: {
        from: () => ({
          download: async () => ({ data: new Blob([JSON.stringify(state.manifest)]), error: null }),
        }),
      },
    },
  };
});

function sealed(evidence: Record<string, unknown>, changes: Record<string, unknown> = {}) {
  return {
    job_id: JOB,
    root_digest: "r".repeat(64),
    audit_evidence: evidence,
    audit_evidence_digest: rawArtifactSha256(stableRawArtifactJson(evidence)),
    ...changes,
  };
}

const post = (body: unknown, auth = `Bearer ${SECRET}`) =>
  handleH3ERawAuditReasons(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { authorization: auth },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.stubEnv("PARSER_ATTESTATION_TRANSPORT_SECRET", SECRET);
  state.artifact = {
    job_id: JOB,
    attempt_number: 10,
    root_digest: "r".repeat(64),
    manifest_storage_path: "u/x/attempt-10/manifest.json",
    status: "ready",
    audit_status: "blocked",
  };
});
afterEach(() => vi.unstubAllEnvs());

describe("RAW audit reasons", () => {
  it("rejects unauthenticated callers and malformed input", async () => {
    expect((await post({ jobId: JOB }, "Bearer wrong")).status).toBe(401);
    expect((await post({ jobId: "x" })).status).toBe(400);
  });

  it("returns reasons, failing gates and mapping counts from a sealed manifest only", async () => {
    state.manifest = sealed({
      raw_status: "BLOCKED",
      raw_block_reasons: ["unmapped_but_available:player_props.X", "gate:G-03"],
      gates: [
        { gate: "G-01", status: "PASS" },
        { gate: "G-03", status: "BLOCKED" },
      ],
      field_mappings: [
        { status: "MAPPED" },
        { status: "UNMAPPED_BUT_AVAILABLE" },
        { status: "MAPPED" },
      ],
    });
    const body = await (await post({ jobId: JOB })).json();
    expect(body).toMatchObject({
      reasons: ["unmapped_but_available:player_props.X", "gate:G-03"],
      failingGates: ["G-03"],
      mappingStatusCounts: { MAPPED: 2, UNMAPPED_BUT_AVAILABLE: 1 },
    });
    expect(JSON.stringify(body)).not.toContain("manifest.json");
  });

  it("refuses a manifest whose evidence digest or identity does not match", async () => {
    state.manifest = sealed(
      { raw_block_reasons: ["x"] },
      { audit_evidence_digest: "0".repeat(64) },
    );
    expect((await post({ jobId: JOB })).status).toBe(409);
    state.manifest = sealed({ raw_block_reasons: ["x"] }, { job_id: "other" });
    expect((await post({ jobId: JOB })).status).toBe(409);
  });
});
