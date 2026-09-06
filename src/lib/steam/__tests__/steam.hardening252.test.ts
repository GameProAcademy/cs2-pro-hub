/**
 * FASE 2.5.2 — closure regression tests.
 *
 * Each case corresponds to an attack that must stay impossible: a forged OpenID
 * provider, a missing/renamed realm, a tampered return_to, an oversized public
 * payload, an unauthorised bulk mutation, and an email locale resolved from the
 * wrong signal.
 */
import { describe, expect, it } from "vitest";

import { STEAM_OPENID_DEFAULT_ENDPOINT, STEAM_OPENID_NS } from "@/lib/steam/steam.constants";
import { isSteamError, type SteamErrorCode } from "@/lib/steam/steam.errors";
import { STEAM_CALLBACK_LIMITS, assertCallbackPayloadWithinLimits } from "@/lib/steam/steam.limits";
import { buildReturnTo, parseSteamCallback } from "@/lib/steam/steam.openid";
import { BULK_STATUS_MAX_USERS } from "@/lib/admin.functions";
import { resolveEmailLocale, normalizeEmailLocale } from "@/lib/email/email.locale";
import { renderSteamLinkedEmail, renderSteamUnlinkedEmail } from "@/lib/email/email.templates";

const RETURN_URL = "https://app.example.com/api/public/integrations/steam/callback";
const REALM = "https://app.example.com";
const STATE = "b".repeat(64);
const STEAM_ID = "76561198000000042";

const EXPECTED = { realm: REALM, opEndpoint: STEAM_OPENID_DEFAULT_ENDPOINT };

function callbackParams(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
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
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) if (value !== undefined) params[key] = value;
  return params;
}

function expectRejection(params: Record<string, string>, code?: SteamErrorCode) {
  try {
    parseSteamCallback(params, RETURN_URL, EXPECTED);
    throw new Error("expected the callback to be rejected");
  } catch (error) {
    expect(isSteamError(error)).toBe(true);
    if (code && isSteamError(error)) expect(error.code).toBe(code);
  }
}

describe("steam callback — mandatory assertion fields", () => {
  it("accepts a well-formed assertion", () => {
    const parsed = parseSteamCallback(callbackParams(), RETURN_URL, EXPECTED);
    expect(parsed.steamId64).toBe(STEAM_ID);
    expect(parsed.state).toBe(STATE);
  });

  it("rejects a missing op_endpoint", () => {
    expectRejection(
      callbackParams({ "openid.op_endpoint": undefined }),
      "STEAM_OPENID_INVALID_ENDPOINT",
    );
  });

  it("rejects an assertion from a foreign OpenID provider", () => {
    expectRejection(
      callbackParams({ "openid.op_endpoint": "https://evil.example.com/openid/login" }),
      "STEAM_OPENID_INVALID_ENDPOINT",
    );
  });

  it("rejects a missing realm", () => {
    expectRejection(callbackParams({ "openid.realm": undefined }), "STEAM_OPENID_INVALID_REALM");
  });

  it("rejects a cross-realm assertion", () => {
    expectRejection(
      callbackParams({ "openid.realm": "https://phish.example.com" }),
      "STEAM_OPENID_INVALID_REALM",
    );
  });

  it("rejects a tampered return_to (extra parameter)", () => {
    expectRejection(
      callbackParams({ "openid.return_to": `${buildReturnTo(RETURN_URL, STATE)}&next=/admin` }),
      "STEAM_OPENID_INVALID_RETURN_TO",
    );
  });

  it("rejects a return_to on another host", () => {
    expectRejection(
      callbackParams({
        "openid.return_to": buildReturnTo(
          "https://evil.example.com/api/public/integrations/steam/callback",
          STATE,
        ),
      }),
      "STEAM_OPENID_INVALID_RETURN_TO",
    );
  });

  it("rejects a return_to without our state", () => {
    expectRejection(callbackParams({ "openid.return_to": RETURN_URL }));
  });

  it("rejects a missing signature", () => {
    expectRejection(callbackParams({ "openid.sig": undefined }));
  });

  it("rejects a claimed_id that is not a Steam identity URL", () => {
    expectRejection(
      callbackParams({
        "openid.claimed_id": "https://steamcommunity.com/openid/id/not-a-number",
        "openid.identity": "https://steamcommunity.com/openid/id/not-a-number",
      }),
    );
  });

  it("rejects claimed_id and identity pointing at different accounts", () => {
    expectRejection(
      callbackParams({
        "openid.identity": "https://steamcommunity.com/openid/id/76561198000000099",
      }),
    );
  });

  it("rejects an assertion whose signature does not cover the identity fields", () => {
    expectRejection(callbackParams({ "openid.signed": "signed,response_nonce,assoc_handle" }));
  });

  it("keeps SteamID64 as a string, never a number", () => {
    const parsed = parseSteamCallback(callbackParams(), RETURN_URL, EXPECTED);
    expect(typeof parsed.steamId64).toBe("string");
  });
});

