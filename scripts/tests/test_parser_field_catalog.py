"""Parser field catalog governance (runs on every PR via scripts/tests).

The committed catalog must equal what the worker code classifies, every class needs a review
record, a field can never be in two classes, and the diagnose command must identify the real
production case (player_disconnect.ever_fully_connected, job e4088318 attempt 1).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import parser_field_catalog as catalog  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "raw_manifest_unmapped_e4088318.json"


def test_committed_catalog_matches_worker_code_and_reviews():
    assert catalog.check() == []


def test_catalog_has_the_four_classes_and_no_unmapped_entry():
    data = json.loads(catalog.CATALOG.read_text(encoding="utf-8"))
    assert data["classes"] == ["CANONICAL", "RAW_ONLY", "IGNORED_APPROVED", "UNMAPPED"]
    assert set(data["counts"]) == {"CANONICAL", "RAW_ONLY", "IGNORED_APPROVED"}
    assert data["source_of_truth"] == "services/cs2-demo-parser/raw_evidence.py"
    by_field = {entry["field"]: entry for entry in data["entries"]}
    assert by_field["player_disconnect.ever_fully_connected"]["class"] == "RAW_ONLY"
    assert by_field["player_death.assistedflash"]["class"] == "CANONICAL"
    assert by_field["hltv_fixed.fov"]["class"] == "IGNORED_APPROVED"


def test_drift_is_detected(tmp_path, monkeypatch):
    stale = json.loads(catalog.CATALOG.read_text(encoding="utf-8"))
    stale["entries"] = stale["entries"][1:]
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps(stale), encoding="utf-8")
    monkeypatch.setattr(catalog, "CATALOG", path)
    assert any(p.startswith("catalog_drift") for p in catalog.check())


def test_missing_review_and_orphan_review_are_detected(tmp_path, monkeypatch):
    reviews = json.loads(catalog.REVIEWS.read_text(encoding="utf-8"))
    del reviews["events"]["round_mvp"]
    reviews["fields"]["nonexistent_event.field"] = {"reason": "x", "reviewed": "x", "introduced_in": "x", "tests": ["x"]}
    path = tmp_path / "reviews.json"
    path.write_text(json.dumps(reviews), encoding="utf-8")
    monkeypatch.setattr(catalog, "REVIEWS", path)
    problems = catalog.check()
    assert "review_missing:round_mvp.reason" in problems
    assert "orphan_review_field:nonexistent_event.field" in problems


def test_a_field_in_two_classes_fails(monkeypatch):
    r = catalog._worker()
    monkeypatch.setitem(r.REVIEWED_IGNORED_EVENT_FIELDS, "player_death", frozenset({"assistedflash"}))
    with pytest.raises(SystemExit, match="field classified twice: player_death.assistedflash"):
        catalog.worker_classes()


def test_check_never_writes_the_catalog():
    before = catalog.CATALOG.read_bytes()
    catalog.check()
    assert catalog.CATALOG.read_bytes() == before


def test_diagnose_identifies_the_real_production_unmapped_field():
    report = catalog.diagnose(json.loads(FIXTURE.read_text(encoding="utf-8")))
    assert report["job_id"] == "e4088318-1b80-466d-a8ef-78001c14c979"
    assert report["attempt"] == 1
    assert report["unmapped"] == [{
        "field": "player_disconnect.ever_fully_connected",
        "event": "player_disconnect",
        "native_field": "ever_fully_connected",
        "kind": "new_field",
        "observed_types": ["boolean"],
        "event_rows": 1,
        "first_tick": 41140,
        "last_tick": 41140,
    }]
    assert report["blocking_admission_gates"] == ["gate:RAW-EVIDENCE-01", "gate:RAW→CANONICAL"]
    assert report["parser"]["revision"] == "git:e8f287500d53586f230a71eff17689969634ecd2"
    assert report["type_conflicts"] == []


def test_diagnose_reports_new_events_and_type_conflicts():
    manifest = {
        "audit_evidence": {
            "field_mappings": [{"raw_field": "brand_new_event.__event__", "status": "UNMAPPED_BUT_AVAILABLE"}],
            "forensic_contract_v2": {"event_inventory": [
                {"event_name": "player_hurt", "native_types": {"dmg_health": ["integer", "string"]}},
            ]},
        },
    }
    report = catalog.diagnose(manifest)
    assert report["unmapped"][0]["kind"] == "new_event"
    assert report["type_conflicts"] == ["player_hurt.dmg_health"]
