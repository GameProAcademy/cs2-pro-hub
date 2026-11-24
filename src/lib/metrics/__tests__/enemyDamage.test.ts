import { describe, expect, it } from "vitest";

import { enemyHealthDamage, type DamageHit } from "@/lib/metrics/enemyDamage";

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
});