describe("steam callback — public payload ceilings", () => {
  it("accepts a normal callback URL", () => {
    const url = new URL(RETURN_URL);
    for (const [key, value] of Object.entries(callbackParams())) {
      url.searchParams.set(key, value);
    }
    expect(() => assertCallbackPayloadWithinLimits(url)).not.toThrow();
  });

  it("rejects an oversized URL", () => {
    const url = new URL(RETURN_URL);
    url.searchParams.set("openid.sig", "x".repeat(STEAM_CALLBACK_LIMITS.maxQueryBytes + 1));
    expect(() => assertCallbackPayloadWithinLimits(url)).toThrow();
  });

  it("rejects too many parameters", () => {
    const url = new URL(RETURN_URL);
    for (let i = 0; i <= STEAM_CALLBACK_LIMITS.maxParams; i += 1)
      url.searchParams.append(`p${i}`, "1");
    expect(() => assertCallbackPayloadWithinLimits(url)).toThrow();
  });

  it("rejects an oversized single value", () => {
    const url = new URL(RETURN_URL);
    url.searchParams.set("openid.claimed_id", "y".repeat(STEAM_CALLBACK_LIMITS.maxValueLength + 1));
    expect(() => assertCallbackPayloadWithinLimits(url)).toThrow();
  });
});

describe("bulk status ceiling", () => {
  it("is a hard limit of 50", () => {
    expect(BULK_STATUS_MAX_USERS).toBe(50);
  });
});

describe("email locale resolution", () => {
  it("prefers the saved preference over everything else", () => {
    expect(
      resolveEmailLocale({ preferredLocale: "fr", browserLocale: "en-US", country: "BR" }),
    ).toBe("fr");
  });

  it("falls back to the browser locale when no preference is saved", () => {
    expect(resolveEmailLocale({ browserLocale: "es-AR", country: "BR" })).toBe("es");
  });

  it("uses the country only as a last resort, and never as a language", () => {
    expect(resolveEmailLocale({ country: "BR" })).toBe("pt-BR");
    expect(resolveEmailLocale({ country: "PT" })).toBe("pt-PT");
    expect(resolveEmailLocale({ country: "MX" })).toBe("es");
    expect(resolveEmailLocale({ country: "ZZ" })).toBe("pt-BR");
  });

  it("defaults to pt-BR with no signal at all", () => {
    expect(resolveEmailLocale()).toBe("pt-BR");
    expect(normalizeEmailLocale("klingon")).toBeNull();
  });
});

describe("steam security notices", () => {
  const input = {
    name: "Player",
    steamIdMasked: "7656…0042",
    personaName: "player",
    occurredAt: "2026-09-05T12:00:00.000Z",
  };

  for (const locale of ["pt-BR", "pt-PT", "en", "es", "fr"] as const) {
    it(`renders the linked notice in ${locale} without a full SteamID64`, () => {
      const rendered = renderSteamLinkedEmail({ ...input, locale });
      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.html).not.toContain(STEAM_ID);
      expect(rendered.text).not.toContain(STEAM_ID);
      expect(rendered.text.length).toBeGreaterThan(0);
    });

    it(`renders the unlinked notice in ${locale}`, () => {
      const rendered = renderSteamUnlinkedEmail({ ...input, locale });
      expect(rendered.html).toContain(input.steamIdMasked);
      expect(rendered.html).not.toContain(STEAM_ID);
    });
  }

  it("produces different copy per language", () => {
    const pt = renderSteamLinkedEmail({ ...input, locale: "pt-BR" }).subject;
    const fr = renderSteamLinkedEmail({ ...input, locale: "fr" }).subject;
    expect(pt).not.toBe(fr);
  });
});
