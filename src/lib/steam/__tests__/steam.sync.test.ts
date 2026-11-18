/**
 * STEAM — profile sync and nickname aliases (server). Proven link only, server-side key,
 * throttled, private profile ≠ failure, alias as data (never identity), no id in logs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SID = "76561198000000001";
type Row = Record<string, unknown>;
const state = {
  profile: { id: "player-1" } as Row | null,
  identity: {
    external_id: SID,
    identity_status: "verified",
    is_verified: true,
    verification_method: "openid",
  } as Row | null,
  connection: { status: "connected", last_sync_at: null } as Row | null,
  updates: [] as Array<{ table: string; values: Row; filters: Array<[string, unknown]> }>,
  rpcs: [] as Array<{ fn: string; args: Row }>,
  rpcResult: { data: true, error: null } as { data: unknown; error: unknown },
};

function builder(table: string) {
  const filters: Array<[string, unknown]> = [];
  let values: Row | null = null;
  const api = {
    select: () => api,
    eq: (c: string, v: unknown) => {
      filters.push([c, v]);
      return api;
    },
    update: (v: Row) => {
      values = v;
      return api;
    },
    maybeSingle: async () => ({
      data:
        table === "player_profiles"
          ? state.profile
          : table === "player_identities"
            ? state.identity
            : state.connection,
    }),
    then: (resolve: (v: { error: null }) => unknown) => {
      if (values) state.updates.push({ table, values, filters });
      return Promise.resolve(resolve({ error: null }));
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: async (fn: string, args: Row) => {
      state.rpcs.push({ fn, args });
      return state.rpcResult;
    },
  },
}));

const { syncSteamProfile, recordSteamAlias, STEAM_SYNC_MIN_INTERVAL_MS } =
  await import("@/lib/steam/steam.sync.server");

function summary(visibility: number, persona = "PersonaA") {
  return vi.fn(async (url: string) => {
    expect(url).toContain("GetPlayerSummaries");
    return new Response(
      JSON.stringify({
        response: {
          players: [
            {
              steamid: SID,
              personaname: persona,
              profileurl: `https://steamcommunity.com/profiles/${SID}/`,
              avatarfull: "https://avatars.steamstatic.com/a_full.jpg",
              communityvisibilitystate: visibility,
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.stubEnv("STEAM_INTEGRATION_ENABLED", "true");
  vi.stubEnv("STEAM_WEB_API_KEY", "test-key-not-real");
  state.profile = { id: "player-1" };
  state.identity = {
    external_id: SID,
    identity_status: "verified",
    is_verified: true,
    verification_method: "openid",
  };
  state.connection = { status: "connected", last_sync_at: null };
  state.updates = [];
  state.rpcs = [];
  state.rpcResult = { data: true, error: null };
});
afterEach(() => vi.unstubAllEnvs());

describe("syncSteamProfile", () => {
  it("syncs a public profile and records the persona name as an alias", async () => {
    const logs: string[] = [];
    const info = vi.spyOn(console, "info").mockImplementation((m) => void logs.push(String(m)));
    const result = await syncSteamProfile("user-1", summary(3));
    info.mockRestore();
    expect(result).toMatchObject({ status: "SYNCED", profilePublic: true, aliasAdded: true });
    const conn = state.updates.find((u) => u.table === "player_connections")!;
    expect(conn.values).toMatchObject({
      external_username: "PersonaA",
      last_sync_status: "success",
    });
    expect((conn.values["metadata"] as Row)["synced_at"]).toBe(result.syncedAt);
    // Trust fields are never touched by a sync.
    const ident = state.updates.find((u) => u.table === "player_identities")!;
    expect(Object.keys(ident.values).sort()).toEqual(["profile_url", "updated_at", "username"]);
    expect(state.rpcs).toEqual([
      {
        fn: "record_steam_alias",
        args: { _player_id: "player-1", _nickname: "PersonaA", _steam_id: SID },
      },
    ]);
    expect(logs.join(" ")).not.toContain(SID);
  });

  it("a private profile is still a successful sync of a VERIFIED link", async () => {
    const result = await syncSteamProfile("user-1", summary(1));
    expect(result.status).toBe("SYNCED");
    expect(result.profilePublic).toBe(false);
  });

  it("refuses without a PROVEN Steam identity", async () => {
    state.identity = { ...state.identity!, identity_status: "correlated", is_verified: false };
    await expect(syncSteamProfile("user-1", summary(3))).rejects.toMatchObject({
      code: "STEAM_NOT_CONNECTED",
    });
  });

  it("refuses a disconnected connection", async () => {
    state.connection = { status: "disconnected", last_sync_at: null };
    await expect(syncSteamProfile("user-1", summary(3))).rejects.toMatchObject({
      code: "STEAM_NOT_CONNECTED",
    });
  });

  it("is throttled per player", async () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    state.connection = {
      status: "connected",
      last_sync_at: new Date(now - STEAM_SYNC_MIN_INTERVAL_MS + 1000).toISOString(),
    };
    const fetchImpl = summary(3);
    const result = await syncSteamProfile("user-1", fetchImpl, now);
    expect(result.status).toBe("THROTTLED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("without a Web API key reports UNAVAILABLE, never fake data", async () => {
    vi.stubEnv("STEAM_WEB_API_KEY", "");
    const fetchImpl = summary(3);
    const result = await syncSteamProfile("user-1", fetchImpl);
    expect(result).toEqual({
      status: "UNAVAILABLE",
      profilePublic: null,
      aliasAdded: false,
      syncedAt: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it("an upstream failure records the error code only and rethrows", async () => {
    const failing = vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(syncSteamProfile("user-1", failing)).rejects.toBeTruthy();
    const conn = state.updates.find((u) => u.table === "player_connections")!;
    expect(conn.values["last_sync_status"]).toBe("error");
    expect(String(conn.values["last_sync_error"])).toMatch(/^STEAM_[A-Z_]+$/);
  });
});

describe("recordSteamAlias", () => {
  it("is best effort and never throws", async () => {
    state.rpcResult = { data: null, error: { message: "STEAM_ALIAS_NOT_VERIFIED" } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(recordSteamAlias("player-1", "x", SID)).resolves.toBe(false);
    expect(warn.mock.calls.flat().join(" ")).not.toContain(SID);
    warn.mockRestore();
  });
  it("skips a missing persona name", async () => {
    await expect(recordSteamAlias("player-1", null, SID)).resolves.toBe(false);
    expect(state.rpcs).toEqual([]);
  });
});
