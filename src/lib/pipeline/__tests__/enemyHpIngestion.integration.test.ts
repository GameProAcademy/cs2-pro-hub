/**
 * UX-1.0 enemy-hp-v1 — ingestion path end to end, without production data:
 *   parser output (every damage case) → normalizeParserOutput → computeMetrics
 *   → projectionMetricsPayload (the object persistence.server.ts sends)
 *   → persist_demo_projection from the PRODUCTION migration, on a disposable PostgreSQL.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { projectionMetricsPayload } from "@/lib/pipeline/projectionPayload";
import type { RawParserEvent, RawParserOutput } from "@/lib/pipeline/types";

import { ENEMY_A, ENEMY_B, MATE, ME, syntheticParserOutput } from "./fixture";

const STRANGER = "76561198000000199"; // never has a side: unknown-side victim

function hurt(
  round: number,
  tick: number,
  attacker: string | null,
  victim: string,
  damage: number,
  healthAfter: number | null,
): RawParserEvent {
  const e: Record<string, unknown> = {
    type: "player_hurt",
    round,
    tick,
    time_seconds: tick / 64,
    attacker,
    victim,
    damage,
    weapon: "ak47",
  };
  if (healthAfter !== null) e["health_after"] = healthAfter;
  return e as unknown as RawParserEvent;
}

/** Every case of the enemy-hp-v1 rule, one per round (rounds 1–5 ME is CT, enemies T). */
export function ingestionFixture(): RawParserOutput {
  const raw = structuredClone(syntheticParserOutput) as RawParserOutput;
  const events = (raw.events as RawParserEvent[]).filter((e) => e.type !== "player_hurt");
  events.push(
    // R1 enemy: 30 non-lethal, then a 115 lethal hit on 70 HP → 30 + 70 = 100 (overkill capped).
    hurt(1, 100, ME, ENEMY_A, 30, 70),
    hurt(1, 200, ME, ENEMY_A, 115, 0),
    // R2 multiple attackers: MATE takes 60, ME finishes with a 90 hit on 40 HP → ME 40.
    hurt(2, 6500, MATE, ENEMY_B, 60, 40),
    hurt(2, 6600, ME, ENEMY_B, 90, 0),
    // R3 team, self and world damage: none counts, none is "excluded" (they are not enemy hits).
    hurt(3, 12900, ME, MATE, 25, 75),
    hurt(3, 13000, ME, ME, 10, 90),
    hurt(3, 13100, null, ME, 5, 85),
    // R4 unknown side: the victim has no side in that round → excluded, reported.
    hurt(4, 19300, ME, STRANGER, 50, 50),
    // R5 incomplete: one hit without health_after mixed with one with it → uncertain, excluded.
    hurt(5, 25700, MATE, ENEMY_A, 30, 70),
    hurt(5, 25800, ME, ENEMY_A, 40, null),
  );
  (raw as unknown as { events: RawParserEvent[] }).events = events;
  (raw as unknown as { players: Array<Record<string, unknown>> }).players.push({
    steam_id: STRANGER,
    name: "stranger",
  });
  return raw;
}

describe("enemy-hp-v1 ingestion (disposable PostgreSQL)", () => {
  const metrics = computeMetrics(normalizeParserOutput(ingestionFixture()), ME);
  const payload = projectionMetricsPayload(metrics);

  it("the pipeline applies every case of the rule", () => {
    expect(metrics.damageEnemyHp).toBe(140); // 100 (R1) + 40 (R2)
    expect(metrics.damageEnemyHpExcludedHits).toBe(2); // R4 unknown side + R5 uncertain
    expect(metrics.damageEnemyHpMethod).toBe("HEALTH_AFTER");
    expect(metrics.adrEnemyHp).toBe(14); // 140 ÷ 10 rounds; partial because excluded > 0
    // The historical adr keeps its own meaning (every dmg_health, uncapped, all victims).
    expect(metrics.adr).not.toBe(metrics.adrEnemyHp);
    expect(payload).toMatchObject({
      damage_enemy_hp: 140,
      damage_enemy_hp_method: "HEALTH_AFTER",
      damage_enemy_hp_excluded_hits: 2,
      adr: metrics.adr,
      rounds_played: 10,
    });
  });

  it("persist_demo_projection stores it, idempotently, without touching anything else", () => {
    const dir = mkdtempSync(join(tmpdir(), "enemyhp-payload-"));
    const file = join(dir, "payload.json");
    writeFileSync(file, JSON.stringify(payload));
    chmodSync(dir, 0o755);
    chmodSync(file, 0o644);
    try {
      const out = execFileSync("python3", ["scripts/enemy-hp-ingestion-harness.py"], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 180_000,
        env: { PATH: process.env["PATH"], HOME: "/tmp", ENEMY_HP_PAYLOAD: file },
      });
      const result = JSON.parse(out.trim().split("\n").pop()!) as {
        checks: Record<string, boolean>;
        failures: string[];
        observed: { row?: string };
        teardown: boolean;
      };
      expect(result.failures).toEqual([]);
      expect(Object.keys(result.checks).length).toBe(11);
      expect(result.observed.row).toBe(`140|HEALTH_AFTER|2|${metrics.adr}|10`);
      expect(result.teardown).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 200_000);
});
