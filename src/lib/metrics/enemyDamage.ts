/**
 * `enemy-hp-v1` — the damage behind the ADR shown to players: ENEMY HEALTH REMOVED.
 *
 * Product decision (owner, 2026-11-24): health actually removed from enemies, each hit capped at
 * the victim's remaining health; team, self and world damage never count; hits whose sides are
 * unknown are excluded and reported as a coverage limitation, never presumed enemy damage.
 *
 * Why: `player_hurt.dmg_health` is not capped in CS2 demos (production max 456) and the historical
 * `match_metrics.adr` also counted team and self damage. That `adr` is kept unchanged as the input
 * of `pro-score-v1` and `dna-weighted-v2`.
 *
 * Health removed by one hit, per round and victim (every victim starts each round at 100; no
 * healing in competitive CS2, so health only goes down):
 *
 *  1. The hit carries the game's `health_after` (HEALTH_AFTER, order-free):
 *     - victim survived (health_after > 0): removed = dmg_health exactly;
 *     - lethal hit (health_after = 0): removed = the health before it = the lowest health_after
 *       among the victim's surviving hits in that round, or 100 when there is none. This needs no
 *       tick order, so hits without a tick are safe. It is only trusted when the victim's chain is
 *       consistent (sorted by health, each hit's health before = the previous health_after ± 1 HP,
 *       the first starting at 100) and the round has exactly one lethal hit on that victim; otherwise
 *       a hit is missing or duplicated and the lethal hit is UNCERTAIN.
 *  2. No `health_after` (RECONSTRUCTED): the health is walked by tick from 100 over ALL attackers.
 *     Only valid when every hit on that victim in the round has a tick and none carries
 *     `health_after` mixed in; otherwise the player's hits on that victim are UNCERTAIN.
 *
 * A player's hit counts only on a victim PROVEN to be on the other side in that round. Uncertain
 * and unknown-side hits are never added: they are reported so the value is shown as PARTIAL.
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

/** true = same side/team, false = opposite, null = unknown, for two keys in a round. */
export type SameSide = (round: number, a: string, b: string) => boolean | null;

