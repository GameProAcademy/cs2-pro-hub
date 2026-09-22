#!/usr/bin/env python3
"""Canonical-scoped mapping inventory and fail-closed release gate."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MATRIX_PATH = ROOT / "docs/client-parser/reconciled-field-matrix.json"
OUTPUT_PATH = ROOT / "docs/client-parser/canonical-mapping-inventory.json"

ALLOWED_STATUSES = {
    "PROPOSED", "REVIEWED", "RECONCILED", "PARITY_PENDING",
    "DETERMINISM_PENDING", "AUTHORIZED_CANONICAL", "RAW_ONLY", "BLOCKED", "REJECTED",
}
REQUIRED_FIELDS = (
    "canonicalField", "sourceCapability", "sourceField", "parserApi", "pythonEvidence",
    "wasmEvidence", "eventEvidence", "normalization", "identityRequirement", "nullSemantics",
    "zeroSemantics", "falseSemantics", "emptyStringSemantics", "missingSemantics",
    "evidenceClass", "parityStatus", "determinismStatus", "canonicalAuthorization",
    "reviewStatus", "lastVerifiedAt", "status", "dependsOnFullTickDomain",
    "semanticMismatch", "normalizationExecuted",
)

# Complete leaf-field surface emitted by the Demo adapter. Free-form metadata/data
# bags are inventoried as bounded roots; their keys remain provenance, never schema.
ADAPTER_OUTPUT_FIELDS = frozenset({
    "CanonicalMatchSource.source", "CanonicalMatchSource.sourceContractVersion",
    "CanonicalMatchSource.externalMatchId", "CanonicalMatchSource.externalParentId",
    "CanonicalMatchSource.sourceVersion", "CanonicalMatchSource.fetchedAt",
    "CanonicalMatchSource.sourceUpdatedAt", "CanonicalMatchSource.status",
    "CanonicalMatchSource.quality.status", "CanonicalMatchSource.quality.reasons",
    "CanonicalMatchSource.quality.confidence", "CanonicalMatchSource.fingerprint",
    "CanonicalMatchSource.metadata",
    "CanonicalMatch.game", "CanonicalMatch.map", "CanonicalMatch.mapNumber",
    "CanonicalMatch.playedAt", "CanonicalMatch.startedAt", "CanonicalMatch.finishedAt",
    "CanonicalMatch.durationSeconds", "CanonicalMatch.status", "CanonicalMatch.finished",
    "CanonicalMatch.terminal", "CanonicalMatch.teamA", "CanonicalMatch.teamB",
    "CanonicalMatch.scoreTeamA", "CanonicalMatch.scoreTeamB", "CanonicalMatch.winnerTeam",
    "CanonicalMatch.roundCount", "CanonicalMatch.quality.status",
    "CanonicalMatch.quality.reasons", "CanonicalMatch.quality.confidence",
    "CanonicalMatch.coverage.roundsExpected", "CanonicalMatch.coverage.roundsObserved",
    "CanonicalMatch.coverage.participantsExpected", "CanonicalMatch.coverage.participantsObserved",
    "CanonicalMatch.coverage.participantsResolved", "CanonicalMatch.coverage.eventsObserved",
    "CanonicalMatch.coverage.hasRoundData", "CanonicalMatch.coverage.hasEventData",
    "CanonicalMatch.coverage.hasPlayerRoundState", "CanonicalMatch.schemaVersion",
    "CanonicalParticipant.participantKey", "CanonicalParticipant.internalPlayerId",
    "CanonicalParticipant.source", "CanonicalParticipant.externalPlayerId",
    "CanonicalParticipant.steamId64", "CanonicalParticipant.nicknameSnapshot",
    "CanonicalParticipant.team", "CanonicalParticipant.isTargetPlayer",
    "CanonicalParticipant.identityStatus", "CanonicalParticipant.identityConfidence",
    "CanonicalParticipant.metadata",
    "CanonicalRound.roundNumber", "CanonicalRound.startTick", "CanonicalRound.endTick",
    "CanonicalRound.startTimeSeconds", "CanonicalRound.endTimeSeconds",
    "CanonicalRound.durationSeconds", "CanonicalRound.winningTeam",
    "CanonicalRound.winningSide", "CanonicalRound.winReason", "CanonicalRound.bombPlanted",
    "CanonicalRound.bombDefused", "CanonicalRound.bombExploded",
    "CanonicalRound.quality.status", "CanonicalRound.quality.reasons",
    "CanonicalRound.quality.confidence", "CanonicalRound.metadata",
    "CanonicalRoundPlayer.roundNumber", "CanonicalRoundPlayer.participantKey",
    "CanonicalRoundPlayer.side", "CanonicalRoundPlayer.survived",
    "CanonicalRoundPlayer.moneyStart", "CanonicalRoundPlayer.moneyEnd",
    "CanonicalRoundPlayer.equipmentValue", "CanonicalRoundPlayer.buyContext",
    "CanonicalRoundPlayer.kills", "CanonicalRoundPlayer.deaths", "CanonicalRoundPlayer.assists",
    "CanonicalRoundPlayer.damage", "CanonicalRoundPlayer.flashAssists",
    "CanonicalRoundPlayer.openingKill", "CanonicalRoundPlayer.openingDeath",
    "CanonicalRoundPlayer.traded", "CanonicalRoundPlayer.tradeKill",
    "CanonicalRoundPlayer.metadata",
    "CanonicalEvent.roundNumber", "CanonicalEvent.type", "CanonicalEvent.tick",
    "CanonicalEvent.gameTimeSeconds", "CanonicalEvent.actorParticipantKey",
    "CanonicalEvent.victimParticipantKey", "CanonicalEvent.assisterParticipantKey",
    "CanonicalEvent.sourceActorExternalId", "CanonicalEvent.sourceVictimExternalId",
    "CanonicalEvent.sourceAssisterExternalId", "CanonicalEvent.weapon",
    "CanonicalEvent.headshot", "CanonicalEvent.distance", "CanonicalEvent.damage",
    "CanonicalEvent.quality.status", "CanonicalEvent.quality.reasons",
    "CanonicalEvent.quality.confidence", "CanonicalEvent.data",
})

# Direct parser-to-Canonical mappings get specific evidence. Every other emitted
# field is still inventoried and remains fail-closed as a derived/constant mapping.
DIRECT_INVENTORY: tuple[dict[str, Any], ...] = (
    {
        "canonicalField": "CanonicalMatch.map", "sourceCapability": "header.map_name",
        "sourceField": "map_name", "parserApi": "parse_header",
        "normalization": "canonical CS2 map-code normalization",
        "identityRequirement": "NOT_APPLICABLE", "nullSemantics": "unknown map",
        "zeroSemantics": "INVALID", "falseSemantics": "INVALID", "emptyStringSemantics": "missing",
        "missingSemantics": "null", "dependsOnFullTickDomain": False,
    },
    {
        "canonicalField": "CanonicalParticipant.steamId64", "sourceCapability": "player_info.steamid",
        "sourceField": "steamid", "parserApi": "parse_player_info",
        "normalization": "decimal SteamID64 string; zero is unlinked",
        "identityRequirement": "STEAM_ID64_OR_NULL", "nullSemantics": "unlinked participant",
        "zeroSemantics": "null", "falseSemantics": "INVALID", "emptyStringSemantics": "null",
        "missingSemantics": "null", "dependsOnFullTickDomain": False,
    },
    {
        "canonicalField": "CanonicalParticipant.nicknameSnapshot", "sourceCapability": "player_info.name",
        "sourceField": "name", "parserApi": "parse_player_info",
        "normalization": "bounded UTF-8 snapshot; never identity",
        "identityRequirement": "NICKNAME_NOT_STRONG_IDENTITY", "nullSemantics": "unknown nickname",
        "zeroSemantics": "INVALID", "falseSemantics": "INVALID", "emptyStringSemantics": "null",
        "missingSemantics": "null", "dependsOnFullTickDomain": False,
    },
    {
        "canonicalField": "CanonicalRound.startTick", "sourceCapability": "rounds.start_tick",
        "sourceField": "round_start.tick", "parserApi": "parse_event",
        "normalization": "non-negative integer preserving parser order",
        "identityRequirement": "NOT_APPLICABLE", "nullSemantics": "unknown boundary",
        "zeroSemantics": "valid tick zero", "falseSemantics": "INVALID", "emptyStringSemantics": "INVALID",
        "missingSemantics": "null", "dependsOnFullTickDomain": False,
    },
    {
        "canonicalField": "CanonicalRound.endTick", "sourceCapability": "rounds.end_tick",
        "sourceField": "round_end.tick", "parserApi": "parse_event",
        "normalization": "first valid end after start; pre-start ends ignored",
        "identityRequirement": "NOT_APPLICABLE", "nullSemantics": "unknown boundary",
        "zeroSemantics": "valid only when ordered after start", "falseSemantics": "INVALID",
        "emptyStringSemantics": "INVALID", "missingSemantics": "null", "dependsOnFullTickDomain": False,
    },
    {
        "canonicalField": "CanonicalRound.winningSide", "sourceCapability": "rounds.winner_side",
        "sourceField": "round_end.winner", "parserApi": "parse_event",
        "normalization": "explicit CT/T parser-side value only",
        "identityRequirement": "TEAM_SLOT_IS_NOT_ROUND_SIDE", "nullSemantics": "unknown side",
        "zeroSemantics": "unknown", "falseSemantics": "INVALID", "emptyStringSemantics": "unknown",
        "missingSemantics": "null", "dependsOnFullTickDomain": False,
    },
    {
        "canonicalField": "CanonicalEvent.sourceActorExternalId", "sourceCapability": "event_fields.attacker_steamid",
        "sourceField": "attacker_steamid", "parserApi": "parse_event",
        "normalization": "source identifier preserved verbatim; participant resolution separate",
        "identityRequirement": "SOURCE_ID_NOT_PARTICIPANT_KEY", "nullSemantics": "unresolved actor",
        "zeroSemantics": "null", "falseSemantics": "INVALID", "emptyStringSemantics": "null",
        "missingSemantics": "null", "dependsOnFullTickDomain": False,
    },
)

DIRECT_BY_FIELD = {row["canonicalField"]: row for row in DIRECT_INVENTORY}


def seed_for(field: str) -> dict[str, Any]:
    direct = DIRECT_BY_FIELD.get(field)
    if direct:
        return direct
    if field.startswith("CanonicalParticipant"):
        capability, parser_api = "player_info.steamid", "parse_player_info"
    elif field.startswith("CanonicalRoundPlayer"):
        capability, parser_api = "economy.balance", "parse_ticks"
    elif field.startswith("CanonicalRound"):
        capability, parser_api = "rounds.number", "parse_event"
    elif field.startswith("CanonicalEvent"):
        capability, parser_api = "events.player_death", "parse_event"
    else:
        capability, parser_api = "header.map_name", "parse_header"
    return {
        "canonicalField": field,
        "sourceCapability": capability,
        "sourceField": "derived_or_constant",
        "parserApi": parser_api,
        "normalization": "Demo adapter translation; real same-DEM evidence required",
        "identityRequirement": "EXPLICIT_CANONICAL_SEMANTICS",
        "nullSemantics": "unknown remains null",
        "zeroSemantics": "observed zero preserved",
        "falseSemantics": "observed false preserved",
        "emptyStringSemantics": "not promoted without validation",
        "missingSemantics": "null or fail-closed constant",
        "dependsOnFullTickDomain": field.startswith(("CanonicalRound", "CanonicalEvent")),
    }


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    return hashlib.sha256(stable_json(value).encode()).hexdigest()


def build_inventory() -> dict[str, Any]:
    matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    matrix_by_id = {row["identity"]: row for row in matrix["rows"]}
    rows: list[dict[str, Any]] = []
    for field in sorted(ADAPTER_OUTPUT_FIELDS):
        seed = seed_for(field)
        evidence = matrix_by_id.get(seed["sourceCapability"])
        row = {
            **seed,
            "pythonEvidence": evidence.get("pythonEvidenceRef") if evidence else None,
            "wasmEvidence": evidence.get("wasmEvidenceRefs", []) if evidence else [],
            "eventEvidence": "REQUIRED_ON_REAL_DEM" if seed["parserApi"] == "parse_event" else "NOT_APPLICABLE",
            "evidenceClass": "DECLARED_SOURCE_ONLY",
            "parityStatus": "NOT_RUN",
            "determinismStatus": "NOT_RUN",
            "canonicalAuthorization": False,
            "reviewStatus": "REVIEWED",
            "lastVerifiedAt": None,
            "status": "PARITY_PENDING",
            "semanticMismatch": False,
            "normalizationExecuted": False,
        }
        row["digest"] = digest(row)
        rows.append(row)
    payload = {"schemaVersion": 1, "matrixDigest": matrix["digest"], "rows": rows}
    return {**payload, "digest": digest(payload)}


def assert_canonical_mapping_gate(inventory: dict[str, Any], matrix: dict[str, Any]) -> dict[str, Any]:
    matrix_ids = {row.get("identity") for row in matrix.get("rows", [])}
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
        if row["status"] not in ALLOWED_STATUSES or row["sourceCapability"] not in matrix_ids:
            blocked.append(field)
            continue
        if row["semanticMismatch"] is True or row["dependsOnFullTickDomain"] is True:
            blocked.append(field)
            continue
        if row["normalization"] and row["normalizationExecuted"] is not True:
            unverified.append(field)
            continue
        if row["status"] != "AUTHORIZED_CANONICAL" or row["canonicalAuthorization"] is not True:
            unverified.append(field)
            continue
        if row["parityStatus"] != "VERIFIED" or row["determinismStatus"] != "VERIFIED":
            unverified.append(field)
            continue
        authorized += 1
    missing = ADAPTER_OUTPUT_FIELDS - canonical_fields
    unknown = canonical_fields - ADAPTER_OUTPUT_FIELDS
    if missing or unknown:
        raise ValueError(
            "CANONICAL_MAPPING_SURFACE_MISMATCH:"
            f"missing={','.join(sorted(missing))}:unknown={','.join(sorted(unknown))}"
        )
    noncanonical_blocked = sum(
        row.get("status") == "BLOCKED" and row.get("identity") not in {r.get("sourceCapability") for r in rows}
        for row in matrix.get("rows", [])
    )
    result = {
        "canonicalRequiredMappingsTotal": len(rows),
        "canonicalAuthorizedMappings": authorized,
        "canonicalBlockedMappings": len(blocked),
        "canonicalUnverifiedMappings": len(unverified),
        "noncanonicalBlockedFields": noncanonical_blocked,
        "matrixDigest": matrix.get("digest"),
        "inventoryDigest": inventory.get("digest"),
        "gateStatus": "PASS" if not blocked and not unverified else "BLOCKED",
        "blockedFields": sorted(blocked),
        "unverifiedFields": sorted(unverified),
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
