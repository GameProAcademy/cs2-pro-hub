/**
 * PM2 / 4.2.4 — replay: wire sanitation, compact decoding, segment building (labels, radar,
 * gaps, events, tick rate), interpolation rules, round availability, and page states in every
 * locale. No SteamID ever reaches the segment.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/config";
import {
  buildReplaySegment,
  positionAt,
  ticksPerSecond,
  type StoredRoundTrajectory,
} from "@/lib/replay/segment";
import {
  decodeAlive,
  decodeSamples,
  sanitizeRoundTrajectories,
  TRAJECTORY_GAP,
  xyzLength,
} from "@/lib/replay/trajectory";
import { MAP_OVERVIEWS } from "@/lib/spatial/maps";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { roundAvailability } = await import("@/lib/replay.functions");
const { ReplayBody } = await import("@/components/real/RealReplay");
type Resp = import("@/lib/replay.functions").ReplayResponse;

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );

const dust2 = MAP_OVERVIEWS["de_dust2"]!;
const world = (rx: number, ry: number) => ({
  x: Math.round(rx * dust2.scale + dust2.posX),
  y: Math.round(dust2.posY - ry * dust2.scale),
  z: 0,
});
const encode = (samples: ({ x: number; y: number; z: number } | null)[]) => {
  const buf = Buffer.alloc(samples.length * 6);
  samples.forEach((s, i) => {
    buf.writeInt16LE(s ? s.x : TRAJECTORY_GAP, i * 6);
    buf.writeInt16LE(s ? s.y : TRAJECTORY_GAP, i * 6 + 2);
    buf.writeInt16LE(s ? s.z : TRAJECTORY_GAP, i * 6 + 4);
  });
  return buf.toString("base64");
};
const ME = "76561190000000001";
const MATE = "76561190000000002";
const OPP = "76561190000000003";
const round: StoredRoundTrajectory = {
  round_number: 3,
  first_tick: 1000,
  end_tick: 1048,
  step_ticks: 16,
  sample_count: 4,
  players: [
    {
      participant_key: ME,
      side: "CT",
      xyz: encode([world(100, 100), world(110, 100), null, world(130, 100)]),
      alive: "11-1",
    },
    {
      participant_key: OPP,
      side: "T",
      xyz: encode([world(500, 500), world(500, 510), world(500, 520), world(500, 520)]),
      alive: "1100",
    },
    {
      participant_key: MATE,
      side: "CT",
      xyz: encode([world(200, 200), null, null, null]),
      alive: "1---",
    },
  ],
};
const events = [
  {
    id: "e2",
    tick: 1040,
    timeSeconds: 16.25,
    type: "kill",
    actor: ME,
    victim: OPP,
    weapon: "m4a1",
    headshot: true,
  },
  {
    id: "e1",
    tick: 1008,
    timeSeconds: 15.75,
    type: "bomb_plant",
    actor: OPP,
    victim: null,
    weapon: null,
    headshot: null,
  },
  {
    id: "e0",
    tick: 5000,
    timeSeconds: 70,
    type: "kill",
    actor: OPP,
    victim: MATE,
    weapon: "ak47",
    headshot: false,
  },
  {
    id: "e3",
    tick: 1010,
    timeSeconds: null,
    type: "damage",
    actor: OPP,
    victim: ME,
    weapon: "ak47",
    headshot: false,
  },
];

describe("trajectory wire", () => {
  it("decodes samples, gaps and alive flags", () => {
    expect(decodeSamples(encode([{ x: 1, y: -2, z: 3 }, null]), 2)).toEqual([
      { x: 1, y: -2, z: 3 },
      null,
    ]);
    expect(decodeAlive("10-")).toEqual([true, false, null]);
    expect(xyzLength(4)).toBe(32);
  });

  it("accepts only the documented shape and drops malformed parts", () => {
    const good = {
      schema: "cs2.round-trajectory.v1",
      encoding: "x",
      status: "PARTIAL",
      reason: null,
      step_ticks: 16,
      skipped: [{ round: 9, reason: "LIMIT" }],
      rounds: [
        {
          round: 3,
          first_tick: 1000,
          end_tick: 1048,
          step_ticks: 16,
          sample_count: 4,
          dropped_players: 0,
          players: [
            { steam_id: ME, side: "CT", xyz: round.players[0]!.xyz, alive: "11-1" },
            { steam_id: "x", side: "CT", xyz: round.players[0]!.xyz, alive: "11-1" },
            { steam_id: OPP, side: "T", xyz: round.players[1]!.xyz, alive: "11" },
          ],
        },
        { round: 3, first_tick: 0, end_tick: 1, step_ticks: 16, sample_count: 1, players: [] },
        { round: 4, first_tick: 10, end_tick: 5, step_ticks: 16, sample_count: 1, players: [] },
      ],
    };
    const s = sanitizeRoundTrajectories(good)!;
    expect(s.rounds).toHaveLength(1);
    expect(s.rounds[0]!.players.map((p) => p.steam_id)).toEqual([ME]);
    expect(s.skipped).toEqual([{ round: 9, reason: "LIMIT" }]);
    expect(sanitizeRoundTrajectories({ ...good, schema: "v2" })).toBeNull();
    expect(sanitizeRoundTrajectories({ ...good, status: "UNAVAILABLE" })!.rounds).toEqual([]);
    expect(sanitizeRoundTrajectories(null)).toBeNull();
  });
});

describe("replay segment", () => {
  const seg = buildReplaySegment({ map: "de_dust2", round, ownKey: ME, events })!;

  it("labels players by slot and never returns a SteamID", () => {
    expect(seg.players.map((p) => p.slot).sort()).toEqual(["CT1", "T1", "you"]);
    expect(JSON.stringify(seg)).not.toMatch(/7656119/);
  });

  it("keeps gaps as null and allows interpolation only between observed living samples", () => {
    const me = seg.players.find((p) => p.isYou)!;
    expect(me.points[0]).toEqual([100, 100, "default"]);
    expect(me.points[2]).toBeNull();
    expect(me.interpolable).toEqual([true, false, false, false]);
    expect(positionAt(me, 0.5)).toMatchObject({ x: 105, interpolated: true });
    expect(positionAt(me, 1.5)).toBeNull(); // next sample is a gap
    expect(positionAt(me, 2)).toBeNull();
    expect(positionAt(me, 3)).toMatchObject({ x: 130, interpolated: false });
    expect(positionAt(me, 3.5)).toBeNull(); // never extrapolates
    const opp = seg.players.find((p) => p.side === "T")!;
    expect(opp.interpolable).toEqual([true, false, false, false]);
    expect(positionAt(opp, 2.5)).toMatchObject({ x: 500, y: 520, dead: true, interpolated: false });
    expect(seg.coverage).toEqual({ players: 3, observedSamples: 8, possibleSamples: 12 });
  });

  it("keeps only round events, ordered, with slots", () => {
    expect(seg.events.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(seg.events[1]).toMatchObject({ actorSlot: "you", victimSlot: "T1", involvesYou: true });
  });

  it("derives a tick rate only from agreeing pairs", () => {
    expect(seg.ticksPerSecond).toBeNull(); // 32 ticks / 0.5 s vs (5000-1040)/(70-16.25): disagree
    expect(
      ticksPerSecond([
        { tick: 0, timeSeconds: 0 },
        { tick: 64, timeSeconds: 1 },
        { tick: 192, timeSeconds: 3 },
      ]),
    ).toBe(64);
    expect(ticksPerSecond([{ tick: 0, timeSeconds: null }])).toBeNull();
  });

  it("draws nothing on a map that is not validated", () => {
    expect(buildReplaySegment({ map: "de_mirage", round, ownKey: ME, events })).toBeNull();
  });
});

describe("round availability", () => {
  it("separates voided, skipped and missing rounds", () => {
    expect(
      roundAvailability(
        [1, 2, 3, 4],
        [1, 3],
        [
          { round: 2, reason: "LIMIT" },
          { round: 7, reason: "WINDOW_UNKNOWN" },
        ],
      ),
    ).toEqual([
      { number: 1, availability: "AVAILABLE" },
      { number: 2, availability: "LIMIT" },
      { number: 3, availability: "AVAILABLE" },
      { number: 4, availability: "NOT_SAMPLED" },
    ]);
    expect(roundAvailability([1], [1, 2], [])[1]).toEqual({
      number: 2,
      availability: "VOIDED_OR_UNKNOWN",
    });
  });
});

describe("replay page states", () => {
  const seg = buildReplaySegment({ map: "de_dust2", round, ownKey: ME, events })!;
  const ok: Resp = {
    status: "OK",
    map: "de_dust2",
    trajectoryStatus: "PARTIAL",
    round: 3,
    availability: "AVAILABLE",
    rounds: [
      { number: 2, availability: "VOIDED_OR_UNKNOWN" },
      { number: 3, availability: "AVAILABLE" },
    ],
    segment: seg,
  };

  it.each(LOCALES)("renders the player with controls and legend (%s)", (locale) => {
    const html = render(<ReplayBody r={ok} onRound={() => {}} initialTick={1016} />, locale);
    const d = dictionaries[locale];
    for (const k of [
      "replay.legend.observed",
      "replay.legend.interpolated",
      "replay.partial",
      "replay.events",
    ] as const)
      expect(html).toContain(d[k].replaceAll("'", "&#x27;"));
    expect(html).toContain(`aria-label="${d["replay.play"]}"`);
    expect(html).toContain(`aria-label="${d["replay.timeline"]}"`);
    expect(html).toContain("data-replay-svg");
    expect(html).not.toMatch(/7656119/);
  });

  it.each(["NOT_RECORDED", "UNAVAILABLE", "MAP_NOT_VALIDATED", "NOT_FOUND"] as const)(
    "state %s",
    (status) => {
      const r = (
        status === "MAP_NOT_VALIDATED"
          ? { status, map: "de_mirage", rounds: [] }
          : status === "UNAVAILABLE"
            ? { status, map: "de_dust2", reason: "READ_FAILED" }
            : { status, map: "de_dust2" }
      ) as Resp;
      const html = render(<ReplayBody r={r} onRound={() => {}} />);
      expect(html).toContain(dictionaries["pt-BR"][`replay.state.${status}.title`]);
      expect(html).not.toContain("data-replay-svg");
    },
  );

  it("explains an unavailable round", () => {
    const html = render(
      <ReplayBody
        r={{
          ...ok,
          status: "ROUND_UNAVAILABLE",
          round: 2,
          availability: "VOIDED_OR_UNKNOWN",
          segment: null,
        }}
        onRound={() => {}}
      />,
    );
    expect(html).toContain(dictionaries["pt-BR"]["replay.availability.VOIDED_OR_UNKNOWN"]);
  });
});