export interface EnemyDamageResult {
  /** Enemy health removed by the player, in hit points, over the CERTAIN enemy hits only. */
  enemyHp: number;
  /** Damage the game reported on those same hits, before the health cap. */
  enemyRaw: number;
  enemyHits: number;
  teamHits: number;
  selfHits: number;
  /** Player hits whose victim side is unknown in that round (excluded). */
  unknownSideHits: number;
  /** Player hits on an enemy whose removed health cannot be determined (excluded). */
  uncertainHits: number;
  /** Stored-twice hits (any actor) dropped before the walk; diagnostic only. */
  duplicateHits: number;
  playerHits: number;
  method: EnemyDamageMethod | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Health removed by each hit of one victim in one round; null where it cannot be determined. */
function removedPerHit(list: readonly DamageHit[]): Array<number | null> {
  const dmg = list.map((h) => Math.max(0, num(h.damage) ?? 0));
  const after = list.map((h) => num(h.healthAfter));
  const allHealth = after.every((a) => a !== null);
  const noHealth = after.every((a) => a === null);

  if (allHealth) {
    const surviving = list
      .map((_, i) => i)
      .filter((i) => (after[i] as number) > 0)
      .sort((a, b) => (after[b] as number) - (after[a] as number));
    // Chain check over the surviving hits: health before = previous health_after (start 100).
    let prev = 100;
    let consistent = true;
    for (const i of surviving) {
      // ±1 HP: production shows dmg_health and health_after differing by one (88 → 75 on a
      // 12-damage hit); a missing hit of 2+ HP still breaks the chain.
      if (Math.abs(dmg[i]! + (after[i] as number) - prev) > 1) consistent = false;
      prev = after[i] as number;
    }
    const lethal = list.map((_, i) => i).filter((i) => (after[i] as number) <= 0);
    return list.map((_, i) => {
      if ((after[i] as number) > 0) return dmg[i]!;
      if (!consistent || lethal.length !== 1) return null;
      return Math.min(dmg[i]!, prev);
    });
  }

  if (noHealth && list.every((h) => num(h.tick) !== null)) {
    const idx = list.map((_, i) => i);
    idx.sort(
      (a, b) =>
        (list[a]!.tick as number) - (list[b]!.tick as number) ||
        String(list[a]!.order).localeCompare(String(list[b]!.order), "en", { numeric: true }),
    );
    const out: Array<number | null> = list.map(() => null);
    let health = 100;
    for (const i of idx) {
      const removed = Math.min(dmg[i]!, Math.max(0, health));
      out[i] = removed;
      health -= removed;
    }
    return out;
  }

  // Mixed health_after within one victim, or a hit without a tick and no health_after: unknown.
  return list.map(() => null);
}

export function enemyHealthDamage(
  hits: readonly DamageHit[],
  playerKey: string,
  sameSide: SameSide,
): EnemyDamageResult {
  const groups = new Map<string, DamageHit[]>();
  // Exact duplicates: a hit that damaged (dmg > 0) and carries health_after is unique per round
  // and victim, because health only goes down — the same actor, damage and health_after twice is
  // one event stored twice, whatever its tick. Hits without health_after cannot be told apart from
  // two real identical hits, so they are kept (RECONSTRUCTED still caps them at 100 per round).
  const seen = new Set<string>();
  let duplicateHits = 0;
  for (const h of hits) {
    if (!h.victim) continue;
    const d = num(h.damage);
    const ha = num(h.healthAfter);
    if (ha !== null && d !== null && d > 0) {
      const dup = `${h.round}\u0000${h.victim}\u0000${h.actor ?? ""}\u0000${d}\u0000${ha}`;
      if (seen.has(dup)) {
        duplicateHits += 1;
        continue;
      }
      seen.add(dup);
    }
    const key = `${h.round}\u0000${h.victim}`;
    const list = groups.get(key);
    if (list) list.push(h);
    else groups.set(key, [h]);
  }
  const out: EnemyDamageResult = {
    enemyHp: 0,
    enemyRaw: 0,
    enemyHits: 0,
    teamHits: 0,
    selfHits: 0,
    unknownSideHits: 0,
    uncertainHits: 0,
    duplicateHits: 0,
    playerHits: 0,
    method: null,
  };
  let withHealth = 0;
  let withoutHealth = 0;
  for (const list of groups.values()) {
    const removed = removedPerHit(list);
    list.forEach((h, i) => {
      if (h.actor !== playerKey) return;
      out.playerHits += 1;
      if (h.victim === playerKey) {
        out.selfHits += 1;
        return;
      }
      const same = sameSide(h.round, playerKey, h.victim as string);
      if (same === null) {
        out.unknownSideHits += 1;
        return;
      }
      if (same) {
        out.teamHits += 1;
        return;
      }
      const r = removed[i];
      if (r === null || r === undefined) {
        out.uncertainHits += 1;
        return;
      }
      out.enemyHits += 1;
      out.enemyHp += r;
      out.enemyRaw += Math.max(0, num(h.damage) ?? 0);
      if (num(h.healthAfter) !== null) withHealth += 1;
      else withoutHealth += 1;
    });
  }
  out.duplicateHits = duplicateHits;
  out.enemyHp = Math.round(out.enemyHp);
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

export interface RoundEnemyDamage {
  /** Certain enemy health removed by the player in the round. */
  enemyHp: number;
  /** Player hits on non-teammates left out (unknown side or undeterminable removal). */
  excludedHits: number;
}

/**
 * enemy-hp-v1 per round — the SAME `enemyHealthDamage`, applied round by round, for round-level
 * surfaces (Rounds, X-ray round context, Coach round facts). Hits must include EVERY attacker's
 * damage on the victims of the round (other players' hits are needed to know the health left);
 * they are only read server-side and never returned. Rounds where the player hit nobody are absent.
 */
export function enemyHpByRound(
  hits: readonly DamageHit[],
  playerKey: string,
  sameSide: SameSide,
): Map<number, RoundEnemyDamage> {
  const byRound = new Map<number, DamageHit[]>();
  for (const h of hits) {
    const list = byRound.get(h.round);
    if (list) list.push(h);
    else byRound.set(h.round, [h]);
  }
  const out = new Map<number, RoundEnemyDamage>();
  for (const [round, list] of byRound) {
    if (!list.some((h) => h.actor === playerKey)) continue;
    const r = enemyHealthDamage(list, playerKey, sameSide);
    out.set(round, { enemyHp: r.enemyHp, excludedHits: r.unknownSideHits + r.uncertainHits });
  }
  return out;
}
