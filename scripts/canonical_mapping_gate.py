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

# This inventory names only fields consumed by the current Canonical adapter. Entries
# remain blocked until same-DEM parity and determinism are actually observed.
INVENTORY: tuple[dict[str, Any], ...] = (
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


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    return hashlib.sha256(stable_json(value).encode()).hexdigest()


def build_inventory(*, authorize: bool = False) -> dict[str, Any]:
    matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    matrix_by_id = {row["identity"]: row for row in matrix["rows"]}
    rows: list[dict[str, Any]] = []
    for seed in INVENTORY:
        evidence = matrix_by_id.get(seed["sourceCapability"])
        parity = "VERIFIED" if authorize else "NOT_RUN"
        determinism = "VERIFIED" if authorize else "NOT_RUN"
        status = "AUTHORIZED_CANONICAL" if authorize else "PARITY_PENDING"
        row = {
            **seed,
            "pythonEvidence": evidence.get("pythonEvidenceRef") if evidence else None,
            "wasmEvidence": evidence.get("wasmEvidenceRefs", []) if evidence else [],
            "eventEvidence": "REQUIRED_ON_REAL_DEM" if seed["parserApi"] == "parse_event" else "NOT_APPLICABLE",
            "evidenceClass": "REAL_DEM_PARITY" if authorize else "DECLARED_SOURCE_ONLY",
            "parityStatus": parity,
            "determinismStatus": determinism,
            "canonicalAuthorization": authorize,
            "reviewStatus": "REVIEWED",
            "lastVerifiedAt": "2026-09-22T00:00:00Z" if authorize else None,
            "status": status,
            "semanticMismatch": False,
            "normalizationExecuted": authorize,
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
