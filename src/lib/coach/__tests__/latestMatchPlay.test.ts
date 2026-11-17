/**
 * PM3 — Coach integration of modules C/D: the latest match's duels and utility reach the Coach
 * compacted from the same reports the pages render; non-valued statuses carry null (never 0);
 * no player identity, match id, round or tick is sent; numbers sent are accepted by the guard.
 */
import { describe, expect, it } from "vitest";

import { buildCombatReport, type CombatEventRow, type CombatInput } from "@/lib/combat/duels";
import { buildLatestMatchPlay, compactMetric } from "@/lib/coach/latestMatchPlay";
import { factNumbers, backed } from "@/lib/coach/coachReplyGuard";
import { coachSystemPrompt } from "@/lib/coach/coachContext";
import { envelope } from "@/lib/metrics/metricContract";
import type { OverviewMatch } from "@/lib/playerOverview";
import { buildUtilityReport, type UtilityEventRow, type UtilityInput } from "@/lib/utility/utility";

const MATCH = "33333333-3333-4333-8333-333333333333";
const ME = "76561190000000001";
const OPP = "76561190000000002";
const roster = [
  { roundNumber: 1, participantKey: ME, side: "CT" as const },
  { roundNumber: 1, participantKey: OPP, side: "T" as const },
];
const rounds = [
  { roundNumber: 1, startTick: 0, endTick: 99999, winnerSide: null, winReason: null },
];
const cRow = (
  o: Partial<CombatEventRow> & Pick<CombatEventRow, "type" | "tick">,
): CombatEventRow => ({
  id: `c${o.tick}${o.type}`,
  roundNumber: 1,
  timeSeconds: null,
  actor: null,
  victim: null,
  weapon: null,
  headshot: null,
  distance: null,
  damage: null,
  hitgroup: null,
  ...o,
});
const uRow = (
  o: Partial<UtilityEventRow> & Pick<UtilityEventRow, "type" | "tick">,
): UtilityEventRow => ({
  id: `u${o.tick}${o.type}${o.victim ?? ""}`,
  roundNumber: 1,
  actor: null,
  victim: null,
  weapon: null,
  damage: null,
  flashDuration: null,
  ...o,
});
const combatInput: CombatInput = {
  matchId: MATCH,
  rounds,
  roundPlayers: roster,
  events: [
    cRow({ type: "damage", tick: 640, actor: ME, victim: OPP, weapon: "ak47", damage: 100 }),
    cRow({
      type: "kill",
      tick: 640,
      actor: ME,
      victim: OPP,
      weapon: "ak47",
      headshot: true,
      distance: 12,
    }),
  ],
  shotsAttributed: false,
  hitGroupsRecorded: false,
};
const utilityInput: UtilityInput = {
  matchId: MATCH,
  rounds,
  roundPlayers: roster,
  events: [
    uRow({ type: "flash", tick: 100, actor: ME }),
    uRow({ type: "flash", tick: 100, actor: ME, victim: OPP, flashDuration: 2.25 }),
  ],
  throwsAttributed: false,
  blindsRecorded: true,
  detonationsAttributed: true,
  fireRecorded: false,
  flashAssists: 1,
  flashAssistMethod: "GAME_FLAG",
};
const match = { matchId: MATCH, map: "de_dust2", dateSource: "processed" } as OverviewMatch;
const play = () =>
  buildLatestMatchPlay(
    match,
    { report: buildCombatReport(combatInput, ME), shotsAttributed: false },
    { report: buildUtilityReport(utilityInput, ME), blindsRecorded: true, throwsAttributed: false },
  );

describe("latestMatchPlay", () => {
  it("compacts ratios as percentages and keeps non-valued statuses null", () => {
    const ratio = envelope({
      metric_key: "x",
      value: 0.6251,
      unit: "ratio",
      status: "DERIVED",
      provenance_method: "m",
      sample_size: { n: 32, unit: "duels" },
      coverage: null,
      evidence_refs: [],
    });
    expect(compactMetric(ratio)).toMatchObject({ value: 62.5, unit: "percent", status: "DERIVED" });
    const small = envelope({ ...ratio, value: null, status: "INSUFFICIENT_SAMPLE" });
    expect(compactMetric(small).value).toBeNull();
  });

  it("carries the page numbers, never identities, ids, rounds or ticks", () => {
    const p = play();
    expect(p.combat!.duels).toEqual({ total: 1, won: 1, lost: 0, withoutKill: 0 });
    expect(p.combat!.notMeasured).toEqual([
      "crosshair_placement",
      "counter_strafe",
      "recoil_control",
    ]);
    expect(p.combat!.metrics.map((m) => m.metric)).not.toContain("combat.crosshair_placement");
    const fa = p.utility!.metrics.find((m) => m.metric === "utility.flash_assist")!;
    expect(fa).toMatchObject({ status: "OBSERVED", value: 1 });
    const flash = p.utility!.grenades.find((g) => g.grenade === "flash")!;
    expect(flash).toMatchObject({ throws: null, detonations: 1, beforeFirstKill: 1 });
    expect(p.utility!.grenades.find((g) => g.grenade === "fire")!.detonations).toBeNull();
    const json = JSON.stringify(p);
    for (const secret of [ME, OPP, MATCH, '"tick"', '"round"', "evidence_refs"])
      expect(json).not.toContain(secret);
  });

  it("numbers it sends are accepted by the reply guard", () => {
    const p = play();
    const facts = factNumbers({ latestMatchPlay: p });
    const enemiesPerFlash = p.utility!.metrics.find(
      (m) => m.metric === "utility.enemies_blinded_per_flash",
    )!;
    // One flash: under the minimum sample → no number to quote.
    expect(enemiesPerFlash).toMatchObject({ status: "INSUFFICIENT_SAMPLE", value: null });
    expect(backed(1, 0, facts)).toBe(true);
  });

  it("the system prompt states the rule for latest-match duels and utility in every locale", () => {
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"] as const) {
      const prompt = coachSystemPrompt(l);
      expect(prompt).toContain("26. Duels, aim and utility");
      expect(prompt).toContain("latestMatchPlay.utility");
    }
  });
});
