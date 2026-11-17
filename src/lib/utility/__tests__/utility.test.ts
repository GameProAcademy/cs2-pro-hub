/**
 * PM3 / 4.2.6 — `cs2.utility.v1`: flash ↔ blind association by tick, enemy/teammate/self split,
 * NOT_OBSERVED when the match did not record blinds/throwers/fire (never zero), minimum samples,
 * HE/fire damage by side, round phases and flash-assist provenance.
 */
import { describe, expect, it } from "vitest";

import {
  buildUtilityReport,
  MIN_SAMPLE,
  UTILITY_VERSION,
  type UtilityEventRow,
  type UtilityInput,
} from "@/lib/utility/utility";

const ME = "p-me";
const MATE = "p-mate";
const O1 = "p-o1";
const O2 = "p-o2";
const MATCH = "22222222-2222-4222-8222-222222222222";

let seq = 0;
const ev = (
  over: Partial<UtilityEventRow> & Pick<UtilityEventRow, "type" | "tick">,
): UtilityEventRow => ({
  id: `u${++seq}`,
  roundNumber: 1,
  actor: null,
  victim: null,
  weapon: null,
  damage: null,
  flashDuration: null,
  ...over,
});
const flash = (tick: number, round = 1, actor = ME) =>
  ev({ type: "flash", tick, actor, roundNumber: round });
const blind = (tick: number, victim: string, secs: number, round = 1, actor = ME) =>
  ev({ type: "flash", tick, actor, victim, flashDuration: secs, roundNumber: round });
const roster = (round: number) => [
  { roundNumber: round, participantKey: ME, side: "CT" as const },
  { roundNumber: round, participantKey: MATE, side: "CT" as const },
  { roundNumber: round, participantKey: O1, side: "T" as const },
  { roundNumber: round, participantKey: O2, side: "T" as const },
];
const input = (events: UtilityEventRow[], over: Partial<UtilityInput> = {}): UtilityInput => ({
  matchId: MATCH,
  rounds: [1, 2, 3].map((n) => ({
    roundNumber: n,
    startTick: 0,
    endTick: 100000,
    winnerSide: null,
    winReason: null,
  })),
  roundPlayers: [...roster(1), ...roster(2), ...roster(3)],
  events,
  throwsAttributed: true,
  blindsRecorded: true,
  detonationsAttributed: true,
  fireRecorded: true,
  flashAssists: null,
  flashAssistMethod: null,
  ...over,
});
const report = (events: UtilityEventRow[], over: Partial<UtilityInput> = {}) =>
  buildUtilityReport(input(events, over), ME);

describe("flash effect", () => {
  it("ties blinds to the flash of the same tick and splits enemy / teammate / self", () => {
    const r = report([
      flash(100),
      blind(100, O1, 2.5),
      blind(100, O2, 1.0),
      blind(100, MATE, 3.0),
      blind(100, ME, 0.5),
      flash(200),
    ]);
    expect(r.version).toBe(UTILITY_VERSION);
    expect(r.flashes).toHaveLength(2);
    expect(r.flashes[0]).toMatchObject({
      enemies: 2,
      teammates: 1,
      self: true,
      enemyBlindSeconds: 3.5,
    });
    // A flash with no recorded enemy blind is "no measured effect", counted as 0 enemies.
    expect(r.flashes[1]).toMatchObject({ enemies: 0, teammates: 0, self: false });
    expect(r.unmatchedBlinds).toBe(0);
  });

  it("a blind on another tick is never credited to a flash (unmatched)", () => {
    const r = report([flash(100), blind(101, O1, 2)]);
    expect(r.flashes[0]!.enemies).toBe(0);
    expect(r.unmatchedBlinds).toBe(1);
  });

  it("another player's flash on the same tick is not mine", () => {
    const r = report([flash(100), blind(100, O1, 2, 1, MATE), flash(100, 1, MATE)]);
    expect(r.flashes).toHaveLength(1);
    expect(r.flashes[0]!.enemies).toBe(0);
  });

  it("per-flash metrics need the minimum sample, then are DERIVED", () => {
    const few = report([flash(100), blind(100, O1, 2)]);
    expect(few.metrics["utility.flash_effective_rate"]).toMatchObject({
      status: "INSUFFICIENT_SAMPLE",
      value: null,
    });
    const events: UtilityEventRow[] = [];
    for (let i = 0; i < MIN_SAMPLE.flashes; i++) {
      events.push(flash(1000 + i * 100));
      if (i < 3) events.push(blind(1000 + i * 100, O1, 2));
    }
    const ok = report(events);
    expect(ok.metrics["utility.flash_effective_rate"]).toMatchObject({
      status: "DERIVED",
      value: 0.6,
    });
    expect(ok.metrics["utility.enemies_blinded_per_flash"]!.value).toBe(0.6);
    expect(ok.metrics["utility.enemy_blind_seconds_per_flash"]!.value).toBe(1.2);
    expect(ok.metrics["utility.flash_effective_rate"]!.evidence_refs).toHaveLength(3);
  });

  it("no blind rows in the match: flash effect NOT_OBSERVED, never 0", () => {
    const r = report([flash(100), flash(200)], { blindsRecorded: false });
    for (const k of [
      "utility.flash_effective_rate",
      "utility.enemies_blinded_per_flash",
      "utility.enemy_blind_seconds_per_flash",
      "utility.teammates_blinded",
      "utility.self_blinded",
    ])
      expect(r.metrics[k]).toMatchObject({ status: "NOT_OBSERVED", value: null });
    expect(r.unmatchedBlinds).toBeNull();
    expect(r.metrics["utility.flashes_detonated"]).toMatchObject({ status: "OBSERVED", value: 2 });
  });

  it("no thrower on detonations: detonations and flash effect NOT_OBSERVED", () => {
    const r = report([], { detonationsAttributed: false, throwsAttributed: false });
    expect(r.metrics["utility.flashes_detonated"]).toMatchObject({
      status: "NOT_OBSERVED",
      value: null,
    });
    expect(r.grenades.find((g) => g.grenade === "flash")).toMatchObject({
      detonations: null,
      throws: null,
    });
    expect(r.metrics["utility.he_damage_per_grenade"]!.status).toBe("NOT_OBSERVED");
  });
});

