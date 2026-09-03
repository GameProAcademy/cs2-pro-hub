/**
 * Metrics engine: CanonicalMatch -> CanonicalMetrics (per player).
 *
 * Pure and deterministic (unit tested without parser/database).
 *
 * KAST DEFINITION (documented, not copied from an external product)
 * ----------------------------------------------------------------
 * A round counts towards KAST for a player when AT LEAST ONE of:
 *   K - the player got a kill in the round;
 *   A - the player got an assist (including flash assists) in the round;
 *   S - the player survived the round (no death event for the player);
 *   T - the player died and the death was traded, i.e. an enemy killed the
 *       player's killer within TRADE_WINDOW_SECONDS of the player's death.
 * KAST = (qualifying rounds / rounds played) * 100, rounded to 1 decimal.
 * Rounds the player did not participate in are excluded from the denominator.
 *
 * TRADE DEFINITION
 * ----------------
 * A death is "traded" when a teammate kills the killer within
 * TRADE_WINDOW_SECONDS. A kill is a "trade kill" when its victim killed one of
 * the attacker's teammates within the same window. The window is configuration
 * (TRADE_WINDOW_SECONDS), never inlined.
 *
 * source_rating is a transparent, documented composite derived ONLY from this
 * match. It is explicitly NOT the CS2 PRO Score (later phase).
 */
import { EARLY_DEATH_SECONDS, TRADE_WINDOW_SECONDS } from "@/config/pipeline";
import type { CanonicalEvent, CanonicalMatch, CanonicalMetrics, Side } from "@/lib/pipeline/types";

interface KillRecord {
  round: number;
  time: number;
  attacker: string | null;
  victim: string | null;
  assister: string | null;
  headshot: boolean | null;
  flashAssister: string | null;
}

const round1 = (v: number) => Number(v.toFixed(1));
const round3 = (v: number) => Number(v.toFixed(3));

function eventTime(event: CanonicalEvent): number {
  return event.timeSeconds ?? (event.tick ?? 0) / 64;
}

function teamOf(match: CanonicalMatch, steamId: string): string | null {
  return match.players.find((p) => p.steamId === steamId)?.team ?? null;
}

function sideOf(match: CanonicalMatch, steamId: string, roundNumber: number): Side | null {
  const round = match.rounds.find((r) => r.roundNumber === roundNumber);
  return round?.sides[steamId] ?? match.players.find((p) => p.steamId === steamId)?.side ?? null;
}

function collectKills(match: CanonicalMatch): KillRecord[] {
  const flashAssists = new Map<string, string>(); // `${round}:${victim}` -> flasher
  for (const event of match.events) {
    if (event.type === "flash" && event.actorSteamId && event.victimSteamId) {
      flashAssists.set(`${event.roundNumber}:${event.victimSteamId}`, event.actorSteamId);
    }
  }

  return match.events
    .filter((e) => e.type === "kill")
    .map((e) => ({
      round: e.roundNumber,
      time: eventTime(e),
      attacker: e.actorSteamId,
      victim: e.victimSteamId,
      assister: e.assisterSteamId,
      headshot: e.headshot,
      flashAssister: e.victimSteamId
        ? flashAssists.get(`${e.roundNumber}:${e.victimSteamId}`) ?? null
        : null,
    }))
    .sort((a, b) => a.round - b.round || a.time - b.time);
}

/** Opening duel of a round: the chronologically first kill. */
export function openingDuels(kills: KillRecord[]) {
  const byRound = new Map<number, KillRecord>();
  for (const kill of kills) if (!byRound.has(kill.round)) byRound.set(kill.round, kill);
  return byRound;
}

/** True when `death` was traded within the configured window. */
function wasTraded(kills: KillRecord[], death: KillRecord, match: CanonicalMatch): boolean {
  if (!death.attacker || !death.victim) return false;
  const victimTeam = teamOf(match, death.victim);
  return kills.some(
    (k) =>
      k.round === death.round &&
      k.time > death.time &&
      k.time - death.time <= TRADE_WINDOW_SECONDS &&
      k.victim === death.attacker &&
      (victimTeam == null || teamOf(match, k.attacker ?? "") === victimTeam),
  );
}

