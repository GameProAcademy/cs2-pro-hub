/**
 * PM3 / 4.2.5 — `cs2.duels.v1`: every rule of the duel definition, the shot↔hit association and
 * the NOT_MEASURED / INSUFFICIENT_SAMPLE boundaries. Null is never zero.
 */
import { describe, expect, it } from "vitest";

import {
  buildCombatReport,
  DUELS_VERSION,
  matchTickRate,
  MIN_SAMPLE,
  type CombatEventRow,
  type CombatInput,
} from "@/lib/combat/duels";
import { isFirearm, weaponClass } from "@/lib/combat/weapons";

const ME = "p-me";
const MATE = "p-mate";
const O1 = "p-o1";
const O2 = "p-o2";
const MATCH = "11111111-1111-4111-8111-111111111111";

let seq = 0;
function ev(over: Partial<CombatEventRow> & Pick<CombatEventRow, "type" | "tick">): CombatEventRow {
  seq += 1;
  return {
    id: `e${seq}`,
    roundNumber: 1,
    timeSeconds: null,
    actor: null,
    victim: null,
    weapon: null,
    headshot: null,
    distance: null,
    damage: null,
    hitgroup: null,
    ...over,
  };
}
const dmg = (
  tick: number,
  actor: string,
  victim: string,
  weapon = "ak47",
  extra: Partial<CombatEventRow> = {},
) => ev({ type: "damage", tick, actor, victim, weapon, damage: 27, ...extra });
const kill = (tick: number, actor: string, victim: string, extra: Partial<CombatEventRow> = {}) =>
  ev({
    type: "kill",
    tick,
    actor,
    victim,
    weapon: "ak47",
    headshot: false,
    distance: 10,
    ...extra,
  });
const shot = (tick: number, weapon = "ak47", actor = ME, round = 1) =>
  ev({ type: "weapon_fire", tick, actor, weapon, roundNumber: round });

const roster = (round = 1) => [
  { roundNumber: round, participantKey: ME, side: "CT" as const },
  { roundNumber: round, participantKey: MATE, side: "CT" as const },
  { roundNumber: round, participantKey: O1, side: "T" as const },
  { roundNumber: round, participantKey: O2, side: "T" as const },
];
const input = (events: CombatEventRow[], over: Partial<CombatInput> = {}): CombatInput => ({
  matchId: MATCH,
  rounds: [{ roundNumber: 1, startTick: 0, endTick: 100000, winnerSide: null, winReason: null }],
  roundPlayers: [...roster(1), ...roster(2)],
  events,
  shotsAttributed: true,
  hitGroupsRecorded: true,
  ...over,
});
const report = (events: CombatEventRow[], over: Partial<CombatInput> = {}) =>
  buildCombatReport(input(events, over), ME);

