import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const route = readFileSync(resolve("src/routes/api/public/parser-attestation.ts"), "utf8");
const workflow = readFileSync(resolve(".github/workflows/parser-runtime-attestation.yml"), "utf8");
const server = readFileSync(resolve("src/server.ts"), "utf8");

describe("H.3-E.2 protected attestation recorder contract", () => {
  it("requires transport, OIDC, HMAC, canonical, digest, and release evidence", () => {
    expect(route).toContain('process.env["PARSER_ATTESTATION_TRANSPORT_SECRET"]');
    expect(route).toContain('process.env["PARSER_ATTESTATION_HMAC_SECRET"]');
    expect(route).toContain("verifyGitHubOidc");
    expect(route).toContain("CANONICAL_PAYLOAD_MISMATCH");
    expect(route).toContain("ATTESTATION_DIGEST_INVALID");
    expect(route).toContain("ATTESTATION_SIGNATURE_INVALID");
    expect(route).toContain("RELEASE_GATE_EVIDENCE_INVALID");
  });

  it("passes the secret only to the service-only transient bridge", () => {
    expect(route).toContain('"record_parser_runtime_attestation_with_secret"');
    expect(route).toContain("_hmac_secret: signingSecret");
    expect(route).not.toMatch(/Response\.json\([^)]*(signingSecret|transportSecret|oidcToken)/);
    expect(route).not.toMatch(
      /console\.(log|error)\([^)]*(signingSecret|transportSecret|oidcToken)/,
    );
  });

  it("keeps missing runtime configuration fail-closed without disclosing readiness details", () => {
    expect(route).toContain('error: "ATTESTATION_SERVER_NOT_CONFIGURED"');
    expect(route).toContain("{ status: 503 }");
    expect(route).not.toContain("transportSecretConfigured");
    expect(route).not.toContain("signingSecretConfigured");
    expect(server).toContain("bindAttestationRuntimeSecrets(env)");
  });

  it("keeps dispatch manual and sends the exact signed canonical payload", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain('--arg canonicalPayload "$canonical_payload"');
    expect(workflow).toContain("canonicalPayload:$canonicalPayload");
    expect(workflow).toContain(".payload.release_gate_evidence");
    expect(workflow).not.toContain("jq -c '.release_gate_evidence'");
  });
});
