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
import {
  hasDamageEvidence,
  hasKillEvidence,
  hasUtilityEvidence,
  isUtilityEvent,
} from "@/lib/pipeline/evidence";
import type {
  CanonicalEvent,
  CanonicalMatch,
  CanonicalMetrics,
  MetricsAvailability,
  Side,
} from "@/lib/pipeline/types";

interface KillRecord {
  round: number;
  /**
   * Seconds inside the round. NULL when the parser gave neither `time_seconds`
   * nor a usable tickrate: a fabricated timestamp would fabricate trades,
   * flash assists and early deaths.
   */
  time: number | null;
  attacker: string | null;
  victim: string | null;
  assister: string | null;
  headshot: boolean | null;
  flashAssister: string | null;
}

const round1 = (v: number) => Number(v.toFixed(1));
const round3 = (v: number) => Number(v.toFixed(3));

/**
 * FASE 2.7 — TIMING WITHOUT ASSUMPTIONS.
 *
 * Precedence: `time_seconds` from the parser, then `tick / tickrate` when the
 * demo reported its own tickrate. A tickrate is NEVER assumed (a 128-tick demo
 * divided by 64 doubles every duration), so an unknown tickrate yields NULL and
 * every timing-dependent metric becomes NULL instead of wrong.
 */
export function eventTime(event: CanonicalEvent, tickrate: number | null): number | null {
  if (event.timeSeconds != null) return event.timeSeconds;
  if (event.tick != null && tickrate != null && tickrate > 0) return event.tick / tickrate;
  return null;
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
  const tickrate = match.tickrate;
  const flashes: FlashRecord[] = [];
  for (const event of match.events) {
    if (event.type !== "flash") continue;
    if (!event.actorSteamId || !event.victimSteamId) continue;
    if (event.actorSteamId === event.victimSteamId) continue; // self-flash
    const time = eventTime(event, tickrate);
    // Without a trustworthy instant a flash cannot be attributed to a kill.
    if (time == null) continue;
    flashes.push({
      round: event.roundNumber,
      time,
      flasher: event.actorSteamId,
      victim: event.victimSteamId,
    });
  }

  /**
   * Flash assist attribution: temporal, at most ONE per kill.
   * The flash must precede the kill, be inside FLASH_ASSIST_WINDOW_SECONDS,
   * target the same victim, and not come from the killer itself. Among the
   * eligible flashes only the most recent one is credited. A kill with unknown
   * timing is never credited a flash assist.
   */
  const flashAssisterFor = (kill: KillRecord): string | null => {
    if (!kill.victim || kill.time == null) return null;
    const killTime = kill.time;
    let best: FlashRecord | null = null;
    for (const flash of flashes) {
      if (flash.round !== kill.round) continue;
      if (flash.victim !== kill.victim) continue;
      if (flash.flasher === kill.attacker) continue;
      if (flash.time > killTime) continue;
      if (killTime - flash.time > FLASH_ASSIST_WINDOW_SECONDS) continue;
      if (!best || flash.time > best.time) best = flash;
    }
    return best?.flasher ?? null;
  };

  return (
    match.events
      .filter((e) => e.type === "kill")
      .map((e) => {
        const kill: KillRecord = {
          round: e.roundNumber,
          time: eventTime(e, tickrate),
          attacker: e.actorSteamId,
          victim: e.victimSteamId,
          assister: e.assisterSteamId,
          headshot: e.headshot,
          flashAssister: null,
        };
        kill.flashAssister = flashAssisterFor(kill);
        return kill;
      })
      // Unknown timing is NOT late timing: a kill without a trustworthy instant
      // must never be pushed to the end of the round as if it happened last.
      // Ordering is therefore only by round here; every time-sensitive derivation
      // (opening, trades, KAST) compares instants explicitly and refuses unknowns.
      .sort((a, b) => a.round - b.round)
  );
}

/**
 * Opening duel of a round: the chronologically first kill.
 *
 * A round only contributes when the ordering of its kills is DETERMINABLE:
 * every kill in the round has a known instant and the earliest instant is
 * unique. Rounds with an unknown instant or a tie are ambiguous and are
 * excluded from the opening sample — they are never resolved by event order.
 * Ambiguity in one round never invalidates the determinable rounds.
 */
