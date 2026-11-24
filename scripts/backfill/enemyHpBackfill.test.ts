/**
 * enemy-hp-v1 BACKFILL / SIMULATION harness (read-only; it never touches the database).
 *
 * Runs the SAME functions the ingestion pipeline uses — `enemyHealthDamage`
 * (src/lib/metrics/enemyDamage.ts) and `sameTeamInRound` (src/lib/pipeline/metrics.ts) — over
 * damage events exported from production, and writes:
 *   - <out>.json : per row match_id, player_id, rounds, old adr, enemy hp, new adr, method, exclusions;
 *   - <out>.sql  : guarded UPDATEs (only the 3 new columns; `adr` is never written).
 *
 * Input (ENEMY_HP_BACKFILL_INPUT): TSV `match_id, player_id, rounds_played, adr, partial_parse, events`,
 * events = `round,tick,actor,victim,damage,health_after,player_side,victim_side` joined by `;`,
 * with the player as `ME` and every other key replaced by a short hash (no PII leaves the DB).
 * Column 7 is the player's own side in that round, column 8 the victim's (empty = unknown).
 *
 * Skipped unless ENEMY_HP_BACKFILL_INPUT is set, so CI never depends on exported data.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { ENEMY_DAMAGE_METHOD_VERSION, enemyHealthDamage } from "@/lib/metrics/enemyDamage";
import { sameTeamInRound } from "@/lib/pipeline/metrics";

const input = process.env.ENEMY_HP_BACKFILL_INPUT ?? "";
const outBase = process.env.ENEMY_HP_BACKFILL_OUT ?? "/tmp/enemy-hp-backfill";
const round1 = (v: number) => Math.round(v * 10) / 10;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test.skipIf(!input || !existsSync(input))("enemy-hp-v1 backfill simulation", () => {
  const rows = readFileSync(input, "utf8").trim().split("\n");
  const result = [];
  const sql: string[] = [];
  for (const line of rows) {
    const [matchId, playerId, rounds, adr, partial, ev] = line.split("\t");
    expect(matchId).toMatch(uuid);
    expect(playerId).toMatch(uuid);
    const sides = new Map<number, Record<string, string>>();
    const hits = (ev ?? "")
      .split(";")
      .filter(Boolean)
      .map((s, i) => {
        const [r, tick, actor, victim, dmg, ha, sp, sv] = s.split(",");
        const round = Number(r);
        const m = sides.get(round) ?? {};
        if (sp) m["ME"] = sp;
        if (sv && victim) m[victim] = sv;
        sides.set(round, m);
        return {
          round,
          tick: tick === "" ? null : Number(tick),
          order: i,
          actor: actor === "" ? null : actor!,
          victim: victim === "" ? null : victim!,
          damage: dmg === "" ? null : Number(dmg),
          healthAfter: ha === "" ? null : Number(ha),
        };
      });
    // Only per-round sides are evidence (match-level team is empty for these rows in production).
    const match = {
      players: [],
      rounds: [...sides.entries()].map(([roundNumber, s]) => ({ roundNumber, sides: s })),
    } as never;
    const n = Number(rounds);
    // Same rule as the pipeline: partial extraction → UNAVAILABLE (null), never a partial number.
    const res =
      partial === "true" || !(n > 0)
        ? null
        : enemyHealthDamage(hits, "ME", (round, a, b) => sameTeamInRound(match, a, b, round));
    const excluded = res ? res.unknownSideHits + res.uncertainHits : null;
    result.push({
      matchId,
      playerId,
      roundsPlayed: n,
      adrHistorical: Number(adr),
      damageEnemyHp: res?.enemyHp ?? null,
      adrEnemyHp: res ? round1(res.enemyHp / n) : null,
      method: res?.method ?? null,
      excludedHits: excluded,
      status: res === null ? "UNAVAILABLE" : excluded! > 0 ? "PARTIAL" : "COMPLETE",
      diagnostics: res && {
        playerHits: res.playerHits,
        enemyHits: res.enemyHits,
        teamHits: res.teamHits,
        selfHits: res.selfHits,
        unknownSideHits: res.unknownSideHits,
        uncertainHits: res.uncertainHits,
        duplicateHits: res.duplicateHits,
        enemyRawBeforeCap: res.enemyRaw,
      },
    });
    if (res && res.method) {
      sql.push(
        `UPDATE public.match_metrics SET damage_enemy_hp = ${res.enemyHp}, damage_enemy_hp_method = '${res.method}', damage_enemy_hp_excluded_hits = ${excluded} ` +
          `WHERE match_id = '${matchId}' AND player_id = '${playerId}' AND rounds_played = ${n} AND adr = ${adr} AND damage_enemy_hp IS NULL;`,
      );
    }
  }
  writeFileSync(
    `${outBase}.json`,
    JSON.stringify({ method: ENEMY_DAMAGE_METHOD_VERSION, rows: result }, null, 1),
  );
  writeFileSync(`${outBase}.sql`, sql.join("\n") + "\n");
});
