"""Read-only generator for the 105-field Canonical gate proposal matrix (2026-10-28).

It READS the current gate definition (scripts/canonical_mapping_gate.FIELD_SPECS) and the
reconciled capability matrix, and joins the production observations recorded in
docs/CANONICAL_105_FIELD_GATE_PROPOSAL.md (read-only SQL against the three validated
matches). It never writes the gate inventory, never changes a gate rule and never marks a
field VERIFIED: per-field parity and determinism remain NOT_PROVEN until a per-field
same-DEM comparison exists.

Usage: python3 scripts/canonical_field_gate_proposal_matrix.py > docs/client-parser/canonical-105-field-proposal-matrix.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.canonical_mapping_gate import FIELD_SPECS  # noqa: E402  (read only)

MATRIX = json.loads((ROOT / "docs/client-parser/reconciled-field-matrix.json").read_text(encoding="utf-8"))
CAPABILITIES = {row.get("pythonCapabilityId"): row for row in MATRIX["rows"]}

# A9.1 run 40622794332 compares raw demoparser2 extraction (Python vs WASM) per DOMAIN on the
# Cache DEM 0caa7c97 only. These are the raw domains a capability belongs to. A domain PASS
# is evidence about the raw extraction, not about the Canonical field after the adapters.
A91_DOMAIN = {
    "header": "header", "economy": "economy", "rounds": "rounds", "game_state": "game_state",
    "teams": "game_state", "score": "game_state", "player_info": "players",
    "events": "deaths", "event_fields": "events",
}
A91_RESULT = {
    "header": "PASS", "economy": "PASS", "rounds": "PASS", "game_state": "PASS", "events": "PASS",
    "deaths": "PASS", "players": "NOT_COMPARABLE (NOT_AVAILABLE_ON_WASM)",
}

# Production observations: 3 validated matches (Dust2 747c7a6b, Mirage 95186f3f, Cache 48e517e4),
# read-only SQL on 2026-10-28. "n/N" = non-null rows / rows. Not queried = NOT_OBSERVED.
OBSERVED = {
    "CanonicalMatchSource.source": "3/3 'demo'",
    "CanonicalMatchSource.sourceContractVersion": "3/3 'demo-v1'",
    "CanonicalMatchSource.externalMatchId": "0/3 (null)",
    "CanonicalMatchSource.externalParentId": "0/3 (null)",
    "CanonicalMatchSource.sourceVersion": "3/3 'demoparser2@0.42.0'",
    "CanonicalMatchSource.fetchedAt": "3/3",
    "CanonicalMatchSource.sourceUpdatedAt": "0/3 (null)",
    "CanonicalMatchSource.status": "3/3 'complete'",
    "CanonicalMatchSource.quality.status": "3/3 'complete'",
    "CanonicalMatchSource.fingerprint": "3/3",
    "CanonicalMatchSource.metadata": "3/3 (8 named keys; tickrate null in 3/3)",
    "CanonicalMatch.game": "3/3", "CanonicalMatch.map": "3/3", "CanonicalMatch.mapNumber": "0/3 (null)",
    "CanonicalMatch.playedAt": "0/3 (null)", "CanonicalMatch.startedAt": "0/3 (null)",
    "CanonicalMatch.finishedAt": "0/3 (null)", "CanonicalMatch.durationSeconds": "0/3 (null)",
    "CanonicalMatch.status": "3/3 'completed'", "CanonicalMatch.finished": "3/3 true",
    "CanonicalMatch.terminal": "3/3 true", "CanonicalMatch.teamA": "0/3 (null)",
    "CanonicalMatch.teamB": "0/3 (null)", "CanonicalMatch.scoreTeamA": "0/3 (null)",
    "CanonicalMatch.scoreTeamB": "0/3 (null)", "CanonicalMatch.winnerTeam": "0/3 (null)",
    "CanonicalMatch.roundCount": "3/3", "CanonicalMatch.quality.status": "3/3 'complete'",
    "CanonicalMatch.quality.reasons": "3/3 []", "CanonicalMatch.quality.confidence": "3/3 1",
    "CanonicalMatch.coverage.roundsExpected": "3/3",
    "CanonicalMatch.coverage.participantsExpected": "0/3 (null)",
    "CanonicalMatch.coverage.participantsResolved": "3/3 = 1",
    "CanonicalMatch.coverage.hasPlayerRoundState": "3/3 true",
    "CanonicalMatch.schemaVersion": "3/3 = 2",
    "CanonicalParticipant.participantKey": "30/30", "CanonicalParticipant.internalPlayerId": "3/30 (targets)",
    "CanonicalParticipant.externalPlayerId": "30/30", "CanonicalParticipant.steamId64": "30/30",
    "CanonicalParticipant.nicknameSnapshot": "30/30", "CanonicalParticipant.team": "0/30 (null)",
    "CanonicalParticipant.isTargetPlayer": "3/30 true (one per match)",
    "CanonicalParticipant.identityStatus": "30/30 'unlinked' (incl. 3 targets with internalPlayerId; D34)",
    "CanonicalParticipant.identityConfidence": "3/30 = 1 (targets)",
    "CanonicalParticipant.metadata": "30/30 {}",
    "CanonicalRound.startTick": "63/63", "CanonicalRound.endTick": "63/63",
    "CanonicalRound.startTimeSeconds": "0/63 (null)", "CanonicalRound.endTimeSeconds": "0/63 (null)",
    "CanonicalRound.durationSeconds": "0/63 (null; parser warning tickrate_unavailable)",
    "CanonicalRound.winningTeam": "0/63 (null)", "CanonicalRound.winningSide": "63/63",
    "CanonicalRound.winReason": "63/63 'unknown'", "CanonicalRound.bombPlanted": "45/63 true",
    "CanonicalRound.bombDefused": "9/63 true", "CanonicalRound.bombExploded": "22/63 true",
    "CanonicalRound.quality.status": "63/63 'complete'", "CanonicalRound.metadata": "63/63 {}",
    "CanonicalRoundPlayer.side": "630/630", "CanonicalRoundPlayer.survived": "0/630 (null)",
    "CanonicalRoundPlayer.moneyStart": "9/630 (D33: demo has 10/10 per round start)",
    "CanonicalRoundPlayer.moneyEnd": "13/630 (D33)",
    "CanonicalRoundPlayer.equipmentValue": "9/630 (D33: demo has 10/10 per round start)",
    "CanonicalRoundPlayer.buyContext": "0/630 (null)",
    "CanonicalRoundPlayer.kills": "0/630 (null)", "CanonicalRoundPlayer.deaths": "0/630 (null)",
    "CanonicalRoundPlayer.assists": "0/630 (null)", "CanonicalRoundPlayer.damage": "0/630 (null)",
    "CanonicalRoundPlayer.flashAssists": "0/630 (null)", "CanonicalRoundPlayer.openingKill": "0/630 (null)",
    "CanonicalRoundPlayer.openingDeath": "0/630 (null)", "CanonicalRoundPlayer.traded": "0/630 (null)",
    "CanonicalRoundPlayer.tradeKill": "0/630 (null)", "CanonicalRoundPlayer.metadata": "630/630 {}",
    "CanonicalEvent.type": "12006/12006 (11 types)", "CanonicalEvent.tick": "12006/12006",
    "CanonicalEvent.gameTimeSeconds": "12006/12006 (from game clock; header tickrate absent)",
    "CanonicalEvent.actorParticipantKey": "2048/12006", "CanonicalEvent.victimParticipantKey": "1979/12006",
    "CanonicalEvent.assisterParticipantKey": "117/12006",
    "CanonicalEvent.sourceActorExternalId": "2048/12006", "CanonicalEvent.sourceVictimExternalId": "1979/12006",
    "CanonicalEvent.sourceAssisterExternalId": "117/12006", "CanonicalEvent.weapon": "1972/12006",
    "CanonicalEvent.headshot": "392/12006", "CanonicalEvent.distance": "392/12006",
    "CanonicalEvent.damage": "1587/12006", "CanonicalEvent.quality.status": "12006/12006 'complete'",
    "CanonicalEvent.data": "1979/12006 non-empty",
}

CURRENT_STATE = {
    "DECLARED_BUT_NOT_VERIFIED": "NOT_VERIFIED",
    "SOURCE_UNAVAILABLE": "UNSUPPORTED (SOURCE_UNAVAILABLE)",
    "NOT_SUPPORTED": "UNSUPPORTED (NOT_SUPPORTED)",
    "IDENTITY_BLOCKED": "IDENTITY_BLOCKED",
    "TICK_DOMAIN_BLOCKED": "TICK_BLOCKED",
    "CANONICAL_NOT_AUTHORIZED": "NOT_AUTHORIZED",
}

# Proposed state under the recommended contract (canonical-demo-v3, NOT adopted; owner decision).
# A proposed state is a target classification with the evidence it still needs, never a result.
PROPOSED = {
    # Defects found by this investigation (fix first, then verify).
    "CanonicalRoundPlayer.moneyStart": ("BLOCKED_DEFECT", "D33 economy under-extraction; fix, release, then per-field parity/determinism."),
    "CanonicalRoundPlayer.moneyEnd": ("BLOCKED_DEFECT", "D33; same root cause (end-of-round read from the thinned sample)."),
    "CanonicalRoundPlayer.equipmentValue": ("BLOCKED_DEFECT", "D33."),
    "CanonicalParticipant.identityStatus": ("BLOCKED_DEFECT", "D34 identity_status not updated on re-observation (ON CONFLICT omits it)."),
    # Structural blockers.
    "CanonicalMatchSource.externalMatchId": ("UNSUPPORTED_BY_SOURCE", "Always null; test that the adapter never fills it."),
    "CanonicalMatchSource.externalParentId": ("UNSUPPORTED_BY_SOURCE", "Always null; test."),
    "CanonicalMatchSource.sourceUpdatedAt": ("UNSUPPORTED_BY_SOURCE", "DEM has no update timestamp; always null; test."),
    "CanonicalMatch.mapNumber": ("UNSUPPORTED_BY_SOURCE", "Standalone DEM has no series position; always null; test."),
    "CanonicalMatch.finishedAt": ("UNSUPPORTED_BY_SOURCE", "No wall clock in the DEM; always null; test."),
    "CanonicalMatch.coverage.participantsExpected": ("UNSUPPORTED_BY_SOURCE", "No roster contract; always null; test."),
    "CanonicalMatch.coverage.participantsResolved": ("IDENTITY_SCOPED", "Count of attached participants; valid only with the EXACT Steam attachment rule; test."),
    "CanonicalRound.startTimeSeconds": ("NEEDS_PARSER_SUPPORT", "Derivable from the proven game clock (D22) once specified; until then always null."),
    "CanonicalRound.endTimeSeconds": ("NEEDS_PARSER_SUPPORT", "Same as startTimeSeconds."),
    "CanonicalRound.winReason": ("NEEDS_PARSER_SUPPORT", "round_win_reason exists in game state (D30 evidence); requires a reviewed enum mapping; sentinel 'unknown' until then."),
    "CanonicalRound.startTick": ("CANDIDATE_AVAILABLE", "Tick domain proven for round boundaries by D30 real-DEM tests; needs per-field parity on the server contract."),
    "CanonicalRound.endTick": ("CANDIDATE_AVAILABLE", "Same as startTick."),
    "CanonicalEvent.tick": ("CANDIDATE_AVAILABLE", "Raw events domain PASS (A9.1); needs per-field parity on the server contract and an ordering test."),
    "CanonicalEvent.gameTimeSeconds": ("CANDIDATE_AVAILABLE", "Values come from the game clock when header tickrate is absent; provenance must be recorded per observation."),
    "CanonicalRoundPlayer.survived": ("NEEDS_DERIVATION_DECISION", "Derivable from death events + round roster only if the roster is proven complete; product decision."),
    "CanonicalRoundPlayer.buyContext": ("UNSUPPORTED_BY_CONTRACT", "Needs a reviewed classifier; depends on D33 economy."),
    "CanonicalRoundPlayer.participantKey": ("IDENTITY_SCOPED", "Source-local Steam key; join key only, never ownership."),
    "CanonicalParticipant.participantKey": ("IDENTITY_SCOPED", "Source-local Steam key; never nickname."),
    "CanonicalParticipant.internalPlayerId": ("IDENTITY_SCOPED", "Only through EXACT Steam attachment."),
    "CanonicalParticipant.isTargetPlayer": ("IDENTITY_SCOPED", "Only through EXACT Steam attachment."),
    "CanonicalParticipant.identityConfidence": ("IDENTITY_SCOPED", "1 only with EXACT attachment."),
    "CanonicalEvent.actorParticipantKey": ("IDENTITY_SCOPED", "Source-local Steam key."),
    "CanonicalEvent.victimParticipantKey": ("IDENTITY_SCOPED", "Source-local Steam key."),
    "CanonicalEvent.assisterParticipantKey": ("IDENTITY_SCOPED", "Source-local Steam key."),
    "CanonicalParticipant.metadata": ("CONSTANT_EMPTY", "Constant {}; test that it stays {}."),
    "CanonicalRound.metadata": ("CONSTANT_EMPTY", "Constant {}; test."),
    "CanonicalRoundPlayer.metadata": ("CONSTANT_EMPTY", "Constant {}; test."),
    # Declared fields whose production value is always null for a source reason.
    "CanonicalMatch.playedAt": ("LEGITIMATELY_EMPTY_WHEN_ABSENT", "header.match_date absent in 3/3; declared capability game_state.match_start_time is game-clock seconds, not a timestamp (spec correction)."),
    "CanonicalMatch.startedAt": ("LEGITIMATELY_EMPTY_WHEN_ABSENT", "Same as playedAt."),
    "CanonicalMatch.durationSeconds": ("LEGITIMATELY_EMPTY_WHEN_ABSENT", "Only from header tickrate; absent in 3/3 (warning tickrate_unavailable)."),
    "CanonicalRound.durationSeconds": ("LEGITIMATELY_EMPTY_WHEN_ABSENT", "Same root as Match.durationSeconds."),
    "CanonicalMatch.teamA": ("NEEDS_PARSER_SUPPORT", "header.teams empty in 3/3; teams.team_name is a RECONCILED capability the parser does not emit."),
    "CanonicalMatch.teamB": ("NEEDS_PARSER_SUPPORT", "Same as teamA."),
    "CanonicalMatch.scoreTeamA": ("NEEDS_PARSER_SUPPORT", "header.score empty in 3/3; team_rounds_total exists in game state."),
    "CanonicalMatch.scoreTeamB": ("NEEDS_PARSER_SUPPORT", "Same as scoreTeamA."),
    "CanonicalMatch.winnerTeam": ("NEEDS_PARSER_SUPPORT", "Derived from scores; null while scores are null."),
    "CanonicalRound.winningTeam": ("NEEDS_PARSER_SUPPORT", "Depends on team identity (teamA/teamB); CT/T tokens are sides, correctly removed."),
    "CanonicalParticipant.team": ("NEEDS_PARSER_SUPPORT", "Depends on teamA/teamB; team_number is side evidence, correctly removed."),
}
for _f in ("kills", "deaths", "assists", "damage", "flashAssists", "openingKill", "openingDeath", "traded", "tradeKill"):
    PROPOSED[f"CanonicalRoundPlayer.{_f}"] = (
        "NEEDS_DERIVATION_DECISION",
        "Derivable from verified events + round boundaries (the metrics recount already does it); "
        "null until a reviewed derivation is specified; never zero.",
    )

RISK = {
    "IDENTITY_SCOPED": "HIGH (wrong ownership is a privacy and correctness failure)",
    "BLOCKED_DEFECT": "HIGH (persisted value is incomplete today)",
    "NEEDS_DERIVATION_DECISION": "MEDIUM (a derivation can invent values if under-specified)",
    "NEEDS_PARSER_SUPPORT": "MEDIUM",
    "CANDIDATE_AVAILABLE": "MEDIUM (tick/time provenance)",
    "LEGITIMATELY_EMPTY_WHEN_ABSENT": "LOW (null is correct; risk is a silent fallback)",
    "UNSUPPORTED_BY_SOURCE": "LOW (risk only if a value is ever substituted)",
    "UNSUPPORTED_BY_CONTRACT": "LOW",
    "CONSTANT_EMPTY": "LOW",
    "CANDIDATE_VERIFY": "LOW-MEDIUM",
}


def _support(spec: dict) -> tuple[str, str, str]:
    cap = spec["sourceCapability"]
    if cap.startswith("adapter."):
        return "adapter-derived (server TS)", "N/A (no WASM counterpart in the server path)", "N/A (adapter)"
    row = CAPABILITIES.get(cap)
    if row is None:
        return "NOT_FOUND_IN_MATRIX", "NOT_FOUND_IN_MATRIX", "NOT_PROVEN"
    wasm = "yes (RECONCILED)" if row.get("status") == "RECONCILED" else f"no ({row.get('status')})"
    domain = A91_DOMAIN.get(cap.split(".")[0])
    a91 = A91_RESULT.get(domain or "", "NOT_RUN")
    return "yes (demoparser2 0.42.0)", wasm, f"raw domain '{domain}': {a91}; field: NOT_PROVEN"


def build() -> dict:
    rows = []
    for key, spec in FIELD_SPECS.items():
        entity, field = key.split(".", 1)
        python, wasm, parity = _support(spec)
        status = spec["mappingStatus"]
        proposed, why = PROPOSED.get(key, ("CANDIDATE_VERIFY", "Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence."))
        rows.append({
            "id": key, "entity": entity, "field": field,
            "consumer": spec["persistenceTarget"], "persistenceType": spec["persistenceType"],
            "sourceCapability": spec["sourceCapability"], "sourceField": spec["sourceField"],
            "kind": spec["sourceKind"], "type": spec["canonicalType"],
            "semantics": spec["sourceSemantics"], "nullability": spec["normalizationRule"],
            "python": python, "wasm": wasm,
            "identityDependency": "BLOCKED" if status == "IDENTITY_BLOCKED" else "NONE_DECLARED",
            "tickDependency": "BLOCKED" if status == "TICK_DOMAIN_BLOCKED" else "NONE_DECLARED",
            "observedProduction": OBSERVED.get(key, "NOT_OBSERVED"),
            "parity": parity,
            "determinism": "NOT_PROVEN (A9.1 determinism is digest-level over raw tables)" if not spec["sourceCapability"].startswith("adapter.") else "NOT_PROVEN",
            "evidence": "DECLARED_SOURCE_ONLY",
            "currentMappingStatus": status, "currentState": CURRENT_STATE[status],
            "canonicalAuthorization": False,
            "proposedState": proposed, "proposedRationale": why, "risk": RISK[proposed],
        })
    return {
        "schema": "canonical-105-field-proposal-matrix/1",
        "status": "PROPOSAL_NOT_ADOPTED",
        "gateRuleChanged": False,
        "rowCount": len(rows),
        "rows": rows,
    }


if __name__ == "__main__":
    out = build()
    assert out["rowCount"] == 105, out["rowCount"]
    json.dump(out, sys.stdout, indent=1, ensure_ascii=False, sort_keys=False)
    sys.stdout.write("\n")
