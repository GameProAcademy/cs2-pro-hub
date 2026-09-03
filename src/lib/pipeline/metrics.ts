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
 *   S - the player provably survived the round (see `playerSurvivedRound`: the
 *       mere absence of a death event is NOT survival);
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
import {
  EARLY_DEATH_SECONDS,
  FLASH_ASSIST_WINDOW_SECONDS,
  TRADE_WINDOW_SECONDS,
} from "@/config/pipeline";
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

/**
 * Side of a player IN A SPECIFIC ROUND.
 *
 * Only per-round information is trusted: a player changes side at halftime, so
 * the side of another round (or a match-level default) is NOT evidence for this
 * round. Without per-round data the answer is null.
 */
export function sideInRound(
  match: CanonicalMatch,
  steamId: string,
  roundNumber: number,
): Side | null {
  const round = match.rounds.find((r) => r.roundNumber === roundNumber);
  return round?.sides[steamId] ?? null;
}

/** True when the resolved player is provably present in the round. */
export function participatedInRound(
  match: CanonicalMatch,
  steamId: string,
  roundNumber: number,
): boolean {
  const round = match.rounds.find((r) => r.roundNumber === roundNumber);
  if (!round) return false;
  if (round.sides[steamId] != null) return true;
  if (
    round.moneyStart[steamId] != null ||
    round.moneyEnd[steamId] != null ||
    round.equipmentValue[steamId] != null
  ) {
    return true;
  }
  return match.events.some(
    (event) =>
      event.roundNumber === roundNumber &&
      (event.actorSteamId === steamId ||
        event.victimSteamId === steamId ||
        event.assisterSteamId === steamId),
  );
}

/**
 * Survival of a player in a round — the single definition used by metrics,
 * features and persistence.
 *
 * `false` requires an explicit death event. `true` requires positive evidence:
 * the player participated, the round provably ended and the round's events were
 * actually extracted (complete parse). Anything weaker is `null`: a missing
 * death event is NOT proof of survival.
 */
export function playerSurvivedRound(
  match: CanonicalMatch,
  steamId: string,
  roundNumber: number,
): boolean | null {
  const round = match.rounds.find((r) => r.roundNumber === roundNumber);
  if (!round) return null;

  const died = match.events.some(
    (event) =>
      event.type === "kill" && event.roundNumber === roundNumber && event.victimSteamId === steamId,
  );
  if (died) return false;

  if (!participatedInRound(match, steamId, roundNumber)) return null;
  if (match.quality.partialParse) return null;

  const roundEnded =
    round.endTick != null ||
    round.durationSeconds != null ||
    round.winnerSide != null ||
    round.winnerTeam != null;
  if (!roundEnded) return null;

  // The round must actually carry extracted combat/round events; otherwise the
  // absence of a death event says nothing at all.
  const hasRoundEvidence = match.events.some(
    (event) =>
      event.roundNumber === roundNumber &&
      (event.type === "kill" || event.type === "damage" || event.type === "round_end"),
  );
  if (!hasRoundEvidence) return null;

  return true;
}

interface FlashRecord {
  round: number;
  time: number;
  flasher: string;
  victim: string;
}

function collectKills(match: CanonicalMatch): KillRecord[] {
  const flashes: FlashRecord[] = [];
  for (const event of match.events) {
    if (event.type !== "flash") continue;
    if (!event.actorSteamId || !event.victimSteamId) continue;
    if (event.actorSteamId === event.victimSteamId) continue; // self-flash
    flashes.push({
      round: event.roundNumber,
      time: eventTime(event),
      flasher: event.actorSteamId,
      victim: event.victimSteamId,
    });
  }

  /**
   * Flash assist attribution: temporal, at most ONE per kill.
   * The flash must precede the kill, be inside FLASH_ASSIST_WINDOW_SECONDS,
   * target the same victim, and not come from the killer itself. Among the
   * eligible flashes only the most recent one is credited.
   */
  const flashAssisterFor = (kill: KillRecord): string | null => {
    if (!kill.victim) return null;
    let best: FlashRecord | null = null;
    for (const flash of flashes) {
      if (flash.round !== kill.round) continue;
      if (flash.victim !== kill.victim) continue;
      if (flash.flasher === kill.attacker) continue;
      if (flash.time > kill.time) continue;
      if (kill.time - flash.time > FLASH_ASSIST_WINDOW_SECONDS) continue;
      if (!best || flash.time > best.time) best = flash;
    }
    return best?.flasher ?? null;
  };

  return match.events
    .filter((e) => e.type === "kill")
    .map((e) => {
      const kill: KillRecord = {
        round: e.roundNumber,
        time: eventTime(e),
        attacker: e.actorSteamId,
        victim: e.victimSteamId,
        assister: e.assisterSteamId,
        headshot: e.headshot,
        flashAssister: null,
      };
      kill.flashAssister = flashAssisterFor(kill);
      return kill;
    })
    .sort((a, b) => a.round - b.round || a.time - b.time);
}

