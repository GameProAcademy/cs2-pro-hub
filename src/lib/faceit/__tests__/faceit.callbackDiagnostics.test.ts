/**
 * PM5 — a failed LINK callback records the stage where it failed (token / userinfo / link /
 * sync) with the internal code and upstream status only, and still redirects to /profile.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FaceitError } from "../faceit.errors";

const inserts: Array<Record<string, unknown>> = [];
const fail = { at: "" as "" | "token" | "userinfo" | "link" | "sync" };

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table: t, ...row });
        return { error: null };
      },
    }),
  },
}));
vi.mock("@/lib/faceit/faceit.oauth.server", () => ({
  consumeFaceitOAuthState: async () => ({
    userId: "u1",
    purpose: "link",
    browserBindingHash: null,
    codeVerifier: "v",
    redirectUri: "https://gamepro.network/faceit/callback",
  }),
  consumeFaceitOAuthStateQuietly: async () => null,
  exchangeFaceitCode: async () => {
    if (fail.at === "token") throw new FaceitError("FACEIT_OAUTH_INVALID_GRANT", { status: 400 });
    return { accessToken: "SECRET_ACCESS", idToken: null };
  },
  resolveFaceitPlayerId: async () => {
    if (fail.at === "userinfo") throw new FaceitError("FACEIT_MALFORMED_RESPONSE");
    return "faceit-123";
  },
}));
vi.mock("@/lib/faceit/faceit.connect.server", () => ({
  finalizeFaceitConnection: async () => {
    if (fail.at === "link") throw new FaceitError("FACEIT_API_FORBIDDEN", { status: 403 });
    return { playerId: "p", connectionId: "c", reconnected: false };
  },
}));
vi.mock("@/lib/faceit/faceit.sync.server", () => ({
  enqueueFaceitSync: async () => {
    if (fail.at === "sync") throw new FaceitError("FACEIT_INTERNAL_ERROR");
    return { alreadyRunning: false };
  },
}));

const { handleFaceitCallback } = await import("../faceit.callback.server");
const call = () =>
  handleFaceitCallback(
    new Request("https://gamepro.network/faceit/callback?code=CODE&state=STATE"),
  );

beforeEach(() => {
  inserts.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("FACEIT callback diagnostics", () => {
  it.each([
    ["token", "FACEIT_OAUTH_INVALID_GRANT", 400],
    ["userinfo", "FACEIT_MALFORMED_RESPONSE", null],
    ["link", "FACEIT_API_FORBIDDEN", 403],
    ["sync", "FACEIT_INTERNAL_ERROR", null],
  ] as const)("records stage %s", async (stage, code, status) => {
    fail.at = stage;
    const r = await call();
    expect(r.headers.get("Location")).toMatch(/\/profile\?connection=faceit_error/);
    expect(inserts).toEqual([
      {
        table: "faceit_oauth_failures",
        purpose: "link",
        stage,
        error_code: code,
        http_status: status,
      },
    ]);
    expect(JSON.stringify(inserts)).not.toMatch(/SECRET_ACCESS|CODE|STATE|faceit-123|u1/);
  });

  it("records nothing on success", async () => {
    fail.at = "";
    const r = await call();
    expect(r.headers.get("Location")).toMatch(/faceit_success/);
    expect(inserts).toEqual([]);
  });
});
