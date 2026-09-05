/**
 * FASE 2.5 — configuration, mapping and error-surface hardening.
 *
 * Rules proven here:
 *  - no configuration is ever guessed or hardcoded;
 *  - `steamConfigStatus()` exposes BOOLEANS only, never a value;
 *  - absence stays absence (never 0, never a fake nickname);
 *  - no error path can leak a SteamID64, a key or an upstream body.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { requireSteamOpenIdConfig, steamConfigStatus } from "../steam.config.server";
import { STEAM_ERROR_CODES, SteamError, callbackReason, toSteamError } from "../steam.errors";
import { mapSteamConnectionFields, mapSteamPlayerSummary, steamMinimalProfile } from "../steam.mapper";
import { assertSafeConnectionMetadata } from "@/lib/sources/connectionMetadata";
import { sourceAvailability } from "@/lib/sources/availability";
import { SOURCE_CONNECTION_TYPES } from "@/lib/sources/sources";

const KEYS = [
  "STEAM_OPENID_REALM",
  "STEAM_OPENID_RETURN_URL",
  "STEAM_OPENID_ENDPOINT",
  "STEAM_WEB_API_KEY",
] as const;

const SAVED: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    SAVED[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (SAVED[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED[key];
  }
});

function configure(overrides: Partial<Record<(typeof KEYS)[number], string>> = {}) {
  process.env["STEAM_OPENID_REALM"] = "https://app.example.com";
  process.env["STEAM_OPENID_RETURN_URL"] =
    "https://app.example.com/api/public/integrations/steam/callback";
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
}

describe("steam configuration", () => {
  it("reports not_configured with an empty environment and refuses to guess", () => {
    const status = steamConfigStatus();
    expect(status.state).toBe("not_configured");
    expect(status.openidReady).toBe(false);
    expect(() => requireSteamOpenIdConfig()).toThrow(
      new SteamError("STEAM_CONFIGURATION_MISSING"),
    );
  });

  it("only exposes booleans and a state — never a value", () => {
    configure({ STEAM_WEB_API_KEY: "super-secret-key" });
    const status = steamConfigStatus();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("super-secret-key");
    expect(serialized).not.toContain("app.example.com");
    for (const [key, value] of Object.entries(status)) {
      if (key === "state") continue;
      expect(typeof value).toBe("boolean");
    }
  });

  it("linking works without a Web API key (configured, not available)", () => {
    configure();
    const status = steamConfigStatus();
    expect(status.openidReady).toBe(true);
    expect(status.webApiReady).toBe(false);
    expect(status.state).toBe("configured");
  });

  it("becomes available once the Web API key exists", () => {
    configure({ STEAM_WEB_API_KEY: "abc" });
    expect(steamConfigStatus().state).toBe("available");
  });

  it("refuses a return URL outside the realm", () => {
    configure({ STEAM_OPENID_RETURN_URL: "https://other.example.com/callback" });
    const status = steamConfigStatus();
    expect(status.returnUrlInsideRealm).toBe(false);
    expect(status.openidReady).toBe(false);
  });

  it("refuses insecure transport but tolerates localhost for development", () => {
    configure({
      STEAM_OPENID_REALM: "http://insecure.example.com",
      STEAM_OPENID_RETURN_URL: "http://insecure.example.com/callback",
    });
    expect(steamConfigStatus().openidReady).toBe(false);

    configure({
      STEAM_OPENID_REALM: "http://localhost:8080",
      STEAM_OPENID_RETURN_URL: "http://localhost:8080/api/public/integrations/steam/callback",
    });
    expect(steamConfigStatus().openidReady).toBe(true);
  });

  it("refuses a non-HTTPS provider endpoint override", () => {
    configure({ STEAM_OPENID_ENDPOINT: "http://steamcommunity.com/openid/login" });
    expect(steamConfigStatus().openidReady).toBe(false);
  });
});

describe("steam mapping", () => {
  const STEAM_ID = "76561198000000001";

  it("keeps absence as absence for a private profile", () => {
    const profile = mapSteamPlayerSummary(STEAM_ID, {
      steamid: STEAM_ID,
      communityvisibilitystate: 1,
    });
    expect(profile.personaName).toBeNull();
    expect(profile.avatar).toBeNull();
    expect(profile.countryCode).toBeNull();
    expect(profile.createdAt).toBeNull();
    expect(profile.isPublic).toBe(false);
    expect(profile.visibility).toBe(1);
  });

  it("distinguishes an unknown visibility from a private one", () => {
    expect(steamMinimalProfile(STEAM_ID).visibility).toBeNull();
    expect(steamMinimalProfile(STEAM_ID).personaName).toBeNull();
    expect(steamMinimalProfile(STEAM_ID).profileUrl).toContain(STEAM_ID);
  });

  it("reads a public profile without inventing anything", () => {
    const profile = mapSteamPlayerSummary(STEAM_ID, {
      steamid: STEAM_ID,
      personaname: "player",
      communityvisibilitystate: 3,
      avatarfull: "https://avatars.example/a.jpg",
      loccountrycode: "BR",
      timecreated: 1_600_000_000,
    });
    expect(profile.personaName).toBe("player");
    expect(profile.isPublic).toBe(true);
    expect(profile.createdAt).toBe(new Date(1_600_000_000 * 1000).toISOString());
  });

  it("produces connection metadata with no credential-shaped key", () => {
    const fields = mapSteamConnectionFields(steamMinimalProfile(STEAM_ID), "steam.openid.v1");
    expect(() => assertSafeConnectionMetadata(fields.metadata)).not.toThrow();
    expect(fields.external_id).toBe(STEAM_ID);
    expect(fields.profile_locator_type).toBe("steam_id_64");
    expect(JSON.stringify(fields.metadata)).not.toContain("token");
  });
});

describe("steam error surface", () => {
  it("maps every code to a stable, non-sensitive reason slug", () => {
    for (const code of STEAM_ERROR_CODES) {
      const reason = callbackReason(code);
      expect(reason).toMatch(/^[a-z_]{1,40}$/);
    }
  });

  it("never carries an upstream body or an id in the message", () => {
    const error = toSteamError(new Error("steamid 76561198000000001 rejected by upstream"));
    expect(error.code).toBe("STEAM_INTERNAL_ERROR");
    expect(error.message).toBe("STEAM_INTERNAL_ERROR");
  });

  it("classifies aborts as timeouts and network failures as network errors", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(toSteamError(abort).code).toBe("STEAM_TIMEOUT");
    expect(toSteamError(new TypeError("fetch failed")).code).toBe("STEAM_NETWORK_ERROR");
  });
});

describe("steam in the source model", () => {
  it("links through OpenID, not OAuth", () => {
    expect(SOURCE_CONNECTION_TYPES.steam).toContain("openid");
    expect(SOURCE_CONNECTION_TYPES.steam).not.toContain("oauth");
  });

  it("is an identity source, never a match-data source", () => {
    const availability = sourceAvailability("steam");
    expect(availability.reason).toBe("identity_only");
    expect(availability.collectable).toBe(false);
  });
});