/** Opening duel of a round: the chronologically first kill. */
export function openingDuels(kills: KillRecord[]) {
  const byRound = new Map<number, KillRecord>();
  for (const kill of kills) if (!byRound.has(kill.round)) byRound.set(kill.round, kill);
  return byRound;
}

/**
 * True when `death` was traded within the configured window.
 *
 * Required evidence: same round, chronological order, both Steam IDs present,
 * the avenger kills exactly the original killer, the avenger belongs to the
 * victim's team and is not the victim itself, and the original death is not a
 * team kill or a suicide.
 */
function wasTraded(kills: KillRecord[], death: KillRecord, match: CanonicalMatch): boolean {
  if (!death.attacker || !death.victim) return false;
  if (death.attacker === death.victim) return false; // suicide
  const victimTeam = teamOf(match, death.victim);
  const killerTeam = teamOf(match, death.attacker);
  if (victimTeam != null && killerTeam != null && victimTeam === killerTeam) return false;

  return kills.some((k) => {
    if (!k.attacker || !k.victim) return false;
    if (k.round !== death.round) return false;
    if (k.victim !== death.attacker) return false;
    if (k.attacker === k.victim) return false;
    if (k.attacker === death.victim) return false;
    if (k.time <= death.time) return false;
    if (k.time - death.time > TRADE_WINDOW_SECONDS) return false;
    const avengerTeam = teamOf(match, k.attacker);
    // The avenger must be a teammate of the original victim, and must not kill
    // one of its own (team kills never count as trades).
    if (victimTeam == null || avengerTeam == null) return false;
    if (avengerTeam !== victimTeam) return false;
    return teamOf(match, k.victim) !== avengerTeam;
  });
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

    const playerSide = sideInRound(match, steamId, round.roundNumber);
    const survived = playerSurvivedRound(match, steamId, round.roundNumber) === true;
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
  const flashAssists = kills.filter(
    (k) => k.flashAssister === steamId && k.attacker !== steamId,
  ).length;

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
  const grenadesUsed = match.events
    .filter((e) => utilityTypes.has(e.type) || e.type === "flash" || e.type === "smoke")
    .filter((e) => e.actorSteamId === steamId).length;
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
  // A trade kill is the offensive half of a trade: the player kills an enemy
  // who, within the window and in the same round, had just killed one of the
  // player's teammates. Team kills, suicides and events without Steam IDs are
  // never counted.
  const ownTeam = teamOf(match, steamId);
  let tradeKills = 0;
  for (const kill of playerKills) {
    if (!kill.attacker || !kill.victim) continue;
    if (kill.attacker === kill.victim) continue;
    const victimTeam = teamOf(match, kill.victim);
    if (ownTeam == null || victimTeam == null || victimTeam === ownTeam) continue;
    const traded = kills.some((k) => {
      if (!k.attacker || !k.victim) return false;
      if (k.round !== kill.round) return false;
      if (k.attacker !== kill.victim) return false;
      if (k.attacker === k.victim) return false;
      if (k.time >= kill.time) return false;
      if (kill.time - k.time > TRADE_WINDOW_SECONDS) return false;
      // The player killed first must really belong to the player's team.
      return teamOf(match, k.victim) === ownTeam;
    });
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
    // Survival uses the shared definition: absence of a death event is not
    // survival unless there is positive evidence for it.
    const survived = playerSurvivedRound(match, steamId, roundNumber) === true;
    const traded = death ? wasTraded(kills, death, match) : false;
    if (got || assisted || survived || traded) kastRounds += 1;
  }

  const headshots = playerKills.filter((k) => k.headshot === true).length;
  const clutch = clutchStats(match, kills, steamId);

  // Side ratings use the same composite formula restricted to CT/T rounds.
  const sideRating = (side: Side): number | null => {
    const sideRounds = match.rounds.filter(
      (r) => sideInRound(match, steamId, r.roundNumber) === side,
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
        ? round3(
            compositeRating(playerKills.length, playerDeaths.length, damageGiven, roundsPlayed),
          )
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