describe("duel definition", () => {
  it("a kill closes a duel: WON / LOST, with damage on both sides", () => {
    const r = report([
      dmg(100, O1, ME),
      dmg(110, ME, O1),
      kill(120, ME, O1),
      dmg(5000, O2, ME),
      kill(5010, O2, ME),
    ]);
    expect(r.duels.map((d) => d.outcome)).toEqual(["WON", "LOST"]);
    expect(r.duels[0]).toMatchObject({
      damageDealt: 27,
      damageTaken: 27,
      hitsDealt: 1,
      hitsTaken: 1,
      weapon: "ak47",
      weaponClass: "rifle",
    });
    expect(r.duels[0]!.ref).toEqual({ matchId: MATCH, round: 1, tick: 100 });
  });

  it("damage with no kill between the pair is UNRESOLVED, never a win or a loss", () => {
    const r = report([dmg(100, ME, O1), dmg(120, O1, ME)]);
    expect(r.duels).toHaveLength(1);
    expect(r.duels[0]!.outcome).toBe("UNRESOLVED");
    expect(r.metrics["duel_win_rate"]).toMatchObject({
      status: "INSUFFICIENT_SAMPLE",
      value: null,
    });
  });

  it("splits the same pair when events are more than 3 s apart (64 tick nominal)", () => {
    const r = report([
      dmg(100, ME, O1),
      dmg(100 + 3 * 64 + 1, ME, O1),
      kill(100 + 3 * 64 + 5, ME, O1),
    ]);
    expect(r.duels.map((d) => d.outcome)).toEqual(["UNRESOLVED", "WON"]);
    expect(r.ticksPerSecond).toEqual({ value: 64, source: "NOMINAL" });
  });

  it("a multi-player fight is one duel per opponent", () => {
    const r = report([dmg(100, O1, ME), dmg(105, O2, ME), dmg(110, ME, O1), kill(115, O2, ME)]);
    expect(r.duels).toHaveLength(2);
    expect(r.duels.find((d) => d.outcome === "LOST")!.damageTaken).toBe(27);
    expect(r.duels.find((d) => d.outcome === "UNRESOLVED")!.hitsDealt).toBe(1);
  });

  it("team damage, utility/world damage and unknown sides are excluded and counted", () => {
    const r = report([
      dmg(100, MATE, ME),
      dmg(110, O1, ME, "hegrenade"),
      dmg(120, O1, ME, "world"),
      dmg(130, "p-unknown", ME),
    ]);
    expect(r.duels).toEqual([]);
    expect(r.excluded).toEqual({ unknownSide: 1, utilityOrWorld: 2 });
  });

  it("an opening duel is closed by the round's first kill between opponents", () => {
    const r = report([
      kill(50, MATE, MATE), // suicide: not an opening kill
      kill(80, O2, MATE), // first kill of the round, not involving P
      dmg(90, ME, O1),
      kill(100, ME, O1),
      ev({
        type: "kill",
        tick: 200,
        roundNumber: 2,
        actor: ME,
        victim: O1,
        weapon: "awp",
        distance: 20,
      }),
    ]);
    expect(r.duels.map((d) => d.opening)).toEqual([false, true]);
    expect(r.duels[1]!.weaponClass).toBe("sniper");
  });

  it("a lost duel's weapon is P's last damaging weapon; none when P never hit", () => {
    const r = report([dmg(100, ME, O1, "glock"), kill(110, O1, ME), kill(5000, O2, ME)]);
    expect(r.duels.map((d) => [d.outcome, d.weapon, d.weaponClass])).toEqual([
      ["LOST", "glock", "pistol"],
      ["LOST", null, null],
    ]);
    expect(r.byWeaponClass.map((c) => c.cls).sort()).toEqual(["pistol", "unknown"]);
  });
});

describe("aggregates", () => {
  it("duel win rate needs the minimum resolved duels", () => {
    const events: CombatEventRow[] = [];
    for (let i = 0; i < MIN_SAMPLE.resolvedDuels; i++) {
      const t = 1000 * (i + 1);
      events.push(kill(t, i < 7 ? ME : O1, i < 7 ? O1 : ME));
    }
    const r = report(events);
    expect(r.metrics["duel_win_rate"]).toMatchObject({
      status: "DERIVED",
      value: 0.7,
      sample_size: { n: 10, unit: "resolved duels" },
    });
    expect(r.metrics["duel_win_rate"]!.provenance_method).toContain(DUELS_VERSION);
  });

  it("headshot rate is OBSERVED from the kill flag; kills without the flag are left out", () => {
    const events = [1, 2, 3, 4, 5].map((i) => kill(i * 1000, ME, O1, { headshot: i <= 2 }));
    events.push(kill(9000, ME, O2, { headshot: null }));
    expect(report(events).metrics["headshot_kill_rate"]).toMatchObject({
      status: "OBSERVED",
      value: 0.4,
      sample_size: { n: 5 },
    });
  });

  it("distance bands in meters use kills and deaths between opponents", () => {
    const events = [
      kill(1000, ME, O1, { distance: 3 }),
      kill(2000, O1, ME, { distance: 4 }),
      kill(3000, ME, O2, { distance: 20 }),
      kill(4000, ME, MATE, { distance: 2 }), // team kill: ignored
      kill(5000, ME, O1, { distance: null }), // no distance: in no band, never band 0
    ];
    const close = report(events).byDistance.find((b) => b.band === "close")!;
    expect([close.kills, close.deaths, close.metric.status]).toEqual([1, 1, "INSUFFICIENT_SAMPLE"]);
    expect(report(events).byDistance.find((b) => b.band === "long")!.kills).toBe(1);
  });
});

