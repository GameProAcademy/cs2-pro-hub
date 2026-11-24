import { describe, expect, it } from "vitest";

import { replaySlotLabel } from "@/lib/replay/slotLabel";
import { dictionaries } from "@/i18n/config";
import {
  buildReplaySegment,
  stableSlots,
  type RosterRow,
  type StoredRoundTrajectory,
} from "@/lib/replay/segment";

/** cs2.round-trajectory.v1 encoding: little-endian int16 x, y, z per sample, base64. */
const encodeSamples = (samples: Array<[number, number, number]>) => {
  const buf = Buffer.alloc(samples.length * 6);
  samples.forEach(([x, y, z], i) => {
    buf.writeInt16LE(x, i * 6);
    buf.writeInt16LE(y, i * 6 + 2);
    buf.writeInt16LE(z, i * 6 + 4);
  });
  return buf.toString("base64");
};

const ME = "me";
// Teammates a1..a4 and opponents e1..e5; opaque keys (never SteamIDs in the output).
const TEAM = ["a1", "a2", "a3", "a4"];
const OPP = ["e1", "e2", "e3", "e4", "e5"];

/** 24 rounds with the half-time swap at round 13 and one disconnect (a2 misses round 20). */
function roster(): RosterRow[] {
  const rows: RosterRow[] = [];
  for (let n = 1; n <= 24; n++) {
    const mine = n <= 12 ? "CT" : "T";
    const theirs = mine === "CT" ? "T" : "CT";
    rows.push({ participant_key: ME, round_number: n, side: mine });
    for (const k of TEAM)
      if (!(k === "a2" && n === 20)) rows.push({ participant_key: k, round_number: n, side: mine });
    for (const k of OPP) rows.push({ participant_key: k, round_number: n, side: theirs });
  }
  return rows;
}

function roundOf(n: number, present: string[]): StoredRoundTrajectory {
  const mine = n <= 12 ? "CT" : "T";
  const theirs = mine === "CT" ? "T" : "CT";
  const xyz = encodeSamples([[-500, 500, 0]]);
  return {
    round_number: n,
    first_tick: 1000,
    end_tick: 1016,
    step_ticks: 16,
    sample_count: 1,
    players: present.map((k) => ({
      participant_key: k,
      side: (k === ME || TEAM.includes(k) ? mine : theirs) as "T" | "CT",
      xyz,
      alive: "1",
    })),
  };
}

const slotsIn = (n: number, present: string[]) => {
  const seg = buildReplaySegment({
    map: "de_mirage",
    round: roundOf(n, present),
    ownKey: ME,
    events: [],
    roster: roster(),
  })!;
  return new Map(seg.players.map((p) => [p.side + ":" + p.slot, p.slot]));
};

describe("UX-1.0 D-33 — anonymous labels stable for the whole match", () => {
  it("assigns ally:1..4 and enemy:1..5 relative to the caller", () => {
    const s = stableSlots(roster(), ME)!;
    expect(s.get(ME)).toBe("you");
    expect(TEAM.map((k) => s.get(k))).toEqual(["ally:1", "ally:2", "ally:3", "ally:4"]);
    expect(OPP.map((k) => s.get(k))).toEqual([
      "enemy:1",
      "enemy:2",
      "enemy:3",
      "enemy:4",
      "enemy:5",
    ]);
  });

  it("keeps each player's label across the half-time side swap and a disconnect", () => {
    const all = [ME, ...TEAM, ...OPP];
    const label = (n: number, present: string[]) => {
      const seg = buildReplaySegment({
        map: "de_mirage",
        round: roundOf(n, present),
        ownKey: ME,
        events: [],
        roster: roster(),
      })!;
      return Object.fromEntries(
        seg.players.map((p, i) => [
          // players come back sorted by side then key; recover the key through the side/slot pair
          p.slot,
          i,
        ]),
      );
    };
    const first = Object.keys(label(1, all)).sort();
    const afterSwap = Object.keys(label(13, all)).sort();
    const withDisconnect = Object.keys(
      label(
        20,
        all.filter((k) => k !== "a2"),
      ),
    ).sort();
    expect(afterSwap).toEqual(first); // CT in the first half, T after: same labels
    expect(withDisconnect).toEqual(first.filter((s) => s !== "ally:2")); // nobody is renumbered
    expect(slotsIn(13, all).has("T:ally:1")).toBe(true); // allies are on T after the swap
    expect(slotsIn(1, all).has("CT:ally:1")).toBe(true);
  });

  it("events use the same stable labels", () => {
    const seg = buildReplaySegment({
      map: "de_mirage",
      round: roundOf(15, [ME, ...TEAM, ...OPP]),
      ownKey: ME,
      roster: roster(),
      events: [
        {
          id: "k1",
          tick: 1008,
          timeSeconds: null,
          type: "kill",
          actor: "e3",
          victim: "a4",
          weapon: "ak47",
          headshot: true,
        },
      ],
    })!;
    expect(seg.events[0]).toMatchObject({ actorSlot: "enemy:3", victimSlot: "ally:4" });
    expect(JSON.stringify(seg)).not.toMatch(/"(a[1-4]|e[1-5]|me)"/);
  });

  it("falls back to the per-round labels without a usable roster", () => {
    const seg = buildReplaySegment({
      map: "de_mirage",
      round: roundOf(1, [ME, "a1", "e1"]),
      ownKey: ME,
      events: [],
    })!;
    expect(seg.players.map((p) => p.slot).sort()).toEqual(["CT1", "T1", "you"]);
    expect(stableSlots([], ME)).toBeNull();
  });

  it("is translated in the five locales", () => {
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"] as const) {
      const d = dictionaries[l] as Record<string, string>;
      const t = (k: string) => d[k]!;
      expect(replaySlotLabel("ally:2", t as never)).toMatch(/2$/);
      expect(replaySlotLabel("enemy:5", t as never)).toMatch(/5$/);
      expect(replaySlotLabel("you", t as never)).toBe(d["replay.slot.you"]);
      expect(replaySlotLabel("CT1", t as never)).toBe("CT1");
    }
  });
});
