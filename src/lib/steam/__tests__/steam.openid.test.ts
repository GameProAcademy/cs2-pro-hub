/**
 * FASE 2.5 — Steam OpenID contract tests.
 *
 * These are the security-relevant invariants: a browser must never be able to
 * choose which Steam account gets linked.
 */
import { describe, expect, it } from "vitest";

import {
  buildCheckAuthenticationBody,
  buildReturnTo,
  buildSteamAuthUrl,
  extractStateFromReturnTo,
  generateState,
  hashState,
  isSteamId64,
  maskSteamId64,
  parseCheckAuthenticationResponse,
  parseSteamCallback,
  steamId64FromClaimedId,
  steamProfileUrl,
} from "../steam.openid";
import { SteamError } from "../steam.errors";
import {
  STEAM_OPENID_DEFAULT_ENDPOINT,
  STEAM_OPENID_IDENTIFIER_SELECT,
  STEAM_OPENID_NS,
} from "../steam.constants";

const RETURN_URL = "https://app.example.com/api/public/integrations/steam/callback";
const STEAM_ID = "76561198000000001";
const CLAIMED = `https://steamcommunity.com/openid/id/${STEAM_ID}`;

function validParams(state: string, overrides: Record<string, string> = {}) {
  return {
    "openid.ns": STEAM_OPENID_NS,
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID_DEFAULT_ENDPOINT,
    "openid.claimed_id": CLAIMED,
    "openid.identity": CLAIMED,
    "openid.return_to": buildReturnTo(RETURN_URL, state),
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "Zm9vYmFy",
    ...overrides,
  };
}

describe("steam openid — authorization request", () => {
  it("asks Steam to select the identifier and carries our state in return_to", () => {
    const url = new URL(
      buildSteamAuthUrl({
        endpoint: STEAM_OPENID_DEFAULT_ENDPOINT,
        realm: "https://app.example.com",
        returnUrl: RETURN_URL,
        state: "a".repeat(64),
      }),
    );
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.identity")).toBe(STEAM_OPENID_IDENTIFIER_SELECT);
    expect(url.searchParams.get("openid.claimed_id")).toBe(STEAM_OPENID_IDENTIFIER_SELECT);
    expect(extractStateFromReturnTo(url.searchParams.get("openid.return_to")!)).toBe(
      "a".repeat(64),
    );
  });

  it("generates a 64-hex state and only ever persists its hash", async () => {
    const state = generateState();
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    const hash = await hashState(state);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(state);
    expect(await hashState(state)).toBe(hash);
  });
});

describe("steam openid — callback parsing", () => {
  const state = "b".repeat(64);

  it("accepts a well-formed, correctly bound assertion", () => {
    const parsed = parseSteamCallback(validParams(state), RETURN_URL);
    expect(parsed.steamId64).toBe(STEAM_ID);
    expect(parsed.state).toBe(state);
  });

  it("reports an explicit cancellation", () => {
    expect(() =>
      parseSteamCallback(validParams(state, { "openid.mode": "cancel" }), RETURN_URL),
    ).toThrow(new SteamError("STEAM_OPENID_CANCELLED"));
  });

  it("refuses a foreign namespace", () => {
    expect(() =>
      parseSteamCallback(validParams(state, { "openid.ns": "http://evil.example/ns" }), RETURN_URL),
    ).toThrow(new SteamError("STEAM_OPENID_INVALID_RESPONSE"));
  });

  it("refuses an assertion whose signature does not cover claimed_id", () => {
    expect(() =>
      parseSteamCallback(
        validParams(state, { "openid.signed": "signed,return_to,identity" }),
        RETURN_URL,
      ),
    ).toThrow(new SteamError("STEAM_OPENID_INVALID_RESPONSE"));
  });

  it("refuses a tampered return_to (different host, same state)", () => {
    expect(() =>
      parseSteamCallback(
        validParams(state, {
          "openid.return_to": buildReturnTo("https://evil.example/callback", state),
        }),
        RETURN_URL,
      ),
    ).toThrow(new SteamError("STEAM_OPENID_INVALID_RETURN_TO"));
  });

  it("refuses an assertion with no state at all", () => {
    expect(() =>
      parseSteamCallback(validParams(state, { "openid.return_to": RETURN_URL }), RETURN_URL),
    ).toThrow(new SteamError("STEAM_OPENID_STATE_INVALID"));
  });

  it("refuses claimed_id and identity describing different accounts", () => {
    expect(() =>
      parseSteamCallback(
        validParams(state, {
          "openid.identity": "https://steamcommunity.com/openid/id/76561198000000002",
        }),
        RETURN_URL,
      ),
    ).toThrow(new SteamError("STEAM_OPENID_INVALID_RESPONSE"));
  });

  it("refuses a claimed_id that is not a Steam OpenID identifier", () => {
    expect(() =>
      parseSteamCallback(
        validParams(state, {
          "openid.claimed_id": "https://evil.example/openid/id/76561198000000001",
          "openid.identity": "https://evil.example/openid/id/76561198000000001",
        }),
        RETURN_URL,
      ),
    ).toThrow(new SteamError("STEAM_INVALID_STEAM_ID"));
  });
});

describe("steam openid — verification round trip", () => {
  it("forwards only openid.* fields and switches to check_authentication", () => {
    const body = buildCheckAuthenticationBody({
      ...validParams("c".repeat(64)),
      gp_state: "must-not-be-sent",
    });
    expect(body.get("openid.mode")).toBe("check_authentication");
    expect(body.get("gp_state")).toBeNull();
    expect(body.get("openid.sig")).toBe("Zm9vYmFy");
  });

  it("only accepts an explicit is_valid:true", () => {
    expect(
      parseCheckAuthenticationResponse("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"),
    ).toBe(true);
    expect(parseCheckAuthenticationResponse("is_valid:false\n")).toBe(false);
    expect(parseCheckAuthenticationResponse("")).toBe(false);
    expect(parseCheckAuthenticationResponse("garbage")).toBe(false);
    // A later false wins: no "first match" shortcut.
    expect(parseCheckAuthenticationResponse("is_valid:true\nis_valid:false")).toBe(false);
  });
});

describe("steam id handling", () => {
  it("treats a SteamID64 as a 17-digit string, never a number", () => {
    expect(isSteamId64(STEAM_ID)).toBe(true);
    expect(isSteamId64("123")).toBe(false);
    expect(isSteamId64("8656119800000000")).toBe(false);
    // Precision proof: the numeric round trip is lossy, the string is not.
    expect(String(Number(STEAM_ID))).not.toBe(STEAM_ID);
  });

  it("extracts the id from a claimed id and tolerates a trailing slash", () => {
    expect(steamId64FromClaimedId(CLAIMED)).toBe(STEAM_ID);
    expect(steamId64FromClaimedId(`${CLAIMED}/`)).toBe(STEAM_ID);
    expect(steamId64FromClaimedId("https://steamcommunity.com/openid/id/abc")).toBeNull();
  });

  it("masks the id everywhere except for its owner", () => {
    const masked = maskSteamId64(STEAM_ID)!;
    expect(masked.startsWith("7656")).toBe(true);
    expect(masked.endsWith("001")).toBe(true);
    expect(masked).not.toContain(STEAM_ID);
    expect(maskSteamId64(null)).toBeNull();
    expect(maskSteamId64("123")).toBeNull();
  });

  it("builds the public profile URL", () => {
    expect(steamProfileUrl(STEAM_ID)).toBe(`https://steamcommunity.com/profiles/${STEAM_ID}`);
  });
});
