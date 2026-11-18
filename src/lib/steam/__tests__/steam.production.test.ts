/**
 * STEAM — production-shape OpenID validation.
 *
 * Real Steam id_res callbacks carry: ns, mode, op_endpoint, claimed_id, identity,
 * return_to, response_nonce, assoc_handle, signed, sig — and NO `openid.realm`
 * (verified against a logged real callback; see docs/steam/STEAM_INTEGRATION.md).
 * The earlier parser required `openid.realm` and would have refused every real sign-in.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STEAM_OPENID_DEFAULT_ENDPOINT,
  STEAM_OPENID_NS,
  STEAM_PRODUCTION_REALM,
  STEAM_PRODUCTION_RETURN_URL,
} from "@/lib/steam/steam.constants";
import { isSteamError } from "@/lib/steam/steam.errors";
import {
  STEAM_NONCE_MAX_AGE_MS,
  buildReturnTo,
  isFreshResponseNonce,
  parseSteamCallback,
} from "@/lib/steam/steam.openid";

const STATE = "a".repeat(64);
const NOW = Date.parse("2026-11-18T22:00:00Z");
const EXPECTED = {
  realm: STEAM_PRODUCTION_REALM,
  opEndpoint: STEAM_OPENID_DEFAULT_ENDPOINT,
  now: NOW,
};
const ID = "76561198120154806";

/** Exactly the parameter set of a real Steam callback (no openid.realm). */
function realCallback(over: Record<string, string | undefined> = {}): Record<string, string> {
  const base: Record<string, string | undefined> = {
    "openid.ns": STEAM_OPENID_NS,
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID_DEFAULT_ENDPOINT,
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${ID}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${ID}`,
    "openid.return_to": buildReturnTo(STEAM_PRODUCTION_RETURN_URL, STATE),
    "openid.response_nonce": "2026-11-18T21:58:30Zq9XxkPZ8bdo=",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "c2lnbmF0dXJl",
    ...over,
  };
  return Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined)) as Record<
    string,
    string
  >;
}

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return isSteamError(error) ? error.code : "OTHER";
  }
}

describe("real Steam callback shape", () => {
  it("accepts it and keeps the SteamID64 as a 17-digit string", () => {
    const parsed = parseSteamCallback(realCallback(), STEAM_PRODUCTION_RETURN_URL, EXPECTED);
    expect(parsed.steamId64).toBe(ID);
    expect(typeof parsed.steamId64).toBe("string");
    expect(parsed.state).toBe(STATE);
  });

  it("still refuses a realm that a provider does echo when it is not ours", () => {
    expect(
      code(() =>
        parseSteamCallback(
          realCallback({ "openid.realm": "https://phish.example.com" }),
          STEAM_PRODUCTION_RETURN_URL,
          EXPECTED,
        ),
      ),
    ).toBe("STEAM_OPENID_INVALID_REALM");
  });

  it("refuses a return_to outside the realm even when it matches the configured URL", () => {
    const foreign = "https://evil.example.com/api/public/integrations/steam/callback";
    expect(
      code(() =>
        parseSteamCallback(
          realCallback({ "openid.return_to": buildReturnTo(foreign, STATE) }),
          foreign,
          EXPECTED,
        ),
      ),
    ).toBe("STEAM_OPENID_INVALID_REALM");
  });

  it.each(["op_endpoint", "response_nonce", "claimed_id", "identity", "return_to"])(
    "refuses an assertion whose signature does not cover %s",
    (field) => {
      const signed = "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle"
        .split(",")
        .filter((f) => f !== field)
        .join(",");
      expect(
        code(() =>
          parseSteamCallback(
            realCallback({ "openid.signed": signed }),
            STEAM_PRODUCTION_RETURN_URL,
            EXPECTED,
          ),
        ),
      ).toBe("STEAM_OPENID_INVALID_RESPONSE");
    },
  );

  it.each([
    ["missing", undefined],
    ["malformed", "yesterday-abc"],
    ["stale", "2026-11-18T21:30:00Zold"],
    ["from the future", "2026-11-18T22:30:00Zfuture"],
  ])("refuses a %s response nonce", (_label, nonce) => {
    expect(
      code(() =>
        parseSteamCallback(
          realCallback({ "openid.response_nonce": nonce }),
          STEAM_PRODUCTION_RETURN_URL,
          EXPECTED,
        ),
      ),
    ).toBe("STEAM_OPENID_INVALID_RESPONSE");
  });

  it("refuses identity ≠ claimed_id, a foreign provider and a non-Steam claimed id", () => {
    const other = "https://steamcommunity.com/openid/id/76561198000000001";
    expect(
      code(() =>
        parseSteamCallback(
          realCallback({ "openid.identity": other }),
          STEAM_PRODUCTION_RETURN_URL,
          EXPECTED,
        ),
      ),
    ).toBe("STEAM_OPENID_INVALID_RESPONSE");
    expect(
      code(() =>
        parseSteamCallback(
          realCallback({ "openid.op_endpoint": "https://evil.example/openid/login" }),
          STEAM_PRODUCTION_RETURN_URL,
          EXPECTED,
        ),
      ),
    ).toBe("STEAM_OPENID_INVALID_ENDPOINT");
    const fake = "https://steamcommunity.com.evil/openid/id/76561198120154806";
    expect(
      code(() =>
        parseSteamCallback(
          realCallback({ "openid.claimed_id": fake, "openid.identity": fake }),
          STEAM_PRODUCTION_RETURN_URL,
          EXPECTED,
        ),
      ),
    ).toBe("STEAM_INVALID_STEAM_ID");
  });
});

describe("response nonce", () => {
  it("accepts a fresh nonce and bounds its age", () => {
    expect(isFreshResponseNonce("2026-11-18T21:59:59Zx", NOW)).toBe(true);
    const old = new Date(NOW - STEAM_NONCE_MAX_AGE_MS - 1000).toISOString().replace(/\.\d+Z$/, "Z");
    expect(isFreshResponseNonce(`${old}x`, NOW)).toBe(false);
    expect(isFreshResponseNonce(`2026-11-18T21:59:59Z${"x".repeat(300)}`, NOW)).toBe(false);
  });
});

describe("configuration defaults", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the production realm and callback only when the environment does not set them", async () => {
    vi.stubEnv("STEAM_INTEGRATION_ENABLED", "true");
    vi.stubEnv("STEAM_OPENID_REALM", "");
    vi.stubEnv("STEAM_OPENID_RETURN_URL", "");
    const { requireSteamOpenIdConfig, steamConfigStatus } =
      await import("@/lib/steam/steam.config.server");
    expect(steamConfigStatus()).toMatchObject({ openidReady: true, returnUrlInsideRealm: true });
    expect(requireSteamOpenIdConfig()).toMatchObject({
      realm: "https://gamepro.network",
      returnUrl: "https://gamepro.network/api/public/integrations/steam/callback",
    });
    vi.stubEnv("STEAM_OPENID_REALM", "https://staging.example.com");
    vi.stubEnv(
      "STEAM_OPENID_RETURN_URL",
      "https://staging.example.com/api/public/integrations/steam/callback",
    );
    expect(requireSteamOpenIdConfig().realm).toBe("https://staging.example.com");
  });

  it("stays off without the operator switch", async () => {
    vi.stubEnv("STEAM_INTEGRATION_ENABLED", "");
    const { steamConfigStatus } = await import("@/lib/steam/steam.config.server");
    expect(steamConfigStatus()).toMatchObject({
      enabled: false,
      openidReady: false,
      state: "not_configured",
    });
  });
});
