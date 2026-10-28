"""canonical-demo-v3: per-field, per-path availability contract for the 105 Canonical demo fields.

v2 (scripts/canonical_mapping_gate.py, release cf0549c2) is unchanged and stays the historical,
immutable baseline: 0/105 authorized, gate BLOCKED. v3 is a separate, versioned contract over the
SAME 105 field ids (FIELD_SPECS). It does not authorize fields by flipping a boolean: every field
gets one explicit STATE per runtime PATH, and each state names the evidence it requires. The v3
gate (scripts/canonical_v3/gate.py) passes for a path only when every field is in a terminal
state AND the evidence for that state exists and holds.

Paths are evaluated independently. A server result never approves the browser path and vice
versa. Raw-table parity between Python and WASM (A9.1) is evidence about the raw extraction only;
it is never counted as Canonical field parity.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from scripts.canonical_mapping_gate import FIELD_SPECS

CONTRACT_VERSION = "canonical-demo-v3"
SCHEMA_VERSION = 1
PATHS = ("server", "browser")

# --------------------------------------------------------------------------------------------- #
# States (formal). "representation" is what the persisted value must be for an observation of a
# field in that state; null, 0, [], {}, "unknown" and an absent key are distinct.
# --------------------------------------------------------------------------------------------- #
STATES: dict[str, dict[str, Any]] = {
    "available": {
        "meaning": "The value is produced from a verified source by the path's code, with field-level evidence.",
        "preconditions": ["source capability exists for this path", "derivation reviewed", "no open defect"],
        "evidence": ["observed_non_null_in_real_demo", "deterministic_across_runs", "semantic_checks_pass",
                     "persistence_round_trip_equal"],
        "nullable": "only per observation, with the field's declared null rule (NULL != ZERO)",
        "persist": True, "metrics": True, "display": True, "terminal": True,
        "evolution": "leaves only if a check fails (-> not_verified) or a cross-path comparison diverges (-> parity_failed)",
    },
    "legitimately_empty": {
        "meaning": "The information does not exist in this source (the DEM format or contract cannot carry it).",
        "preconditions": ["documented source reason"],
        "evidence": ["representation_holds_in_every_observation"],
        "nullable": "always the declared representation (null or a constant)",
        "persist": "representation only", "metrics": False, "display": "as 'not provided by this source'",
        "terminal": True,
        "evolution": "a source change that carries the information re-opens the field as not_verified",
    },
    "unsupported": {
        "meaning": "The information exists or could be derived, but this path has no reviewed extraction yet.",
        "preconditions": ["documented gap", "exit criteria"],
        "evidence": ["representation_holds_in_every_observation"],
        "nullable": "always null (or the declared sentinel)",
        "persist": "representation only", "metrics": False, "display": "as 'not supported yet'",
        "terminal": True,
        "evolution": "implementing the extraction moves it to not_verified until its evidence exists",
    },
    "identity_blocked": {
        "meaning": "The value depends on player identity this path cannot establish.",
        "preconditions": ["identity rule reference"],
        "evidence": ["representation_holds_in_every_observation"],
        "nullable": "always the declared representation",
        "persist": False, "metrics": False, "display": False, "terminal": True,
        "evolution": "an identity source with EXACT Steam evidence on this path re-opens it as not_verified",
    },
    "tick_blocked": {
        "meaning": "The value depends on a tick/time domain this path has not proven complete.",
        "preconditions": ["tick domain definition (O6)"],
        "evidence": ["representation_holds_in_every_observation"],
        "nullable": "always the declared representation",
        "persist": False, "metrics": False, "display": False, "terminal": True,
        "evolution": "proving the tick domain on this path re-opens it as not_verified",
    },
    "not_authorized": {
        "meaning": "The path may not persist or promote this field by policy (single source of truth elsewhere, or no Canonical writer on this path).",
        "preconditions": ["policy reference"],
        "evidence": ["policy_reference_resolves", "representation_holds_in_every_observation_when_produced"],
        "nullable": "always the declared representation",
        "persist": False, "metrics": False, "display": False, "terminal": True,
        "evolution": "changes only by a new contract version",
    },
    "not_verified": {
        "meaning": "Produced or producible, but its evidence is missing or a check failed.",
        "preconditions": [], "evidence": [], "nullable": "unknown",
        "persist": "only as in v2 (unchanged behaviour); never counts as verified", "metrics": "as in v2",
        "display": "as in v2", "terminal": False,
        "evolution": "evidence -> its target state; failing check stays here",
    },
    "parity_failed": {
        "meaning": "Two implementations of the same field on the same DEM disagree.",
        "preconditions": [], "evidence": ["divergence_record"], "nullable": "unknown",
        "persist": False, "metrics": False, "display": False, "terminal": False,
        "evolution": "a fix plus a new equal comparison -> not_verified -> available",
    },
}
TERMINAL_STATES = frozenset(k for k, v in STATES.items() if v["terminal"])
REPRESENTATION_STATES = frozenset({"legitimately_empty", "unsupported", "identity_blocked", "tick_blocked", "not_authorized"})

# --------------------------------------------------------------------------------------------- #
# Decisions O3-O6 (technical, reversible; see docs/CANONICAL_DEMO_V3.md §4).
# --------------------------------------------------------------------------------------------- #
DECISIONS = {
    "O3_winReason": "The stored literal 'unknown' (v2) is a sentinel meaning 'unsupported on this path', never a "
                    "reason value. v3 classifies the field 'unsupported'; consumers must read the field state, not "
                    "the string. A typed reason requires a reviewed round_win_reason code table (exit criterion).",
    "O4_round_aggregates": "Per-round kills/deaths/assists/damage/flashAssists/opening*/traded/tradeKill/survived stay "
                           "null in the bundle. They are derived once, in the metrics layer (src/lib/pipeline/metrics.ts), "
                           "from verified events; the bundle never carries a second copy (single source of truth). "
                           "A 0 is only produced by the metrics layer, never by the bundle.",
    "O5_participantsResolved": "An integer count of participants with an internal player id after the EXACT Steam "
                               "attachment step ran; 0 means 'none resolved'. The demo path always runs the step, so "
                               "'could not determine' does not occur on it; an observation without the step would be "
                               "null (not 0).",
    "O6_tick_domain": "A demo's tick domain is complete for Canonical when: (a) every round has non-null start and end "
                      "ticks with start < end <= next start; (b) every persisted event tick lies inside its round's "
                      "[start, end] (events the parser could not assign are omitted and counted in a warning, never "
                      "re-assigned); (c) event times are non-decreasing in tick order within a round; (d) the time "
                      "provenance (native game_time, header tickrate or game clock) is recorded in the RAW manifest "
                      "warnings. Derived per-round aggregates stay in the metrics layer (O4).",
}

S = "server"
B = "browser"
# Common rationale fragments
DEM_NO = "a CS2 DEM does not carry this information"
CONTRACT_NULL = "the parser contract emits it as null/empty by construction (services/cs2-demo-parser/adapter.py)"
METRICS_SOT = "derived once in the metrics layer from verified events (O4: single source of truth)"
BROWSER_POLICY = ("no browser Canonical writer exists: the client parser is disabled in production "
                  "(src/lib/client-parser/clientParser.service.ts), never persists and never grants admission "
                  "(src/lib/appDataContracts.ts canonicalAuthorization:false)")


def _server(state: str, why: str, *, representation: Any = None, exit: str | None = None,
            checks: tuple[str, ...] = ()) -> dict[str, Any]:
    return {"state": state, "why": why, "representation": representation, "exit": exit, "checks": list(checks)}


# Server-path classification for every field. Anything not listed here is a hard error (no default).
SERVER: dict[str, dict[str, Any]] = {
    # CanonicalMatchSource
    "CanonicalMatchSource.source": _server("available", "adapter literal 'demo'", checks=("equals:demo",)),
    "CanonicalMatchSource.sourceContractVersion": _server("available", "configured source contract token", checks=("equals:demo-v1",)),
    "CanonicalMatchSource.externalMatchId": _server("legitimately_empty", DEM_NO + " (no provider match id); never the fingerprint"),
    "CanonicalMatchSource.externalParentId": _server("legitimately_empty", DEM_NO + " (no series parent)"),
    "CanonicalMatchSource.sourceVersion": _server("available", "validated parser name@version", checks=("equals:demoparser2@0.42.0",)),
    "CanonicalMatchSource.fetchedAt": _server("available", "server collection timestamp (input)", checks=("iso8601",)),
    "CanonicalMatchSource.sourceUpdatedAt": _server("legitimately_empty", DEM_NO + " (no source update time)"),
    "CanonicalMatchSource.status": _server("available", "complete iff the parser reports no partial parse", checks=("in:complete,incomplete",)),
    "CanonicalMatchSource.quality.status": _server("available", "quality helper over parser flags", checks=("in:complete,partial,unknown",)),
    "CanonicalMatchSource.quality.reasons": _server("available", "stable reason slugs", checks=("array",)),
    "CanonicalMatchSource.quality.confidence": _server("available", "measured extraction confidence", checks=("unit_interval_or_null",)),
    "CanonicalMatchSource.fingerprint": _server("available", "SHA-256 of the DEM file", checks=("sha256",)),
    "CanonicalMatchSource.metadata": _server("available", "bounded lineage metadata", checks=("object",)),
    # CanonicalMatch
    "CanonicalMatch.game": _server("available", "adapter literal 'cs2'", checks=("equals:cs2",)),
    "CanonicalMatch.map": _server("available", "header map code", checks=("map_code",)),
    "CanonicalMatch.mapNumber": _server("legitimately_empty", DEM_NO + " (a standalone DEM has no series position)"),
    "CanonicalMatch.playedAt": _server("legitimately_empty", DEM_NO + " (no wall-clock date in the header); " + CONTRACT_NULL),
    "CanonicalMatch.startedAt": _server("legitimately_empty", DEM_NO + " (no wall-clock date in the header); " + CONTRACT_NULL),
    "CanonicalMatch.finishedAt": _server("legitimately_empty", DEM_NO + " (no wall-clock time)"),
    "CanonicalMatch.durationSeconds": _server(
        "unsupported", "derived only from header playback_ticks_per_second, absent from every real CS2 demo observed "
        "(warning tickrate_unavailable); a game-clock derivation is not specified",
        exit="specify duration from the proven game clock (D22) and add real-DEM evidence"),
    "CanonicalMatch.status": _server("available", "completed only for a non-partial parse with all end ticks", checks=("in:completed,partial",)),
    "CanonicalMatch.finished": _server("available", "terminal round evidence", checks=("boolean",)),
    "CanonicalMatch.terminal": _server("available", "same strict predicate as finished", checks=("boolean",)),
    "CanonicalMatch.teamA": _server("unsupported", "team names exist in the game state (teams.team_name) but " + CONTRACT_NULL,
                                    exit="emit team clan names from the game state with real-DEM evidence"),
    "CanonicalMatch.teamB": _server("unsupported", "as teamA", exit="as teamA"),
    "CanonicalMatch.scoreTeamA": _server("unsupported", "team_rounds_total exists in the game state but " + CONTRACT_NULL,
                                         exit="emit final scores bound to team identity, with real-DEM evidence"),
    "CanonicalMatch.scoreTeamB": _server("unsupported", "as scoreTeamA", exit="as scoreTeamA"),
    "CanonicalMatch.winnerTeam": _server("unsupported", "derived from the two scores, which are unsupported", exit="after scores"),
    "CanonicalMatch.roundCount": _server("available", "count of reconstructed rounds", checks=("equals_rounds_length",)),
    "CanonicalMatch.quality.status": _server("available", "quality helper", checks=("in:complete,partial,unknown",)),
    "CanonicalMatch.quality.reasons": _server("available", "stable reason slugs", checks=("array",)),
    "CanonicalMatch.quality.confidence": _server("available", "measured or coverage-derived confidence", checks=("unit_interval_or_null",)),
    "CanonicalMatch.coverage.roundsExpected": _server("available", "observed reconstructed rounds", checks=("equals_rounds_length",)),
    "CanonicalMatch.coverage.roundsObserved": _server("available", "emitted rounds", checks=("equals_rounds_length",)),
    "CanonicalMatch.coverage.participantsExpected": _server("legitimately_empty", "no expected-roster contract; assuming 5v5 would invent it"),
    "CanonicalMatch.coverage.participantsObserved": _server("available", "emitted participants", checks=("equals_participants_length",)),
    "CanonicalMatch.coverage.participantsResolved": _server("available", "O5: count after EXACT Steam attachment", checks=("equals_resolved_count",)),
    "CanonicalMatch.coverage.eventsObserved": _server("available", "emitted events", checks=("equals_events_length",)),
    "CanonicalMatch.coverage.hasRoundData": _server("available", "rounds.length > 0", checks=("boolean",)),
    "CanonicalMatch.coverage.hasEventData": _server("available", "events.length > 0", checks=("boolean",)),
    "CanonicalMatch.coverage.hasPlayerRoundState": _server("available", "roundPlayers.length > 0", checks=("boolean",)),
    "CanonicalMatch.schemaVersion": _server("available", "Canonical model schema", checks=("equals:2",)),
    # CanonicalParticipant
    "CanonicalParticipant.participantKey": _server("available", "source-local Steam key; never a nickname; no ownership claim", checks=("steam_id64",)),
    "CanonicalParticipant.internalPlayerId": _server("available", "only through the EXACT Steam attachment (server path)", checks=("uuid_only_on_target",)),
    "CanonicalParticipant.source": _server("available", "adapter literal 'demo'", checks=("equals:demo",)),
    "CanonicalParticipant.externalPlayerId": _server("available", "player_info steamid", checks=("steam_id64",)),
    "CanonicalParticipant.steamId64": _server("available", "player_info steamid (exact u64 decimal)", checks=("steam_id64",)),
    "CanonicalParticipant.nicknameSnapshot": _server("available", "display snapshot only", checks=("string",)),
    "CanonicalParticipant.team": _server("unsupported", "neutral team slot needs teamA/teamB (unsupported); team_number is side evidence and is correctly removed",
                                         exit="after teamA/teamB"),
    "CanonicalParticipant.isTargetPlayer": _server("available", "EXACT selected participant only", checks=("one_target_when_attached",)),
    "CanonicalParticipant.identityStatus": _server("available", "correlated iff target with internal id (D34 keeps it on re-observation)", checks=("identity_status_coherent",)),
    "CanonicalParticipant.identityConfidence": _server("available", "1 iff correlated", checks=("identity_confidence_coherent",)),
    "CanonicalParticipant.metadata": _server("legitimately_empty", "no participant metadata is promoted", representation={}),
    # CanonicalRound
    "CanonicalRound.roundNumber": _server("available", "1..n after D30 voiding", checks=("round_numbers_contiguous",)),
    "CanonicalRound.startTick": _server("available", "O6 tick domain (a)", checks=("tick_domain_rounds",)),
    "CanonicalRound.endTick": _server("available", "O6 tick domain (a)", checks=("tick_domain_rounds",)),
    "CanonicalRound.startTimeSeconds": _server("unsupported", "no normalized round time in the contract",
                                               exit="derive from startTick and the proven game clock"),
    "CanonicalRound.endTimeSeconds": _server("unsupported", "as startTimeSeconds", exit="as startTimeSeconds"),
    "CanonicalRound.durationSeconds": _server("unsupported", "needs header tickrate (absent; warning tickrate_unavailable)",
                                              exit="as Match.durationSeconds"),
    "CanonicalRound.winningTeam": _server("unsupported", "needs team identity (teamA/teamB unsupported)", exit="after teamA/teamB"),
    "CanonicalRound.winningSide": _server("available", "round_win_status side", checks=("in:CT,T",)),
    "CanonicalRound.winReason": _server("unsupported", "O3: sentinel 'unknown'; no reviewed reason table", representation="unknown",
                                        exit="reviewed round_win_reason code table + consistency with bomb flags"),
    "CanonicalRound.bombPlanted": _server("available", "bomb_planted events (D25: absent stream = zero occurrences)", checks=("boolean",)),
    "CanonicalRound.bombDefused": _server("available", "bomb_defused events", checks=("boolean", "defuse_implies_plant")),
    "CanonicalRound.bombExploded": _server("available", "bomb_exploded events", checks=("boolean", "explode_implies_plant")),
    "CanonicalRound.quality.status": _server("available", "inherits source quality", checks=("in:complete,partial,unknown",)),
    "CanonicalRound.quality.reasons": _server("available", "inherits source reasons", checks=("array",)),
    "CanonicalRound.quality.confidence": _server("available", "inherits source confidence", checks=("unit_interval_or_null",)),
    "CanonicalRound.metadata": _server("legitimately_empty", "no round metadata is promoted", representation={}),
    # CanonicalRoundPlayer
    "CanonicalRoundPlayer.roundNumber": _server("available", "foreign key to an emitted round", checks=("round_fk",)),
    "CanonicalRoundPlayer.participantKey": _server("available", "source-local Steam key, FK to participants", checks=("participant_fk",)),
    "CanonicalRoundPlayer.side": _server("available", "D29 round-start entity read", checks=("in:CT,T", "ten_per_round")),
    "CanonicalRoundPlayer.survived": _server("not_authorized", METRICS_SOT),
    "CanonicalRoundPlayer.moneyStart": _server("available", "D33 round-start account (start_balance)", checks=("non_negative_int", "ten_per_round", "pistol_800")),
    "CanonicalRoundPlayer.moneyEnd": _server("available", "D33 balance at the round end tick (before post-round credits)", checks=("non_negative_int", "ten_per_round")),
    "CanonicalRoundPlayer.equipmentValue": _server("available", "D33 equipment held at round start (round_start_equip_value)", checks=("non_negative_int", "ten_per_round")),
    "CanonicalRoundPlayer.buyContext": _server("unsupported", "the adapter runs no reviewed classifier",
                                               exit="promote classifyBuyContext (normalizer.ts) with real-DEM evidence"),
    "CanonicalRoundPlayer.kills": _server("not_authorized", METRICS_SOT),
    "CanonicalRoundPlayer.deaths": _server("not_authorized", METRICS_SOT),
    "CanonicalRoundPlayer.assists": _server("not_authorized", METRICS_SOT),
    "CanonicalRoundPlayer.damage": _server("not_authorized", METRICS_SOT),
    "CanonicalRoundPlayer.flashAssists": _server("not_authorized", METRICS_SOT),
    "CanonicalRoundPlayer.openingKill": _server("not_authorized", METRICS_SOT),
    "CanonicalRoundPlayer.openingDeath": _server("not_authorized", METRICS_SOT),
    "CanonicalRoundPlayer.traded": _server("not_authorized", METRICS_SOT),
    "CanonicalRoundPlayer.tradeKill": _server("not_authorized", METRICS_SOT),
    "CanonicalRoundPlayer.metadata": _server("legitimately_empty", "no player-round metadata is promoted", representation={}),
    # CanonicalEvent
    "CanonicalEvent.roundNumber": _server("available", "event round after reconstruction", checks=("round_fk",)),
    "CanonicalEvent.type": _server("available", "allowlisted event types", checks=("event_type_allowlist",)),
    "CanonicalEvent.tick": _server("available", "O6 tick domain (b)", checks=("tick_domain_events",)),
    "CanonicalEvent.gameTimeSeconds": _server("available", "O6 (c)(d): native or derived time, provenance in RAW warnings", checks=("time_monotonic_in_round",)),
    "CanonicalEvent.actorParticipantKey": _server("available", "source-local key; FK to participants", checks=("participant_fk_or_null",)),
    "CanonicalEvent.victimParticipantKey": _server("available", "source-local key; FK to participants", checks=("participant_fk_or_null",)),
    "CanonicalEvent.assisterParticipantKey": _server("available", "source-local key; FK to participants", checks=("participant_fk_or_null",)),
    "CanonicalEvent.sourceActorExternalId": _server("available", "verbatim source id", checks=("steam_id64_or_null",)),
    "CanonicalEvent.sourceVictimExternalId": _server("available", "verbatim source id", checks=("steam_id64_or_null",)),
    "CanonicalEvent.sourceAssisterExternalId": _server("available", "verbatim source id", checks=("steam_id64_or_null",)),
    "CanonicalEvent.weapon": _server("available", "event weapon token", checks=("string_or_null",)),
    "CanonicalEvent.headshot": _server("available", "explicit flag; null versus false preserved", checks=("boolean_or_null",)),
    "CanonicalEvent.distance": _server("available", "explicit event distance", checks=("non_negative_or_null",)),
    "CanonicalEvent.damage": _server("available", "health damage (preserve zero)", checks=("non_negative_or_null",)),
    "CanonicalEvent.quality.status": _server("available", "inherits source quality", checks=("in:complete,partial,unknown",)),
    "CanonicalEvent.quality.reasons": _server("available", "inherits source reasons", checks=("array",)),
    "CanonicalEvent.quality.confidence": _server("available", "inherits source confidence", checks=("unit_interval_or_null",)),
    "CanonicalEvent.data": _server("available", "bounded residual evidence, never promoted", checks=("object",)),
}

# Browser path: no browser Canonical producer exists, so nothing on it may be persisted.
# The A9.1 raw parity domain is recorded per field as context, never as field parity.
A91_DOMAIN = {"header": "header", "economy": "economy", "rounds": "rounds", "game_state": "game_state",
              "teams": "game_state", "score": "game_state", "player_info": "players",
              "events": "deaths", "event_fields": "events"}
A91_RESULT = {"header": "PASS", "economy": "PASS", "rounds": "PASS", "game_state": "PASS", "events": "PASS",
              "deaths": "PASS", "players": "NOT_COMPARABLE (NOT_AVAILABLE_ON_WASM)"}


def _browser(field: str) -> dict[str, Any]:
    cap = FIELD_SPECS[field]["sourceCapability"]
    domain = A91_DOMAIN.get(cap.split(".")[0]) if not cap.startswith("adapter.") else None
    identity = FIELD_SPECS[field]["mappingStatus"] == "IDENTITY_BLOCKED" or (domain == "players")
    return {
        "state": "not_authorized",
        "why": BROWSER_POLICY + ("; the WASM player identity domain is NOT_COMPARABLE (identity also blocked)" if identity else ""),
        "representation": "not produced",
        "raw_parity_context": (f"A9.1 run 40622794332, raw domain '{domain}': {A91_RESULT.get(domain, 'NOT_RUN')} "
                               "(raw tables only; not Canonical field parity)") if domain else "adapter-derived; no raw domain",
        "exit": "a browser Canonical producer, its own per-field evidence on the same DEMs as the server path, and a new contract version",
        "checks": [],
    }


POLICY_REFS = {
    "browser": ["src/lib/client-parser/clientParser.service.ts", "src/lib/appDataContracts.ts",
                "src/lib/client-parser/clientParser.validator.server.ts"],
    "metrics": ["src/lib/pipeline/metrics.ts"],
}


def build_contract() -> dict[str, Any]:
    missing = sorted(set(FIELD_SPECS) - set(SERVER))
    extra = sorted(set(SERVER) - set(FIELD_SPECS))
    if missing or extra:
        raise SystemExit(f"V3_CLASSIFICATION_INCOMPLETE: missing={missing} extra={extra}")
    fields = []
    for field, spec in FIELD_SPECS.items():
        server = dict(SERVER[field])
        if server["state"] not in STATES:
            raise SystemExit(f"V3_UNKNOWN_STATE: {field} {server['state']}")
        state = STATES[server["state"]]
        fields.append({
            "id": field, "type": spec["canonicalType"], "semantics": spec["sourceSemantics"],
            "authoritativeSource": spec["sourceCapability"], "sourceField": spec["sourceField"],
            "transformation": spec["normalizationRule"], "persistenceTarget": spec["persistenceTarget"],
            "identityDependency": spec["mappingStatus"] == "IDENTITY_BLOCKED",
            "tickDependency": spec["mappingStatus"] == "TICK_DOMAIN_BLOCKED",
            "v2MappingStatus": spec["mappingStatus"],
            "paths": {
                "server": {**server, "implementation": "services/cs2-demo-parser/parser.py -> src/lib/pipeline/normalizer.ts -> src/lib/canonical/adapters/demo.adapter.ts",
                           "persist": state["persist"], "metrics": state["metrics"], "display": state["display"]},
                "browser": _browser(field),
            },
        })
    body = {"contract": CONTRACT_VERSION, "schemaVersion": SCHEMA_VERSION, "fieldCount": len(fields),
            "supersedesForEvaluation": "canonical-demo-v2 (unchanged, historical baseline release cf0549c2)",
            "states": STATES, "decisions": DECISIONS, "policyRefs": POLICY_REFS, "fields": fields}
    body["digest"] = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return body


if __name__ == "__main__":
    import sys
    json.dump(build_contract(), sys.stdout, indent=1, sort_keys=False)
    sys.stdout.write("\n")