export function openingDuels(kills: KillRecord[]): {
  openings: Map<number, KillRecord>;
  determinableRounds: Set<number>;
  ambiguousRounds: Set<number>;
} {
  const byRound = new Map<number, KillRecord[]>();
  for (const kill of kills) {
    const list = byRound.get(kill.round);
    if (list) list.push(kill);
    else byRound.set(kill.round, [kill]);
  }

  const openings = new Map<number, KillRecord>();
  const determinableRounds = new Set<number>();
  const ambiguousRounds = new Set<number>();

  for (const [roundNumber, list] of byRound) {
    if (list.length === 0) continue;
    if (list.some((k) => k.time == null)) {
      ambiguousRounds.add(roundNumber);
      continue;
    }
    let earliest = list[0]!;
    for (const kill of list) if (kill.time! < earliest.time!) earliest = kill;
    const tied = list.filter((kill) => kill.time === earliest.time).length;
    if (tied > 1) {
      ambiguousRounds.add(roundNumber);
      continue;
    }
    determinableRounds.add(roundNumber);
    openings.set(roundNumber, earliest);
  }

  return { openings, determinableRounds, ambiguousRounds };
}

/**
 * True when `death` was traded within the configured window.
 *
 * Required evidence: same round, KNOWN timing for both kills, chronological
 * order, both Steam IDs present, the avenger kills exactly the original killer,
 * the avenger belongs to the victim's team and is not the victim itself, and the
 * original death is not a team kill or a suicide.
 */
function wasTraded(kills: KillRecord[], death: KillRecord, match: CanonicalMatch): boolean {
  if (!death.attacker || !death.victim) return false;
  if (death.attacker === death.victim) return false; // suicide
  if (death.time == null) return false; // no timing => no trade evidence
  const deathTime = death.time;
  const victimTeam = teamOf(match, death.victim);
  const killerTeam = teamOf(match, death.attacker);
  if (victimTeam != null && killerTeam != null && victimTeam === killerTeam) return false;

  return kills.some((k) => {
    if (!k.attacker || !k.victim || k.time == null) return false;
    if (k.round !== death.round) return false;
    if (k.victim !== death.attacker) return false;
    if (k.attacker === k.victim) return false;
    if (k.attacker === death.victim) return false;
    if (k.time <= deathTime) return false;
    if (k.time - deathTime > TRADE_WINDOW_SECONDS) return false;
    const avengerTeam = teamOf(match, k.attacker);
    // The avenger must be a teammate of the original victim, and must not kill
    // one of its own (team kills never count as trades).
    if (victimTeam == null || avengerTeam == null) return false;
    if (avengerTeam !== victimTeam) return false;
    return teamOf(match, k.victim) !== avengerTeam;
  });
}

/**
 * Clutch detection: player alive alone against N living enemies.
 *
 * FASE 2.7 — PARTICIPATION IS EVIDENCE, NOT MEMBERSHIP. A player's global
 * `team` only says which team the player belonged to in the match, never that
 * the player was on the server for THIS round (substitutions, disconnects,
 * partially extracted rounds). Only `participatedInRound()` decides who is in
 * the round, so a global roster can no longer inflate the number of living
 * enemies and manufacture a clutch.
 *
 * Without kill events the alive/dead state of a round is unknowable, so the
 * result is NULL: "we cannot tell" is not "it did not happen".
 */
