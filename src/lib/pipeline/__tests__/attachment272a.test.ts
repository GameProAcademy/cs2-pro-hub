/**
 * FASE 2.7.2A — PLAYER ATTACHMENT IS A STATE, NOT A PARSE FAILURE.
 *
 * These tests pin the rule that broke the first real E2E run: a demo whose
 * participants do not include the signed-in user's Steam ID is still a valid,
 * fully canonicalisable match. The attachment resolver must therefore RETURN the
 * real reason instead of throwing, and it must never guess a player from a
 * nickname, a team or a slot.
 */
import { describe, expect, it } from "vitest";

import { PipelineError } from "../errors";
import type { CanonicalMatch } from "../types";
import { resolveOwnParticipant, resolveOwnSteamId } from "../validator";

const match = {
  players: [
    { steamId: "76561198000000001", name: "player-one" },
    { steamId: "76561198000000002", name: "player-two" },
  ],
} as unknown as CanonicalMatch;

describe("resolveOwnParticipant", () => {
  it("attaches only on a proven Steam ID present in the demo", () => {
    expect(resolveOwnParticipant(match, "76561198000000002")).toEqual({
      steamId: "76561198000000002",
      reason: null,
      method: "steam_id_profile",
      confidence: 1,
    });
  });

  it("reports no_steam_id_on_profile instead of throwing", () => {
    const outcome = resolveOwnParticipant(match, null);
    expect(outcome.steamId).toBeNull();
    expect(outcome.reason).toBe("no_steam_id_on_profile");
    expect(outcome.method).toBeNull();
  });

  it("reports steam_id_not_in_demo when the user did not play this match", () => {
    const outcome = resolveOwnParticipant(match, "76561198000000009");
    expect(outcome.steamId).toBeNull();
    expect(outcome.reason).toBe("steam_id_not_in_demo");
  });

  it("never resolves a player from a nickname", () => {
    expect(resolveOwnParticipant(match, "player-one").steamId).toBeNull();
  });
});

describe("resolveOwnSteamId", () => {
  it("still throws for callers that genuinely require a player", () => {
    expect(() => resolveOwnSteamId(match, null)).toThrow(PipelineError);
    expect(() => resolveOwnSteamId(match, "76561198000000009")).toThrow(
      /steam_id_not_in_demo|PLAYER_IDENTITY_UNRESOLVED/,
    );
    expect(resolveOwnSteamId(match, "76561198000000001")).toBe("76561198000000001");
  });
});
