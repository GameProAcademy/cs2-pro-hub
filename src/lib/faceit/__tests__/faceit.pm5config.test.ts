/**
 * PM5 — FACEIT configuration: the PM5 secret names (`FACEIT_DATA_API_KEY`,
 * `FACEIT_OAUTH_REDIRECT_URI`) work as aliases, the Fase 2.2.1 names win when both exist, the
 * OAuth endpoints default to FACEIT's published discovery values only when unset, and the
 * diagnostics never expose a value. Both callback routes use the same handler.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FACEIT_DISCOVERED_ENDPOINTS,
  faceitConfigStatus,
  requireFaceitDataApiConfig,
  requireFaceitOAuthConfig,
} from "@/lib/faceit/faceit.config.server";

const KEYS = [
  "FACEIT_CLIENT_ID",
  "FACEIT_CLIENT_SECRET",
  "FACEIT_API_KEY",
  "FACEIT_DATA_API_KEY",
  "FACEIT_REDIRECT_URI",
  "FACEIT_OAUTH_REDIRECT_URI",
  "FACEIT_OAUTH_AUTHORIZE_URL",
  "FACEIT_OAUTH_TOKEN_URL",
  "FACEIT_OAUTH_USERINFO_URL",
];
const set = (o: Record<string, string | undefined>) => {
  for (const k of KEYS) vi.stubEnv(k, o[k] ?? "");
};
afterEach(() => vi.unstubAllEnvs());

describe("PM5 FACEIT configuration", () => {
  it("works with the PM5 secret names and the documented endpoints", () => {
    set({
      FACEIT_CLIENT_ID: "client",
      FACEIT_CLIENT_SECRET: "secret-value",
      FACEIT_DATA_API_KEY: "api-key-value",
      FACEIT_OAUTH_REDIRECT_URI: "https://gamepro.network/faceit/callback",
    });
    const status = faceitConfigStatus();
    expect(status.oauthReady).toBe(true);
    expect(status.dataApiReady).toBe(true);
    expect(JSON.stringify(status)).not.toMatch(/secret-value|api-key-value/);
    const oauth = requireFaceitOAuthConfig();
    expect(oauth.authorizeUrl).toBe(FACEIT_DISCOVERED_ENDPOINTS["FACEIT_OAUTH_AUTHORIZE_URL"]);
    expect(oauth.tokenUrl).toBe("https://api.faceit.com/auth/v1/oauth/token");
    expect(oauth.redirectUri).toBe("https://gamepro.network/faceit/callback");
    expect(requireFaceitDataApiConfig().apiKey).toBe("api-key-value");
  });

  it("explicit Fase 2.2.1 names and endpoints win over aliases and defaults", () => {
    set({
      FACEIT_CLIENT_ID: "client",
      FACEIT_CLIENT_SECRET: "s",
      FACEIT_API_KEY: "primary",
      FACEIT_DATA_API_KEY: "alias",
      FACEIT_REDIRECT_URI: "https://gamepro.network/api/public/integrations/faceit/callback",
      FACEIT_OAUTH_REDIRECT_URI: "https://gamepro.network/faceit/callback",
      FACEIT_OAUTH_TOKEN_URL: "https://example.test/token",
    });
    expect(requireFaceitDataApiConfig().apiKey).toBe("primary");
    expect(requireFaceitOAuthConfig().redirectUri).toBe(
      "https://gamepro.network/api/public/integrations/faceit/callback",
    );
    expect(requireFaceitOAuthConfig().tokenUrl).toBe("https://example.test/token");
  });

  it("still fails closed without client credentials or an HTTPS redirect", () => {
    set({ FACEIT_OAUTH_REDIRECT_URI: "https://gamepro.network/faceit/callback" });
    expect(faceitConfigStatus().oauthReady).toBe(false);
    expect(() => requireFaceitOAuthConfig()).toThrow();
    set({
      FACEIT_CLIENT_ID: "c",
      FACEIT_CLIENT_SECRET: "s",
      FACEIT_OAUTH_REDIRECT_URI: "http://gamepro.network/x",
    });
    expect(faceitConfigStatus().redirectUri).toBe(false);
  });

  it("both callback routes delegate to the same server handler", () => {
    for (const f of [
      "src/routes/faceit.callback.ts",
      "src/routes/api/public/integrations/faceit/callback.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain('import("@/lib/faceit/faceit.callback.server")');
      expect(src).toContain("handleFaceitCallback(request)");
    }
  });
});

describe("PM5 — FACEIT card placement", () => {
  it("returns the OAuth callback to /profile, where the card is mounted in real mode", () => {
    const callback = readFileSync("src/lib/faceit/faceit.callback.server.ts", "utf8");
    expect(callback).toContain('"/profile?connection=faceit_success"');
    expect(callback).toContain("`/profile?connection=faceit_error&reason=");
    const profile = readFileSync("src/routes/_authenticated/profile.tsx", "utf8");
    expect(profile).toMatch(/<FaceitPanel callback=\{faceitCallback\} \/>/);
  });
});
