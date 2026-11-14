"""R5.8.24 re-pins the runtime after spatial-v1 layer A (PR #267), forward-only.

PR #267 reads player_death with the player positions X/Y/Z at the death tick (demoparser2 0.42.0 takes
them as keyword-only `player=`; the earlier positional call raised TypeError and fell back without them)
and catalogues the new attacker_/user_ position fields as MAPPED (assister_ positions RAW-only). Released
under the standing watch-pattern freeze as ONE controlled Railway deployment of the merge commit 4badf606
(deployment 0ff96670): semantic = build = 4badf606; the parser.py and raw_evidence.py critical blobs
changed. Both /version hosts are proven by the H.3-E activation gate.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

OLD_DEPLOYMENT = "7324404e-f15d-45a0-8ec7-518a0770ca81"
NEW_DEPLOYMENT = "0ff96670-e373-4beb-90c9-f1967eee3195"
OLD_COMMIT = "94c6460b6c577e66e573a3a1d53f11a8edd5feae"
NEW_COMMIT = "4badf6060e4e69a589179567f488f5d58a4a58dc"
OLD_RAW = "b72c3174216f833522d66d8bc6c43f1af2d6fb17"
NEW_RAW = "5b7b674c88a77f85ab8791f84a47a188889b5802"
OLD_PARSER = "0dcb5962a0c977ab7a82326ebf8a0ef70bafde02"
NEW_PARSER = "4102f6174e4dc01d97637174f4f70fe53629c285"
SPEC = json.loads((ROOT / "docs/reference/r5_8_24/spec.json").read_text(encoding="utf-8"))
PREVIOUS = json.loads((ROOT / "docs/reference/r5_8_23/spec.json").read_text(encoding="utf-8"))
MIGRATION = (ROOT / "supabase/migrations/20261112090000_r5_8_24_repin_runtime_release.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/r5_8_24/rollback.sql").read_text(encoding="utf-8")


def _git(*args: str) -> str | None:
    try:
        return subprocess.check_output(("git", *args), cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError:
        return None


def test_only_the_spatial_v1_release_pins_change():
    assert (PREVIOUS["deployment_id"], SPEC["deployment_id"]) == (OLD_DEPLOYMENT, NEW_DEPLOYMENT)
    assert PREVIOUS["semantic_commit"] == PREVIOUS["build_commit"] == OLD_COMMIT
    assert SPEC["semantic_commit"] == SPEC["build_commit"] == SPEC["deployment_commit"] == NEW_COMMIT
    assert (SPEC["branch"], SPEC["workflow_source_sha"]) == (PREVIOUS["branch"], PREVIOUS["workflow_source_sha"])
    changed = {k for k, v in SPEC["critical_hashes"].items() if PREVIOUS["critical_hashes"][k] != v}
    assert changed == {"parser.py", "raw_evidence.py"}
    assert (PREVIOUS["critical_hashes"]["raw_evidence.py"], SPEC["critical_hashes"]["raw_evidence.py"]) == (OLD_RAW, NEW_RAW)
    assert (PREVIOUS["critical_hashes"]["parser.py"], SPEC["critical_hashes"]["parser.py"]) == (OLD_PARSER, NEW_PARSER)
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
    assert r5_8_11.target_md5(PREVIOUS) == SPEC["r5_8_23_recorder_target_md5"] == PREVIOUS["recorder_target_md5"]
    assert r5_8_11.target_md5(SPEC) == SPEC["recorder_target_md5"] == "c28ed93d37612ffdbe02653d8ea980eb"
    for name in r5_8_11.BOUNDARY:
        assert SPEC["r5_8_23_database_target_md5"][name] == PREVIOUS["database_target_md5"][name]
        assert r5_8_11.boundary_target_md5(name, SPEC) == SPEC["database_target_md5"][name]
    # Observed read-only on the managed database (md5 of prosrc after the same substitutions).
    assert SPEC["database_target_md5"]["assert_verified_parser_provenance"] == "c661f1f3adf774a3376c2ed510bfe607"
    assert SPEC["database_target_md5"]["enforce_approved_attestation_workflow"] == \
        PREVIOUS["database_target_md5"]["enforce_approved_attestation_workflow"]
    previous_body = r5_8_11.target_body(PREVIOUS)
    assert (previous_body.count(OLD_DEPLOYMENT), previous_body.count(OLD_COMMIT), previous_body.count(OLD_RAW),
            previous_body.count(OLD_PARSER)) == (1, 4, 1, 1)
    body = r5_8_11.target_body(SPEC)
    assert md5(body) == SPEC["recorder_target_md5"]
    assert (body.count(NEW_COMMIT), body.count(NEW_DEPLOYMENT), body.count(NEW_RAW), body.count(NEW_PARSER)) == (4, 1, 1, 1)
    # Forward then rollback substitutions restore the R5.8.23 body exactly.
    back = body.replace(NEW_DEPLOYMENT, OLD_DEPLOYMENT).replace(NEW_RAW, OLD_RAW).replace(NEW_PARSER, OLD_PARSER)
    back = back.replace(NEW_COMMIT, OLD_COMMIT)
    assert md5(back) == SPEC["r5_8_23_recorder_target_md5"]


def test_migration_is_forward_only_bounded_and_fail_closed():
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_RAW, NEW_RAW, OLD_PARSER, NEW_PARSER,
                  SPEC["recorder_target_md5"], SPEC["r5_8_23_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_23_database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["database_target_md5"]["enforce_approved_attestation_workflow"]):
        assert value in MIGRATION, value
    for marker in ("R5_8_24_UNEXPECTED_PIN_STATE", "R5_8_24_POSTCONDITION_INVALID",
                   "R5_8_24_FUNCTION_PROPERTIES_CHANGED", "R5_8_24_R5_8_12_WORKFLOW_STATE_MISSING",
                   "R5_8_24_ALREADY_AT_TARGET_STATE", "_deployment_count constant integer[] := ARRAY[1, 1]",
                   "_commit_count constant integer[] := ARRAY[4, 3]",
                   "_raw_blob_count constant integer[] := ARRAY[1, 0]",
                   "_parser_blob_count constant integer[] := ARRAY[1, 0]"):
        assert marker in MIGRATION, marker
    assert "R5_8_23" not in MIGRATION
    for forbidden in ("CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in MIGRATION, forbidden
    prior = (ROOT / "supabase/migrations/20261104100000_r5_8_23_repin_runtime_release.sql").read_text(encoding="utf-8")
    assert OLD_DEPLOYMENT in prior and NEW_DEPLOYMENT not in prior and NEW_COMMIT not in prior


def test_rollback_restores_the_r5_8_23_bodies_and_fails_closed():
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_RAW, NEW_RAW, OLD_PARSER, NEW_PARSER,
                  SPEC["recorder_target_md5"], SPEC["r5_8_23_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_23_database_target_md5"]["assert_verified_parser_provenance"]):
        assert value in ROLLBACK, value
    assert "R5_8_24_ROLLBACK_UNEXPECTED_PIN_STATE" in ROLLBACK
    assert "R5_8_24_ROLLBACK_POSTCONDITION_INVALID" in ROLLBACK
    for forbidden in ("UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in ROLLBACK, forbidden


def test_every_active_repository_pin_names_the_released_runtime():
    """R5.8.24 is historical since R5.8.25 (demoparser2 0.42.2): no active pin may still name it."""
    successor = json.loads((ROOT / "docs/reference/r5_8_25/spec.json").read_text(encoding="utf-8"))
    assert successor["observed"]["before"]["deployment_id"] == NEW_DEPLOYMENT
    # R5.8.25 is itself historical since R5.8.26; every active pin names the head.
    successor = json.loads((ROOT / "docs/reference/r5_8_27/spec.json").read_text(encoding="utf-8"))  # active head
    for path in ("scripts/parser_runtime_attestation.py", "scripts/h3e91_live_preflight.py",
                 "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert successor["deployment_id"] in text, path
        assert NEW_DEPLOYMENT not in text and OLD_DEPLOYMENT not in text, path
        assert NEW_COMMIT not in text and OLD_COMMIT not in text, path
    adapter = (ROOT / "src/lib/pipeline/parser/adapter.ts").read_text(encoding="utf-8")
    assert f'DEPLOYED_WORKER_REVISION = "git:{successor["semantic_commit"]}"' in adapter
    assert f'DEPLOYED_WORKER_BUILD_REVISION = "git:{successor["build_commit"]}"' in adapter
    # parser.py and raw_evidence.py changed again in R5.8.25: neither R5.8.24 nor R5.8.23 blob is still active.
    for path in ("scripts/parser_runtime_attestation.py", "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert successor["critical_hashes"]["raw_evidence.py"] in text, path
        assert successor["critical_hashes"]["parser.py"] in text, path
        assert NEW_RAW not in text and OLD_RAW not in text, path
        assert NEW_PARSER not in text and OLD_PARSER not in text, path


def test_migration_comments_name_only_the_released_runtime():
    """The COMMENT statements are metadata read by people and audits: they must describe R5.8.24 only."""
    comments = MIGRATION[MIGRATION.index("COMMENT ON FUNCTION"):]
    assert comments.count("IS 'R5.8.24 re-pinned") == 2
    for value in (NEW_DEPLOYMENT, NEW_COMMIT, NEW_RAW, NEW_PARSER):
        assert value in comments, value
    for value in (OLD_DEPLOYMENT, OLD_COMMIT, OLD_RAW, OLD_PARSER, "R5.8.23"):
        assert value not in comments, value
    # The rollback restores the R5.8.23 comments, never the R5.8.24 ones.
    rollback_comments = ROLLBACK[ROLLBACK.index("COMMENT ON FUNCTION"):]
    assert rollback_comments.count("IS 'R5.8.23 re-pinned") == 2
    assert NEW_DEPLOYMENT not in rollback_comments and NEW_COMMIT not in rollback_comments
