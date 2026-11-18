/**
 * PM4 4.2.7 — `cs2.economy.v1`: team bands (Xenopoulos et al., Table 1), pistol by economy reset,
 * warmup equipment on round 1, missing spend, mixed buys, roster != 5, and player vs team labels.
 */
import { describe, expect, it } from "vitest";

import { classifyRoundEconomy, isPistolRound, type EconomyPlayerRound } from "@/lib/rounds/economy";

const P = (
  key: string,
  side: "T" | "CT",
  moneyStart: number | null,
  equipmentStart: number | null,
  moneySpent: number | null,
): EconomyPlayerRound => ({ participantKey: key, side, moneyStart, equipmentStart, moneySpent });
const team = (
  side: "T" | "CT",
  start: number,
  equip: number,
  spent: number | null,
  prefix = side,
) => Array.from({ length: 5 }, (_, i) => P(`${prefix}${i}`, side, start, equip, spent));
const classify = (players: EconomyPlayerRound[], spendRecorded = true, me: string | null = "T0") =>
  classifyRoundEconomy({ roundNumber: 5, players, spendRecorded }, me);
const cat = (r: ReturnType<typeof classify>, side: "T" | "CT") => r.teams[side]!.label;

describe("team bands", () => {
  it.each([
    // equip per player, spend per player, expected (×5 players)
    [200, 300, "eco"],
    [200, 600, "low_buy"],
    [200, 1600, "half_buy"],
    [700, 300, "hero_low_buy"],
    [700, 1600, "hero_half_buy"],
    [1000, 3000, "full_buy"],
    [3000, 1000, "full_buy"],
  ])("equip %i + spend %i per player => %s", (equip, spent, expected) => {
    const r = classify([...team("T", 4000, equip, spent), ...team("CT", 4000, 1000, 3000)]);
    expect(cat(r, "T")).toEqual({ status: "CLASSIFIED", category: expected, scaled: false });
  });

  it("thresholds are inclusive at 20 000 total", () => {
    const r = classify([...team("T", 4000, 1000, 3000), ...team("CT", 4000, 999, 3000)]);
    expect(cat(r, "T")).toMatchObject({ category: "full_buy" });
    expect(cat(r, "CT")).toMatchObject({ category: "hero_half_buy" });
  });

  it("a team of 4 uses thresholds × 4/5 and is flagged scaled", () => {
    const four = team("T", 4000, 1000, 3000).slice(0, 4);
    const r = classify([...four, ...team("CT", 4000, 1000, 3000)]);
    expect(cat(r, "T")).toEqual({ status: "CLASSIFIED", category: "full_buy", scaled: true });
  });
});

describe("pistol and reset rules", () => {
  it("economy reset (every player of both teams at the same money <= 1000) is a pistol", () => {
    const players = [...team("T", 800, 200, 650), ...team("CT", 800, 200, 700)];
    expect(isPistolRound(players)).toBe(true);
    expect(cat(classify(players), "T")).toMatchObject({ category: "pistol" });
  });

  it("round 1 with warmup equipment is still a pistol, and its equipment is never shown", () => {
    const players = [...team("T", 800, 3400, 650), ...team("CT", 800, 3600, 700)];
    const r = classify(players);
    expect(r.pistol).toBe(true);
    expect(r.player).toMatchObject({ equipmentStart: null, moneyStart: 800 });
  });

  it("overtime start money (equal but > 1000) is not a pistol", () => {
    const players = [...team("T", 12500, 0, 5000), ...team("CT", 12500, 0, 5000)];
    expect(isPistolRound(players)).toBe(false);
  });

  it("a single player with different money breaks the reset", () => {
    const players = [...team("T", 800, 200, 0), ...team("CT", 800, 200, 0)];
    players[3] = P("T3", "T", 1050, 200, 0);
    expect(isPistolRound(players)).toBe(false);
  });
});

describe("missing data and player vs team", () => {
  it("spend not recorded (match before R5.8.31) => UNKNOWN, never eco", () => {
    const r = classify([...team("T", 4000, 0, null), ...team("CT", 4000, 0, null)], false);
    expect(cat(r, "T")).toEqual({ status: "UNKNOWN", reason: "SPEND_NOT_RECORDED" });
    expect(r.player?.label).toEqual({ status: "UNKNOWN", reason: "SPEND_NOT_RECORDED" });
  });

  it("one missing value makes the team UNKNOWN (no partial sum)", () => {
    const t = team("T", 4000, 1000, 3000);
    t[2] = P("T2", "T", 4000, null, 3000);
    expect(cat(classify([...t, ...team("CT", 4000, 1000, 3000)]), "T")).toEqual({
      status: "UNKNOWN",
      reason: "VALUE_MISSING",
    });
  });

  it("mixed buy: the team label is not given to a saving player", () => {
    const t = [
      ...team("T", 6000, 200, 4800).slice(0, 4),
      P("T4", "T", 1400, 200, 0), // saved
    ];
    const r = classify([...t, ...team("CT", 4000, 1000, 3000)], true, "T4");
    expect(cat(r, "T")).toMatchObject({ category: "full_buy" });
    expect(r.teams.T!.mixed).toBe(true);
    expect(r.player?.label).toMatchObject({ category: "eco" });
  });

  it("caller absent from the round => no player row", () => {
    expect(
      classify([...team("T", 4000, 0, 0), ...team("CT", 4000, 0, 0)], true, "x").player,
    ).toBeNull();
  });
});
