/**
 * FASE 2.6.6 — DEMO source adapter (canonical schema v2).
 *
 * The demo pipeline already produces a rich, validated structure
 * (`@/lib/pipeline/types`). This adapter TRANSLATES it into the source-neutral
 * canonical model; it does not re-analyse anything and it never invents fields
 * the parser did not report.
 *
 * No network access, no parsing and no file I/O happens here.
 */
import { ANALYSIS_VERSION, FEATURES_VERSION, METRICS_VERSION } from "@/config/pipeline";
import type {
  CanonicalMatch as LegacyDemoMatch,
  CanonicalRound as LegacyDemoRound,
  Side,
} from "@/lib/pipeline/types";

import {
  computeCoverage,
  quality,
  qualityFromCoverage,
  UNKNOWN_QUALITY,
} from "../canonical.quality";
import type {
  CanonicalEvent,
  CanonicalMatchBundle,
  CanonicalParticipant,
  CanonicalRound,
  CanonicalRoundPlayer,
  CanonicalTeamSlot,
} from "../canonical.types";
import { CANONICAL_SCHEMA_VERSION, SOURCE_CONTRACT_VERSIONS } from "../canonical.versions";

export interface DemoAdapterInput {
  parsed: LegacyDemoMatch;
  /** SHA-256 of the demo file: the strongest identity evidence we can hold. */
  fingerprint: string | null;
  /** SteamID64 of the player the upload belongs to, when known. */
  targetSteamId?: string | null;
  internalPlayerId?: string | null;
  fetchedAt?: string;
}

function slotFor(
  team: string | null,
  teamA: string | null,
  teamB: string | null,
): CanonicalTeamSlot | null {
  if (!team) return null;
  if (teamA && team === teamA) return "team_a";
  if (teamB && team === teamB) return "team_b";
  return null;
}

function winnerSlot(
  round: LegacyDemoRound,
  teamA: string | null,
  teamB: string | null,
): CanonicalTeamSlot | null {
  return slotFor(round.winnerTeam, teamA, teamB);
}

function sideOf(value: Side | null | undefined): "CT" | "T" | null {
  return value === "CT" || value === "T" ? value : null;
}

