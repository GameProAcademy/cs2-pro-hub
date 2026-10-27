"""R5.8.11 candidate pins and database transition remain fail-closed until runtime proof.""" 
import json
import re
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "docs/reference/r5_8_11/spec.json").read_text(encoding="utf-8"))

import sys
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

RECORDER = ROOT / "supabase/migrations/20261016100000_r5_8_11_repin_attestation_recorder.sql"
ROLLBACK = ROOT / "docs/reference/r5_8_11/rollback.sql"
BOUNDARY = ROOT / "supabase/migrations/20261016100100_r5_8_11b_repin_provenance_boundary.sql"
BOUNDARY_ROLLBACK = ROOT / "docs/reference/r5_8_11/rollback_boundary.sql"


def test_candidate_spec_matches_active_application_pins_and_target_hashes():
    from scripts.parser_runtime_attestation import BRANCH, BUILD_COMMIT, COMMIT, DEPLOYMENT, EXPECTED_HASHES
    from scripts.h3e91_live_preflight import BRANCH as PF_BRANCH, DEPLOYMENT as PF_DEPLOYMENT, PARSER_REVISION, SOURCE_COMMIT
    # R5.8.13 advanced only the deployment ID (redeploy of the same image); R5.8.14 (D13
    # parser release) advanced semantic/build commit, deployment and the parser.py blob.
    # R5.8.15 (D13b) and R5.8.16 (D22) advanced them again the same way. The R5.8.11 spec
    # itself stays frozen; the active pins are the R5.8.18 spec (D29).
    r5813 = json.loads((ROOT / "docs/reference/r5_8_13/spec.json").read_text(encoding="utf-8"))
    active = json.loads((ROOT / "docs/reference/r5_8_18/spec.json").read_text(encoding="utf-8"))
    assert SPEC["deployment_id"] == "ce9b760d-c92f-4da1-a3e6-dd105d49585c"
    assert r5813["observed"]["railway_deployment"]["redeploy_of"] == SPEC["deployment_id"]
    assert (r5813["semantic_commit"], r5813["build_commit"]) == (SPEC["semantic_commit"], SPEC["build_commit"])
    assert (BRANCH, COMMIT, BUILD_COMMIT, DEPLOYMENT) == (
        active["branch"], active["semantic_commit"], active["build_commit"], active["deployment_id"])
    assert (PF_BRANCH, PF_DEPLOYMENT, SOURCE_COMMIT, PARSER_REVISION) == (
        active["branch"], active["deployment_id"], active["deployment_commit"], f"git:{active['semantic_commit']}")
    assert {Path(k).name: v for k, v in EXPECTED_HASHES.items()} == active["critical_hashes"]
    changed = {k for k in SPEC["critical_hashes"] if SPEC["critical_hashes"][k] != active["critical_hashes"][k]}
    assert changed == {"parser.py"}
    assert r5_8_11.targets(SPEC) == {
        "record_parser_runtime_attestation": "72df9c518f5573db232a6759301e4360",
        "assert_verified_parser_provenance": "f5e27fc3961d7d4bee50d440862f39cc",
        "enforce_approved_attestation_workflow": "f95e6a50fd78a5aef78feb4d0dd7fdd1",
    }


def test_candidate_is_not_release_proven_without_both_live_version_observations():
    assert SPEC["release_status"] == "CANDIDATE_ONLY_PENDING_RUNTIME_VERSION_OBSERVATION"
    assert SPEC["observed"]["observed_at"] is None
    assert SPEC["observed"]["version_hosts"] == {}
    # Static target checks are separate from the release-proof requirement.
    with patch.object(r5_8_11, "static_target_problems", return_value=[]):
        assert r5_8_11.verify(SPEC) == ["RUNTIME_VERSION_OBSERVATION_PENDING"]


def test_candidate_migrations_only_rewrite_pinned_function_definitions():
    for path, start, target in (
        (RECORDER, "4ee7be9d9d133adbeeafe6e6a5763112", "72df9c518f5573db232a6759301e4360"),
        (ROLLBACK, "72df9c518f5573db232a6759301e4360", "4ee7be9d9d133adbeeafe6e6a5763112"),
        (BOUNDARY, "57e4196115eb9253fd307e4443fb603c", "f5e27fc3961d7d4bee50d440862f39cc"),
        (BOUNDARY_ROLLBACK, "f5e27fc3961d7d4bee50d440862f39cc", "57e4196115eb9253fd307e4443fb603c"),
    ):
        sql = path.read_text(encoding="utf-8")
        assert start in sql
        assert target in sql
        assert "pg_catalog.md5(p.prosrc)" in sql
        assert "EXECUTE _def" in sql
        code = re.sub(r"--[^\n]*", "", re.sub(r"'(?:[^']|'')*'", "''", sql))
        assert not re.search(r"\b(INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|DROP|ALTER)\b", code, re.I)
        assert "parser_runtime_provenance" not in code or "SELECT" in code


def test_historical_probe_preserves_current_recorder_when_requested():
    sys.path.insert(0, str(ROOT / "scripts/queue"))
    import attestation_recorder_reconciliation_probe as recorder_probe  # noqa: PLC0415

    current = recorder_probe.render_prelude(recorder_probe.PRELUDE_TEMPLATE, keep_current=True)
    historical = recorder_probe.render_prelude(recorder_probe.PRELUDE_TEMPLATE)
    assert "IF false AND _md5 = '72df9c518f5573db232a6759301e4360' THEN" in current
    assert "IF true AND _md5 = '72df9c518f5573db232a6759301e4360' THEN" in historical
    assert "PROBE_BASELINE_R5_8_11_ROLLBACK_MISMATCH" in historical
