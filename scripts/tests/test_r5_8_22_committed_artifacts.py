"""R5.8.22 re-pins the runtime after the player_disconnect.ever_fully_connected review (PR #232), forward-only.

Production job e4088318 (2026-11-03) was blocked by the RAW audit only because a newer CS2 build adds
ever_fully_connected to player_disconnect. PR #232 reviewed it as RAW-only (raw_evidence.py). Released
under the standing watch-pattern freeze as ONE controlled Railway deployment of the merge commit
c764f858 (deployment 2edd7ed1): semantic = build = c764f858; only the raw_evidence.py critical blob
changed. Both /version hosts are proven by the H.3-E activation gate after this repin.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

OLD_DEPLOYMENT = "1c0f26d5-4064-4e6d-a552-2ce05ae517fe"
NEW_DEPLOYMENT = "2edd7ed1-2703-42ad-abe3-ebe13d235e81"
OLD_COMMIT = "e8f287500d53586f230a71eff17689969634ecd2"
NEW_COMMIT = "c764f858ffa9df0ffa2740bdba450c7a37be2f3e"
OLD_RAW = "001281eecb02ebc318ff997f734c4081c161d1d9"
NEW_RAW = "f906889c795a7e6e8a41902e8e453f3f5b9d956e"
SPEC = json.loads((ROOT / "docs/reference/r5_8_22/spec.json").read_text(encoding="utf-8"))
PREVIOUS = json.loads((ROOT / "docs/reference/r5_8_21/spec.json").read_text(encoding="utf-8"))
MIGRATION = (ROOT / "supabase/migrations/20261103190000_r5_8_22_repin_runtime_release.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/r5_8_22/rollback.sql").read_text(encoding="utf-8")


def _git(*args: str) -> str | None:
    try:
        return subprocess.check_output(("git", *args), cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError:
        return None


def test_only_the_raw_evidence_release_pins_change():
    assert (PREVIOUS["deployment_id"], SPEC["deployment_id"]) == (OLD_DEPLOYMENT, NEW_DEPLOYMENT)
    assert PREVIOUS["semantic_commit"] == PREVIOUS["build_commit"] == OLD_COMMIT
    assert SPEC["semantic_commit"] == SPEC["build_commit"] == SPEC["deployment_commit"] == NEW_COMMIT
    assert (SPEC["branch"], SPEC["workflow_source_sha"]) == (PREVIOUS["branch"], PREVIOUS["workflow_source_sha"])
    changed = {k for k, v in SPEC["critical_hashes"].items() if PREVIOUS["critical_hashes"][k] != v}
    assert changed == {"raw_evidence.py"}
    assert (PREVIOUS["critical_hashes"]["raw_evidence.py"], SPEC["critical_hashes"]["raw_evidence.py"]) == (OLD_RAW, NEW_RAW)
    observed = SPEC["observed"]
    assert observed["railway_deployment"]["id"] == NEW_DEPLOYMENT
    assert observed["railway_deployment"]["status"] == "SUCCESS"
    assert observed["railway_deployment"]["commitHash"] == NEW_COMMIT
    assert str(observed["version_hosts"]).startswith("PROVEN_AFTER_REPIN_BY_THE_H3E_ACTIVATION_GATE")
    assert observed["before"]["deployment_id"] == OLD_DEPLOYMENT
    assert observed["managed_start_state"]["record_parser_runtime_attestation"] == PREVIOUS["recorder_target_md5"]


def test_critical_hashes_are_the_blobs_of_the_released_commit():
    if _git("cat-file", "-e", f"{NEW_COMMIT}^{{commit}}") is None:
        return  # shallow checkout without the release commit; the gate checks it remotely
    for name, blob in SPEC["critical_hashes"].items():
        assert _git("rev-parse", f"{NEW_COMMIT}:services/cs2-demo-parser/{name}") == blob, name
    assert _git("merge-base", "--is-ancestor", OLD_COMMIT, NEW_COMMIT) == ""


def test_targets_are_the_generator_output():
    md5 = lambda text: hashlib.md5(text.encode()).hexdigest()  # noqa: E731
    assert r5_8_11.target_md5(PREVIOUS) == SPEC["r5_8_21_recorder_target_md5"] == PREVIOUS["recorder_target_md5"]
    assert r5_8_11.target_md5(SPEC) == SPEC["recorder_target_md5"] == "2a7b517911981b45ca57947a8b1627be"
    for name in r5_8_11.BOUNDARY:
        assert SPEC["r5_8_21_database_target_md5"][name] == PREVIOUS["database_target_md5"][name]
        assert r5_8_11.boundary_target_md5(name, SPEC) == SPEC["database_target_md5"][name]
    # Observed read-only on the managed database (md5 of prosrc after the same substitutions).
    assert SPEC["database_target_md5"]["assert_verified_parser_provenance"] == "8253e121dbcd90aa86a70296eb05d961"
    assert SPEC["database_target_md5"]["enforce_approved_attestation_workflow"] == \
        PREVIOUS["database_target_md5"]["enforce_approved_attestation_workflow"]
    previous_body = r5_8_11.target_body(PREVIOUS)
    assert (previous_body.count(OLD_DEPLOYMENT), previous_body.count(OLD_COMMIT), previous_body.count(OLD_RAW)) == (1, 4, 1)
    body = r5_8_11.target_body(SPEC)
    assert md5(body) == SPEC["recorder_target_md5"]
    assert (body.count(NEW_COMMIT), body.count(NEW_DEPLOYMENT), body.count(NEW_RAW)) == (4, 1, 1)
    # Forward then rollback substitutions restore the R5.8.21 body exactly.
    back = body.replace(NEW_DEPLOYMENT, OLD_DEPLOYMENT).replace(NEW_RAW, OLD_RAW).replace(NEW_COMMIT, OLD_COMMIT)
    assert md5(back) == SPEC["r5_8_21_recorder_target_md5"]


def test_migration_is_forward_only_bounded_and_fail_closed():
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_RAW, NEW_RAW,
                  SPEC["recorder_target_md5"], SPEC["r5_8_21_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_21_database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["database_target_md5"]["enforce_approved_attestation_workflow"]):
        assert value in MIGRATION, value
    for marker in ("R5_8_22_UNEXPECTED_PIN_STATE", "R5_8_22_POSTCONDITION_INVALID",
                   "R5_8_22_FUNCTION_PROPERTIES_CHANGED", "R5_8_22_R5_8_12_WORKFLOW_STATE_MISSING",
                   "R5_8_22_ALREADY_AT_TARGET_STATE", "_deployment_count constant integer[] := ARRAY[1, 1]",
                   "_commit_count constant integer[] := ARRAY[4, 3]",
                   "_raw_blob_count constant integer[] := ARRAY[1, 0]"):
        assert marker in MIGRATION, marker
    assert "R5_8_21" not in MIGRATION
    for forbidden in ("CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in MIGRATION, forbidden
    prior = (ROOT / "supabase/migrations/20261029100000_r5_8_21_repin_runtime_release.sql").read_text(encoding="utf-8")
    assert OLD_DEPLOYMENT in prior and NEW_DEPLOYMENT not in prior and NEW_COMMIT not in prior


def test_rollback_restores_the_r5_8_21_bodies_and_fails_closed():
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_RAW, NEW_RAW,
                  SPEC["recorder_target_md5"], SPEC["r5_8_21_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_21_database_target_md5"]["assert_verified_parser_provenance"]):
        assert value in ROLLBACK, value
    assert "R5_8_22_ROLLBACK_UNEXPECTED_PIN_STATE" in ROLLBACK
    assert "R5_8_22_ROLLBACK_POSTCONDITION_INVALID" in ROLLBACK
    for forbidden in ("UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in ROLLBACK, forbidden


def test_every_active_repository_pin_names_the_released_runtime():
    """R5.8.22 is historical since R5.8.23 (field-governance review): no active pin may still name it."""
    successor = json.loads((ROOT / "docs/reference/r5_8_23/spec.json").read_text(encoding="utf-8"))
    assert successor["observed"]["before"]["deployment_id"] == NEW_DEPLOYMENT
    head = json.loads((ROOT / "docs/reference/r5_8_26/spec.json").read_text(encoding="utf-8"))  # active head
    for path in ("scripts/parser_runtime_attestation.py", "scripts/h3e91_live_preflight.py",
                 "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert head["deployment_id"] in text, path
        assert NEW_DEPLOYMENT not in text and OLD_DEPLOYMENT not in text, path
        assert NEW_COMMIT not in text and OLD_COMMIT not in text, path
    adapter = (ROOT / "src/lib/pipeline/parser/adapter.ts").read_text(encoding="utf-8")
    assert f'DEPLOYED_WORKER_REVISION = "git:{head["semantic_commit"]}"' in adapter
    assert f'DEPLOYED_WORKER_BUILD_REVISION = "git:{head["build_commit"]}"' in adapter
    # raw_evidence.py changed again in R5.8.23 and R5.8.24: neither R5.8.22 nor R5.8.21 blob is still active.
    for path in ("scripts/parser_runtime_attestation.py", "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert head["critical_hashes"]["raw_evidence.py"] in text, path
        assert NEW_RAW not in text and OLD_RAW not in text, path