function clutchStats(
  match: CanonicalMatch,
  kills: KillRecord[],
  steamId: string,
): { attempts: number | null; wins: number | null } {
  if (kills.length === 0) return { attempts: null, wins: null };

  const team = teamOf(match, steamId);
  let attempts = 0;
  let wins = 0;

  for (const round of match.rounds) {
    if (!participatedInRound(match, steamId, round.roundNumber)) continue;
    const roundKills = kills.filter((k) => k.round === round.roundNumber);
    const participants = match.players.filter((p) =>
      participatedInRound(match, p.steamId, round.roundNumber),
    );
    const teammates = participants.filter((p) => p.team === team).map((p) => p.steamId);
    const enemies = participants
      .filter((p) => p.team != null && team != null && p.team !== team)
      .map((p) => p.steamId);
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

/**
 * FASE 2.7 — DATA-AVAILABILITY MATRIX.
 *
 * Which classes of evidence the observation actually carries. Every metric that
 * depends on a class it does not have is emitted as NULL. See
 * docs/PHASE-2.7-REAL-DEMO-INGESTION-AND-CANONICAL-ANALYTICS.md for the full
 * metric -> required data -> null condition table.
 */
export function metricsAvailability(match: CanonicalMatch): MetricsAvailability {
  const kills = match.events.filter((e) => e.type === "kill");
  const timing = kills.length > 0 && kills.every((e) => eventTime(e, match.tickrate) != null);
  return {
    killEvents: hasKillEvidence(match.events),
    damageEvents: hasDamageEvidence(match.events),
    // Shared, single definition of utility evidence (see evidence.ts): the same
    // classification the normalizer uses for the `missing_utility` flag.
    utilityEvents: hasUtilityEvidence(match.events),
    roundEndEvidence: match.rounds.some(
      (r) => r.winnerSide != null || r.winnerTeam != null || r.endTick != null,
    ),
    economy: match.rounds.some((r) => Object.keys(r.equipmentValue).length > 0),
    timing,
    // A partial extraction NEVER counts as complete coverage. Whole-match rates
    // (rating, KAST) are only defensible over a complete round set, so they are
    // NULL while the parser reports a partial parse.
    completeCoverage: match.quality.partialParse !== true,
  };
}

export function computeMetrics(match: CanonicalMatch, steamId: string): CanonicalMetrics {
  const availability = metricsAvailability(match);
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
  // is provably present in that round.
  const roundNumbers = new Set<number>();
  for (const round of match.rounds) {
    if (participatedInRound(match, steamId, round.roundNumber)) roundNumbers.add(round.roundNumber);
  }
  const roundsPlayed = roundNumbers.size;

  const damageEvents = match.events.filter((e) => e.type === "damage");
  const damageGiven = damageEvents
    .filter((e) => e.actorSteamId === steamId)
    .reduce((sum, e) => sum + (e.damage ?? 0), 0);
  const damageTaken = damageEvents
    .filter((e) => e.victimSteamId === steamId)
    .reduce((sum, e) => sum + (e.damage ?? 0), 0);

  const utilityDamage = damageEvents
    .filter(
      (e) =>
        e.actorSteamId === steamId &&
        typeof e.weapon === "string" &&
        /hegrenade|molotov|inferno|incgrenade|flashbang|decoy|smoke/i.test(e.weapon),
    )
    .reduce((sum, e) => sum + (e.damage ?? 0), 0);
  // Utility usage uses the SHARED evidence classification, so "which events are
  // utility" is defined in exactly one place for quality flags, availability and
  // counters.
  const grenadesUsed = match.events.filter(
    (e) => isUtilityEvent(e) && e.actorSteamId === steamId,
  ).length;
  const enemiesFlashed = match.events
    .filter((e) => e.type === "flash" && e.actorSteamId === steamId)
    .reduce((sum, e) => sum + Number(e.data["players_flashed"] ?? 1), 0);

  /**
   * Opening duels — only over rounds whose kill ordering is determinable and
   * only when kill evidence exists. With no determinable round the sample is
   * unknown (NULL), never 0.
   */
  const openingDeterminable = availability.killEvents && opening.determinableRounds.size > 0;
  let firstKillCount = 0;
  let firstDeathCount = 0;
  for (const [, kill] of opening.openings) {
    if (kill.attacker === steamId) firstKillCount += 1;
    if (kill.victim === steamId) firstDeathCount += 1;
  }
  const firstKills = openingDeterminable ? firstKillCount : null;
  const firstDeaths = openingDeterminable ? firstDeathCount : null;
  const openingAttempts = openingDeterminable ? firstKillCount + firstDeathCount : null;
  const openingSuccessRate =
    openingAttempts != null && openingAttempts > 0
      ? round3(firstKillCount / openingAttempts)
      : null;

  // Trades — timing-dependent. Without trustworthy timing the answer is NULL,
  // never 0: "no trade observed" and "we cannot observe trades" differ.
  // A trade kill is the offensive half of a trade: the player kills an enemy
  // who, within the window and in the same round, had just killed one of the
  // player's teammates. Team kills, suicides and events without Steam IDs are
  // never counted.
  const ownTeam = teamOf(match, steamId);
  let tradeKills: number | null = null;
  let tradeDeaths: number | null = null;
  let untradedDeaths: number | null = null;
  let earlyDeaths: number | null = null;

  if (availability.timing) {
    let tradeKillCount = 0;
    for (const kill of playerKills) {
      if (!kill.attacker || !kill.victim || kill.time == null) continue;
      if (kill.attacker === kill.victim) continue;
      const killTime = kill.time;
      const victimTeam = teamOf(match, kill.victim);
      if (ownTeam == null || victimTeam == null || victimTeam === ownTeam) continue;
      const traded = kills.some((k) => {
        if (!k.attacker || !k.victim || k.time == null) return false;
        if (k.round !== kill.round) return false;
        if (k.attacker !== kill.victim) return false;
        if (k.attacker === k.victim) return false;
        if (k.time >= killTime) return false;
        if (killTime - k.time > TRADE_WINDOW_SECONDS) return false;
        // The player killed first must really belong to the player's team.
        return teamOf(match, k.victim) === ownTeam;
      });
      if (traded) tradeKillCount += 1;
    }
    tradeKills = tradeKillCount;

    let tradedDeathCount = 0;
    for (const death of playerDeaths) if (wasTraded(kills, death, match)) tradedDeathCount += 1;
    tradeDeaths = tradedDeathCount;
    untradedDeaths = playerDeaths.length - tradedDeathCount;
    earlyDeaths = playerDeaths.filter(
      (d) => d.time != null && d.time <= EARLY_DEATH_SECONDS,
    ).length;
  }

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

  // KAST (see header). It needs kill events AND timing (the T component is a
  // trade), so an observation without them reports NULL rather than a number
  // built on absent evidence.
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
  // KAST is a whole-match rate: it needs kill evidence, timing AND complete
  // coverage. Over a partial round set the value would silently mean something
  // else, so it is NULL.
  const kastAvailable =
    availability.killEvents &&
    availability.timing &&
    availability.completeCoverage &&
    roundsPlayed > 0;

  const headshots = playerKills.filter((k) => k.headshot === true).length;
  const clutch = clutchStats(match, kills, steamId);

  /**
   * Rating evidence gate. The composite formula (unchanged) mixes kills, deaths
   * and damage per round, so it requires KILL evidence AND DAMAGE evidence AND
   * rounds AND complete coverage. Damage alone would feed implicit zero kills
   * and zero deaths into the formula and publish a fabricated number.
   */
  const ratingEvidence =
    availability.killEvents && availability.damageEvents && availability.completeCoverage;

  // Side ratings use the same composite formula restricted to CT/T rounds.
  const sideRating = (side: Side): number | null => {
    if (!ratingEvidence) return null;
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

  // Damage-derived signals require damage events; otherwise they are unknown.
  const adr =
    availability.damageEvents && roundsPlayed > 0 ? round1(damageGiven / roundsPlayed) : null;

  return {
    steamId,
    availability,
    roundsPlayed,
    kills: playerKills.length,
    deaths: playerDeaths.length,
    assists,
    headshots,
    hsPercent: playerKills.length > 0 ? round1((headshots / playerKills.length) * 100) : null,
    damageGiven: availability.damageEvents ? round1(damageGiven) : null,
    damageTaken: availability.damageEvents ? round1(damageTaken) : null,
    adr,
    kast: kastAvailable ? round1((kastRounds / roundsPlayed) * 100) : null,
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
    utilityDamage: availability.damageEvents ? round1(utilityDamage) : null,
    grenadeDamage: availability.damageEvents ? round1(utilityDamage) : null,
    // A flash assist is a TEMPORAL claim: it needs both utility events and a
    // trustworthy instant for every kill. Without reliable timing the count is
    // unknown, not zero.
    flashAssists: availability.utilityEvents && availability.timing ? flashAssists : null,

    enemiesFlashed: availability.utilityEvents ? enemiesFlashed : null,
    grenadesUsed: availability.utilityEvents ? grenadesUsed : null,
    ctRating: sideRating("CT"),
    tRating: sideRating("T"),
    sourceRating:
      ratingEvidence && roundsPlayed > 0
        ? round3(
            compositeRating(playerKills.length, playerDeaths.length, damageGiven, roundsPlayed),
          )
        : null,

    damageEfficiency:
      availability.damageEvents && damageTaken > 0 ? round3(damageGiven / damageTaken) : null,
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
