"""The committed R5.8.9 spec, migration and rollback are exactly the generator's output.

The spec records what was observed read-only after Railway deployment
09b50029 existed (2026-10-13T08:29Z). The migration is regenerated here and
compared byte for byte, so nobody can hand-edit a pin into it.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_9  # noqa: E402

SPEC = json.loads((ROOT / "docs/reference/r5_8_9/spec.json").read_text())
MIGRATION = ROOT / "supabase/migrations/20261013130000_r5_8_9_repin_attestation_recorder.sql"
ROLLBACK = ROOT / "docs/reference/r5_8_9/rollback.sql"


def test_committed_artifacts_are_the_generator_output():
    assert MIGRATION.read_text() == r5_8_9.migration_sql(SPEC)
    assert ROLLBACK.read_text() == r5_8_9.rollback_sql(SPEC)
    assert r5_8_9.target_md5(SPEC) == "d7c325bac1a98c6a7cac67a0f18ba08b"


def test_spec_pins_the_observed_deployment_not_a_synthetic_one():
    assert SPEC["deployment_id"] == "09b50029-2508-4267-bb1d-28c5e99b95db"
    assert SPEC["build_commit"] == SPEC["deployment_commit"] == "c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d"
    assert SPEC["semantic_commit"] == "10815fb44e165963adfaf07f71c474ca628f4b7f"
    assert SPEC["observed"]["railway_deployment"]["status"] == "SUCCESS"


def test_spec_agrees_with_the_repository_pins():
    from scripts.parser_runtime_attestation import BRANCH, BUILD_COMMIT, COMMIT, DEPLOYMENT, EXPECTED_HASHES
    assert (BRANCH, COMMIT, BUILD_COMMIT, DEPLOYMENT) == (
        SPEC["branch"], SPEC["semantic_commit"], SPEC["build_commit"], SPEC["deployment_id"])
    assert {Path(p).name: h for p, h in EXPECTED_HASHES.items()} == SPEC["critical_hashes"]
    registry = json.loads((ROOT / "scripts/approved_attestation_workflow.json").read_text())
    assert registry["source_sha"] == SPEC["workflow_source_sha"]


def _full_history() -> bool:
    out = subprocess.run(("git", "cat-file", "-e", f"{SPEC['semantic_commit']}^{{commit}}"), cwd=ROOT)
    main = subprocess.run(("git", "rev-parse", "--verify", "origin/main"), cwd=ROOT, capture_output=True)
    return out.returncode == 0 and main.returncode == 0


@pytest.mark.skipif(not _full_history(), reason="needs full history and origin/main")
def test_spec_passes_the_generator_verification():
    assert r5_8_9.verify(SPEC) == []


def test_committed_boundary_artifacts_are_the_generator_output():
    import r5_8_9_boundary as boundary
    assert (ROOT / "supabase/migrations/20261013130100_r5_8_9b_repin_provenance_boundary.sql").read_text() \
        == boundary.migration_sql(SPEC)
    assert (ROOT / "docs/reference/r5_8_9/rollback_boundary.sql").read_text() == boundary.rollback_sql(SPEC)
    assert {n: boundary.target_md5(n, SPEC) for n in boundary.FUNCTIONS} == {
        "assert_verified_parser_provenance": "b1576ce0d085e7bc1961d37b34a432f2",
        "enforce_approved_attestation_workflow": "b9412b87a12d51a4fa0e68bafd23735a"}


def test_boundary_targets_carry_only_the_new_pins():
    import r5_8_9_boundary as boundary
    for name in boundary.FUNCTIONS:
        body = boundary.target_body(name, SPEC)
        assert SPEC["workflow_source_sha"] in body
        for old in (boundary.OLD_BRANCH, boundary.OLD_DEPLOYMENT, boundary.OLD_COMMIT, boundary.OLD_WORKFLOW):
            assert old not in body
    body = boundary.target_body("assert_verified_parser_provenance", SPEC)
    assert f"_p.build_revision<>'git:{SPEC['build_commit']}'" in body
    assert f"_p.semantic_revision<>'git:{SPEC['semantic_commit']}'" in body
    assert f"_p.deployment_id<>'{SPEC['deployment_id']}'" in body
