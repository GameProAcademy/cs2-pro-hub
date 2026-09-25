import { describe, expect, it } from "vitest";

import { parserAttestationEnvelopeSchema } from "@/lib/parserAttestationEnvelope";

const releaseGateEvidence = {
  mapping_inventory: {
    status: "BLOCKED",
    inventory_digest: "a".repeat(64),
    matrix_digest: "b".repeat(64),
    row_count: 105,
    generic_count: 0,
    authorized_count: 0,
    verified_count: 0,
  },
};

type EnvelopeFixture = {
  result?: {
    status: string;
    blockers: string[];
    attestation_digest: unknown;
    payload: unknown;
  };
  canonicalPayload: unknown;
  signature: unknown;
  oidcToken: unknown;
  releaseGateEvidence?: unknown;
};

function githubActionsEnvelope(): EnvelopeFixture {
  const payload = {
    schema_version: 3,
    release_gate_evidence: releaseGateEvidence,
  };
  return {
    result: {
      status: "VERIFIED",
      blockers: [],
      attestation_digest: "c".repeat(64),
      payload,
    },
    canonicalPayload: JSON.stringify(payload),
    signature: "d".repeat(64),
    oidcToken: "synthetic-oidc-token-".padEnd(100, "x"),
    releaseGateEvidence,
  };
}

describe("parser attestation GitHub Actions envelope", () => {
  it("accepts the exact GitHub Actions attestation envelope shape", () => {
    expect(parserAttestationEnvelopeSchema.safeParse(githubActionsEnvelope()).success).toBe(true);
  });

  it.each([
    ["non-VERIFIED status", (body: EnvelopeFixture) => body.result && (body.result.status = "BLOCKED")],
    ["non-empty blockers", (body: EnvelopeFixture) => body.result?.blockers.push("BLOCKED")],
    ["short digest", (body: EnvelopeFixture) => body.result && (body.result.attestation_digest = "abc")],
    ["non-hex digest", (body: EnvelopeFixture) => body.result && (body.result.attestation_digest = "g".repeat(64))],
    ["invalid signature", (body: EnvelopeFixture) => (body.signature = "g".repeat(64))],
    ["short OIDC token", (body: EnvelopeFixture) => (body.oidcToken = "short")],
    ["string release evidence", (body: EnvelopeFixture) => (body.releaseGateEvidence = "invalid")],
    ["array release evidence", (body: EnvelopeFixture) => (body.releaseGateEvidence = [])],
    ["string result payload", (body: EnvelopeFixture) => body.result && (body.result.payload = "invalid")],
    ["array result payload", (body: EnvelopeFixture) => body.result && (body.result.payload = [])],
    ["object canonical payload", (body: EnvelopeFixture) => (body.canonicalPayload = {})],
    ["null canonical payload", (body: EnvelopeFixture) => (body.canonicalPayload = null)],
    ["missing result", (body: EnvelopeFixture) => delete body.result],
    ["missing release evidence", (body: EnvelopeFixture) => delete body.releaseGateEvidence],
    ["undefined critical field", (body: EnvelopeFixture) => (body.signature = undefined)],
  ] satisfies Array<[string, (body: EnvelopeFixture) => unknown]>)
    ("rejects %s", (_label, mutate) => {
    const body = githubActionsEnvelope();
    mutate(body);
    expect(parserAttestationEnvelopeSchema.safeParse(body).success).toBe(false);
    });

  it("identifies the historical workflow path failure without exposing values", () => {
    const body = githubActionsEnvelope();
    body.releaseGateEvidence = null;
    const parsed = parserAttestationEnvelopeSchema.safeParse(body);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(
      parsed.error.issues.map(({ code, path, message }) => ({ code, path, message })),
    ).toEqual([
      {
        code: "invalid_type",
        path: ["releaseGateEvidence"],
        message: "Expected object, received null",
      },
    ]);
  });
});