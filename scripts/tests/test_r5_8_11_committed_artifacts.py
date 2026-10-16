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
    assert (BRANCH, COMMIT, BUILD_COMMIT, DEPLOYMENT) == (
        SPEC["branch"], SPEC["semantic_commit"], SPEC["build_commit"], SPEC["deployment_id"])
    assert (PF_BRANCH, PF_DEPLOYMENT, SOURCE_COMMIT, PARSER_REVISION) == (
        SPEC["branch"], SPEC["deployment_id"], SPEC["deployment_commit"], f"git:{SPEC['semantic_commit']}")
    assert {Path(k).name: v for k, v in EXPECTED_HASHES.items()} == SPEC["critical_hashes"]
    assert r5_8_11.targets(SPEC) == {
        "record_parser_runtime_attestation": "beeb4f8f94a6960ca9e7448344ae379b",
        "assert_verified_parser_provenance": "a2e5ee1383561e7a9a10a47684b6256e",
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
        (RECORDER, "4ee7be9d9d133adbeeafe6e6a5763112", "beeb4f8f94a6960ca9e7448344ae379b"),
        (ROLLBACK, "beeb4f8f94a6960ca9e7448344ae379b", "4ee7be9d9d133adbeeafe6e6a5763112"),
        (BOUNDARY, "57e4196115eb9253fd307e4443fb603c", "a2e5ee1383561e7a9a10a47684b6256e"),
        (BOUNDARY_ROLLBACK, "a2e5ee1383561e7a9a10a47684b6256e", "57e4196115eb9253fd307e4443fb603c"),
    ):
        sql = path.read_text(encoding="utf-8")
        assert start in sql
        assert target in sql
        assert "pg_catalog.md5(p.prosrc)" in sql
        assert "EXECUTE _def" in sql
        code = re.sub(r"--[^\\n]*", "", re.sub(r"'(?:[^']|'')*'", "''", sql))
        assert not re.search(r"\\b(INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|DROP|ALTER)\\b", code, re.I)
        assert "parser_runtime_provenance" not in code or "SELECT" in code
