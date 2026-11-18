/**
 * STEAM — demo identification uses the PROVEN SteamID64 directly; nickname aliases are
 * complementary and never pick a player whose own SteamID contradicts the proven one.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  resolvePlayerAttachment,
  suggestParticipantForPlayer,
  type DemoParticipant,
} from "@/lib/pipeline/attachment";

const ME = "76561198000000001";
const OTHER = "76561198000000002";
const p = (key: string, steamId: string | null, nickname: string | null): DemoParticipant => ({
  participantKey: key,
  steamId,
  nickname,
  team: "CT",
});

describe("suggestParticipantForPlayer", () => {
  it("suggests the player carrying the verified SteamID64", () => {
    const players = [p("a", OTHER, "alias"), p("b", ME, "renamed")];
    expect(
      suggestParticipantForPlayer(players, { verifiedSteamId: ME, historyNicknames: ["alias"] }),
    ).toEqual({ participant: players[1], basis: "steam_id" });
  });

  it("no suggestion when two players carry the same SteamID (contradictory demo)", () => {
    const players = [p("a", ME, "x"), p("b", ME, "y")];
    expect(
      suggestParticipantForPlayer(players, { verifiedSteamId: ME, historyNicknames: [] }),
    ).toBeNull();
  });

  it("an alias never suggests a player whose SteamID differs from the proven one", () => {
    const players = [p("a", OTHER, "MyName"), p("b", "76561198000000042", "z")];
    expect(
      suggestParticipantForPlayer(players, { verifiedSteamId: ME, historyNicknames: ["myname"] }),
    ).toBeNull();
  });

  it("an alias suggests only when unique in the whole demo", () => {
    const players = [p("a", null, "MyName"), p("b", OTHER, "myname")];
    expect(
      suggestParticipantForPlayer(players, { verifiedSteamId: ME, historyNicknames: ["MyName"] }),
    ).toBeNull();
    expect(
      suggestParticipantForPlayer([p("a", null, "MyName")], {
        verifiedSteamId: ME,
        historyNicknames: ["myname"],
      }),
    ).toEqual({
      participant: expect.objectContaining({ participantKey: "a" }),
      basis: "nickname_history",
    });
  });

  it("without a proven SteamID it keeps the nickname-history behaviour", () => {
    const players = [p("a", OTHER, "MyName"), p("b", null, "z")];
    expect(
      suggestParticipantForPlayer(players, { verifiedSteamId: null, historyNicknames: ["myname"] })
        ?.basis,
    ).toBe("nickname_history");
  });
});

describe("attachment with the proven SteamID64", () => {
  it("attaches automatically with high confidence", () => {
    const outcome = resolvePlayerAttachment({
      participants: [p("a", OTHER, "x"), p("b", ME, "y")],
      hasProfile: true,
      profileSteamId: ME,
    });
    expect(outcome).toMatchObject({
      state: "attached",
      participantKey: "b",
      method: "steam_id_confirmed",
      confidence: "high",
    });
  });

  it("a Steam alias (or any nickname) never auto-attaches when the SteamID is absent", () => {
    const outcome = resolvePlayerAttachment({
      participants: [p("a", OTHER, "MyName")],
      hasProfile: true,
      profileSteamId: ME,
      confirmedNicknames: [{ nickname: "MyName", steamId: null }],
    });
    expect(outcome.state).toBe("unattached");
    expect(outcome.reason).toBe("steam_id_not_in_demo");
  });

  it("both pipeline paths read the OpenID-proven SteamID before the legacy column", () => {
    const worker = readFileSync("src/lib/pipeline/jobs.server.ts", "utf8");
    expect(worker).toContain("readVerifiedSteamId64(db, player.id)");
    expect(worker).toContain("profileSteamId: verifiedSteamId ?? player?.steam_id ?? null");
    const declare = readFileSync("src/lib/pipeline-identity.functions.ts", "utf8");
    expect(declare).toContain("readVerifiedSteamId64(supabase, profile.id)");
    expect(declare).toContain("suggestParticipantForPlayer(participants, own)");
  });

  it("only nickname history written by manual selection can auto-attach (not steam_profile)", () => {
    const worker = readFileSync("src/lib/pipeline/jobs.server.ts", "utf8");
    expect(worker).toContain('.eq("source", "manual_selection")');
  });
});
