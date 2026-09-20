import copy

from capability_catalog import CATALOG_VERSION, catalog_payload, validate_catalog
from forensic_audit import build_tick_coverage, summarize_rows
from parser import _audit_full_tick_domain
from raw_evidence import build_forensic_contract_v2


def test_catalog_is_version_locked_deterministic_and_classified():
    first = catalog_payload(["health", "future_prop"], ["player_death", "future_event"])
    second = catalog_payload(reversed(["health", "future_prop"]), reversed(["player_death", "future_event"]))
    assert first == second
    assert first["catalog_version"] == CATALOG_VERSION
    assert validate_catalog(first) == []
    assert {row["classification"] for row in first["capabilities"]} <= {
        "CANONICAL", "DERIVED", "RAW_ONLY", "NOT_PRESENT", "UNAVAILABLE", "PARSE_FAILED"
    }
    changed = copy.deepcopy(first)
    changed["capabilities"][0]["classification"] = "UNKNOWN"
    assert "capability_catalog_classification_invalid" in validate_catalog(changed)
    assert "capability_catalog_digest_mismatch" in validate_catalog(changed)


def test_full_tick_audit_uses_none_and_deterministic_property_batches():
    class Demo:
        def __init__(self):
            self.calls = []

        def parse_ticks(self, properties, ticks=None):
            self.calls.append((tuple(properties), ticks))
            return [
                {"tick": 1, "steamid": 7, **{name: 0 for name in properties}},
                {"tick": 2, "steamid": 7, **{name: 1 for name in properties}},
            ]

    demo = Demo()
    coverage, properties = _audit_full_tick_domain(demo, [f"p{i:02}" for i in range(25)], 100)
    assert len(demo.calls) == 3
    assert all(ticks is None for _, ticks in demo.calls)
    assert coverage["coverage"] == "FULL_TICK_DOMAIN_AUDIT"
    assert coverage["complete"] is True
    assert coverage["total_rows_audited"] == 6
    assert len(properties) == 25
    assert all(row["classification"] == "RAW_ONLY" for row in properties)


def test_tick_audit_failure_is_explicit_and_never_full():
    coverage = build_tick_coverage(
        batches=[{"properties": ["health"], "row_count": 0, "ticks": [], "error": "boom"}],
        playback_ticks=10,
    )
    assert coverage["coverage"] == "SAMPLE_ONLY"
    assert coverage["complete"] is False
    summary = summarize_rows([], ["health"], error=RuntimeError("boom"))[0]
    assert summary["classification"] == "PARSE_FAILED"


def test_contract_has_exactly_22_gates_and_waits_for_independent_physical_audit():
    evidence = {
        "manifest": {"parser_name": "demoparser2", "parser_version": "0.42.0", "contract_version": 1, "event_inventory_success": True},
        "event_coverage": [],
        "field_mappings": [{"raw_field": "header.map_name", "status": "MAPPED", "reason": None}],
        "forensic_inventory": {key: [] for key in (
            "header_inventory", "player_info_inventory", "game_state_inventory", "round_inventory",
            "bomb_inventory", "damage_inventory", "death_inventory", "weapon_inventory",
            "grenade_inventory", "usercmd_inventory", "teams_inventory", "score_inventory",
            "aggregate_inventory", "movement_inventory", "all_event_inventory",
        )},
    }
    raw = {
        "capability_catalog": catalog_payload([], []),
        "full_tick_audit": build_tick_coverage(batches=[{"properties": ["health"], "row_count": 1, "ticks": [1], "players": ["7"]}], playback_ticks=1),
        "full_tick_properties": summarize_rows([{"tick": 1, "health": 100}], ["health"]),
    }
    contract = build_forensic_contract_v2(evidence, raw)
    assert len(contract["gates"]) == 22
    assert contract["gates"][-1] == {
        "gate": "RAW-V2-22-physical-reaudit",
        "status": "BLOCKED",
        "reasons": ["physical_chunk_reaudit_pending_app"],
    }
    assert contract["canonical_admission"] == "BLOCKED"