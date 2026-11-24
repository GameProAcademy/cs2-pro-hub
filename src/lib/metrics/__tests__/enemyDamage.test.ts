import { describe, expect, it } from "vitest";

import { enemyHealthDamage, enemyHpByRound, type DamageHit } from "@/lib/metrics/enemyDamage";

const ME = "me";
// Round 1: me and "ally" on CT; "e1", "e2" on T; "ghost" has no side in the round.
const SIDE: Record<string, "CT" | "T"> = { me: "CT", ally: "CT", e1: "T", e2: "T" };
const sameSide = (_r: number, a: string, b: string) =>
  SIDE[a] && SIDE[b] ? SIDE[a] === SIDE[b] : null;

let order = 0;
const hit = (o: Partial<DamageHit>): DamageHit => ({
  round: 1,
  tick: 100 + order,
  order: order++,
  actor: ME,
  victim: "e1",
  damage: 27,
  healthAfter: null,
  ...o,
});

describe("enemy-hp-v1 — enemy health removed, each hit capped", () => {
  it("caps a lethal hit at the health the victim still had (game health_after)", () => {
    // 28 → 72 left, 28 → 44 left, then a 118 headshot kills: only 44 was removed.
    const hits = [
      hit({ damage: 28, healthAfter: 72 }),
      hit({ damage: 28, healthAfter: 44 }),
      hit({ damage: 118, healthAfter: 0 }),
    ];
    const r = enemyHealthDamage(hits, ME, sameSide);
    expect(r).toMatchObject({ enemyHp: 100, enemyRaw: 174, method: "HEALTH_AFTER" });
  });

  it("reconstructs the cap from 100 per round when health_after is absent", () => {
    const hits = [
      hit({ damage: 27 }),
      hit({ damage: 27 }),
      hit({ damage: 27 }),
      hit({ damage: 27 }),
    ];
    // 27 × 4 = 108 but the victim only had 100.
    expect(enemyHealthDamage(hits, ME, sameSide)).toMatchObject({
      enemyHp: 100,
      enemyRaw: 108,
      method: "RECONSTRUCTED",
    });
  });

  it("counts other attackers' hits when tracking the victim's health", () => {
    // A teammate takes e2 to 10; my 142 headshot only removes 10.
    const hits = [
      hit({ actor: "ally", victim: "e2", damage: 90, healthAfter: 10 }),
      hit({ victim: "e2", damage: 142, healthAfter: 0 }),
    ];
    expect(enemyHealthDamage(hits, ME, sameSide).enemyHp).toBe(10);
  });

  it("excludes team, self and unknown-side hits — never assumed to be enemies", () => {
    const hits = [
      hit({ victim: "ally", damage: 37 }),
      hit({ victim: ME, damage: 5 }),
      hit({ victim: "ghost", damage: 101 }),
      hit({ victim: "e1", damage: 20 }),
    ];
    expect(enemyHealthDamage(hits, ME, sameSide)).toMatchObject({
      enemyHp: 20,
      teamHits: 1,
      selfHits: 1,
      unknownSideHits: 1,
      playerHits: 4,
    });
  });

  it("restarts every victim at 100 health each round", () => {
    const hits = [
      hit({ round: 1, damage: 100, healthAfter: 0 }),
      hit({ round: 2, damage: 100, healthAfter: 0 }),
    ];
    expect(enemyHealthDamage(hits, ME, sameSide).enemyHp).toBe(200);
  });

  it("orders hits on the same tick deterministically and ignores null damage", () => {
    const a = enemyHealthDamage(
      [
        hit({ tick: 5, order: 2, damage: 60 }),
        hit({ tick: 5, order: 1, damage: 60 }),
        hit({ damage: null }),
      ],
      ME,
      sameSide,
    );
    expect(a.enemyHp).toBe(100);
  });

  it("reports MIXED when only some hits carry health_after, and null with no enemy hit", () => {
    expect(
      enemyHealthDamage(
        [hit({ damage: 10, healthAfter: 90 }), hit({ victim: "e2", damage: 10 })],
        ME,
        sameSide,
      ).method,
    ).toBe("MIXED");
    expect(enemyHealthDamage([], ME, sameSide)).toMatchObject({ enemyHp: 0, method: null });
  });

  // ---- UX-1.0 regression cases requested by the owner (2026-11-24) ----

  it("does not depend on tick order when health_after is recorded (null ticks, shuffled input)", () => {
    const ordered = [
      hit({ damage: 28, healthAfter: 72 }),
      hit({ actor: "ally2", damage: 28, healthAfter: 44 }),
      hit({ damage: 118, healthAfter: 0 }),
    ];
    const noTicks = ordered.map((h) => ({ ...h, tick: null }));
    const shuffled = [noTicks[2]!, noTicks[0]!, noTicks[1]!];
    // 28 (mine) + 44 (my lethal hit removed the 44 left after the ally's 28).
    expect(enemyHealthDamage(ordered, ME, sameSide).enemyHp).toBe(72);
    expect(enemyHealthDamage(shuffled, ME, sameSide)).toMatchObject({
      enemyHp: 72,
      uncertainHits: 0,
    });
  });

  it("a hit without tick and without health_after makes that victim's walk UNCERTAIN, never placed last", () => {
    const r = enemyHealthDamage(
      [hit({ damage: 60 }), hit({ actor: "ally2", damage: 60, tick: null }), hit({ damage: 60 })],
      ME,
      sameSide,
    );
    expect(r).toMatchObject({ enemyHp: 0, uncertainHits: 2, enemyHits: 0 });
  });

  it("survived hits remove exactly dmg_health; the lethal hit removes the health left before it", () => {
    // dmg + health_after = health before, within the observed ±1 HP rounding.
    const r = enemyHealthDamage(
      [
        hit({ damage: 12, healthAfter: 88 }),
        hit({ damage: 12, healthAfter: 75 }), // 12 + 75 = 87 ≈ 88 (±1)
        hit({ damage: 142, healthAfter: 0 }),
      ],
      ME,
      sameSide,
    );
    expect(r).toMatchObject({ enemyHp: 12 + 12 + 75, enemyRaw: 166, uncertainHits: 0 });
  });

  it("several attackers on one victim: each removes only what it actually took", () => {
    const r = enemyHealthDamage(
      [
        hit({ actor: "ally", damage: 40, healthAfter: 60 }),
        hit({ damage: 30, healthAfter: 30 }),
        hit({ actor: "ally2", damage: 27, healthAfter: 3 }),
        hit({ damage: 99, healthAfter: 0 }),
      ],
      ME,
      sameSide,
    );
    expect(r.enemyHp).toBe(30 + 3);
  });

  it("a missing hit before the lethal one makes ONLY the lethal hit uncertain", () => {
    // 28 → 72, then (missing 30) → 42 observed as 20 → 22, then lethal: chain 72 → (20+22=42) breaks.
    const r = enemyHealthDamage(
      [
        hit({ damage: 28, healthAfter: 72 }),
        hit({ damage: 20, healthAfter: 22 }),
        hit({ damage: 100, healthAfter: 0 }),
      ],
      ME,
      sameSide,
    );
    expect(r).toMatchObject({ enemyHp: 48, enemyHits: 2, uncertainHits: 1 });
  });

  it("two lethal hits on the same victim in a round make the lethal hit uncertain", () => {
    const r = enemyHealthDamage(
      [hit({ damage: 100, healthAfter: 0 }), hit({ actor: "ally2", damage: 100, healthAfter: 0 })],
      ME,
      sameSide,
    );
    expect(r).toMatchObject({ enemyHp: 0, uncertainHits: 1 });
  });

  it("drops a stored-twice event instead of counting it twice", () => {
    const once = hit({ damage: 27, healthAfter: 73 });
    const r = enemyHealthDamage(
      [once, { ...once, order: "dup" }, hit({ damage: 100, healthAfter: 0 })],
      ME,
      sameSide,
    );
    expect(r).toMatchObject({ enemyHp: 100, duplicateHits: 1, uncertainHits: 0 });
  });

  it("mixing hits with and without health_after on one victim is uncertain, not guessed", () => {
    const r = enemyHealthDamage(
      [
        hit({ damage: 30, healthAfter: 70 }),
        hit({ actor: "ally2", damage: 30 }),
        hit({ damage: 80, healthAfter: 0 }),
      ],
      ME,
      sameSide,
    );
    expect(r).toMatchObject({ enemyHp: 0, uncertainHits: 2 });
  });

  it("uses each round's sides: the same opponent is an enemy before AND after the side swap", () => {
    // Round 1: me CT vs opp T; round 13: me T vs opp CT; a teammate stays a teammate.
    const bySide: Record<number, Record<string, "CT" | "T">> = {
      1: { me: "CT", mate: "CT", opp: "T" },
      13: { me: "T", mate: "T", opp: "CT" },
    };
    const swap = (r: number, a: string, b: string) =>
      bySide[r]?.[a] && bySide[r]?.[b] ? bySide[r]![a] === bySide[r]![b] : null;
    const r = enemyHealthDamage(
      [
        hit({ round: 1, victim: "opp", damage: 20, healthAfter: 80 }),
        hit({ round: 13, victim: "opp", damage: 20, healthAfter: 80 }),
        hit({ round: 13, victim: "mate", damage: 20, healthAfter: 80 }),
      ],
      ME,
      swap,
    );
    expect(r).toMatchObject({ enemyHp: 40, teamHits: 1, enemyHits: 2 });
  });

  it("counts an unknown-side victim as excluded coverage, never as enemy damage", () => {
    const r = enemyHealthDamage(
      [hit({ victim: "ghost", damage: 101, healthAfter: 0 })],
      ME,
      sameSide,
    );
    expect(r).toMatchObject({ enemyHp: 0, unknownSideHits: 1, enemyHits: 0, method: null });
  });
});

