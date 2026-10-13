import { createFileRoute } from "@tanstack/react-router";

import { isAttestationTransportAuthorized } from "@/lib/parserAttestationCrypto.server";

/**
 * A9.1 reference-fixture source, for the manual A9.1 real-DEM workflow only.
 *
 * Authenticated with the CI transport secret. It re-proves the identity of the
 * official reference fixture (r5_forensic_staging registry row: authorized
 * SHA-256 and size observed, bytes readable, not deleted; physical object
 * present with the authorized size) and only then returns a 30-minute signed
 * URL for exactly that object. The workflow still verifies the downloaded bytes
 * (size and SHA-256) before any parse. The URL is never logged.
 */
export async function handleA91ReferenceFixture(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const transportSecret = process.env["PARSER_ATTESTATION_TRANSPORT_SECRET"];
  if (!transportSecret || transportSecret.length < 32) {
    return Response.json({ error: "FIXTURE_SOURCE_NOT_CONFIGURED" }, { status: 503, headers });
  }
  if (!isAttestationTransportAuthorized(request.headers, transportSecret)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  }
  try {
    const { signReferenceFixture } = await import("@/lib/pipeline/h3eRetentionOperator.server");
    const result = await signReferenceFixture();
    if (!result.ok) {
      console.info("[a91-reference-fixture] refused", result.fixture);
      return Response.json(
        { error: "FIXTURE_NOT_PROVEN", fixture: result.fixture },
        { status: 409, headers },
      );
    }
    console.info("[a91-reference-fixture] issued", { expiresInSeconds: result.expiresInSeconds });
    return Response.json(
      {
        source: "OFFICIAL_R5_FORENSIC_STAGING",
        url: result.url,
        sha256: result.sha256,
        sizeBytes: result.sizeBytes,
        expiresInSeconds: result.expiresInSeconds,
      },
      { status: 200, headers },
    );
  } catch {
    return Response.json({ error: "FIXTURE_SOURCE_UNAVAILABLE" }, { status: 503, headers });
  }
}

export const Route = createFileRoute("/api/public/a91-reference-fixture")({
  server: {
    handlers: {
      POST: ({ request }) => handleA91ReferenceFixture(request),
    },
  },
});
