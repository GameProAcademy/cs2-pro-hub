#!/usr/bin/env python3
"""Deterministic 105-field Canonical semantic registry and fail-closed gate."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MATRIX_PATH = ROOT / "docs/client-parser/reconciled-field-matrix.json"
OUTPUT_PATH = ROOT / "docs/client-parser/canonical-mapping-inventory.json"
INVENTORY_VERSION = "canonical-demo-v2"
SCHEMA_VERSION = 2
PARSER_NAME = "demoparser2"
PARSER_VERSION = "0.42.0"
PARSER_CONTRACT_VERSION = 1

MAPPING_CLASSES = frozenset({
    "VERIFIED_DIRECT_SOURCE", "VERIFIED_DERIVED_FROM_VERIFIED_SOURCE",
    "VERIFIED_NORMALIZED_SOURCE", "DECLARED_BUT_NOT_VERIFIED", "PARITY_PENDING",
    "DETERMINISM_PENDING", "SEMANTIC_MISMATCH", "TYPE_MISMATCH", "VALUE_MISMATCH",
    "SOURCE_UNAVAILABLE", "PARSE_FAILED", "TICK_DOMAIN_BLOCKED", "IDENTITY_BLOCKED",
    "NOT_SUPPORTED", "CANONICAL_NOT_AUTHORIZED",
})
VERIFIED_CLASSES = frozenset({
    "VERIFIED_DIRECT_SOURCE", "VERIFIED_DERIVED_FROM_VERIFIED_SOURCE",
    "VERIFIED_NORMALIZED_SOURCE",
})
BLOCKING_CLASSES = MAPPING_CLASSES - VERIFIED_CLASSES
FORBIDDEN_GENERIC_SOURCES = frozenset({"derived_or_constant", "generic", "unknown"})
REQUIRED_FIELDS = (
    "canonicalField", "canonicalType", "canonicalNullability", "sourceCapability",
    "sourceField", "sourceEvent", "sourceQuery", "sourceParser", "sourceParserVersion",
    "sourceContractVersion", "sourceSemantics", "normalizationRule", "identityDependency",
    "tickDependency", "evidenceClass", "mappingStatus", "parityStatus",
    "determinismStatus", "canonicalAuthorization", "verificationMethod",
    "evidenceReference", "lastVerifiedAt", "blockReason", "semanticNotes",
    "persistenceTarget", "persistenceType", "lossiness", "confidence",
    "provenanceRequirements", "semanticValidation", "persistenceValidation",
)

# These are adapter-owned, executable semantics rather than parser-library capabilities.
ADAPTER_CAPABILITIES = frozenset({
    "adapter.constant", "adapter.input", "adapter.lifecycle", "adapter.quality",
    "adapter.coverage", "adapter.identity", "adapter.persistence", "adapter.unsupported",
})


def _rows(prefix: str, fields: dict[str, tuple[str, str, str, str, str, str, str, str, str]]) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for name, values in fields.items():
        capability, source, kind, mapping_class, canonical_type, persistence, persistence_type, semantics, normalization = values
        result[f"{prefix}.{name}"] = {
            "sourceCapability": capability, "sourceField": source, "sourceKind": kind,
            "mappingStatus": mapping_class, "canonicalType": canonical_type,
            "persistenceTarget": persistence, "persistenceType": persistence_type,
            "sourceSemantics": semantics, "normalizationRule": normalization,
        }
    return result


# Every leaf emitted by demo.adapter.ts is named exactly once. There is deliberately
# no prefix fallback: a new adapter field fails the surface gate until explicitly reviewed.
FIELD_SPECS: dict[str, dict[str, str]] = {}
FIELD_SPECS.update(_rows("CanonicalMatchSource", {
    "source": ("adapter.constant", 'literal:"demo"', "CONSTANT", "DECLARED_BUT_NOT_VERIFIED", "DataSource", "match_sources.source", "data_source", "Source discriminator fixed by the demo adapter.", "Exact literal."),
    "sourceContractVersion": ("adapter.constant", "SOURCE_CONTRACT_VERSIONS.demo", "CONSTANT", "DECLARED_BUT_NOT_VERIFIED", "SourceContractVersion", "match_sources.source_contract_version", "text", "Version of the demo source contract, not parser package version.", "Exact configured contract token."),
    "externalMatchId": ("adapter.unsupported", "null:no_demo_external_match_id", "UNAVAILABLE", "NOT_SUPPORTED", "string|null", "match_sources.external_match_id", "text", "A DEM has no provider match identifier.", "Persist null; never substitute fingerprint."),
    "externalParentId": ("adapter.unsupported", "null:no_demo_parent_id", "UNAVAILABLE", "NOT_SUPPORTED", "string|null", "match_sources.external_parent_id", "text", "A standalone DEM proves no external series parent.", "Persist null."),
    "sourceVersion": ("adapter.input", "parsed.parser.name+parsed.parser.version", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "string|null", "match_sources.source_version", "text", "Parser name and version reported by validated parser output.", "Join with @ only after parser identity validation."),
    "fetchedAt": ("adapter.input", "input.fetchedAt", "INPUT", "DECLARED_BUT_NOT_VERIFIED", "ISO-8601 string", "match_sources.fetched_at", "timestamptz", "Server collection timestamp supplied to the adapter.", "Validate ISO-8601; never use competitive date."),
    "sourceUpdatedAt": ("adapter.unsupported", "null:no_source_update_timestamp", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "string|null", "match_sources.source_updated_at", "timestamptz", "DEM format supplies no source update timestamp.", "Persist null."),
    "status": ("adapter.lifecycle", "parsed.quality.partialParse", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "ObservationStatus", "match_sources.status", "text", "Incomplete iff parser reports partial extraction.", "Boolean branch: incomplete or complete."),
    "quality.status": ("adapter.quality", "parsed.quality.partialParse+coverage", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "QualityStatus", "match_sources.quality.status", "jsonb:text", "Layer quality from parser partial flag and measured coverage.", "Use quality helpers; no optimistic default."),
    "quality.reasons": ("adapter.quality", "parsed.quality.flags+coverage", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "string[]", "match_sources.quality.reasons", "jsonb:array", "Stable reasons from parser flags or coverage gaps.", "Preserve distinct reason slugs."),
    "quality.confidence": ("adapter.quality", "parsed.quality.extractionConfidence", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "match_sources.quality.confidence", "jsonb:number", "Measured extraction confidence only.", "Preserve null and clamp only in quality helper."),
    "fingerprint": ("adapter.input", "input.fingerprint", "INPUT", "DECLARED_BUT_NOT_VERIFIED", "string|null", "match_sources.fingerprint", "text", "SHA-256 content fingerprint; idempotency evidence, not match identity alone.", "Lowercase validated SHA-256 or null."),
    "metadata": ("adapter.persistence", "analysis/parser/tickrate/quality metadata", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "Record<string,unknown>", "match_sources.metadata", "jsonb", "Bounded lineage metadata; not Canonical facts.", "Stable named keys; preserve null/absence."),
}))
FIELD_SPECS.update(_rows("CanonicalMatch", {
    "game": ("adapter.constant", 'literal:"cs2"', "CONSTANT", "DECLARED_BUT_NOT_VERIFIED", '"cs2"', "matches.game", "text", "Game discriminator fixed by this adapter.", "Exact literal."),
    "map": ("header.map_name", "parsed.map", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "string|null", "matches.map", "text", "Map code from parser header through the validated pipeline contract.", "Canonical CS2 map-code normalization."),
    "mapNumber": ("adapter.unsupported", "null:single_map_demo", "UNAVAILABLE", "NOT_SUPPORTED", "number|null", "matches.map_number", "integer", "A standalone DEM does not establish series position.", "Persist null."),
    "playedAt": ("game_state.match_start_time", "parsed.matchDate", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "string|null", "matches.played_at", "timestamptz", "Competitive timestamp only when parser reports it.", "Validated timestamp or null; never fetchedAt."),
    "startedAt": ("game_state.match_start_time", "parsed.matchDate", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "string|null", "matches.started_at", "timestamptz", "Match start currently shares the parser-provided competitive timestamp.", "Validated timestamp or null."),
    "finishedAt": ("adapter.unsupported", "null:no_finish_timestamp", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "string|null", "matches.finished_at", "timestamptz", "Parser contract has no authoritative finish timestamp.", "Persist null."),
    "durationSeconds": ("header.playback_time", "parsed.durationSeconds", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "matches.duration_seconds", "integer", "Parser-reported demo duration.", "Finite non-negative seconds or null."),
    "status": ("adapter.lifecycle", "partialParse+rounds[].endTick", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "CanonicalStatus", "matches.canonical_status", "text", "Completed only for non-partial parse with rounds and all end ticks.", "Otherwise partial; never infer from date."),
    "finished": ("adapter.lifecycle", "partialParse+rounds[].endTick", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "boolean", "matches.finished", "boolean", "True only with terminal round evidence.", "Fail closed to false."),
    "terminal": ("adapter.lifecycle", "partialParse+rounds[].endTick", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "boolean", "matches.terminal", "boolean", "Demo match terminal only when normal completion is evidenced.", "Same strict predicate as finished."),
    "teamA": ("teams.team_name", "parsed.teamA", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "string|null", "matches.team_a", "text", "Neutral team A label produced by parser normalization.", "Non-empty string or null."),
    "teamB": ("teams.team_name", "parsed.teamB", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "string|null", "matches.team_b", "text", "Neutral team B label produced by parser normalization.", "Non-empty string or null."),
    "scoreTeamA": ("score.score", "parsed.scoreA", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "matches.score_team_a", "integer", "Observed round score for neutral team A.", "Non-negative integer or null."),
    "scoreTeamB": ("score.score", "parsed.scoreB", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "matches.score_team_b", "integer", "Observed round score for neutral team B.", "Non-negative integer or null."),
    "winnerTeam": ("adapter.lifecycle", "parsed.scoreA<>parsed.scoreB", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "CanonicalTeamSlot|null", "matches.winner_team", "text", "Winner derived only from two present unequal scores.", "Tie or missing score remains null."),
    "roundCount": ("rounds.number", "parsed.rounds.length", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "matches.round_count", "integer", "Count of reconstructed rounds, not maps won.", "Positive observed length or null."),
    "quality.status": ("adapter.quality", "partialParse+coverage", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "QualityStatus", "matches.quality.status", "jsonb:text", "Match quality from parser and observed layer coverage.", "Quality helper result."),
    "quality.reasons": ("adapter.quality", "quality flags+coverage", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "string[]", "matches.quality.reasons", "jsonb:array", "Explicit extraction and coverage reasons.", "Stable reason slugs."),
    "quality.confidence": ("adapter.quality", "extractionConfidence+coverage", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "matches.quality.confidence", "jsonb:number", "Measured confidence propagated or derived from coverage.", "Finite [0,1] or null."),
    "coverage.roundsExpected": ("adapter.coverage", "parsed.rounds.length", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "matches.coverage.roundsExpected", "jsonb:integer", "Expected rounds equals observed reconstructed rounds only when any exist.", "Positive count or null."),
    "coverage.roundsObserved": ("adapter.coverage", "rounds.length", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "matches.coverage.roundsObserved", "jsonb:integer", "Count of emitted Canonical rounds.", "Observed length."),
    "coverage.participantsExpected": ("adapter.unsupported", "null:no_expected_roster", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "number|null", "matches.coverage.participantsExpected", "jsonb:integer", "Parser contract does not prove expected roster size.", "Persist null."),
    "coverage.participantsObserved": ("adapter.coverage", "participants.length", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "matches.coverage.participantsObserved", "jsonb:integer", "Count of emitted participants with a source-local key.", "Observed length."),
    "coverage.participantsResolved": ("adapter.identity", "participants.internalPlayerId", "DERIVED", "IDENTITY_BLOCKED", "number|null", "matches.coverage.participantsResolved", "jsonb:integer", "Count resolved to internal players; depends on external ownership correlation.", "Count non-null internal IDs."),
    "coverage.eventsObserved": ("adapter.coverage", "events.length", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "matches.coverage.eventsObserved", "jsonb:integer", "Count of emitted normalized events.", "Observed length."),
    "coverage.hasRoundData": ("adapter.coverage", "rounds.length>0", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "boolean", "matches.coverage.hasRoundData", "jsonb:boolean", "Presence of at least one emitted round.", "Exact count predicate."),
    "coverage.hasEventData": ("adapter.coverage", "events.length>0", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "boolean", "matches.coverage.hasEventData", "jsonb:boolean", "Presence of at least one emitted event.", "Exact count predicate."),
    "coverage.hasPlayerRoundState": ("adapter.coverage", "roundPlayers.length>0", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "boolean", "matches.coverage.hasPlayerRoundState", "jsonb:boolean", "Presence of at least one emitted player-round row.", "Exact count predicate."),
    "schemaVersion": ("adapter.constant", "CANONICAL_SCHEMA_VERSION", "CONSTANT", "DECLARED_BUT_NOT_VERIFIED", "number", "matches.canonical_schema_version", "integer", "Canonical model schema version.", "Exact configured integer."),
}))
FIELD_SPECS.update(_rows("CanonicalParticipant", {
    "participantKey": ("player_info.steamid", "player.participantKey??player.steamId", "NORMALIZED", "IDENTITY_BLOCKED", "string", "match_participants.participant_key", "text", "Source-local participant key; nickname is never accepted.", "Validated participant key; unresolved players omitted."),
    "internalPlayerId": ("adapter.identity", "input.internalPlayerId when target matches", "DERIVED", "IDENTITY_BLOCKED", "string|null", "match_participants.internal_player_id", "uuid", "Internal identity only from an externally selected matching participant.", "UUID or null; never nickname-derived."),
    "source": ("adapter.constant", 'literal:"demo"', "CONSTANT", "DECLARED_BUT_NOT_VERIFIED", "DataSource", "match_participants.source", "data_source", "Participant observation source.", "Exact literal."),
    "externalPlayerId": ("player_info.steamid", "player.steamId", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "string|null", "match_participants.external_player_id", "text", "External Steam identifier evidence.", "Decimal string or null."),
    "steamId64": ("player_info.steamid", "player.steamId", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "string|null", "match_participants.steam_id64", "text", "SteamID64 evidence; zero is unlinked.", "Decimal SteamID64 or null."),
    "nicknameSnapshot": ("player_info.name", "player.name", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "string|null", "match_participants.nickname_snapshot", "text", "Display snapshot only, never strong identity.", "Bounded UTF-8 or null."),
    "team": ("player_info.team_number", "player.team->slotFor(teamA,teamB)", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "CanonicalTeamSlot|null", "match_participants.team", "text", "Neutral team slot when label matches parsed team A/B.", "team_a/team_b or null; not CT/T."),
    "isTargetPlayer": ("adapter.identity", "targetParticipantKey==participantKey", "DERIVED", "IDENTITY_BLOCKED", "boolean", "match_participants.is_target_player", "boolean", "Marks only an externally selected source-local participant.", "Strict key equality; absent target is false."),
    "identityStatus": ("adapter.identity", "target key+internalPlayerId", "DERIVED", "IDENTITY_BLOCKED", "IdentityStatus", "match_participants.identity_status", "identity_link_status", "Correlated only when target key and internal player ID both match.", "correlated or unlinked; never verified by nickname."),
    "identityConfidence": ("adapter.identity", "correlated?1:null", "DERIVED", "IDENTITY_BLOCKED", "number|null", "match_participants.identity_confidence", "numeric", "Confidence 1 only for explicit target-to-internal binding.", "1 or null."),
    "metadata": ("adapter.constant", "empty object", "CONSTANT", "CANONICAL_NOT_AUTHORIZED", "Record<string,unknown>", "match_participants.metadata", "jsonb", "No participant metadata is currently promoted.", "Persist empty object."),
}))
FIELD_SPECS.update(_rows("CanonicalRound", {
    "roundNumber": ("rounds.number", "round.roundNumber", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number", "match_rounds.round_number", "integer", "Positive reconstructed round sequence number.", "Positive integer."),
    "startTick": ("rounds.start_tick", "round.startTick", "NORMALIZED", "TICK_DOMAIN_BLOCKED", "number|null", "match_rounds.start_tick", "integer", "Observed round_start tick, not proof of complete tick domain.", "Non-negative ordered tick or null."),
    "endTick": ("rounds.end_tick", "round.endTick", "NORMALIZED", "TICK_DOMAIN_BLOCKED", "number|null", "match_rounds.end_tick", "integer", "First valid round_end after start; pre-start ends ignored.", "Ordered tick or null."),
    "startTimeSeconds": ("adapter.unsupported", "null:no_round_start_seconds", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "number|null", "match_rounds.start_time_seconds", "numeric", "No authoritative normalized round start seconds in contract.", "Persist null."),
    "endTimeSeconds": ("adapter.unsupported", "null:no_round_end_seconds", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "number|null", "match_rounds.end_time_seconds", "numeric", "No authoritative normalized round end seconds in contract.", "Persist null."),
    "durationSeconds": ("rounds.duration_seconds", "round.durationSeconds", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "match_rounds.duration_seconds", "numeric", "Parser-normalized round duration.", "Finite non-negative seconds or null."),
    "winningTeam": ("rounds.winner_team", "round.winnerTeam->winnerSlot", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "CanonicalTeamSlot|null", "match_rounds.winning_team", "text", "Neutral winning team slot only when winner label matches team A/B.", "team_a/team_b or null."),
    "winningSide": ("rounds.winner_side", "round.winnerSide", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "CanonicalSide|null", "match_rounds.winning_side", "text", "Parser-side CT/T value only.", "CT/T or null; never derive from team slot."),
    "winReason": ("adapter.unsupported", 'literal:"unknown"', "UNAVAILABLE", "NOT_SUPPORTED", "RoundWinReason|null", "match_rounds.win_reason", "text", "Contract does not report authoritative win reason; bomb flags are not sufficient.", "Exact unknown sentinel."),
    "bombPlanted": ("rounds.bomb_planted", "round.bombPlanted", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "boolean|null", "match_rounds.bomb_planted", "boolean", "Observed bomb plant evidence for the round.", "Preserve null versus false."),
    "bombDefused": ("rounds.bomb_defused", "round.bombDefused", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "boolean|null", "match_rounds.bomb_defused", "boolean", "Observed bomb defuse evidence for the round.", "Preserve null versus false."),
    "bombExploded": ("rounds.bomb_exploded", "round.bombExploded", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "boolean|null", "match_rounds.bomb_exploded", "boolean", "Observed bomb explosion evidence for the round.", "Preserve null versus false."),
    "quality.status": ("adapter.quality", "sourceQuality.status", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "QualityStatus", "match_rounds.quality.status", "jsonb:text", "Round inherits source partiality conservatively.", "No per-round completeness inflation."),
    "quality.reasons": ("adapter.quality", "sourceQuality.reasons", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "string[]", "match_rounds.quality.reasons", "jsonb:array", "Round inherits parser quality reasons.", "Preserve reason slugs."),
    "quality.confidence": ("adapter.quality", "sourceQuality.confidence", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "match_rounds.quality.confidence", "jsonb:number", "Round inherits measured parser confidence.", "Finite [0,1] or null."),
    "metadata": ("adapter.constant", "empty object", "CONSTANT", "CANONICAL_NOT_AUTHORIZED", "Record<string,unknown>", "match_rounds.metadata", "jsonb", "No round metadata is currently promoted.", "Persist empty object."),
}))
FIELD_SPECS.update(_rows("CanonicalRoundPlayer", {
    "roundNumber": ("rounds.number", "round.roundNumber", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number", "round_players.round_number", "integer", "Foreign-key round sequence.", "Exact emitted round number."),
    "participantKey": ("adapter.identity", "participant.participantKey", "DERIVED", "IDENTITY_BLOCKED", "string", "round_players.participant_key", "text", "Joins player-round state to a resolved match participant key.", "Exact source-local key; never nickname."),
    "side": ("player_info.team_number", "round.sides[participantKey]", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "CanonicalSide|null", "round_players.side", "text", "Per-round CT/T side only when explicitly reported.", "CT/T or null."),
    "survived": ("adapter.unsupported", "null:no_positive_survival_evidence", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "boolean|null", "round_players.survived", "boolean", "Absence of death is not survival evidence.", "Persist null."),
    "moneyStart": ("economy.start_balance", "round.moneyStart[participantKey]", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "round_players.money_start", "integer", "Observed player balance at round start.", "Integer or null; preserve zero."),
    "moneyEnd": ("economy.balance", "round.moneyEnd[participantKey]", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "round_players.money_end", "integer", "Observed player balance at round end.", "Integer or null; preserve zero."),
    "equipmentValue": ("economy.current_equip_value", "round.equipmentValue[participantKey]", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "round_players.equipment_value", "integer", "Observed player equipment value.", "Integer or null; preserve zero."),
    "buyContext": ("adapter.unsupported", "null:no_buy_classifier", "UNAVAILABLE", "NOT_SUPPORTED", "BuyContext|null", "round_players.buy_context", "text", "No reviewed buy-context classifier runs in the demo adapter.", "Persist null."),
    "kills": ("adapter.unsupported", "null:no_round_player_aggregate", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "number|null", "round_players.kills", "integer", "Per-round player kill aggregate is not emitted by this adapter.", "Persist null; never zero."),
    "deaths": ("adapter.unsupported", "null:no_round_player_aggregate", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "number|null", "round_players.deaths", "integer", "Per-round player death aggregate is not emitted by this adapter.", "Persist null; never zero."),
    "assists": ("adapter.unsupported", "null:no_round_player_aggregate", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "number|null", "round_players.assists", "integer", "Per-round player assist aggregate is not emitted by this adapter.", "Persist null; never zero."),
    "damage": ("adapter.unsupported", "null:no_round_player_aggregate", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "number|null", "round_players.damage", "numeric", "Per-round player damage aggregate is not emitted by this adapter.", "Persist null; never zero."),
    "flashAssists": ("adapter.unsupported", "null:no_round_player_aggregate", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "number|null", "round_players.flash_assists", "integer", "Per-round flash assists are not emitted by this adapter.", "Persist null; never zero."),
    "openingKill": ("adapter.unsupported", "null:no_opening_duel_derivation", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "boolean|null", "round_players.opening_kill", "boolean", "Opening duel requires verified event timing and identity.", "Persist null."),
    "openingDeath": ("adapter.unsupported", "null:no_opening_duel_derivation", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "boolean|null", "round_players.opening_death", "boolean", "Opening duel requires verified event timing and identity.", "Persist null."),
    "traded": ("adapter.unsupported", "null:no_trade_derivation", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "boolean|null", "round_players.traded", "boolean", "Trade status requires verified event timing and identity.", "Persist null."),
    "tradeKill": ("adapter.unsupported", "null:no_trade_derivation", "UNAVAILABLE", "SOURCE_UNAVAILABLE", "boolean|null", "round_players.trade_kill", "boolean", "Trade kill requires verified event timing and identity.", "Persist null."),
    "metadata": ("adapter.constant", "empty object", "CONSTANT", "CANONICAL_NOT_AUTHORIZED", "Record<string,unknown>", "round_players.metadata", "jsonb", "No player-round metadata is currently promoted.", "Persist empty object."),
}))
FIELD_SPECS.update(_rows("CanonicalEvent", {
    "roundNumber": ("event_fields.round", "event.roundNumber", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number", "round_events.round_number", "integer", "Parser event round number after reconstruction validation.", "Positive integer within emitted rounds."),
    "type": ("events.player_death", "event.type", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "CanonicalEventType", "round_events.event_type", "text", "Normalized event discriminator from the supported event union, not only player_death.", "Allowlisted Canonical event type."),
    "tick": ("event_fields.tick", "event.tick", "DIRECT", "TICK_DOMAIN_BLOCKED", "number|null", "round_events.tick", "integer", "Observed event tick; does not prove complete tick domain.", "Non-negative integer or null."),
    "gameTimeSeconds": ("event_fields.game_time", "event.timeSeconds", "NORMALIZED", "TICK_DOMAIN_BLOCKED", "number|null", "round_events.time_seconds", "numeric", "Parser event game-time when present.", "Finite seconds or null; no tick fallback without authority."),
    "actorParticipantKey": ("event_fields.attacker_steamid", "event.actorSteamId", "NORMALIZED", "IDENTITY_BLOCKED", "string|null", "round_events.actor_steam_id", "text", "Actor source ID used as participant key only after resolver semantics.", "Null for unresolved actor; never nickname."),
    "victimParticipantKey": ("event_fields.victim_steamid", "event.victimSteamId", "NORMALIZED", "IDENTITY_BLOCKED", "string|null", "round_events.victim_steam_id", "text", "Victim source ID used as participant key only after resolver semantics.", "Null for unresolved victim; never nickname."),
    "assisterParticipantKey": ("event_fields.assister_steamid", "event.assisterSteamId", "NORMALIZED", "IDENTITY_BLOCKED", "string|null", "round_events.assister_steam_id", "text", "Assister source ID used as participant key only after resolver semantics.", "Null for unresolved assister; never nickname."),
    "sourceActorExternalId": ("event_fields.attacker_steamid", "event.actorSteamId", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "string|null", "round_events.source_actor_external_id", "text", "Original actor identifier is preserved independently of resolution.", "Verbatim source identifier or null."),
    "sourceVictimExternalId": ("event_fields.victim_steamid", "event.victimSteamId", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "string|null", "round_events.source_victim_external_id", "text", "Original victim identifier is preserved independently of resolution.", "Verbatim source identifier or null."),
    "sourceAssisterExternalId": ("event_fields.assister_steamid", "event.assisterSteamId", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "string|null", "round_events.source_assister_external_id", "text", "Original assister identifier is preserved independently of resolution.", "Verbatim source identifier or null."),
    "weapon": ("event_fields.weapon", "event.weapon", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "string|null", "round_events.weapon", "text", "Parser event weapon token.", "Bounded normalized token or null."),
    "headshot": ("event_fields.headshot", "event.headshot", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "boolean|null", "round_events.headshot", "boolean", "Explicit event headshot flag.", "Preserve null versus false."),
    "distance": ("event_fields.distance", "event.distance", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "number|null", "round_events.distance", "numeric", "Explicit parser event distance.", "Finite non-negative value or null."),
    "damage": ("event_fields.dmg_health", "event.damage", "NORMALIZED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "round_events.damage", "numeric", "Health damage amount from parser event.", "Finite non-negative value or null; preserve zero."),
    "quality.status": ("adapter.quality", "sourceQuality.status", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "QualityStatus", "round_events.quality.status", "jsonb:text", "Event inherits conservative source quality.", "No event completeness inflation."),
    "quality.reasons": ("adapter.quality", "sourceQuality.reasons", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "string[]", "round_events.quality.reasons", "jsonb:array", "Event inherits parser quality reasons.", "Preserve reason slugs."),
    "quality.confidence": ("adapter.quality", "sourceQuality.confidence", "DERIVED", "DECLARED_BUT_NOT_VERIFIED", "number|null", "round_events.quality.confidence", "jsonb:number", "Event inherits measured parser confidence.", "Finite [0,1] or null."),
    "data": ("adapter.persistence", "event.data", "DIRECT", "DECLARED_BUT_NOT_VERIFIED", "Record<string,unknown>", "round_events.data", "jsonb", "Bounded residual event evidence not promoted to named Canonical fields.", "Preserve JSON object without semantic promotion."),
}))

ADAPTER_OUTPUT_FIELDS = frozenset(FIELD_SPECS)


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    return hashlib.sha256(stable_json(value).encode()).hexdigest()


def generator_commit() -> str:
    configured = os.getenv("GITHUB_SHA", "")
    if re.fullmatch(r"[0-9a-f]{40}", configured):
        return configured
    try:
        value = subprocess.check_output(("git", "rev-parse", "HEAD"), cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        return "UNAVAILABLE"
    return value if re.fullmatch(r"[0-9a-f]{40}", value) else "UNAVAILABLE"


def build_inventory() -> dict[str, Any]:
    matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    matrix_by_id = {row["identity"]: row for row in matrix["rows"]}
    rows: list[dict[str, Any]] = []
    for field in sorted(ADAPTER_OUTPUT_FIELDS):
        spec = FIELD_SPECS[field]
        evidence = matrix_by_id.get(spec["sourceCapability"])
        source_kind = spec["sourceKind"]
        parser_api = evidence.get("pythonCapabilityId") if evidence else None
        if spec["sourceCapability"] in ADAPTER_CAPABILITIES:
            parser_api = "demoToCanonicalBundle"
        mapping_class = spec["mappingStatus"]
        identity_dependency = "BLOCKED" if mapping_class == "IDENTITY_BLOCKED" else "SATISFIED_BY_CONTRACT"
        tick_dependency = "BLOCKED" if mapping_class == "TICK_DOMAIN_BLOCKED" else "NOT_REQUIRED"
        row = {
            **spec,
            "canonicalField": field,
            "canonicalNullability": "NULLABLE" if "null" in spec["canonicalType"] else "REQUIRED",
            "sourceEvent": spec["sourceCapability"].split(".", 1)[1] if spec["sourceCapability"].startswith("events.") else None,
            "sourceQuery": parser_api or "demoToCanonicalBundle",
            "sourceParser": PARSER_NAME,
            "sourceParserVersion": PARSER_VERSION,
            "sourceContractVersion": PARSER_CONTRACT_VERSION,
            "identityDependency": identity_dependency,
            "tickDependency": tick_dependency,
            "evidenceClass": "DECLARED_SOURCE_ONLY",
            "parityStatus": "NOT_RUN",
            "determinismStatus": "NOT_RUN",
            "canonicalAuthorization": False,
            "verificationMethod": "REAL_SAME_DEM_PYTHON_WASM_AND_PERSISTENCE",
            "evidenceReference": {
                "python": evidence.get("pythonEvidenceRef") if evidence else "adapter:demoToCanonicalBundle",
                "wasm": evidence.get("wasmEvidenceRefs", []) if evidence else [],
                "adapter": "src/lib/canonical/adapters/demo.adapter.ts",
            },
            "lastVerifiedAt": None,
            "blockReason": mapping_class,
            "semanticNotes": spec["sourceSemantics"],
            "lossiness": "NULL_PRESERVING" if "null" in spec["canonicalType"] else "NONE_DECLARED",
            "confidence": None,
            "provenanceRequirements": ["VERIFIED_RUNTIME", "REAL_SAME_DEM_PARITY", "DETERMINISM", "PERSISTENCE_ROUND_TRIP"],
            "semanticValidation": "NOT_RUN",
            "persistenceValidation": "DECLARED_FROM_RPC_SQL",
            "normalizationExecuted": False,
            "dependsOnFullTickDomain": mapping_class == "TICK_DOMAIN_BLOCKED",
            "semanticMismatch": mapping_class == "SEMANTIC_MISMATCH",
            # Compatibility names retained for the database v1 projection.
            "normalization": spec["normalizationRule"],
            "identityRequirement": identity_dependency,
            "nullSemantics": "preserve null as unknown",
            "zeroSemantics": "preserve observed zero",
            "falseSemantics": "preserve observed false",
            "emptyStringSemantics": "normalize invalid empty strings to null",
            "missingSemantics": "missing remains null or explicit unavailable",
            "reviewStatus": "REVIEWED",
            "status": mapping_class,
            "pythonEvidence": evidence.get("pythonEvidenceRef") if evidence else "adapter:demoToCanonicalBundle",
            "wasmEvidence": evidence.get("wasmEvidenceRefs", []) if evidence else [],
            "eventEvidence": "REQUIRED_ON_REAL_DEM" if source_kind in {"DIRECT", "NORMALIZED"} else "NOT_APPLICABLE",
            "parserApi": parser_api or "demoToCanonicalBundle",
        }
        row["digest"] = digest(row)
        rows.append(row)
    core = {
        "schemaVersion": SCHEMA_VERSION,
        "inventoryVersion": INVENTORY_VERSION,
        "generatorRevision": "scripts/canonical_mapping_gate.py:v2",
        "generatorCommit": generator_commit(),
        "matrixDigest": matrix["digest"],
        "rows": rows,
    }
    digest_projection = {key: value for key, value in core.items() if key != "generatorCommit"}
    return {**core, "digest": digest(digest_projection)}


def assert_canonical_mapping_gate(inventory: dict[str, Any], matrix: dict[str, Any]) -> dict[str, Any]:
    matrix_by_id = {row.get("identity"): row for row in matrix.get("rows", [])}
    rows = inventory.get("rows")
    if not isinstance(rows, list):
        raise ValueError("CANONICAL_MAPPING_INVENTORY_INVALID")
    canonical_fields: set[str] = set()
    blocked: list[str] = []
    unverified: list[str] = []
    authorized = 0
    for row in rows:
        if not isinstance(row, dict) or any(field not in row for field in REQUIRED_FIELDS):
            raise ValueError("CANONICAL_MAPPING_METADATA_MISSING")
        field = str(row["canonicalField"])
        if field in canonical_fields:
            raise ValueError("CANONICAL_MAPPING_DUPLICATE")
        canonical_fields.add(field)
        capability = row["sourceCapability"]
        capability_row = matrix_by_id.get(capability)
        capability_exists = capability in ADAPTER_CAPABILITIES or capability_row is not None
        if not capability_exists or row["sourceField"] in FORBIDDEN_GENERIC_SOURCES:
            blocked.append(field)
            continue
        mapping_class = row["mappingStatus"]
        if mapping_class not in MAPPING_CLASSES or mapping_class in BLOCKING_CLASSES:
            blocked.append(field)
            continue
        if row["identityDependency"] == "BLOCKED" or row["tickDependency"] == "BLOCKED":
            blocked.append(field)
            continue
        evidence = row["evidenceReference"]
        if not isinstance(evidence, dict) or not evidence.get("python") or not evidence.get("adapter"):
            blocked.append(field)
            continue
        if row["semanticValidation"] != "VERIFIED" or row["persistenceValidation"] != "VERIFIED":
            unverified.append(field)
            continue
        if row["normalizationRule"] and row["normalizationExecuted"] is not True:
            unverified.append(field)
            continue
        if row["parityStatus"] != "VERIFIED" or row["determinismStatus"] != "VERIFIED":
            unverified.append(field)
            continue
        if row["canonicalAuthorization"] is not True:
            unverified.append(field)
            continue
        if capability_row and capability_row.get("evidenceStatus") not in {"VERIFIED", "EXECUTED_VERIFIED"}:
            unverified.append(field)
            continue
        authorized += 1
    missing = ADAPTER_OUTPUT_FIELDS - canonical_fields
    unknown = canonical_fields - ADAPTER_OUTPUT_FIELDS
    if missing or unknown:
        raise ValueError("CANONICAL_MAPPING_SURFACE_MISMATCH:" f"missing={','.join(sorted(missing))}:unknown={','.join(sorted(unknown))}")
    noncanonical_blocked = sum(row.get("status") == "BLOCKED" for row in matrix.get("rows", []))
    result = {
        "canonicalRequiredMappingsTotal": len(rows),
        "canonicalAuthorizedMappings": authorized,
        "canonicalBlockedMappings": len(set(blocked)),
        "canonicalUnverifiedMappings": len(set(unverified)),
        "noncanonicalBlockedFields": noncanonical_blocked,
        "matrixDigest": matrix.get("digest"),
        "inventoryDigest": inventory.get("digest"),
        "gateStatus": "PASS" if authorized == len(rows) and not blocked and not unverified else "BLOCKED",
        "blockedFields": sorted(set(blocked)),
        "unverifiedFields": sorted(set(unverified)),
    }
    return {**result, "digest": digest(result)}


def main() -> int:
    inventory = build_inventory()
    OUTPUT_PATH.write_text(json.dumps(inventory, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    print(stable_json(assert_canonical_mapping_gate(inventory, matrix)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
