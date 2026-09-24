import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import {
  extractBoundReleaseGateEvidence,
  PARSER_ATTESTATION_EXPECTED,
  validateParserAttestationOidcClaims,
  validateParserAttestationPayload,
} from "@/lib/parserAttestation";
import {
  canonicalAttestationJson,
  isAttestationTransportAuthorized,
  safeAttestationEqual,
  signAttestationPayload,
} from "@/lib/parserAttestationCrypto.server";

const bodySchema = z.object({
  result: z.object({
    status: z.literal("VERIFIED"),
    blockers: z.array(z.string()).length(0),
    attestation_digest: z.string().regex(/^[0-9a-f]{64}$/),
    payload: z.record(z.unknown()),
  }),
  canonicalPayload: z.string().min(2),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
  oidcToken: z.string().min(100),
  releaseGateEvidence: z.record(z.unknown()),
});

function base64UrlJson(value: string): Record<string, unknown> {
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  const parsed: unknown = JSON.parse(decoded);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("OIDC_INVALID");
  return parsed as Record<string, unknown>;
}

async function verifyGitHubOidc(token: string, payload: Record<string, unknown>): Promise<void> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("OIDC_INVALID");
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  if (!encodedHeader || !encodedClaims || !encodedSignature) throw new Error("OIDC_INVALID");
  const header = base64UrlJson(encodedHeader);
  const claims = base64UrlJson(encodedClaims);
  const kid = typeof header["kid"] === "string" ? header["kid"] : null;
  if (header["alg"] !== "RS256" || !kid) throw new Error("OIDC_ALGORITHM_INVALID");

  const configurationResponse = await fetch(
    "https://token.actions.githubusercontent.com/.well-known/openid-configuration",
  );
  if (!configurationResponse.ok) throw new Error("OIDC_CONFIGURATION_UNAVAILABLE");
  const configuration = (await configurationResponse.json()) as { jwks_uri?: string };
  if (!configuration.jwks_uri) throw new Error("OIDC_CONFIGURATION_INVALID");
  const keysResponse = await fetch(configuration.jwks_uri);
  if (!keysResponse.ok) throw new Error("OIDC_KEYS_UNAVAILABLE");
  const keys = (await keysResponse.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const jwk = keys.keys?.find((candidate) => candidate.kid === kid);
  if (!jwk) throw new Error("OIDC_KEY_NOT_FOUND");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(encodedSignature, "base64url"),
    new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
  );
  if (!verified) throw new Error("OIDC_SIGNATURE_INVALID");

  const now = Math.floor(Date.now() / 1000);
  const workflow = payload["workflow_identity"];
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw new Error("WORKFLOW_IDENTITY_INVALID");
  }
  const workflowIdentity = workflow as Record<string, unknown>;
  if (validateParserAttestationOidcClaims(claims, workflowIdentity, now).length > 0) {
    throw new Error("OIDC_CLAIMS_MISMATCH");
  }
}

