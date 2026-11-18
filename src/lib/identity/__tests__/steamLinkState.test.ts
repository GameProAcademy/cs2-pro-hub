/**
 * STEAM — one link-state derivation for every screen, the proven SteamID64 rule, and the
 * unified external-links view (a disconnected account never shows old data).
 */
import { describe, expect, it } from "vitest";

import { buildExternalLinks, observationsFromLinks } from "@/lib/identity/externalLinks";
import { deriveLinkState, isProvenLink } from "@/lib/identity/linkState";
import { provenSteamId64 } from "@/lib/identity/verifiedSteam";

const SID = "76561198000000001";

describe("deriveLinkState", () => {
  const base = {
    configured: true,
    connectionStatus: "connected",
    identityStatus: "verified",
    isVerified: true,
  };
  it("covers every state", () => {
    expect(deriveLinkState({ ...base, connectionStatus: null })).toBe("NOT_LINKED");
    expect(deriveLinkState({ ...base, connectionStatus: "disconnected" })).toBe("NOT_LINKED");
    expect(deriveLinkState({ ...base, configured: false, connectionStatus: null })).toBe(
      "UNAVAILABLE",
    );
    expect(deriveLinkState({ ...base, identityStatus: "correlated", isVerified: false })).toBe(
      "PENDING",
    );
    expect(deriveLinkState(base)).toBe("VERIFIED");
    expect(deriveLinkState({ ...base, lastSyncAt: "2026-11-18T00:00:00Z" })).toBe("SYNCED");
    expect(deriveLinkState({ ...base, syncRunning: true })).toBe("SYNC_PENDING");
    expect(deriveLinkState({ ...base, lastSyncStatus: "retrying" })).toBe("SYNC_PENDING");
    expect(deriveLinkState({ ...base, lastSyncStatus: "error" })).toBe("ERROR");
  });
  it("a verified flag without the verified status is not proof", () => {
    expect(deriveLinkState({ ...base, identityStatus: "strongly_correlated" })).toBe("PENDING");
    expect(deriveLinkState({ ...base, isVerified: false })).toBe("PENDING");
  });
  it("proven states", () => {
    expect(isProvenLink("VERIFIED")).toBe(true);
    expect(isProvenLink("SYNCED")).toBe(true);
    expect(isProvenLink("ERROR")).toBe(true);
    expect(isProvenLink("PENDING")).toBe(false);
    expect(isProvenLink("NOT_LINKED")).toBe(false);
  });
});

describe("provenSteamId64", () => {
  const row = {
    external_id: SID,
    identity_status: "verified",
    is_verified: true,
    verification_method: "openid",
  };
  it("accepts only an OpenID-verified identity", () => {
    expect(provenSteamId64(row)).toBe(SID);
    expect(provenSteamId64({ ...row, verification_method: "manual" })).toBeNull();
    expect(provenSteamId64({ ...row, identity_status: "correlated" })).toBeNull();
    expect(provenSteamId64({ ...row, is_verified: false })).toBeNull();
    expect(provenSteamId64({ ...row, external_id: "not-a-steam-id" })).toBeNull();
    expect(provenSteamId64(null)).toBeNull();
  });
});

describe("buildExternalLinks", () => {
  const configured = { FACEIT: true, GAMERS_CLUB: false, STEAM: true };
  const steamConnection = {
    source: "steam",
    connection_type: "openid",
    status: "connected",
    external_id: SID,
    external_username: "PersonaA",
    profile_url: "https://steamcommunity.com/profiles/x/",
    last_sync_at: "2026-11-18T10:00:00Z",
    last_sync_status: "success",
    metadata: { profile: { avatar: "https://avatars.steamstatic.com/a.jpg" } },
  };
  const steamIdentity = { platform: "STEAM", identity_status: "verified", is_verified: true };

  it("returns the three platforms with one derived state each", () => {
    const links = buildExternalLinks({
      connections: [steamConnection],
      identities: [steamIdentity],
      configured,
      maskId: (_p, id) => (id ? `${id.slice(0, 4)}…` : null),
    });
    expect(links.map((l) => l.platform)).toEqual(["FACEIT", "GAMERS_CLUB", "STEAM"]);
    const steam = links[2]!;
    expect(steam).toMatchObject({
      state: "SYNCED",
      username: "PersonaA",
      avatar: "https://avatars.steamstatic.com/a.jpg",
      idMasked: "7656…",
    });
    expect(JSON.stringify(links)).not.toContain(SID);
    expect(links[0]!.state).toBe("NOT_LINKED");
    expect(links[1]!.state).toBe("UNAVAILABLE");
  });

  it("after unlink (identity left correlated) shows NOT_LINKED and no old data", () => {
    const links = buildExternalLinks({
      connections: [{ ...steamConnection, status: "disconnected" }],
      identities: [{ platform: "STEAM", identity_status: "correlated", is_verified: false }],
      configured,
    });
    expect(links[2]).toEqual({
      platform: "STEAM",
      state: "NOT_LINKED",
      username: null,
      profileUrl: null,
      avatar: null,
      lastSyncAt: null,
      idMasked: null,
    });
  });

  it("feeds the upload identity panel with real, proven-only links", () => {
    const obs = observationsFromLinks(
      buildExternalLinks({
        connections: [steamConnection],
        identities: [steamIdentity],
        configured,
      }),
    );
    expect(obs).toEqual([
      { source: "faceit", username: null, authenticatedLink: false },
      { source: "gamers_club", username: null, authenticatedLink: false },
      { source: "steam", username: "PersonaA", authenticatedLink: true },
    ]);
  });

  it("never accepts a non-https avatar", () => {
    const links = buildExternalLinks({
      connections: [{ ...steamConnection, metadata: { profile: { avatar: "javascript:x" } } }],
      identities: [steamIdentity],
      configured,
    });
    expect(links[2]!.avatar).toBeNull();
  });
});
