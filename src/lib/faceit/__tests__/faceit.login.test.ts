/**
 * PM5 — "Continue with FACEIT": start route (browser-binding cookie, canonical origin, abuse
 * ceiling), callback for LOGIN attempts (login-CSRF, existing connection sign-in, new account
 * only with a FACEIT-verified unused e-mail, never linking by e-mail, cleanup on failure), the
 * fragment hand-over and the contact parser. No token, code or e-mail may reach a log or a query.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashState } from "../faceit.oauth";
import { faceitAccountContact } from "../faceit.oauth";
import { parseFaceitHandover } from "../faceitLogin";

// ---------------------------------------------------------------- fakes
const state = {
  configured: true,
  connection: null as null | { player_id: string },
  emailUsed: false,
  createFails: false,
  finalizeFails: false,
  account: { playerId: "f-123", email: "new@x.io", emailVerified: true, nickname: "nick" } as {
    playerId: string;
    email: string | null;
    emailVerified: boolean;
    nickname: string | null;
  },
};
const calls: string[] = [];

function q(table: string) {
  const self: Record<string, unknown> = {};
  const chain = () => self;
  for (const m of ["select", "eq", "ilike", "limit", "gte"])
    self[m] = (..._a: unknown[]) => chain();
  self["maybeSingle"] = async () => {
    calls.push(`maybeSingle:${table}`);
    if (table === "player_connections") return { data: state.connection, error: null };
    if (table === "player_profiles") return { data: { user_id: "u-existing" }, error: null };
    return { data: null, error: null };
  };
  // profiles e-mail lookup resolves on `limit`
  self["limit"] = async () => ({ data: state.emailUsed ? [{ id: "p" }] : [], error: null });
  return self;
}
const fakeDb = {
  from: (t: string) => q(t),
  auth: {
    admin: {
      getUserById: vi.fn(async (id: string) => ({
        data: { user: { id, email: `${id}@mail.io` } },
        error: null,
      })),
      generateLink: vi.fn(async () => ({
        data: { properties: { hashed_token: "HASHEDtoken_0123456789abcdef" } },
        error: null,
      })),
      createUser: vi.fn(async () =>
        state.createFails
          ? { data: { user: null }, error: { message: "email_exists" } }
          : { data: { user: { id: "u-new" } }, error: null },
      ),
      deleteUser: vi.fn(async () => ({ data: null, error: null })),
    },
  },
};
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fakeDb }));
vi.mock("../faceit.config.server", async () => {
  const { FaceitError } = await import("../faceit.errors");
  return {
    requireFaceitOAuthConfig: () => {
      if (!state.configured) throw new FaceitError("FACEIT_CONFIGURATION_MISSING");
      return {
        clientId: "cid",
        clientSecret: "sec",
        authorizeUrl: "https://accounts.faceit.com",
        tokenUrl: "https://api.faceit.com/auth/v1/oauth/token",
        redirectUri: "https://gamepro.network/faceit/callback",
      };
    },
  };
});
const startFaceitLoginAttempt = vi.fn(async (_h: string) => ({
  authorizeUrl: "https://accounts.faceit.com/?response_type=code&code_challenge_method=S256",
  expiresAt: "x",
}));
vi.mock("../faceit.oauth.server", () => ({
  startFaceitLoginAttempt: (h: string) => startFaceitLoginAttempt(h),
  exchangeFaceitCode: vi.fn(async () => ({ accessToken: "ACCESS", idToken: null })),
  resolveFaceitAccount: vi.fn(async () => state.account),
}));
const finalizeFaceitConnection = vi.fn(async () => {
  if (state.finalizeFails) throw new Error("boom");
  return { playerId: "pl", connectionId: "c", reconnected: false };
});
vi.mock("../faceit.connect.server", () => ({
  finalizeFaceitConnection: () => finalizeFaceitConnection(),
}));
const enqueueFaceitSync = vi.fn(async () => ({ alreadyRunning: false }));
vi.mock("../faceit.sync.server", () => ({ enqueueFaceitSync: () => enqueueFaceitSync() }));

const { handleFaceitLoginStart, completeFaceitLogin, FACEIT_LOGIN_COOKIE } =
  await import("../faceit.login.server");

const logs: string[] = [];
beforeEach(() => {
  Object.assign(state, {
    configured: true,
    connection: null,
    emailUsed: false,
    createFails: false,
    finalizeFails: false,
    account: { playerId: "f-123", email: "new@x.io", emailVerified: true, nickname: "nick" },
  });
  calls.length = 0;
  logs.length = 0;
  vi.clearAllMocks();
  for (const k of ["info", "warn", "error", "log"] as const)
    vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
});
afterEach(() => vi.restoreAllMocks());

const NONCE = "a".repeat(64);
async function attempt(over: Record<string, unknown> = {}) {
  return {
    userId: null,
    purpose: "login" as const,
    browserBindingHash: await hashState(NONCE),
    codeVerifier: "v",
    redirectUri: "https://gamepro.network/faceit/callback",
    ...over,
  };
}
const cb = (cookie: string | null = NONCE) =>
  new Request("https://gamepro.network/faceit/callback?code=c&state=s", {
    headers: cookie ? { cookie: `other=1; ${FACEIT_LOGIN_COOKIE}=${cookie}` } : {},
  });
const loc = (r: Response) => r.headers.get("Location") ?? "";

describe("start", () => {
  it("sets an HttpOnly Secure SameSite cookie bound to the stored hash and goes to FACEIT", async () => {
    const r = await handleFaceitLoginStart(new Request("https://gamepro.network/faceit/login"));
    expect(r.status).toBe(302);
    expect(loc(r)).toMatch(/^https:\/\/accounts\.faceit\.com\//);
    const cookie = r.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/faceit/);
    const nonce = cookie.split(";")[0]!.split("=")[1]!;
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(startFaceitLoginAttempt).toHaveBeenCalledWith(await hashState(nonce));
    expect(loc(r)).not.toContain(nonce);
  });

  it("moves to the redirect-URI origin first and reports a missing configuration", async () => {
    const other = await handleFaceitLoginStart(
      new Request("https://preview.lovable.app/faceit/login"),
    );
    expect(loc(other)).toBe("https://gamepro.network/faceit/login");
    expect(other.headers.get("Set-Cookie")).toBeNull();
    state.configured = false;
    const r = await handleFaceitLoginStart(new Request("https://gamepro.network/faceit/login"));
    expect(loc(r)).toBe("https://gamepro.network/login?faceit=not_configured");
  });
});

describe("callback of a LOGIN attempt", () => {
  it("refuses a callback from another browser (login CSRF)", async () => {
    for (const cookie of [null, "b".repeat(64)]) {
      const r = await completeFaceitLogin(cb(cookie), await attempt(), "c");
      expect(loc(r)).toBe("https://gamepro.network/login?faceit=browser_mismatch");
    }
    expect(fakeDb.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it("signs in the account already connected to this FACEIT account (fragment hand-over)", async () => {
    state.connection = { player_id: "pl-1" };
    const r = await completeFaceitLogin(cb(), await attempt(), "c");
    const target = new URL(loc(r));
    expect(target.pathname).toBe("/auth/faceit");
    expect(target.search).toBe("");
    expect(target.hash).toContain("token_hash=HASHEDtoken_0123456789abcdef");
    expect(fakeDb.auth.admin.createUser).not.toHaveBeenCalled();
    expect(fakeDb.auth.admin.getUserById).toHaveBeenCalledWith("u-existing");
    expect(r.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
  });

  it("creates an account only with a FACEIT-verified e-mail nobody uses, links and syncs it", async () => {
    const r = await completeFaceitLogin(cb(), await attempt(), "c");
    expect(fakeDb.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@x.io", email_confirm: true }),
    );
    expect(finalizeFaceitConnection).toHaveBeenCalled();
    expect(enqueueFaceitSync).toHaveBeenCalled();
    expect(new URL(loc(r)).hash).toContain("new=1");
  });

  it("never creates or links an account by an unverified or already used e-mail", async () => {
    state.account = { ...state.account, emailVerified: false };
    expect(loc(await completeFaceitLogin(cb(), await attempt(), "c"))).toContain(
      "faceit=email_not_verified",
    );
    state.account = { ...state.account, email: null, emailVerified: false };
    expect(loc(await completeFaceitLogin(cb(), await attempt(), "c"))).toContain(
      "faceit=email_not_verified",
    );
    state.account = { playerId: "f-123", email: "used@x.io", emailVerified: true, nickname: null };
    state.emailUsed = true;
    expect(loc(await completeFaceitLogin(cb(), await attempt(), "c"))).toContain(
      "faceit=account_exists",
    );
    expect(fakeDb.auth.admin.createUser).not.toHaveBeenCalled();
    expect(fakeDb.auth.admin.generateLink).not.toHaveBeenCalled();
    state.emailUsed = false;
    state.createFails = true; // a concurrent sign-up won the race
    expect(loc(await completeFaceitLogin(cb(), await attempt(), "c"))).toContain(
      "faceit=account_exists",
    );
    expect(fakeDb.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it("deletes the new account when linking fails and maps cancellation", async () => {
    state.finalizeFails = true;
    const r = await completeFaceitLogin(cb(), await attempt(), "c");
    expect(loc(r)).toContain("faceit=failed");
    expect(fakeDb.auth.admin.deleteUser).toHaveBeenCalledWith("u-new");
    const cancelled = await completeFaceitLogin(
      cb(),
      await attempt(),
      null,
      "FACEIT_OAUTH_ACCESS_DENIED",
    );
    expect(loc(cancelled)).toContain("faceit=cancelled");
  });

  it("never logs a token, code, cookie or e-mail", async () => {
    state.connection = { player_id: "pl-1" };
    await completeFaceitLogin(cb(), await attempt(), "c");
    state.connection = null;
    await completeFaceitLogin(cb(), await attempt(), "c");
    const all = logs.join("\n");
    for (const secret of ["HASHEDtoken", "ACCESS", NONCE, "new@x.io", "@mail.io"])
      expect(all).not.toContain(secret);
  });
});

describe("pure helpers", () => {
  it("trusts an e-mail as verified only on email_verified === true", () => {
    expect(faceitAccountContact({ email: "A@B.io", email_verified: true })).toMatchObject({
      email: "a@b.io",
      emailVerified: true,
    });
    expect(faceitAccountContact({ email: "a@b.io", email_verified: "true" }).emailVerified).toBe(
      false,
    );
    expect(faceitAccountContact({ email: "a@b.io" }).emailVerified).toBe(false);
    expect(faceitAccountContact({ email: "not-an-email", email_verified: true })).toMatchObject({
      email: null,
      emailVerified: false,
    });
    expect(faceitAccountContact({ nickname: "<script>" }).nickname).toBeNull();
    expect(faceitAccountContact(null)).toEqual({
      email: null,
      emailVerified: false,
      nickname: null,
    });
  });

  it("accepts only a well-formed magic-link hand-over", () => {
    expect(parseFaceitHandover("#token_hash=abcdefghijklmnop1234&type=magiclink&new=1")).toEqual({
      tokenHash: "abcdefghijklmnop1234",
      created: true,
    });
    expect(parseFaceitHandover("#token_hash=abc&type=magiclink")).toBeNull();
    expect(parseFaceitHandover("#token_hash=abcdefghijklmnop1234&type=recovery")).toBeNull();
    expect(parseFaceitHandover("")).toBeNull();
  });
});
