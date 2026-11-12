"""R5.8.23 re-pins the runtime after the parser field-governance review (PR #239), forward-only.

PR #239 made raw_evidence.py classify what the adapter and the hot payload really consume (labels only:
fields consumed while labelled RAW_ONLY became MAPPED/DERIVED, an IGNORED_APPROVED table was added,
UNMAPPED still blocks). Released under the standing watch-pattern freeze as ONE controlled Railway
deployment of the merge commit 94c6460b (deployment 7324404e): semantic = build = 94c6460b; only the
raw_evidence.py critical blob changed. Both /version hosts are proven by the H.3-E activation gate.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

OLD_DEPLOYMENT = "2edd7ed1-2703-42ad-abe3-ebe13d235e81"
NEW_DEPLOYMENT = "7324404e-f15d-45a0-8ec7-518a0770ca81"
OLD_COMMIT = "c764f858ffa9df0ffa2740bdba450c7a37be2f3e"
NEW_COMMIT = "94c6460b6c577e66e573a3a1d53f11a8edd5feae"
OLD_RAW = "f906889c795a7e6e8a41902e8e453f3f5b9d956e"
NEW_RAW = "b72c3174216f833522d66d8bc6c43f1af2d6fb17"
SPEC = json.loads((ROOT / "docs/reference/r5_8_23/spec.json").read_text(encoding="utf-8"))
PREVIOUS = json.loads((ROOT / "docs/reference/r5_8_22/spec.json").read_text(encoding="utf-8"))
MIGRATION = (ROOT / "supabase/migrations/20261104100000_r5_8_23_repin_runtime_release.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/r5_8_23/rollback.sql").read_text(encoding="utf-8")


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
    assert r5_8_11.target_md5(PREVIOUS) == SPEC["r5_8_22_recorder_target_md5"] == PREVIOUS["recorder_target_md5"]
    assert r5_8_11.target_md5(SPEC) == SPEC["recorder_target_md5"] == "ea3ba14c6cabd8013e6fc8a50c036158"
    for name in r5_8_11.BOUNDARY:
        assert SPEC["r5_8_22_database_target_md5"][name] == PREVIOUS["database_target_md5"][name]
        assert r5_8_11.boundary_target_md5(name, SPEC) == SPEC["database_target_md5"][name]
    # Observed read-only on the managed database (md5 of prosrc after the same substitutions).
    assert SPEC["database_target_md5"]["assert_verified_parser_provenance"] == "fb659f89da5963b778aa18c668e7fd54"
    assert SPEC["database_target_md5"]["enforce_approved_attestation_workflow"] == \
        PREVIOUS["database_target_md5"]["enforce_approved_attestation_workflow"]
    previous_body = r5_8_11.target_body(PREVIOUS)
    assert (previous_body.count(OLD_DEPLOYMENT), previous_body.count(OLD_COMMIT), previous_body.count(OLD_RAW)) == (1, 4, 1)
    body = r5_8_11.target_body(SPEC)
    assert md5(body) == SPEC["recorder_target_md5"]
    assert (body.count(NEW_COMMIT), body.count(NEW_DEPLOYMENT), body.count(NEW_RAW)) == (4, 1, 1)
    # Forward then rollback substitutions restore the R5.8.22 body exactly.
    back = body.replace(NEW_DEPLOYMENT, OLD_DEPLOYMENT).replace(NEW_RAW, OLD_RAW).replace(NEW_COMMIT, OLD_COMMIT)
    assert md5(back) == SPEC["r5_8_22_recorder_target_md5"]


def test_migration_is_forward_only_bounded_and_fail_closed():
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_RAW, NEW_RAW,
                  SPEC["recorder_target_md5"], SPEC["r5_8_22_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_22_database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["database_target_md5"]["enforce_approved_attestation_workflow"]):
        assert value in MIGRATION, value
    for marker in ("R5_8_23_UNEXPECTED_PIN_STATE", "R5_8_23_POSTCONDITION_INVALID",
                   "R5_8_23_FUNCTION_PROPERTIES_CHANGED", "R5_8_23_R5_8_12_WORKFLOW_STATE_MISSING",
                   "R5_8_23_ALREADY_AT_TARGET_STATE", "_deployment_count constant integer[] := ARRAY[1, 1]",
                   "_commit_count constant integer[] := ARRAY[4, 3]",
                   "_raw_blob_count constant integer[] := ARRAY[1, 0]"):
        assert marker in MIGRATION, marker
    assert "R5_8_22" not in MIGRATION
    for forbidden in ("CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in MIGRATION, forbidden
    prior = (ROOT / "supabase/migrations/20261103190000_r5_8_22_repin_runtime_release.sql").read_text(encoding="utf-8")
    assert OLD_DEPLOYMENT in prior and NEW_DEPLOYMENT not in prior and NEW_COMMIT not in prior


def test_rollback_restores_the_r5_8_22_bodies_and_fails_closed():
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_RAW, NEW_RAW,
                  SPEC["recorder_target_md5"], SPEC["r5_8_22_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_22_database_target_md5"]["assert_verified_parser_provenance"]):
        assert value in ROLLBACK, value
    assert "R5_8_23_ROLLBACK_UNEXPECTED_PIN_STATE" in ROLLBACK
    assert "R5_8_23_ROLLBACK_POSTCONDITION_INVALID" in ROLLBACK
    for forbidden in ("UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in ROLLBACK, forbidden


def test_every_active_repository_pin_names_the_released_runtime():
    """R5.8.23 is historical since R5.8.24 (spatial-v1 layer A): no active pin may still name it."""
    successor = json.loads((ROOT / "docs/reference/r5_8_24/spec.json").read_text(encoding="utf-8"))  # active head
    assert successor["observed"]["before"]["deployment_id"] == NEW_DEPLOYMENT
    for path in ("scripts/parser_runtime_attestation.py", "scripts/h3e91_live_preflight.py",
                 "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert successor["deployment_id"] in text, path
        assert NEW_DEPLOYMENT not in text and OLD_DEPLOYMENT not in text, path
        assert NEW_COMMIT not in text and OLD_COMMIT not in text, path
    adapter = (ROOT / "src/lib/pipeline/parser/adapter.ts").read_text(encoding="utf-8")
    assert f'DEPLOYED_WORKER_REVISION = "git:{successor["semantic_commit"]}"' in adapter
    assert f'DEPLOYED_WORKER_BUILD_REVISION = "git:{successor["build_commit"]}"' in adapter
    # raw_evidence.py changed again in R5.8.24: neither the R5.8.23 nor the R5.8.22 blob is still active.
    for path in ("scripts/parser_runtime_attestation.py", "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert successor["critical_hashes"]["raw_evidence.py"] in text, path
        assert NEW_RAW not in text and OLD_RAW not in text, path