describe("shooting (R5.8.30 telemetry)", () => {
  it("a shot hits when P damaged an opponent on the same tick; misses and team hits do not count", () => {
    const events = [shot(100), dmg(100, ME, O1, "m4a1"), shot(107), shot(114), dmg(114, ME, MATE)];
    const r = report(events);
    const ak = r.shooting.byWeapon.find((w) => w.weapon === "ak47")!;
    expect([ak.shots, ak.hits]).toEqual([3, 1]);
    expect(r.metrics["shot_hit_rate"]).toMatchObject({
      status: "INSUFFICIENT_SAMPLE",
      value: null,
    });
  });

  it("knife, zeus and grenade throws are not shots", () => {
    const r = report([
      shot(100, "knife_karambit"),
      shot(200, "taser"),
      shot(300, "flashbang"),
      shot(400, "ak47"),
    ]);
    expect(r.shooting.byWeapon.map((w) => w.weapon)).toEqual(["ak47"]);
    expect(isFirearm("taser")).toBe(false);
    expect(weaponClass("hkp2000")).toBe("pistol");
  });

  it("bursts split on gap, weapon change and round; first shot and spray buckets", () => {
    const events: CombatEventRow[] = [];
    // 25 bursts of 3 AK shots 6 ticks apart; the first shot of the first 10 bursts hits.
    for (let b = 0; b < 25; b++) {
      const t = 10000 + b * 1000;
      events.push(shot(t), shot(t + 6), shot(t + 12));
      if (b < 10) events.push(dmg(t, ME, O1));
    }
    events.push(shot(50000, "deagle"), shot(50001, "deagle", ME, 2));
    const r = report(events);
    expect(r.metrics["first_shot_hit_rate"]).toMatchObject({
      status: "DERIVED",
      value: 0.3704,
      sample_size: { n: 27, unit: "bursts" },
    });
    const first = r.shooting.spray.find((s) => s.bucket === "1")!;
    expect([first.shots, first.hits]).toEqual([25, 10]); // deagle is not automatic: out of the spray profile
    expect(r.shooting.spray.find((s) => s.bucket === "2-3")!.shots).toBe(50);
    expect(r.metrics["shot_hit_rate"]).toMatchObject({
      status: "DERIVED",
      value: Math.round((10 / 77) * 10000) / 10000,
    });
  });

  it("hit groups merge arms and legs and ignore hits without a group", () => {
    const events: CombatEventRow[] = [];
    for (let i = 0; i < 20; i++)
      events.push(
        dmg(100 + i * 10, ME, O1, "ak47", {
          hitgroup: i < 5 ? "head" : i < 10 ? "left_arm" : "right_arm",
        }),
      );
    events.push(dmg(5000, ME, O1, "ak47", { hitgroup: null }));
    const r = report(events);
    expect(r.metrics["head_hit_share"]).toMatchObject({
      status: "OBSERVED",
      value: 0.25,
      sample_size: { n: 20 },
    });
    expect(r.shooting.hitGroups.find((h) => h.group === "arms")!.hits).toBe(15);
  });

  it("legacy match: shooting and hit groups are NOT_MEASURED, never zero", () => {
    const r = report([shot(100, "ak47", null as unknown as string), dmg(100, ME, O1)], {
      shotsAttributed: false,
      hitGroupsRecorded: false,
    });
    expect(r.shooting.status).toBe("NOT_MEASURED");
    for (const k of ["shot_hit_rate", "first_shot_hit_rate", "head_hit_share"])
      expect(r.metrics[k]).toMatchObject({ status: "NOT_MEASURED", value: null });
  });

  it("crosshair placement, counter-strafe and recoil control are always NOT_MEASURED with what they need", () => {
    const r = report([]);
    for (const k of ["crosshair_placement", "counter_strafe", "recoil_control"]) {
      expect(r.metrics[k]).toMatchObject({ status: "NOT_MEASURED", value: null });
      expect(r.notMeasured.find((n) => n.metric_key === k)!.needs.length).toBeGreaterThan(10);
    }
  });
});

describe("tick rate", () => {
  it("uses the match's own tick/time pairs when consistent", () => {
    const events = [0, 1, 2, 3, 4].map((i) =>
      ev({ type: "kill", tick: i * 640, timeSeconds: i * 10 }),
    );
    expect(matchTickRate(events)).toEqual({ value: 64, source: "MATCH" });
  });
});