/** Clutch detection: player alive alone against N living enemies. */
function clutchStats(match: CanonicalMatch, kills: KillRecord[], steamId: string) {
  const team = teamOf(match, steamId);
  let attempts = 0;
  let wins = 0;

  for (const round of match.rounds) {
    const roundKills = kills.filter((k) => k.round === round.roundNumber);
    const participants = match.players.filter(
      (p) => round.sides[p.steamId] != null || p.team != null,
    );
    const teammates = participants.filter((p) => p.team === team).map((p) => p.steamId);
    const enemies = participants.filter((p) => p.team !== team).map((p) => p.steamId);
    if (!teammates.includes(steamId) || enemies.length === 0) continue;

    const dead = new Set<string>();
    let clutch = false;
    for (const kill of roundKills) {
      if (kill.victim) dead.add(kill.victim);
      const aliveMates = teammates.filter((id) => !dead.has(id));
      const aliveEnemies = enemies.filter((id) => !dead.has(id));
      if (aliveMates.length === 1 && aliveMates[0] === steamId && aliveEnemies.length >= 1) {
        clutch = true;
        break;
      }
    }
    if (!clutch) continue;
    attempts += 1;

    const playerSide = round.sides[steamId] ?? sideOf(match, steamId, round.roundNumber);
    const survived = !roundKills.some((k) => k.victim === steamId);
    const wonRound =
      (round.winnerSide != null && playerSide != null && round.winnerSide === playerSide) ||
      (round.winnerTeam != null && team != null && round.winnerTeam === team);
    if (survived && wonRound) wins += 1;
  }

  return { attempts, wins };
}

