import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { suggestParticipantFromHistory, type DemoParticipant } from "@/lib/pipeline/attachment";

/**
 * Identity UX (Phase D, 2026-10-21): the user picks a detected player; a nickname the user
 * already confirmed in an earlier demo turns into "is player X you?" - never an automatic link.
 */
const players: DemoParticipant[] = [
  { participantKey: "p1", steamId: "p1", nickname: "FalleN", team: null },
  { participantKey: "p2", steamId: "p2", nickname: "fl4mus", team: null },
  { participantKey: "p3", steamId: "p3", nickname: "Twin", team: null },
  { participantKey: "p4", steamId: "p4", nickname: "twin", team: null },
  { participantKey: "p5", steamId: "p5", nickname: null, team: null },
];

describe("suggestParticipantFromHistory", () => {
  it("suggests the one player whose nickname the user already confirmed (normalised)", () => {
    expect(suggestParticipantFromHistory(players, ["  fallen "])?.participantKey).toBe("p1");
    expect(suggestParticipantFromHistory(players, ["FL4MUS", "someone-else"])?.participantKey).toBe(
      "p2",
    );
  });

  it("never suggests when the history is empty or matches nobody", () => {
    expect(suggestParticipantFromHistory(players, [])).toBeNull();
    expect(suggestParticipantFromHistory(players, ["", "   "])).toBeNull();
    expect(suggestParticipantFromHistory(players, ["coldzera"])).toBeNull();
  });

  it("never suggests when two players carry a known nickname (no silent pick)", () => {
    expect(suggestParticipantFromHistory(players, ["twin"])).toBeNull();
    expect(suggestParticipantFromHistory(players, ["fallen", "fl4mus"])).toBeNull();
  });

  it("never matches by similarity, only by exact normalised nickname", () => {
    expect(suggestParticipantFromHistory(players, ["fallen1", "fall"])).toBeNull();
  });
});

describe("identity UX wiring", () => {
  const ui = readFileSync(resolve("src/components/pipeline/DemoPlayerIdentity.tsx"), "utf8");
  const server = readFileSync(resolve("src/lib/pipeline-identity.functions.ts"), "utf8");

  it("has no free-text nickname input", () => {
    expect(ui).not.toContain("<Input");
    expect(ui).not.toContain("nicknameCta");
    expect(ui).not.toMatch(/declare\.mutate\(\{\s*nickname/);
  });

  it("asks 'is this you?' with yes and show-all, and yes declares that participant", () => {
    expect(ui).toContain('t("pipeline.identify.suggestion")');
    expect(ui).toContain('t("pipeline.identify.showAll")');
    expect(ui).toContain("declare.mutate(suggestion.participantKey)");
    expect(ui).toContain("setShowAll(true)");
  });

  it("the server accepts only a participant key, strictly", () => {
    const start = server.indexOf("const declareSchema");
    const schema = server.slice(start, server.indexOf(";", start));
    expect(schema).toContain("participantKey: z.string().min(1).max(64)");
    expect(schema).not.toContain("nickname");
    expect(schema).toContain(".strict()");
  });

  it("the suggestion is read from the caller's own player only", () => {
    const start = server.indexOf("async function readOwnNicknameHistory");
    const body = server.slice(start, server.indexOf("\n}\n", start));
    expect(body).toContain('.eq("user_id", userId)');
    expect(body).toContain('.eq("player_id", playerId)');
  });
});