export const Route = createFileRoute("/api/public/parser-attestation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const transportSecret = process.env["PARSER_ATTESTATION_TRANSPORT_SECRET"];
        const signingSecret = process.env["PARSER_ATTESTATION_HMAC_SECRET"];
        if (
          !transportSecret ||
          transportSecret.length < 32 ||
          !signingSecret ||
          signingSecret.length < 32
        ) {
          return Response.json({ error: "ATTESTATION_SERVER_NOT_CONFIGURED" }, { status: 503 });
        }
        if (!isAttestationTransportAuthorized(request.headers, transportSecret)) {
          return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
        }

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          console.error(
            "[parser-attestation] payload schema rejected",
            parsed.error.issues.map((issue) => ({
              code: issue.code,
              path: issue.path,
              message: issue.message,
            })),
          );
          return Response.json({ error: "ATTESTATION_PAYLOAD_INVALID" }, { status: 400 });
        }
        let canonicalPayloadObject: Record<string, unknown>;
        try {
          const candidate: unknown = JSON.parse(parsed.data.canonicalPayload);
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
            throw new Error("CANONICAL_PAYLOAD_INVALID");
          }
          canonicalPayloadObject = candidate as Record<string, unknown>;
        } catch {
          return Response.json({ error: "CANONICAL_PAYLOAD_INVALID" }, { status: 400 });
        }
        const canonicalPayload = parsed.data.canonicalPayload;
        if (
          canonicalAttestationJson(canonicalPayloadObject) !== canonicalPayload ||
          canonicalAttestationJson(parsed.data.result.payload) !== canonicalPayload
        ) {
          return Response.json({ error: "CANONICAL_PAYLOAD_MISMATCH" }, { status: 400 });
        }
        const calculatedDigest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(canonicalPayload),
        );
        const calculatedDigestHex = Array.from(new Uint8Array(calculatedDigest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        if (!safeAttestationEqual(parsed.data.result.attestation_digest, calculatedDigestHex)) {
          return Response.json({ error: "ATTESTATION_DIGEST_INVALID" }, { status: 400 });
        }
        const expectedSignature = signAttestationPayload(canonicalPayload, signingSecret);
        if (!safeAttestationEqual(parsed.data.signature, expectedSignature)) {
          return Response.json({ error: "ATTESTATION_SIGNATURE_INVALID" }, { status: 401 });
        }
        const payloadBlockers = validateParserAttestationPayload(parsed.data.result.payload);
        if (payloadBlockers.length > 0) {
          return Response.json(
            { error: "ATTESTATION_EVIDENCE_INVALID", blockers: payloadBlockers },
            { status: 422 },
          );
        }
        const attestedAt = parsed.data.result.payload["attested_at"];
        const nonce = parsed.data.result.payload["nonce"];
        if (typeof attestedAt !== "string" || typeof nonce !== "string") {
          return Response.json({ error: "ATTESTATION_FRESHNESS_INVALID" }, { status: 422 });
        }
        const attestedAtMs = Date.parse(attestedAt);
        const nowMs = Date.now();
        if (
          !Number.isFinite(attestedAtMs) ||
          attestedAtMs > nowMs + 60_000 ||
          attestedAtMs < nowMs - 300_000
        ) {
          return Response.json({ error: "ATTESTATION_FRESHNESS_INVALID" }, { status: 422 });
        }
        try {
          await verifyGitHubOidc(parsed.data.oidcToken, parsed.data.result.payload);
        } catch (error) {
          console.error(
            `[parser-attestation] GitHub identity rejected: ${error instanceof Error ? error.message : "unknown"}`,
          );
          return Response.json({ error: "ATTESTATION_IDENTITY_INVALID" }, { status: 401 });
        }

        const releaseGateEvidence = extractBoundReleaseGateEvidence(parsed.data.result.payload);
        if (
          !releaseGateEvidence ||
          canonicalAttestationJson(releaseGateEvidence) !==
            canonicalAttestationJson(parsed.data.releaseGateEvidence)
        ) {
          return Response.json({ error: "RELEASE_GATE_EVIDENCE_INVALID" }, { status: 422 });
        }
        const mappingEvidence = releaseGateEvidence["mapping_inventory"];
        const mappingRecord =
          mappingEvidence && typeof mappingEvidence === "object" && !Array.isArray(mappingEvidence)
            ? (mappingEvidence as Record<string, unknown>)
            : null;
        if (
          !mappingRecord ||
          mappingRecord["status"] !== "BLOCKED" ||
          mappingRecord["inventory_digest"] !==
            "cf0549c2dfbdc4df25b42ce8204edf8705071c586e99696e9ef596c1e742d7b1" ||
          mappingRecord["matrix_digest"] !==
            "a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702" ||
          mappingRecord["row_count"] !== 105 ||
          mappingRecord["generic_count"] !== 0 ||
          mappingRecord["authorized_count"] !== 0 ||
          mappingRecord["verified_count"] !== 0 ||
          mappingRecord["release_id"] !== PARSER_ATTESTATION_EXPECTED.mappingReleaseId ||
          mappingRecord["inventory_version"] !== PARSER_ATTESTATION_EXPECTED.inventoryVersion
        ) {
          return Response.json({ error: "MAPPING_AUTHORITY_MISMATCH" }, { status: 422 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc(
          "record_parser_runtime_attestation_with_secret",
          {
            _canonical_payload: canonicalPayload,
            _payload: parsed.data.result.payload as Json,
            _attestation_digest: parsed.data.result.attestation_digest,
            _signature: parsed.data.signature,
            _release_gate_evidence: releaseGateEvidence as Json,
            _attested_at: attestedAt,
            _nonce: nonce,
            _hmac_secret: signingSecret,
          },
        );
        if (error) {
          console.error(`[parser-attestation] recorder failed: ${error.code}`);
          return Response.json({ error: "ATTESTATION_REJECTED" }, { status: 422 });
        }
        return Response.json(
          {
            ok: true,
            status: "VERIFIED",
            provenanceId: data,
            attestationDigest: parsed.data.result.attestation_digest,
          },
          { status: 200 },
        );
      },
    },
  },
});
