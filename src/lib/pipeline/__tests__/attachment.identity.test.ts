/** FASE 2.7.2A — user attachment domain (pure, deterministic). */
import { describe, expect, it } from "vitest";

import {
  matchDeclaredNicknameToDemoPlayers,
  normalizeNickname,
  resolvePlayerAttachment,
  type DemoParticipant,
} from "@/lib/pipeline/attachment";

const players: DemoParticipant[] = [
  { participantKey: "1", steamId: "1", nickname: "FalleN", team: "A" },
  { participantKey: "2", steamId: "2", nickname: "KSCERATO", team: "A" },
  { participantKey: "3", steamId: "3", nickname: "kscerato", team: "B" },
  { participantKey: "4", steamId: "4", nickname: "THIAGO1", team: "B" },
];

describe("nickname normalisation", () => {
  it("folds case and whitespace only", () => {
    expect(normalizeNickname("  Fal leN ")).toBe("fal len");
  });

  it("never collapses distinguishing characters", () => {
    expect(normalizeNickname("THIAGO1")).not.toBe(normalizeNickname("THIAGO"));
  });
});

describe("nickname lookup", () => {
  it("returns a unique exact match", () => {
    const found = matchDeclaredNicknameToDemoPlayers("fallen", players);
    expect(found.status).toBe("unique");
    expect(found.matches[0]?.participantKey).toBe("1");
  });

  it("never picks silently when ambiguous", () => {
    const found = matchDeclaredNicknameToDemoPlayers("KSCERATO", players);
    expect(found.status).toBe("ambiguous");
    expect(found.matches).toHaveLength(2);
  });

  it("returns none for an absent nickname", () => {
    expect(matchDeclaredNicknameToDemoPlayers("thiago", players).status).toBe("none");
  });
});

describe("attachment resolution", () => {
  it("is unattached without a player profile", () => {
    const out = resolvePlayerAttachment({
      participants: players,
      hasProfile: false,
      profileSteamId: null,
    });
    expect(out).toMatchObject({ state: "unattached", reason: "no_player_profile" });
  });

  it("is unattached without a steam id and without declaration", () => {
    const out = resolvePlayerAttachment({
      participants: players,
      hasProfile: true,
      profileSteamId: null,
    });
    expect(out).toMatchObject({ state: "unattached", reason: "no_steam_id_on_profile" });
  });

  it("attaches with a confirmed steam id", () => {
    const out = resolvePlayerAttachment({
      participants: players,
      hasProfile: true,
      profileSteamId: "2",
    });
    expect(out).toMatchObject({
      state: "attached",
      participantKey: "2",
      steamId: "2",
      method: "steam_id_confirmed",
      source: "system",
      confidence: "high",
    });
  });

  it("reports steam id absent from the demo", () => {
    const out = resolvePlayerAttachment({
      participants: players,
      hasProfile: true,
      profileSteamId: "99",
    });
    expect(out).toMatchObject({ state: "unattached", reason: "steam_id_not_in_demo" });
  });

  it("attaches an explicitly selected participant", () => {
    const out = resolvePlayerAttachment({
      participants: players,
      hasProfile: true,
      profileSteamId: null,
      declaration: { kind: "participant", participantKey: "4" },
    });
    expect(out).toMatchObject({
      state: "attached",
      participantKey: "4",
      steamId: "4",
      method: "self_declared_player",
      source: "user",
      confidence: "user_confirmed",
    });
  });

  it("attaches a unique declared nickname without inventing a steam id", () => {
    const out = resolvePlayerAttachment({
      participants: [{ participantKey: "p9", steamId: null, nickname: "solo", team: null }],
      hasProfile: true,
      profileSteamId: null,
      declaration: { kind: "nickname", nickname: "SOLO" },
    });
    expect(out).toMatchObject({
      state: "attached",
      participantKey: "p9",
      steamId: null,
      method: "self_declared_nickname",
    });
  });

  it("stays unattached on an ambiguous declared nickname", () => {
    const out = resolvePlayerAttachment({
      participants: players,
      hasProfile: true,
      profileSteamId: null,
      declaration: { kind: "nickname", nickname: "kscerato" },
    });
    expect(out).toMatchObject({ state: "unattached", reason: "ambiguous_nickname" });
  });

  it("stays unattached on a declared nickname absent from the demo", () => {
    const out = resolvePlayerAttachment({
      participants: players,
      hasProfile: true,
      profileSteamId: null,
      declaration: { kind: "nickname", nickname: "ghost" },
    });
    expect(out).toMatchObject({ state: "unattached", reason: "self_declared_nickname_not_found" });
  });

  it("gives a confirmed steam id precedence over an agreeing declaration", () => {
    const out = resolvePlayerAttachment({
      participants: players,
      hasProfile: true,
      profileSteamId: "1",
      declaration: { kind: "nickname", nickname: "FalleN" },
    });
    expect(out).toMatchObject({
      state: "attached",
      method: "steam_id_confirmed",
      confidence: "high",
    });
  });

  it("reports a conflict when the declaration contradicts the confirmed steam id", () => {
    const out = resolvePlayerAttachment({
      participants: players,
      hasProfile: true,
      profileSteamId: "1",
      declaration: { kind: "participant", participantKey: "4" },
    });
    expect(out).toMatchObject({
      state: "conflict",
      reason: "identity_conflict",
      participantKey: null,
    });
  });
});