describe("grenades, damage and phases", () => {
  it("counts throws only when attributed, fire only when recorded, decoy never detonates", () => {
    const events = [
      ev({ type: "weapon_fire", tick: 50, actor: ME, weapon: "flashbang" }),
      ev({ type: "weapon_fire", tick: 60, actor: ME, weapon: "molotov" }),
      ev({ type: "weapon_fire", tick: 61, actor: ME, weapon: "incgrenade" }),
      ev({ type: "weapon_fire", tick: 70, actor: ME, weapon: "ak47" }),
      flash(100),
      ev({ type: "incendiary", tick: 120, actor: ME }),
    ];
    const r = report(events);
    const by = Object.fromEntries(r.grenades.map((g) => [g.grenade, g]));
    expect(by["flash"]).toMatchObject({ throws: 1, detonations: 1 });
    expect(by["fire"]).toMatchObject({ throws: 2, detonations: 1 });
    expect(by["decoy"]).toMatchObject({ throws: 0, detonations: null });
    const legacy = report(events, { throwsAttributed: false, fireRecorded: false });
    const lb = Object.fromEntries(legacy.grenades.map((g) => [g.grenade, g]));
    expect(lb["flash"]).toMatchObject({ throws: null, detonations: 1 });
    expect(lb["fire"]).toMatchObject({ throws: null, detonations: null });
    expect(legacy.metrics["utility.fire_damage_per_grenade"]!.status).toBe("NOT_OBSERVED");
  });

  it("splits HE and fire damage by the victim's side and counts utility kills on enemies", () => {
    const events = [
      ev({ type: "damage", tick: 10, actor: ME, victim: O1, weapon: "hegrenade", damage: 40 }),
      ev({ type: "damage", tick: 10, actor: ME, victim: MATE, weapon: "hegrenade", damage: 12 }),
      ev({ type: "damage", tick: 20, actor: ME, victim: O2, weapon: "inferno", damage: 8 }),
      ev({ type: "damage", tick: 20, actor: ME, victim: ME, weapon: "inferno", damage: 5 }),
      ev({ type: "damage", tick: 30, actor: ME, victim: O2, weapon: "ak47", damage: 27 }),
      ev({ type: "kill", tick: 40, actor: ME, victim: O1, weapon: "hegrenade" }),
      ev({ type: "kill", tick: 41, actor: ME, victim: MATE, weapon: "inferno" }),
    ];
    const r = report(events);
    expect(r.damage.he).toEqual({ enemy: 40, team: 12, hits: 1 });
    expect(r.damage.fire).toEqual({ enemy: 8, team: 0, hits: 1 });
    expect(r.metrics["utility.team_damage"]!.value).toBe(12);
    expect(r.metrics["utility.kills"]!.value).toBe(1);
  });

  it("HE damage per grenade needs 5 detonations", () => {
    const hes = Array.from({ length: MIN_SAMPLE.grenades }, (_, i) =>
      ev({ type: "he", tick: 100 + i, actor: ME }),
    );
    const dmg = ev({
      type: "damage",
      tick: 100,
      actor: ME,
      victim: O1,
      weapon: "hegrenade",
      damage: 50,
    });
    expect(report([hes[0]!, dmg]).metrics["utility.he_damage_per_grenade"]!.status).toBe(
      "INSUFFICIENT_SAMPLE",
    );
    expect(report([...hes, dmg]).metrics["utility.he_damage_per_grenade"]).toMatchObject({
      status: "DERIVED",
      value: 10,
    });
  });

  it("phases each detonation against the round's first kill and the plant", () => {
    const events = [
      ev({ type: "smoke", tick: 100, actor: ME, roundNumber: 2 }),
      ev({ type: "kill", tick: 200, actor: O1, victim: MATE, roundNumber: 2 }),
      ev({ type: "smoke", tick: 300, actor: ME, roundNumber: 2 }),
      ev({ type: "bomb_plant", tick: 400, actor: O2, roundNumber: 2 }),
      ev({ type: "smoke", tick: 500, actor: ME, roundNumber: 2 }),
      ev({ type: "smoke", tick: 600, actor: ME, roundNumber: 9 }),
    ];
    const smoke = report(events).grenades.find((g) => g.grenade === "smoke")!;
    expect(smoke.phases).toEqual({
      before_first_kill: 1,
      after_first_kill: 1,
      after_plant: 1,
      unphased: 1,
    });
  });
});

describe("flash assists", () => {
  it("game flag is OBSERVED, timed attribution INFERRED, unknown NOT_MEASURED", () => {
    expect(
      report([], { flashAssists: 2, flashAssistMethod: "GAME_FLAG" }).metrics[
        "utility.flash_assist"
      ],
    ).toMatchObject({ status: "OBSERVED", value: 2 });
    expect(
      report([], { flashAssists: 1, flashAssistMethod: "MIXED" }).metrics["utility.flash_assist"],
    ).toMatchObject({ status: "INFERRED", value: 1 });
    expect(
      report([], { flashAssists: 3, flashAssistMethod: "NOT_RECORDED" }).metrics[
        "utility.flash_assist"
      ],
    ).toMatchObject({ status: "NOT_MEASURED", value: null });
  });
});
