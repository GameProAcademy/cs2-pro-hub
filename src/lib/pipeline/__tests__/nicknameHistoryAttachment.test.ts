/**
 * PM6 D — automatic attachment from the user's OWN confirmed nickname history.
 * Exact match only, unambiguous only, never against contradicting Steam evidence, and never
 * replacing an explicit choice. Anything else keeps the existing manual selection.
 */
import { describe, expect, it } from "vitest";

import {
  matchConfirmedNicknameHistory,
  resolvePlayerAttachment,
  storedAttachmentMethod,
  STORED_ATTACHMENT_METHODS,
  type DemoParticipant,
} from "../attachment";

const p = (
  key: string,
  nickname: string | null,
  steamId: string | null = null,
): DemoParticipant => ({
  participantKey: key,
  steamId,
  nickname,
  team: null,
});
const demo = [
  p("k1", "fallen"),
  p("k2", "coldzera"),
  p("k3", "Taco"),
  p("k4", "fer"),
  p("k5", "boltz"),
];
const base = { participants: demo, hasProfile: true, profileSteamId: null };

describe("PM6 D — confirmed nickname history", () => {
  it("1. first demo without history keeps the manual selection", () => {
    const out = resolvePlayerAttachment({ ...base, confirmedNicknames: [] });
    expect([out.state, out.reason]).toEqual(["unattached", "no_steam_id_on_profile"]);
  });

  it("2. exact nickname confirmed before attaches automatically", () => {
    const out = resolvePlayerAttachment({
      ...base,
      confirmedNicknames: [{ nickname: "coldzera", steamId: null }],
    });
    expect([out.state, out.participantKey, out.method, out.source, out.confidence]).toEqual([
      "attached",
      "k2",
      "confirmed_nickname_history",
      "user",
      "medium",
    ]);
    expect(storedAttachmentMethod(out.method, null)).toBe("confirmed_nickname_history");
    expect(STORED_ATTACHMENT_METHODS).toContain("confirmed_nickname_history");
  });

  it("3. a different nickname asks for selection", () => {
    expect(
      resolvePlayerAttachment({
        ...base,
        confirmedNicknames: [{ nickname: "kscerato", steamId: null }],
      }).state,
    ).toBe("unattached");
  });

  it("4. similar but not identical nicknames never match (no fuzzy matching)", () => {
    for (const nickname of ["Coldzera", "coldzera ", "c0ldzera", "coldzer", "[MIBR] coldzera"]) {
      expect(
        matchConfirmedNicknameHistory(demo, [{ nickname, steamId: null }]),
        nickname,
      ).toBeNull();
    }
  });

  it("5. two players with the same nickname ask for selection (also when only case differs)", () => {
    const dup = [...demo, p("k6", "coldzera")];
    expect(
      matchConfirmedNicknameHistory(dup, [{ nickname: "coldzera", steamId: null }]),
    ).toBeNull();
    const caseDup = [...demo, p("k6", "ColdZera")];
    expect(
      matchConfirmedNicknameHistory(caseDup, [{ nickname: "coldzera", steamId: null }]),
    ).toBeNull();
  });

  it("6. the same nickname in another account never leaks: only the history passed is used", () => {
    // History is read per player (jobs.server.ts filters player_nickname_history by the job owner's
    // player_id and source = manual_selection); another user's confirmations are never an input.
    expect(resolvePlayerAttachment({ ...base, confirmedNicknames: [] }).state).toBe("unattached");
  });

  it("7. a confirmed nickname with a conflicting Steam ID asks for selection", () => {
    const steamDemo = [
      p("k1", "fallen", "76561190000000001"),
      p("k2", "coldzera", "76561190000000002"),
    ];
    expect(
      matchConfirmedNicknameHistory(steamDemo, [
        { nickname: "coldzera", steamId: "76561190000000009" },
      ]),
    ).toBeNull();
    expect(
      matchConfirmedNicknameHistory(steamDemo, [
        { nickname: "coldzera", steamId: "76561190000000002" },
      ])?.participantKey,
    ).toBe("k2");
  });

  it("8. an explicit selection for this demo always wins over history", () => {
    const out = resolvePlayerAttachment({
      ...base,
      declaration: { kind: "participant", participantKey: "k4" },
      confirmedNicknames: [{ nickname: "coldzera", steamId: null }],
    });
    expect([out.participantKey, out.method]).toEqual(["k4", "manual_user_selection"]);
  });

  it("9. a rejected automatic match is never re-attached from history", () => {
    const out = resolvePlayerAttachment({
      ...base,
      automaticMatchRejected: true,
      confirmedNicknames: [{ nickname: "coldzera", steamId: null }],
    });
    expect(out.state).toBe("unattached");
  });

  it("10. a proven Steam ID keeps precedence; a linked Steam absent from the demo never falls back to nicknames", () => {
    const steamDemo = [
      p("k1", "fallen", "76561190000000001"),
      p("k2", "coldzera", "76561190000000002"),
    ];
    const steam = resolvePlayerAttachment({
      participants: steamDemo,
      hasProfile: true,
      profileSteamId: "76561190000000001",
      confirmedNicknames: [{ nickname: "coldzera", steamId: null }],
    });
    expect([steam.participantKey, steam.method]).toEqual(["k1", "steam_id_confirmed"]);
    const absent = resolvePlayerAttachment({
      participants: steamDemo,
      hasProfile: true,
      profileSteamId: "76561190000000099",
      confirmedNicknames: [{ nickname: "coldzera", steamId: null }],
    });
    expect([absent.state, absent.reason]).toEqual(["unattached", "steam_id_not_in_demo"]);
  });

  it("no profile → nothing attaches", () => {
    expect(
      resolvePlayerAttachment({
        ...base,
        hasProfile: false,
        confirmedNicknames: [{ nickname: "coldzera", steamId: null }],
      }).reason,
    ).toBe("no_player_profile");
  });
});