describe("enemyHpByRound (round surfaces use the same function)", () => {
  const side = (round: number, a: string, b: string) => {
    // P and T1 are teammates in every round; E1 is on the other side; U has no side.
    const team = (k: string) => (k === "P" || k === "T1" ? "A" : k === "E1" ? "B" : null);
    const ta = team(a);
    const tb = team(b);
    return ta && tb ? ta === tb : null;
  };
  const hit = (round: number, tick: number, actor: string, victim: string, damage: number) => ({
    round,
    tick,
    order: tick,
    actor,
    victim,
    damage,
    healthAfter: null,
  });

  it("caps per round, resets health each round, and counts exclusions per round", () => {
    const m = enemyHpByRound(
      [
        hit(1, 1, "T1", "E1", 60),
        hit(1, 2, "P", "E1", 90), // only 40 health left
        hit(2, 3, "P", "E1", 90), // new round: full 100
        hit(2, 4, "P", "U", 30), // unknown side → excluded
        hit(3, 5, "T1", "E1", 50), // the player did not hit anyone → absent
      ],
      "P",
      side,
    );
    expect(m.get(1)).toEqual({ enemyHp: 40, excludedHits: 0 });
    expect(m.get(2)).toEqual({ enemyHp: 90, excludedHits: 1 });
    expect(m.has(3)).toBe(false);
  });
});
