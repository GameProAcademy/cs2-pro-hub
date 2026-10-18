"""R5.8.10: the committed spec, migrations and rollbacks are exactly the generator's
output, start from the R5.8.9 targets, and agree with every repository pin.

The spec records what was observed read-only after Railway deployment 25df86c3
existed (2026-10-14T10:59Z) and the managed R5.8.9 target md5s read the same
minute. The SQL is regenerated here and compared byte for byte.
"""
import copy
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_10  # noqa: E402
import r5_8_9  # noqa: E402

SPEC = json.loads((ROOT / "docs/reference/r5_8_10/spec.json").read_text())
MIGRATION = ROOT / "supabase/migrations/20261014210000_r5_8_10_repin_attestation_recorder.sql"
BOUNDARY = ROOT / "supabase/migrations/20261014210100_r5_8_10b_repin_provenance_boundary.sql"
REF = ROOT / "docs/reference/r5_8_10"
BUILD = "60099ed3eaf959d888762bf55043255a63a6a766"
TARGETS = {"record_parser_runtime_attestation": "4ee7be9d9d133adbeeafe6e6a5763112",
           "assert_verified_parser_provenance": "57e4196115eb9253fd307e4443fb603c",
           "enforce_approved_attestation_workflow": "f95e6a50fd78a5aef78feb4d0dd7fdd1"}


def test_committed_artifacts_are_the_generator_output():
    assert MIGRATION.read_text() == r5_8_10.recorder_migration_sql(SPEC)
    assert (REF / "rollback.sql").read_text() == r5_8_10.recorder_rollback_sql(SPEC)
    assert BOUNDARY.read_text() == r5_8_10.boundary_migration_sql(SPEC)
    assert (REF / "rollback_boundary.sql").read_text() == r5_8_10.boundary_rollback_sql(SPEC)
    assert r5_8_10.targets(SPEC) == TARGETS


def test_the_chain_starts_from_the_r5_8_9_targets():
    previous = json.loads((ROOT / "docs/reference/r5_8_9/spec.json").read_text())
    assert r5_8_10.PREVIOUS_SPEC == previous
    assert r5_8_10.START_MD5 == r5_8_9.target_md5(previous)
    assert r5_8_10.START_MD5 == SPEC["observed"]["managed_start_state"]["record_parser_runtime_attestation"]
    for name, md5 in r5_8_10.BOUNDARY_START_MD5.items():
        assert SPEC["observed"]["managed_start_state"][name] == md5
    # The previous link stays committed and unchanged.
    for path in ("supabase/migrations/20261013130000_r5_8_9_repin_attestation_recorder.sql",
                 "supabase/migrations/20261013130100_r5_8_9b_repin_provenance_boundary.sql",
                 "docs/reference/r5_8_9/rollback.sql", "docs/reference/r5_8_9/rollback_boundary.sql"):
        assert (ROOT / path).exists(), path


def test_spec_pins_the_observed_deployment():
    assert SPEC["deployment_id"] == "25df86c3-22e1-4986-9b91-cdabe54535c5"
    assert SPEC["build_commit"] == SPEC["deployment_commit"] == SPEC["semantic_commit"] == BUILD
    assert SPEC["observed"]["railway_deployment"]["status"] == "SUCCESS"
    assert SPEC["observed"]["railway_deployment"]["commitHash"] == BUILD
    # Only raw_evidence.py changed between the R5.8.9 build and this one.
    previous = r5_8_10.PREVIOUS_SPEC["critical_hashes"]
    assert {n for n in previous if previous[n] != SPEC["critical_hashes"][n]} == {"raw_evidence.py"}


def test_r5_8_10_historical_spec_remains_frozen_and_is_not_the_active_pin_source():
    # R5.8.10 remains the exact record of deployment 25df86c3 / build 60099ed3.
    # Active pins belong to R5.8.11 and must not rewrite this historical spec.
    from scripts.parser_runtime_attestation import BUILD_COMMIT, DEPLOYMENT
    assert SPEC["deployment_id"] == "25df86c3-22e1-4986-9b91-cdabe54535c5"
    assert SPEC["build_commit"] == "60099ed3eaf959d888762bf55043255a63a6a766"
    assert SPEC["critical_hashes"]["worker.py"] == "ecaac3968d68e1ed8fc03f8dfea42c223869f473"
    active = json.loads((ROOT / "docs/reference/r5_8_11/spec.json").read_text())
    head = json.loads((ROOT / "docs/reference/r5_8_13/spec.json").read_text())
    assert DEPLOYMENT == head["deployment_id"] != active["deployment_id"]
    assert BUILD_COMMIT == active["build_commit"] == head["build_commit"]
    assert active["release_status"] == "CANDIDATE_ONLY_PENDING_RUNTIME_VERSION_OBSERVATION"
    assert active["observed"]["version_hosts"] == {}
    registry = json.loads((ROOT / "scripts/approved_attestation_workflow.json").read_text())
    current = json.loads((ROOT / "docs/reference/r5_8_12/spec.json").read_text())
    # R5.8.11's candidate snapshot and SQL remain immutable historical inputs.
    assert active["workflow_source_sha"] == "523cee5b0fecc21c7ce2b5f538b42670eec3fed1"
    assert current["workflow_source_sha"] == registry["source_sha"] == "f5e8ffb19d03dca410591f8d2fd38dc47a3ca485"
    assert current["workflow_source_sha"] != active["workflow_source_sha"]


def test_generated_sql_only_rewrites_function_bodies_and_comments():
    for sql in (MIGRATION.read_text(), BOUNDARY.read_text(), (REF / "rollback.sql").read_text(),
                (REF / "rollback_boundary.sql").read_text()):
        code = re.sub(r"'(?:[^']|'')*'", "''", re.sub(r"--[^\n]*", "", sql))
        assert not re.search(r"\b(INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|DROP|ALTER)\b", code, re.I)
        assert "EXECUTE _def" in code
    assert MIGRATION.read_text().count("R5_8_10_FRAGMENT_COUNT_INVALID") == 13


def _full_history() -> bool:
    out = subprocess.run(("git", "cat-file", "-e", f"{r5_8_10.PREVIOUS_SPEC['build_commit']}^{{commit}}"), cwd=ROOT)
    main = subprocess.run(("git", "rev-parse", "--verify", "origin/main"), cwd=ROOT, capture_output=True)
    return out.returncode == 0 and main.returncode == 0


@pytest.mark.skipif(not _full_history(), reason="needs full history and origin/main")
def test_historical_spec_is_not_misrepresented_as_the_current_workflow_pin():
    # The old observation stays immutable, but its workflow blob is no longer the
    # approved current source. It must not pass the current-tree release verifier.
    assert "WORKFLOW_BLOB_NOT_THE_ONE_IN_THIS_TREE" in r5_8_10.verify(SPEC)


@pytest.mark.skipif(not _full_history(), reason="needs full history and origin/main")
@pytest.mark.parametrize("key, value, problem", [
    ("deployment_id", "09b50029-2508-4267-bb1d-28c5e99b95db", "DEPLOYMENT_ID_IS_THE_R5_8_9_ONE"),
    ("workflow_source_sha", "80c6cb645b81ba427ad3d97ee8feb1964ba62d87", "WORKFLOW_BLOB_NOT_THE_ONE_IN_THIS_TREE"),
])
def test_a_spec_that_does_not_move_the_runtime_is_refused(key, value, problem):
    spec = copy.deepcopy(SPEC)
    spec[key] = value
    if key == "deployment_id":
        spec["observed"]["railway_deployment"]["id"] = value
    assert problem in r5_8_10.verify(spec)