export function computeMetrics(match: CanonicalMatch, steamId: string): CanonicalMetrics {
  const kills = collectKills(match);
  const opening = openingDuels(kills);

  const playerKills = kills.filter((k) => k.attacker === steamId);
  const playerDeaths = kills.filter((k) => k.victim === steamId);
  const assists = kills.filter((k) => k.assister === steamId).length;
  const flashAssists = kills.filter((k) => k.flashAssister === steamId && k.attacker !== steamId)
    .length;

  // Rounds the player ACTUALLY participated in. The denominator is never the
  // raw round count of the demo: a round only counts when the resolved Steam ID
  // is present in that round (side assignment, economy entry or an event).
  const roundNumbers = new Set<number>();
  for (const round of match.rounds) {
    const hasSide = round.sides[steamId] != null;
    const hasEconomy =
      round.moneyStart[steamId] != null ||
      round.moneyEnd[steamId] != null ||
      round.equipmentValue[steamId] != null;
    const inEvents = match.events.some(
      (event) =>
        event.roundNumber === round.roundNumber &&
        (event.actorSteamId === steamId ||
          event.victimSteamId === steamId ||
          event.assisterSteamId === steamId),
    );
    if (hasSide || hasEconomy || inEvents) roundNumbers.add(round.roundNumber);
  }
  const roundsPlayed = roundNumbers.size;

  const damageEvents = match.events.filter((e) => e.type === "damage");
  const damageGiven = damageEvents
    .filter((e) => e.actorSteamId === steamId)
    .reduce((sum, e) => sum + (e.damage ?? 0), 0);
  const damageTaken = damageEvents
    .filter((e) => e.victimSteamId === steamId)
    .reduce((sum, e) => sum + (e.damage ?? 0), 0);

  const utilityTypes = new Set(["he", "molotov", "incendiary"]);
  const utilityDamage = damageEvents
    .filter(
      (e) =>
        e.actorSteamId === steamId &&
        typeof e.weapon === "string" &&
        /hegrenade|molotov|inferno|incgrenade|flashbang|decoy|smoke/i.test(e.weapon),
    )
    .reduce((sum, e) => sum + (e.damage ?? 0), 0);
  const grenadesUsed = match.events.filter(
    (e) => utilityTypes.has(e.type) || e.type === "flash" || e.type === "smoke",
  ).filter((e) => e.actorSteamId === steamId).length;
  const enemiesFlashed = match.events
    .filter((e) => e.type === "flash" && e.actorSteamId === steamId)
    .reduce((sum, e) => sum + Number(e.data["players_flashed"] ?? 1), 0);

  // Opening duels
  let firstKills = 0;
  let firstDeaths = 0;
  for (const [, kill] of opening) {
    if (kill.attacker === steamId) firstKills += 1;
    if (kill.victim === steamId) firstDeaths += 1;
  }
  const openingAttempts = firstKills + firstDeaths;
  const openingSuccessRate = openingAttempts > 0 ? round3(firstKills / openingAttempts) : null;

  // Trades
  let tradeKills = 0;
  for (const kill of playerKills) {
    const victimTeam = teamOf(match, kill.victim ?? "");
    const traded = kills.some(
      (k) =>
        k.round === kill.round &&
        k.time < kill.time &&
        kill.time - k.time <= TRADE_WINDOW_SECONDS &&
        k.attacker === kill.victim &&
        teamOf(match, k.victim ?? "") === teamOf(match, steamId) &&
        victimTeam !== teamOf(match, steamId),
    );
    if (traded) tradeKills += 1;
  }
  let tradeDeaths = 0;
  for (const death of playerDeaths) if (wasTraded(kills, death, match)) tradeDeaths += 1;
  const untradedDeaths = playerDeaths.length - tradeDeaths;
  const earlyDeaths = playerDeaths.filter((d) => d.time <= EARLY_DEATH_SECONDS).length;

  // Multi-kills
  const perRound = new Map<number, number>();
  for (const kill of playerKills) {
    perRound.set(kill.round, (perRound.get(kill.round) ?? 0) + 1);
  }
  const breakdown = { k2: 0, k3: 0, k4: 0, ace: 0 };
  for (const count of perRound.values()) {
    if (count === 2) breakdown.k2 += 1;
    else if (count === 3) breakdown.k3 += 1;
    else if (count === 4) breakdown.k4 += 1;
    else if (count >= 5) breakdown.ace += 1;
  }
  const multiKills = breakdown.k2 + breakdown.k3 + breakdown.k4 + breakdown.ace;

  // KAST (see header)
  let kastRounds = 0;
  for (const roundNumber of roundNumbers) {
    const roundKills = kills.filter((k) => k.round === roundNumber);
    const got = roundKills.some((k) => k.attacker === steamId);
    const assisted = roundKills.some(
      (k) => k.assister === steamId || (k.flashAssister === steamId && k.attacker !== steamId),
    );
    const death = roundKills.find((k) => k.victim === steamId);
    const survived = !death;
    const traded = death ? wasTraded(kills, death, match) : false;
    if (got || assisted || survived || traded) kastRounds += 1;
  }

  const headshots = playerKills.filter((k) => k.headshot === true).length;
  const clutch = clutchStats(match, kills, steamId);

  // Side ratings use the same composite formula restricted to CT/T rounds.
  const sideRating = (side: Side): number | null => {
    const sideRounds = match.rounds.filter(
      (r) => (r.sides[steamId] ?? sideOf(match, steamId, r.roundNumber)) === side,
    );
    if (sideRounds.length === 0) return null;
    const nums = new Set(sideRounds.map((r) => r.roundNumber));
    const k = playerKills.filter((x) => nums.has(x.round)).length;
    const d = playerDeaths.filter((x) => nums.has(x.round)).length;
    const dmg = damageEvents
      .filter((e) => e.actorSteamId === steamId && nums.has(e.roundNumber))
      .reduce((sum, e) => sum + (e.damage ?? 0), 0);
    return round3(compositeRating(k, d, dmg, sideRounds.length));
  };

  const adr = roundsPlayed > 0 ? round1(damageGiven / roundsPlayed) : null;

  return {
    steamId,
    roundsPlayed,
    kills: playerKills.length,
    deaths: playerDeaths.length,
    assists,
    headshots,
    hsPercent: playerKills.length > 0 ? round1((headshots / playerKills.length) * 100) : null,
    damageGiven: round1(damageGiven),
    damageTaken: round1(damageTaken),
    adr,
    kast: roundsPlayed > 0 ? round1((kastRounds / roundsPlayed) * 100) : null,
    firstKills,
    firstDeaths,
    openingAttempts,
    openingSuccess: firstKills,
    openingSuccessRate,
    tradeKills,
    tradeDeaths,
    untradedDeaths,
    earlyDeaths,
    clutchAttempts: clutch.attempts,
    clutchWins: clutch.wins,
    multiKills,
    multiKillBreakdown: breakdown,
    utilityDamage: round1(utilityDamage),
    grenadeDamage: round1(utilityDamage),
    flashAssists,
    enemiesFlashed,
    grenadesUsed,
    ctRating: sideRating("CT"),
    tRating: sideRating("T"),
    sourceRating:
      roundsPlayed > 0
        ? round3(compositeRating(playerKills.length, playerDeaths.length, damageGiven, roundsPlayed))
        : null,
    damageEfficiency: damageTaken > 0 ? round3(damageGiven / damageTaken) : null,
  };
}

/**
 * Documented composite rating for a single match:
 *   0.45 * (kills/round / 0.70) + 0.25 * (1 - deaths/round / 0.75)
 * + 0.30 * (ADR / 80)
 * The denominators are reference values for a solid player; the result is a
 * relative indicator of this match only.
 */
export function compositeRating(
  kills: number,
  deaths: number,
  damage: number,
  rounds: number,
): number {
  if (rounds <= 0) return 0;
  const kpr = kills / rounds;
  const dpr = deaths / rounds;
  const adr = damage / rounds;
  const value = 0.45 * (kpr / 0.7) + 0.25 * (1 - dpr / 0.75) + 0.3 * (adr / 80);
  return Math.max(0, value);
}
