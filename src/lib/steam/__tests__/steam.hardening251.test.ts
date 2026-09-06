/**
 * FASE 2.5.1 — hardening regression tests.
 *
 * They exist so a later refactor cannot silently reintroduce: correlation being
 * mistaken for ownership, an assertion from a foreign OpenID provider, a
 * cross-realm assertion, or an unbounded public callback payload.
 */
import { describe, expect, it } from "vitest";

import { hasOwnershipProof, isStrongOwnershipMethod } from "@/lib/identity/ownership";
import { STEAM_OPENID_DEFAULT_ENDPOINT, STEAM_OPENID_NS } from "@/lib/steam/steam.constants";
import { isSteamError } from "@/lib/steam/steam.errors";
import { assertCallbackPayloadWithinLimits } from "@/lib/steam/steam.limits";
import { buildReturnTo, parseSteamCallback } from "@/lib/steam/steam.openid";
import { noopEmailProvider } from "@/lib/email/email.provider";
import { sendTransactionalEmail } from "@/lib/email/email.dispatch.server";

const RETURN_URL = "https://app.example.com/api/public/integrations/steam/callback";
const REALM = "https://app.example.com";
const STATE = "a".repeat(64);
const STEAM_ID = "76561198000000001";

function callbackParams(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "openid.ns": STEAM_OPENID_NS,
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID_DEFAULT_ENDPOINT,
    "openid.realm": REALM,
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "signature",
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    "openid.return_to": buildReturnTo(RETURN_URL, STATE),
    ...overrides,
  };
}

describe("ownership proof", () => {
  it("accepts OAuth and OpenID only", () => {
    expect(isStrongOwnershipMethod("oauth")).toBe(true);
    expect(isStrongOwnershipMethod("openid")).toBe(true);
    expect(isStrongOwnershipMethod("public_profile")).toBe(false);
    expect(isStrongOwnershipMethod(null)).toBe(false);
  });

  it("requires the identity to still be verified", () => {
    expect(hasOwnershipProof({ verification_method: "openid", is_verified: true })).toBe(true);
    expect(hasOwnershipProof({ verification_method: "openid", is_verified: false })).toBe(false);
    expect(hasOwnershipProof({ verification_method: "manual", is_verified: true })).toBe(false);
    expect(hasOwnershipProof(null)).toBe(false);
  });

  it("never treats a conflicting identity as proven", () => {
    expect(
      hasOwnershipProof({
        verification_method: "openid",
        is_verified: true,
        identity_status: "conflict",
      }),
    ).toBe(false);
  });
});

describe("callback provider and realm binding", () => {
  it("accepts a well-formed assertion", () => {
    const parsed = parseSteamCallback(callbackParams(), RETURN_URL, {
      realm: REALM,
      opEndpoint: STEAM_OPENID_DEFAULT_ENDPOINT,
    });
    expect(parsed.steamId64).toBe(STEAM_ID);
  });

  it("refuses a foreign OpenID provider", () => {
    expect(() =>
      parseSteamCallback(
        callbackParams({ "openid.op_endpoint": "https://evil.example.com/openid/login" }),
        RETURN_URL,
        { realm: REALM, opEndpoint: STEAM_OPENID_DEFAULT_ENDPOINT },
      ),
    ).toThrowError(/STEAM_OPENID_INVALID_ENDPOINT/);
  });

  it("refuses an assertion issued for another realm", () => {
    expect(() =>
      parseSteamCallback(
        callbackParams({ "openid.realm": "https://other.example.com" }),
        RETURN_URL,
        {
          realm: REALM,
          opEndpoint: STEAM_OPENID_DEFAULT_ENDPOINT,
        },
      ),
    ).toThrowError(/STEAM_OPENID_INVALID_REALM/);
  });
});

describe("public callback payload limits", () => {
  it("accepts a realistic assertion", () => {
    const url = new URL(RETURN_URL);
    for (const [key, value] of Object.entries(callbackParams())) url.searchParams.set(key, value);
    expect(() => assertCallbackPayloadWithinLimits(url)).not.toThrow();
  });

  it("rejects an oversized query string", () => {
    const url = new URL(RETURN_URL);
    url.searchParams.set("openid.sig", "x".repeat(9000));
    try {
      assertCallbackPayloadWithinLimits(url);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(isSteamError(error)).toBe(true);
    }
  });

  it("rejects too many parameters", () => {
    const url = new URL(RETURN_URL);
    for (let i = 0; i < 60; i += 1) url.searchParams.set(`p${i}`, "v");
    expect(() => assertCallbackPayloadWithinLimits(url)).toThrowError(
      /STEAM_OPENID_INVALID_RESPONSE/,
    );
  });
});

describe("transactional email dispatch", () => {
  const message = {
    to: "player@example.com",
    subject: "Steam vinculado",
    html: "<p>ok</p>",
    text: "ok",
    idempotencyKey: `steam_linked:${STATE}`,
    kind: "steam_linked" as const,
  };

  it("reports not_configured instead of faking a delivery", async () => {
    const outcome = await sendTransactionalEmail(message, { provider: null, persist: false });
    expect(outcome).toEqual({ status: "skipped", reason: "not_configured" });
  });

  it("retries a retryable failure and stops at the ceiling", async () => {
    let attempts = 0;
    const outcome = await sendTransactionalEmail(
      { ...message, idempotencyKey: `retry-${Date.now()}` },
      {
        persist: false,
        sleepImpl: async () => {},
        provider: {
          id: "test",
          async sendTransactionalEmail() {
            attempts += 1;
            return { status: "failed", reason: "PROVIDER_5XX", retryable: true };
          },
        },
      },
    );
    expect(attempts).toBe(3);
    expect(outcome.status).toBe("failed");
  });

  it("never sends the same notice twice", async () => {
    let attempts = 0;
    const provider = {
      id: "test",
      async sendTransactionalEmail() {
        attempts += 1;
        return { status: "sent" as const, providerId: "test", messageId: null };
      },
    };
    const key = `dedupe-${Date.now()}`;
    const options = { provider, persist: false };
    await sendTransactionalEmail({ ...message, idempotencyKey: key }, options);
    const second = await sendTransactionalEmail({ ...message, idempotencyKey: key }, options);
    expect(attempts).toBe(1);
    expect(second).toEqual({ status: "skipped", reason: "duplicate" });
  });
});
