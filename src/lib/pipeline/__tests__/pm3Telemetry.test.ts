/**
 * PM3 (R5.8.30) — the normalizer keeps the new telemetry fields in round_events.data exactly as the
 * worker sent them, and keeps them absent when the worker did not send them (never a default).
 */
import { describe, expect, it } from "vitest";

import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserEvent, RawParserOutput } from "@/lib/pipeline/types";

import { ME, ENEMY_A, syntheticParserOutput } from "./fixture";

const withEvents = (events: RawParserEvent[]): RawParserOutput => ({
  ...syntheticParserOutput,
  events: [...syntheticParserOutput.events, ...events],
});
const find = (raw: RawParserOutput, pred: (e: { type: string; tick: number | null }) => boolean) =>
  normalizeParserOutput(raw).events.filter(pred);

describe("PM3 telemetry in the normalizer", () => {
  const events: RawParserEvent[] = [
    { type: "weapon_fire", round: 1, tick: 900001, attacker: ME, weapon: "ak47", silenced: false },
    { type: "weapon_fire", round: 1, tick: 900002, weapon: "glock" },
    {
      type: "player_hurt",
      round: 1,
      tick: 900003,
      attacker: ME,
      victim: ENEMY_A,
      weapon: "ak47",
      damage: 27,
      hitgroup: "chest",
      health_after: 0,
    },
    {
      type: "player_death",
      round: 1,
      tick: 900004,
      attacker: ME,
      victim: ENEMY_A,
      weapon: "ak47",
      hitgroup: "head",
      thru_smoke: true,
      attacker_in_air: false,
    },
    {
      type: "inferno_startburn",
      round: 1,
      tick: 900005,
      attacker: ME,
      detonation_position: { x: 1, y: 2, z: 3 },
    },
    { type: "smokegrenade_detonate", round: 1, tick: 900006, attacker: ME },
  ];
  const out = normalizeParserOutput(withEvents(events)).events.filter(
    (e) => (e.tick ?? 0) >= 900001,
  );
  const at = (tick: number) => out.find((e) => e.tick === tick)!;

  it("weapon_fire carries its shooter and weapon; a shot without shooter has no actor", () => {
    expect(at(900001)).toMatchObject({ type: "weapon_fire", actorSteamId: ME, weapon: "ak47" });
    expect(at(900001).data["silenced"]).toBe(false);
    expect(at(900002).actorSteamId).toBeNull();
    expect(at(900002).data).not.toHaveProperty("silenced");
  });

  it("damage keeps hitgroup and a legitimate health_after of 0", () => {
    expect(at(900003).data).toMatchObject({ hitgroup: "chest", health_after: 0 });
  });

  it("kill keeps hitgroup, through-smoke and airborne flags", () => {
    expect(at(900004).data).toMatchObject({
      hitgroup: "head",
      thru_smoke: true,
      attacker_in_air: false,
    });
  });

  it("inferno_startburn becomes an incendiary event with thrower and fire position", () => {
    expect(at(900005)).toMatchObject({ type: "incendiary", actorSteamId: ME });
    expect(at(900005).data["detonation_position"]).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("absent fields stay absent (never defaulted)", () => {
    expect(at(900006).data).not.toHaveProperty("detonation_position");
    const legacyKill = find(syntheticParserOutput, (e) => e.type === "kill")[0]!;
    for (const key of ["hitgroup", "thru_smoke", "attacker_in_air", "health_after"])
      expect(legacyKill.data).not.toHaveProperty(key);
  });
});
