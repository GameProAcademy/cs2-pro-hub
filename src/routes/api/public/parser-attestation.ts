import { createHmac, timingSafeEqual } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import {
  PARSER_ATTESTATION_EXPECTED,
  validateParserAttestationOidcClaims,
  validateParserAttestationPayload,
} from "@/lib/parserAttestation";

const bodySchema = z.object({
  result: z.object({
    status: z.literal("VERIFIED"),
    blockers: z.array(z.string()).length(0),
    attestation_digest: z.string().regex(/^[0-9a-f]{64}$/),
    payload: z.record(z.unknown()),
  }),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
  oidcToken: z.string().min(100),
  releaseGateEvidence: z.record(z.unknown()),
});

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

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
        const authorization = request.headers.get("authorization") ?? "";
        if (!safeEqual(authorization, `Bearer ${transportSecret}`)) {
          return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
        }

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "ATTESTATION_PAYLOAD_INVALID" }, { status: 400 });
        }
        const canonicalPayload = canonicalJson(parsed.data.result.payload);
        const calculatedDigest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(canonicalPayload),
        );
        const calculatedDigestHex = Array.from(new Uint8Array(calculatedDigest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        if (!safeEqual(parsed.data.result.attestation_digest, calculatedDigestHex)) {
          return Response.json({ error: "ATTESTATION_DIGEST_INVALID" }, { status: 400 });
        }
        const expectedSignature = createHmac("sha256", signingSecret)
          .update(canonicalPayload)
          .digest("hex");
        if (!safeEqual(parsed.data.signature, expectedSignature)) {
          return Response.json({ error: "ATTESTATION_SIGNATURE_INVALID" }, { status: 401 });
        }
        const payloadBlockers = validateParserAttestationPayload(parsed.data.result.payload);
        if (payloadBlockers.length > 0) {
          return Response.json(
            { error: "ATTESTATION_EVIDENCE_INVALID", blockers: payloadBlockers },
            { status: 422 },
          );
        }
        try {
          await verifyGitHubOidc(parsed.data.oidcToken, parsed.data.result.payload);
        } catch (error) {
          console.error(
            `[parser-attestation] GitHub identity rejected: ${error instanceof Error ? error.message : "unknown"}`,
          );
          return Response.json({ error: "ATTESTATION_IDENTITY_INVALID" }, { status: 401 });
        }

        const mappingEvidence = parsed.data.releaseGateEvidence["mapping_inventory"];
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
          mappingRecord["authorized_count"] !== 0
        ) {
          return Response.json({ error: "MAPPING_AUTHORITY_MISMATCH" }, { status: 422 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("record_parser_runtime_attestation", {
          _canonical_payload: canonicalPayload,
          _payload: parsed.data.result.payload as Json,
          _attestation_digest: parsed.data.result.attestation_digest,
          _signature: parsed.data.signature,
          _release_gate_evidence: parsed.data.releaseGateEvidence as Json,
        });
        if (error) {
          console.error(`[parser-attestation] recorder failed: ${error.code}`);
          return Response.json({ error: "ATTESTATION_REJECTED" }, { status: 422 });
        }
        return Response.json({ status: "RECORDED", provenanceId: data }, { status: 201 });
      },
    },
  },
});
