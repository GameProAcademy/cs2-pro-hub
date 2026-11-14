"""R5.8.27 re-pins the runtime after PM6 C (PR #287), forward-only.

PR #287 wires cs2.match-integrity.v1: the worker reads game_phase at every round_end in its own call
(RAW rows unchanged) and emits match_end_evidence. Released under the standing watch-pattern freeze as
ONE controlled Railway deployment of the merge commit 3837a810 (deployment 7690b171): semantic = build.
Pins that change: deployment, commit and the parser.py (OLD_RAW/NEW_RAW names kept for the parser blob)
and adapter.py critical blobs. Parser version 0.42.2 and every other blob stay.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

OLD_DEPLOYMENT = "2f0e6812-6aa0-4137-b9ca-aa541dafe103"
NEW_DEPLOYMENT = "7690b171-087f-46ca-9899-a5b96d8c32cb"
OLD_COMMIT = "7e84f6da0a60c1b48897ec24bb721cde9aa65a62"
NEW_COMMIT = "3837a810c4569c0f1c2ef67064cb0f0869003c7a"
OLD_RAW = "5d39478c611b57b2dd17f93c9cdce8faa84860f9"
OLD_ADAPTER = "4e6f43c7916bb7d855cfd1abcd26637bb0f3f942"
NEW_RAW = "99ff0cccb999e950f1253a29d3f87ca9e22f067a"
NEW_ADAPTER = "020f847ad57d770779dd4951beb597023fea060e"
SPEC = json.loads((ROOT / "docs/reference/r5_8_27/spec.json").read_text(encoding="utf-8"))
PREVIOUS = json.loads((ROOT / "docs/reference/r5_8_26/spec.json").read_text(encoding="utf-8"))
MIGRATION = (ROOT / "supabase/migrations/20261114050000_r5_8_27_repin_runtime_release.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/r5_8_27/rollback.sql").read_text(encoding="utf-8")


def _git(*args: str) -> str | None:
    try:
        return subprocess.check_output(("git", *args), cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError:
        return None


def test_only_the_pm6_c_release_pins_change():
    assert (PREVIOUS["deployment_id"], SPEC["deployment_id"]) == (OLD_DEPLOYMENT, NEW_DEPLOYMENT)
    assert PREVIOUS["semantic_commit"] == PREVIOUS["build_commit"] == OLD_COMMIT
    assert SPEC["semantic_commit"] == SPEC["build_commit"] == SPEC["deployment_commit"] == NEW_COMMIT
    assert (SPEC["branch"], SPEC["workflow_source_sha"]) == (PREVIOUS["branch"], PREVIOUS["workflow_source_sha"])
    assert SPEC["parser_version"] == PREVIOUS["parser_version"] == "0.42.2"
    changed = {k for k, v in SPEC["critical_hashes"].items() if PREVIOUS["critical_hashes"][k] != v}
    assert changed == {"parser.py", "adapter.py"}
    assert (PREVIOUS["critical_hashes"]["parser.py"], SPEC["critical_hashes"]["parser.py"]) == (OLD_RAW, NEW_RAW)
    assert (PREVIOUS["critical_hashes"]["adapter.py"], SPEC["critical_hashes"]["adapter.py"]) == (OLD_ADAPTER, NEW_ADAPTER)
    observed = SPEC["observed"]
    assert observed["railway_deployment"]["id"] == NEW_DEPLOYMENT
    assert observed["railway_deployment"]["status"] == "SUCCESS"
    assert observed["railway_deployment"]["commitHash"] == NEW_COMMIT
    assert str(observed["version_hosts"]).startswith("PROVEN_AFTER_REPIN_BY_THE_H3E_ACTIVATION_GATE")
    assert observed["before"]["deployment_id"] == OLD_DEPLOYMENT
    assert observed["managed_start_state"]["record_parser_runtime_attestation"] == PREVIOUS["recorder_target_md5"]
    assert observed["managed_start_state"]["assert_verified_parser_provenance"] == \
        PREVIOUS["database_target_md5"]["assert_verified_parser_provenance"]


def test_critical_hashes_are_the_blobs_of_the_released_commit():
    if _git("cat-file", "-e", f"{NEW_COMMIT}^{{commit}}") is None:
        return  # shallow checkout without the release commit; the gate checks it remotely
    for name, blob in SPEC["critical_hashes"].items():
        assert _git("rev-parse", f"{NEW_COMMIT}:services/cs2-demo-parser/{name}") == blob, name
    assert _git("merge-base", "--is-ancestor", OLD_COMMIT, NEW_COMMIT) == ""
    requirements = _git("show", f"{NEW_COMMIT}:services/cs2-demo-parser/requirements.txt") or ""
    assert "demoparser2==0.42.2" in requirements.splitlines()


def test_targets_are_the_generator_output():
    md5 = lambda text: hashlib.md5(text.encode()).hexdigest()  # noqa: E731
    assert r5_8_11.target_md5(PREVIOUS) == SPEC["r5_8_26_recorder_target_md5"] == PREVIOUS["recorder_target_md5"]
    assert r5_8_11.target_md5(SPEC) == SPEC["recorder_target_md5"] == "640a6f7281fc3cf425d888b3ee124f21"
    for name in r5_8_11.BOUNDARY:
        assert SPEC["r5_8_26_database_target_md5"][name] == PREVIOUS["database_target_md5"][name]
        assert r5_8_11.boundary_target_md5(name, SPEC) == SPEC["database_target_md5"][name]
    # Read-only md5 of the managed definitions after the same substitutions, reproduced by applying the
    # migration to the exact managed function definitions on a disposable PostgreSQL 16.
    assert SPEC["database_target_md5"]["assert_verified_parser_provenance"] == "475c684986af01f67c1ce6e3461de189"
    assert SPEC["database_target_md5"]["enforce_approved_attestation_workflow"] == \
        PREVIOUS["database_target_md5"]["enforce_approved_attestation_workflow"]
    previous_body = r5_8_11.target_body(PREVIOUS)
    assert (previous_body.count(OLD_DEPLOYMENT), previous_body.count(OLD_COMMIT), previous_body.count(OLD_RAW),
            previous_body.count(OLD_ADAPTER)) == (1, 4, 1, 1)
    body = r5_8_11.target_body(SPEC)
    assert md5(body) == SPEC["recorder_target_md5"]
    assert (body.count(NEW_DEPLOYMENT), body.count(NEW_COMMIT), body.count(NEW_RAW), body.count(NEW_ADAPTER)) == (1, 4, 1, 1)
    assert OLD_DEPLOYMENT not in body and OLD_COMMIT not in body and OLD_RAW not in body and OLD_ADAPTER not in body
    # Forward then rollback substitutions restore the R5.8.25 body exactly.
    back = body.replace(NEW_DEPLOYMENT, OLD_DEPLOYMENT).replace(NEW_COMMIT, OLD_COMMIT).replace(NEW_RAW, OLD_RAW)
    back = back.replace(NEW_ADAPTER, OLD_ADAPTER)
    assert md5(back) == SPEC["r5_8_26_recorder_target_md5"]


def test_migration_is_forward_only_bounded_and_fail_closed():
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_RAW, NEW_RAW, OLD_ADAPTER, NEW_ADAPTER,
                  SPEC["recorder_target_md5"], SPEC["r5_8_26_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_26_database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["database_target_md5"]["enforce_approved_attestation_workflow"]):
        assert value in MIGRATION, value
    for marker in ("R5_8_27_UNEXPECTED_PIN_STATE", "R5_8_27_POSTCONDITION_INVALID",
                   "R5_8_27_FUNCTION_PROPERTIES_CHANGED", "R5_8_27_R5_8_12_WORKFLOW_STATE_MISSING",
                   "R5_8_27_ALREADY_AT_TARGET_STATE",
                   "_counts constant integer[][] := ARRAY[[1, 1], [4, 3], [1, 0], [1, 0]]"):
        assert marker in MIGRATION, marker
    assert "R5_8_26" not in MIGRATION and "0.42.0" not in MIGRATION
    for forbidden in ("CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in MIGRATION, forbidden
    prior = (ROOT / "supabase/migrations/20261113213000_r5_8_26_repin_runtime_release.sql").read_text(encoding="utf-8")
    assert OLD_DEPLOYMENT in prior and NEW_DEPLOYMENT not in prior and NEW_COMMIT not in prior and NEW_RAW not in prior


def test_rollback_restores_the_r5_8_26_bodies_and_fails_closed():
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_RAW, NEW_RAW, OLD_ADAPTER, NEW_ADAPTER,
                  SPEC["recorder_target_md5"], SPEC["r5_8_26_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_26_database_target_md5"]["assert_verified_parser_provenance"]):
        assert value in ROLLBACK, value
    assert "R5_8_27_ROLLBACK_UNEXPECTED_PIN_STATE" in ROLLBACK
    assert "R5_8_27_ROLLBACK_POSTCONDITION_INVALID" in ROLLBACK
    for forbidden in ("UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in ROLLBACK, forbidden


def test_every_active_repository_pin_names_the_released_runtime():
    for path in ("scripts/parser_runtime_attestation.py", "scripts/h3e91_live_preflight.py",
                 "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert NEW_DEPLOYMENT in text and OLD_DEPLOYMENT not in text, path
        assert NEW_COMMIT in text and OLD_COMMIT not in text, path
    adapter = (ROOT / "src/lib/pipeline/parser/adapter.ts").read_text(encoding="utf-8")
    assert f'DEPLOYED_WORKER_REVISION = "git:{NEW_COMMIT}"' in adapter
    assert f'DEPLOYED_WORKER_BUILD_REVISION = "git:{NEW_COMMIT}"' in adapter
    for path in ("scripts/parser_runtime_attestation.py", "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert NEW_RAW in text and OLD_RAW not in text, path
        assert NEW_ADAPTER in text and OLD_ADAPTER not in text, path
        for name, blob in SPEC["critical_hashes"].items():
            assert blob in text, (path, name)


def test_migration_comments_name_only_the_released_runtime():
    """The COMMENT statements are metadata read by people and audits: they must describe R5.8.27 only."""
    comments = MIGRATION[MIGRATION.index("COMMENT ON FUNCTION"):]
    assert comments.count("IS 'R5.8.27 re-pinned") == 2
    for value in (NEW_DEPLOYMENT, NEW_COMMIT, NEW_RAW, NEW_ADAPTER, "demoparser2 0.42.2"):
        assert value in comments, value
    for value in (OLD_DEPLOYMENT, OLD_COMMIT, OLD_RAW, OLD_ADAPTER, "R5.8.26", "0.42.0"):
        assert value not in comments, value
    rollback_comments = ROLLBACK[ROLLBACK.index("COMMENT ON FUNCTION"):]
    assert rollback_comments.count("IS 'R5.8.26 re-pinned") == 2
    assert NEW_DEPLOYMENT not in rollback_comments and NEW_COMMIT not in rollback_comments
