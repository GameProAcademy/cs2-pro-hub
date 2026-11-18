/**
 * PM5 — production findings from the owner's real FACEIT link:
 *   1. the profile link kept FACEIT's literal `{lang}` placeholder (404 on faceit.com);
 *   2. "Player identities" still showed FACEIT as not linked after a successful OAuth link,
 *      because only `is_verified` was set and `identity_status` stayed `unlinked`.
 * Connecting now writes the full verified trust state; disconnecting returns it to unlinked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { faceitHttpsUrl, fillFaceitLang } from "../faceit.mapper";

type Op = { table: string; op: string; values?: Record<string, unknown> };
const ops: Op[] = [];
const rows: Record<string, unknown> = {};

function chain(table: string) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  for (const m of ["select", "eq", "in", "order", "limit", "gte", "is"])
    q[m] = (..._a: unknown[]) => self();
  q["maybeSingle"] = async () => ({ data: rows[`${table}:maybe`] ?? null, error: null });
  q["single"] = async () => ({ data: { id: `${table}-id` }, error: null });
  q["then"] = (resolve: (v: unknown) => void) => resolve({ data: [{ id: "x" }], error: null });
  for (const op of ["insert", "update"]) {
    q[op] = (values: Record<string, unknown>) => {
      ops.push({ table, op, values });
      return q;
    };
  }
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => chain(t) },
}));
vi.mock("../faceit.runtime.server", () => ({
  faceitRuntime: () => ({ client: {}, config: { gameId: "cs2" } }),
}));
vi.mock("../faceit.player", () => ({
  fetchFaceitPlayer: async () => ({
    player_id: "f-1",
    nickname: "nick",
    avatar: null,
    country: "br",
    faceit_url: "https://www.faceit.com/{lang}/players/nick",
    steam_id_64: null,
    membership_type: null,
    memberships: null,
    activated_at: null,
    verified: false,
    games: {},
  }),
}));
vi.mock("../faceit.oauth.server", () => ({ invalidateFaceitOAuthAttempts: async () => undefined }));

const { finalizeFaceitConnection, disconnectFaceit } = await import("../faceit.connect.server");

beforeEach(() => {
  ops.length = 0;
  for (const k of Object.keys(rows)) delete rows[k];
  rows["player_profiles:maybe"] = { id: "pl-1" };
});

describe("FACEIT profile link", () => {
  it("fills the {lang} placeholder in raw and encoded form", () => {
    expect(fillFaceitLang("https://www.faceit.com/{lang}/players/nick")).toBe(
      "https://www.faceit.com/en/players/nick",
    );
    expect(faceitHttpsUrl("https://www.faceit.com/%7Blang%7D/players/nick")).toBe(
      "https://www.faceit.com/en/players/nick",
    );
    expect(faceitHttpsUrl("https://evil.example/{lang}/players/nick")).toBeNull();
  });
});

describe("FACEIT identity trust state", () => {
  it("marks the identity verified by OAuth on connect, with a working profile link", async () => {
    await finalizeFaceitConnection("u-1", "f-1");
    const identity = ops.find((o) => o.table === "player_identities")!;
    expect(identity.values).toMatchObject({
      identity_status: "verified",
      is_verified: true,
      confidence_score: 1,
      verification_method: "oauth",
      profile_url: "https://www.faceit.com/en/players/nick",
    });
    expect(identity.values?.["verified_at"]).toEqual(expect.any(String));
    const conn = ops.find((o) => o.table === "player_connections")!;
    expect(conn.values?.["profile_url"]).toBe("https://www.faceit.com/en/players/nick");
  });

  it("updates an existing identity row to verified on reconnect", async () => {
    rows["player_identities:maybe"] = { id: "id-1", player_id: "pl-1" };
    await finalizeFaceitConnection("u-1", "f-1");
    const identity = ops.find((o) => o.table === "player_identities")!;
    expect(identity.op).toBe("update");
    expect(identity.values).toMatchObject({ identity_status: "verified", is_verified: true });
  });

  it("returns the identity to unlinked on disconnect", async () => {
    await disconnectFaceit("u-1");
    const identity = ops.find((o) => o.table === "player_identities")!;
    expect(identity.values).toMatchObject({
      identity_status: "unlinked",
      is_verified: false,
      confidence_score: 0,
      verification_method: null,
      verified_at: null,
    });
  });
});