/** Translates one parsed demo into a canonical bundle. */
export function demoToCanonicalBundle(input: DemoAdapterInput): CanonicalMatchBundle {
  const parsed = input.parsed;
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const teamA = parsed.teamA;
  const teamB = parsed.teamB;

  const participants: CanonicalParticipant[] = parsed.players.map((player) => ({
    participantKey: player.steamId,
    internalPlayerId:
      input.targetSteamId && player.steamId === input.targetSteamId
        ? (input.internalPlayerId ?? null)
        : null,
    source: "demo" as const,
    externalPlayerId: player.steamId,
    steamId64: player.steamId,
    nicknameSnapshot: player.name,
    team: slotFor(player.team, teamA, teamB),
    isTargetPlayer: Boolean(input.targetSteamId) && player.steamId === input.targetSteamId,
    // A demo proves who was in the server, not who OWNS the account.
    identityStatus: "unlinked" as const,
    identityConfidence: null,
    metadata: {},
  }));

  const rounds: CanonicalRound[] = parsed.rounds.map((round) => ({
    roundNumber: round.roundNumber,
    startTick: round.startTick,
    endTick: round.endTick,
    startTimeSeconds: null,
    endTimeSeconds: null,
    durationSeconds: round.durationSeconds,
    winningTeam: winnerSlot(round, teamA, teamB),
    winningSide: sideOf(round.winnerSide),
    // The parser contract does not report a win reason; the bomb flags below are
    // evidence, not a conclusion, so the reason stays unknown.
    winReason: round.bombDefused
      ? ("bomb_defused" as const)
      : round.bombExploded
        ? ("bomb_exploded" as const)
        : ("unknown" as const),
    bombPlanted: round.bombPlanted,
    bombDefused: round.bombDefused,
    bombExploded: round.bombExploded,
    quality: quality("complete", [], 1),
    metadata: {},
  }));

  const roundPlayers: CanonicalRoundPlayer[] = [];
  for (const round of parsed.rounds) {
    for (const participant of participants) {
      const key = participant.participantKey;
      const hasEconomy =
        key in round.moneyStart || key in round.moneyEnd || key in round.equipmentValue;
      const side = round.sides[key] ?? null;
      if (!hasEconomy && side === null) continue;
      roundPlayers.push({
        roundNumber: round.roundNumber,
        participantKey: key,
        side: sideOf(side),
        // Survival is only asserted with positive evidence elsewhere in the
        // pipeline; the canonical translation never guesses it.
        survived: null,
        moneyStart: key in round.moneyStart ? round.moneyStart[key]! : null,
        moneyEnd: key in round.moneyEnd ? round.moneyEnd[key]! : null,
        equipmentValue: key in round.equipmentValue ? round.equipmentValue[key]! : null,
        buyContext: null,
        kills: null,
        deaths: null,
        assists: null,
        damage: null,
        flashAssists: null,
        openingKill: null,
        openingDeath: null,
        traded: null,
        tradeKill: null,
        metadata: {},
      });
    }
  }

  const events: CanonicalEvent[] = parsed.events.map((event) => ({
    roundNumber: event.roundNumber,
    type: event.type,
    tick: event.tick,
    gameTimeSeconds: event.timeSeconds,
    actorParticipantKey: event.actorSteamId,
    victimParticipantKey: event.victimSteamId,
    assisterParticipantKey: event.assisterSteamId,
    // External identifiers are ALWAYS preserved, even when resolution succeeded.
    sourceActorExternalId: event.actorSteamId,
    sourceVictimExternalId: event.victimSteamId,
    sourceAssisterExternalId: event.assisterSteamId,
    weapon: event.weapon,
    headshot: event.headshot,
    distance: event.distance,
    damage: event.damage,
    quality: quality("complete", [], 1),
    data: event.data,
  }));

  const coverage = computeCoverage({
    roundCount: parsed.rounds.length > 0 ? parsed.rounds.length : null,
    participants,
    rounds,
    roundPlayers,
    events,
    participantsExpected: null,
  });

  const matchQuality = parsed.quality.partialParse
    ? quality(
        "partial",
        ["partial_parse", ...parsed.quality.flags],
        parsed.quality.extractionConfidence,
      )
    : qualityFromCoverage(coverage);

  return {
    observation: {
      source: "demo",
      sourceContractVersion: SOURCE_CONTRACT_VERSIONS.demo,
      // A demo has no external match identifier; identity comes from its hash.
      externalMatchId: null,
      externalParentId: null,
      sourceVersion: `${parsed.parser.name}@${parsed.parser.version}`,
      fetchedAt,
      sourceUpdatedAt: null,
      status: parsed.quality.partialParse ? "incomplete" : "complete",
      quality: matchQuality,
      fingerprint: input.fingerprint,
      metadata: {
        analysis_version: ANALYSIS_VERSION,
        // FASE 2.7 lineage: which code version produced the derived layers.
        metrics_version: METRICS_VERSION,
        features_version: FEATURES_VERSION,
        parser_revision: parsed.parser.revision,
        tickrate: parsed.tickrate,
        legacy_schema_version: parsed.schemaVersion,
        quality_flags: parsed.quality.flags,
        hot_semantic_data: parsed.hotSemanticData ?? {
          schema_version: 1,
          aim_observations: [],
          position_snapshots: [],
          economy_snapshots: [],
          quality: {},
        },
      },
    },
    // A demo is a single map. It never proves a series exists.
    series: null,
    match: {
      game: "cs2",
      map: parsed.map,
      mapNumber: null,
      playedAt: parsed.matchDate,
      startedAt: parsed.matchDate,
      finishedAt: null,
      durationSeconds: parsed.durationSeconds,
      // A parsed demo is a recording of a match that already happened.
      status: parsed.quality.partialParse ? "partial" : "completed",
      finished: true,
      terminal: true,
      teamA,
      teamB,
      scoreTeamA: parsed.scoreA,
      scoreTeamB: parsed.scoreB,
      winnerTeam:
        parsed.scoreA === null || parsed.scoreB === null
          ? null
          : parsed.scoreA === parsed.scoreB
            ? null
            : parsed.scoreA > parsed.scoreB
              ? "team_a"
              : "team_b",
      roundCount: parsed.rounds.length > 0 ? parsed.rounds.length : null,
      quality: matchQuality,
      coverage,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    participants,
    rounds,
    roundPlayers,
    events,
  };
}

/** Quality used when a demo produced no usable structure at all. */
export const DEMO_EMPTY_QUALITY = UNKNOWN_QUALITY;
