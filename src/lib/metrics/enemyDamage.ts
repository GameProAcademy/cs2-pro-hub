/**
 * `enemy-hp-v1` — the damage behind ADR: ENEMY HEALTH REMOVED.
 *
 * UX-1.0 audit (production, 2026-11-24): the persisted `adr` summed `player_hurt.dmg_health`
 * for every victim. In CS2 demos that value is NOT capped at the victim's remaining health (an
 * AK-47 headshot reads 142, an AWP up to 459) and it also counted team and self damage. On the
 * audited matches this inflated ADR by up to ~40 % (de_mirage 123.5 → 75.0). The convention of
 * the game scoreboard, FACEIT, Leetify, HLTV and awpy is health removed from ENEMIES, each hit
 * capped at the health the victim had left; team, self and world damage do not count.
 *
 * Rules (pure, deterministic, shared by ingestion and the historical recompute):
 *  - Every victim starts each round with 100 health (competitive CS2 has no healing).
 *  - Hits are walked in (tick, order) per round and victim, over ALL attackers (also world /
 *    unattributed damage), so the remaining health is right when the player's hit lands.
 *  - When the hit carries the game's `health_after`, it is authoritative: a hit that leaves the
 *    victim alive removed exactly its damage; a lethal hit removed the health tracked before it.
 *    The tracker is then re-synchronised to `health_after`. Without it, the health is
 *    reconstructed (`RECONSTRUCTED`).
 *  - Only the player's hits on a victim PROVEN to be on the other side in that round count.
 *    Self hits, team hits and hits whose sides are unknown never count; unknown sides are
 *    reported (coverage), never assumed to be enemies.
 */
export const ENEMY_DAMAGE_METHOD_VERSION = "enemy-hp-v1";

export type EnemyDamageMethod = "HEALTH_AFTER" | "RECONSTRUCTED" | "MIXED";

export interface DamageHit {
  round: number;
  tick: number | null;
  /** Stable tie-breaker for hits on the same tick (event id or original index). */
  order: string | number;
  actor: string | null;
  victim: string | null;
  damage: number | null;
  /** The game's victim health right after the hit (`player_hurt.health`), when recorded. */
  healthAfter: number | null;
}

/** true = same side, false = opposite sides, null = unknown, for two keys in a round. */
export type SameSide = (round: number, a: string, b: string) => boolean | null;

export interface EnemyDamageResult {
  /** Enemy health removed by the player, in hit points. */
  enemyHp: number;
  /** Damage the game reported on those same enemy hits, before the health cap. */
  enemyRaw: number;
  teamHits: number;
  selfHits: number;
  /** Player hits whose victim side is unknown in that round (excluded, never counted). */
  unknownSideHits: number;
  playerHits: number;
  method: EnemyDamageMethod | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const compareHits = (a: DamageHit, b: DamageHit) =>
  (a.tick ?? Number.MAX_SAFE_INTEGER) - (b.tick ?? Number.MAX_SAFE_INTEGER) ||
  String(a.order).localeCompare(String(b.order), "en", { numeric: true });

export function enemyHealthDamage(
  hits: readonly DamageHit[],
  playerKey: string,
  sameSide: SameSide,
): EnemyDamageResult {
  const groups = new Map<string, DamageHit[]>();
  for (const h of hits) {
    if (!h.victim) continue;
    const key = `${h.round}\u0000${h.victim}`;
    const list = groups.get(key);
    if (list) list.push(h);
    else groups.set(key, [h]);
  }
  const out: EnemyDamageResult = {
    enemyHp: 0,
    enemyRaw: 0,
    teamHits: 0,
    selfHits: 0,
    unknownSideHits: 0,
    playerHits: 0,
    method: null,
  };
  let withHealth = 0;
  let withoutHealth = 0;
  for (const list of groups.values()) {
    list.sort(compareHits);
    let health = 100;
    for (const h of list) {
      const damage = Math.max(0, num(h.damage) ?? 0);
      const after = num(h.healthAfter);
      let removed: number;
      if (after !== null) {
        const left = Math.max(0, after);
        // A hit the victim survived removed exactly its damage (the game says so); a lethal
        // hit removed the health the victim still had, never more than the hit itself.
        removed = left > 0 ? damage : Math.min(damage, Math.max(0, health));
        health = left;
      } else {
        removed = Math.min(damage, Math.max(0, health));
        health = Math.max(0, health - removed);
      }
      if (h.actor !== playerKey) continue;
      out.playerHits += 1;
      if (h.victim === playerKey) {
        out.selfHits += 1;
        continue;
      }
      const same = sameSide(h.round, playerKey, h.victim as string);
      if (same === null) {
        out.unknownSideHits += 1;
        continue;
      }
      if (same) {
        out.teamHits += 1;
        continue;
      }
      out.enemyHp += removed;
      out.enemyRaw += damage;
      if (after !== null) withHealth += 1;
      else withoutHealth += 1;
    }
  }
  out.method =
    withHealth + withoutHealth === 0
      ? null
      : withoutHealth === 0
        ? "HEALTH_AFTER"
        : withHealth === 0
          ? "RECONSTRUCTED"
          : "MIXED";
  return out;
}
