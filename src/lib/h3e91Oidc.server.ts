import { H3E91_OIDC_AUDIENCE, H3E91_WORKFLOW_PATH } from "@/lib/h3e91LiveEvidence";
import { PARSER_ATTESTATION_EXPECTED, PARSER_ATTESTATION_OIDC } from "@/lib/parserAttestation";

export type H3E91OidcClaims = Record<string, unknown>;

function decodeJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("H3E91_OIDC_MALFORMED");
  return parsed as Record<string, unknown>;
}

export function validateH3E91OidcClaims(claims: H3E91OidcClaims, nowSeconds: number): string[] {
  const expectedWorkflowRef = `${PARSER_ATTESTATION_EXPECTED.repository}/${H3E91_WORKFLOW_PATH}@refs/heads/main`;
  const blockers: string[] = [];
  if (claims["iss"] !== PARSER_ATTESTATION_OIDC.issuer) blockers.push("H3E91_OIDC_ISSUER_INVALID");
  if (claims["aud"] !== H3E91_OIDC_AUDIENCE) blockers.push("H3E91_OIDC_AUDIENCE_INVALID");
  if (claims["repository"] !== PARSER_ATTESTATION_EXPECTED.repository) blockers.push("H3E91_OIDC_REPOSITORY_INVALID");
  if (claims["ref"] !== "refs/heads/main" || claims["ref_type"] !== "branch") blockers.push("H3E91_OIDC_REF_INVALID");
  if (claims["event_name"] !== "workflow_dispatch") blockers.push("H3E91_OIDC_EVENT_INVALID");
  if (claims["workflow"] !== "H.3-E.9.1 Live Evidence Preflight" || claims["workflow_ref"] !== expectedWorkflowRef) blockers.push("H3E91_OIDC_WORKFLOW_INVALID");
  if (typeof claims["workflow_sha"] !== "string" || !/^[0-9a-f]{40}$/.test(claims["workflow_sha"])) blockers.push("H3E91_OIDC_WORKFLOW_SHA_INVALID");
  const iat = claims["iat"];
  const exp = claims["exp"];
  const nbf = claims["nbf"];
  if (typeof iat !== "number" || typeof exp !== "number" || iat > nowSeconds + 60 || exp <= nowSeconds || exp - iat > 600 || (nbf !== undefined && (typeof nbf !== "number" || nbf > nowSeconds + 60))) blockers.push("H3E91_OIDC_TIME_INVALID");
  return blockers;
}

export async function verifyH3E91OidcToken(token: string): Promise<H3E91OidcClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("H3E91_OIDC_MALFORMED");
  const [headerPart, claimsPart, signaturePart] = parts;
  if (!headerPart || !claimsPart || !signaturePart) throw new Error("H3E91_OIDC_MALFORMED");
  const header = decodeJson(headerPart);
  const claims = decodeJson(claimsPart);
  const kid = typeof header["kid"] === "string" ? header["kid"] : null;
  if (header["alg"] !== "RS256" || !kid) throw new Error("H3E91_OIDC_ALGORITHM_INVALID");
  const configurationResponse = await fetch(`${PARSER_ATTESTATION_OIDC.issuer}/.well-known/openid-configuration`);
  if (!configurationResponse.ok) throw new Error("H3E91_OIDC_CONFIGURATION_UNAVAILABLE");
  const configuration = (await configurationResponse.json()) as { jwks_uri?: string };
  if (!configuration.jwks_uri?.startsWith(`${PARSER_ATTESTATION_OIDC.issuer}/`)) throw new Error("H3E91_OIDC_CONFIGURATION_INVALID");
  const keysResponse = await fetch(configuration.jwks_uri);
  if (!keysResponse.ok) throw new Error("H3E91_OIDC_KEYS_UNAVAILABLE");
  const keys = (await keysResponse.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const jwk = keys.keys?.find((candidate) => candidate.kid === kid);
  if (!jwk) throw new Error("H3E91_OIDC_KEY_NOT_FOUND");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, Buffer.from(signaturePart, "base64url"), new TextEncoder().encode(`${headerPart}.${claimsPart}`));
  if (!verified) throw new Error("H3E91_OIDC_SIGNATURE_INVALID");
  const blockers = validateH3E91OidcClaims(claims, Math.floor(Date.now() / 1000));
  if (blockers.length > 0) throw new Error(blockers[0]);
  return claims;
}
