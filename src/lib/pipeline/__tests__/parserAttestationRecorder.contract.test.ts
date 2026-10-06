import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

const route = readFileSync(resolve("src/routes/api/public/parser-attestation.ts"), "utf8");
const workflow = readFileSync(resolve(".github/workflows/parser-runtime-attestation.yml"), "utf8");
const server = readFileSync(resolve("src/server.ts"), "utf8");
const bridgeMigration = readFileSync(
  resolve("supabase/migrations/20260924075412_bd5954f3-8218-4a10-a059-24b01fa84cc6.sql"),
  "utf8",
);
const workflowRegistry = JSON.parse(
  readFileSync(resolve("scripts/approved_attestation_workflow.json"), "utf8"),
) as { path: string; source_sha: string };

function gitBlobSha(content: string): string {
  const bytes = Buffer.from(content);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

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

  it("keeps the bridge transaction-local, service-only, and non-persistent", () => {
    expect(bridgeMigration).toMatch(
      /pg_catalog\.set_config\(\s*['"]app\.settings\.parser_attestation_hmac_secret['"]\s*,\s*_hmac_secret\s*,\s*true\s*\)/,
    );
    expect(bridgeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation_with_secret",
    );
    expect(bridgeMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.record_parser_runtime_attestation_with_secret",
    );
    expect(bridgeMigration).toContain("TO service_role");
    expect(bridgeMigration).toContain("public.record_parser_runtime_attestation(");
    expect(bridgeMigration).not.toMatch(/INSERT\s+INTO\s+public\.[^\n]*(secret|hmac)/i);
    expect(bridgeMigration).not.toMatch(/RETURN\s+_hmac_secret/i);
    expect(bridgeMigration).not.toMatch(/RAISE\s+NOTICE[^\n]*_hmac_secret/i);
  });

  it("keeps server runtime binding scoped to the attestation secrets only", () => {
    expect(server).toContain("PARSER_ATTESTATION_TRANSPORT_SECRET");
    expect(server).toContain("PARSER_ATTESTATION_HMAC_SECRET");
    expect(server).toContain("PARSER_ATTESTATION_ENDPOINT");
    expect(server).not.toContain("Object.assign(process.env");
    expect(server).not.toContain("for (const [key, value] of Object.entries");
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

  it("binds the attestor registry to the reviewed workflow bytes", () => {
    expect(workflowRegistry.path).toBe(".github/workflows/parser-runtime-attestation.yml");
    expect(workflowRegistry.source_sha).toBe(gitBlobSha(workflow));
  });
});
