"""R5.8.13 re-pins only the Railway deployment identity, forward-only.

Observed 2026-10-18: the worker declared its semantic revision as its build revision
(declared_revision_matches=false). PARSER_BUILD_REVISION was corrected and the image of
commit eaaa2c8d was redeployed as deployment ece1c582; both /version hosts then reported
declared_revision_matches=true. Nothing but the deployment ID may change.
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

OLD = "ce9b760d-c92f-4da1-a3e6-dd105d49585c"
NEW = "ece1c582-5cba-403d-b25c-a60faaf1aed5"
SPEC = json.loads((ROOT / "docs/reference/r5_8_13/spec.json").read_text(encoding="utf-8"))
PREVIOUS = json.loads((ROOT / "docs/reference/r5_8_12/spec.json").read_text(encoding="utf-8"))
MIGRATION = (ROOT / "supabase/migrations/20261018050000_r5_8_13_repin_runtime_deployment.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/r5_8_13/rollback.sql").read_text(encoding="utf-8")


def test_only_the_deployment_identity_changes():
    assert PREVIOUS["deployment_id"] == OLD and SPEC["deployment_id"] == NEW
    for key in ("branch", "semantic_commit", "build_commit", "deployment_commit", "workflow_source_sha",
                "critical_hashes"):
        assert SPEC[key] == PREVIOUS[key], key
    observed = SPEC["observed"]
    assert observed["railway_deployment"]["commitHash"] == SPEC["build_commit"]
    assert observed["railway_deployment"]["redeploy_of"] == OLD
    for host in observed["version_hosts"].values():
        assert host["build"]["commit"] == SPEC["build_commit"]
        assert host["build"]["declared_revision_matches"] is True
        assert host["parser"]["semantic_revision"] == f"git:{SPEC['semantic_commit']}"
        assert host["parser"]["build_revision"] == f"git:{SPEC['build_commit']}"
    assert len(observed["version_hosts"]) == 2


def test_targets_are_the_generator_output_from_the_r5_8_12_targets():
    old = "523cee5b0fecc21c7ce2b5f538b42670eec3fed1"
    md5 = lambda text: hashlib.md5(text.encode()).hexdigest()  # noqa: E731
    previous_spec = json.loads((ROOT / "docs/reference/r5_8_11/spec.json").read_text(encoding="utf-8"))
    recorder_12 = r5_8_11.target_body(previous_spec).replace(old, SPEC["workflow_source_sha"])
    assert md5(recorder_12) == SPEC["r5_8_12_recorder_target_md5"] == r5_8_11.target_md5(PREVIOUS)
    assert recorder_12.count(OLD) == 1
    assert md5(recorder_12.replace(OLD, NEW)) == SPEC["recorder_target_md5"] == r5_8_11.target_md5(SPEC)
    for name in r5_8_11.BOUNDARY:
        body_12 = r5_8_11.boundary_target_body(name, previous_spec).replace(old, SPEC["workflow_source_sha"])
        assert md5(body_12) == SPEC["r5_8_12_database_target_md5"][name] == PREVIOUS["database_target_md5"][name]
        assert md5(body_12.replace(OLD, NEW)) == SPEC["database_target_md5"][name] == r5_8_11.boundary_target_md5(name, SPEC)
        assert body_12.count(OLD) == (1 if name == "assert_verified_parser_provenance" else 0)


def test_migration_is_forward_only_bounded_and_fail_closed():
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    for value in (OLD, NEW, SPEC["recorder_target_md5"], SPEC["r5_8_12_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_12_database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["database_target_md5"]["enforce_approved_attestation_workflow"]):
        assert value in MIGRATION, value
    for marker in ("R5_8_13_UNEXPECTED_DEPLOYMENT_PIN_STATE", "R5_8_13_POSTCONDITION_INVALID",
                   "R5_8_13_FUNCTION_PROPERTIES_CHANGED", "R5_8_13_R5_8_12_STATE_MISSING",
                   "R5_8_13_ALREADY_AT_TARGET_STATE", "_expected_count constant integer := 1"):
        assert marker in MIGRATION, marker
    for forbidden in ("CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in MIGRATION, forbidden
    # The prior links are never rewritten.
    for path in ("supabase/migrations/20261016100000_r5_8_11_repin_attestation_recorder.sql",
                 "supabase/migrations/20261016100100_r5_8_11b_repin_provenance_boundary.sql"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert OLD in text and NEW not in text, path


def test_rollback_restores_the_r5_8_12_bodies_and_fails_closed():
    for value in (OLD, NEW, SPEC["recorder_target_md5"], SPEC["r5_8_12_recorder_target_md5"],
                  SPEC["r5_8_12_database_target_md5"]["assert_verified_parser_provenance"]):
        assert value in ROLLBACK, value
    assert "R5_8_13_ROLLBACK_UNEXPECTED_PIN_STATE" in ROLLBACK
    assert "R5_8_13_ROLLBACK_POSTCONDITION_INVALID" in ROLLBACK
    for forbidden in ("UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in ROLLBACK, forbidden


def test_every_repository_pin_names_the_new_deployment():
    # Historical: R5.8.13 moved the pins from OLD to NEW; R5.8.14 has since moved them on to
    # its own deployment. Neither R5.8.13 deployment may remain an active pin.
    r5814 = json.loads((ROOT / "docs/reference/r5_8_14/spec.json").read_text(encoding="utf-8"))
    assert r5814["observed"]["before"]["deployment_id"] == NEW
    r5815 = json.loads((ROOT / "docs/reference/r5_8_15/spec.json").read_text(encoding="utf-8"))
    assert r5815["observed"]["before"]["deployment_id"] == r5814["deployment_id"]
    r5816 = json.loads((ROOT / "docs/reference/r5_8_16/spec.json").read_text(encoding="utf-8"))
    assert r5816["observed"]["before"]["deployment_id"] == r5815["deployment_id"]
    for path in ("scripts/parser_runtime_attestation.py", "scripts/h3e91_live_preflight.py",
                 "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert r5816["deployment_id"] in text, path
        assert r5815["deployment_id"] not in text and r5814["deployment_id"] not in text, path
        assert NEW not in text and OLD not in text, path
