"""R5.8.28 re-pins the runtime after PM2 4.2.4 (PR #294), forward-only.

PR #294 adds cs2.round-trajectory.v1: the worker samples player positions per round in its own bounded
parse_ticks read, after and apart from the governed RAW evidence. Released as ONE Railway deployment of
the merge commit b440a06f (deployment bb92ed95), with the persistent service source aligned to that commit
in the same controlled operation (the source-change deployment was skipped by the watch-pattern freeze and
built nothing). Pins that change: deployment, commit and the parser.py critical blob. Parser version 0.42.2
and every other blob stay.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

OLD_DEPLOYMENT = "7690b171-087f-46ca-9899-a5b96d8c32cb"
NEW_DEPLOYMENT = "bb92ed95-7dd6-4d1c-af27-057140f038dd"
OLD_COMMIT = "3837a810c4569c0f1c2ef67064cb0f0869003c7a"
NEW_COMMIT = "b440a06fc06831be3cfe0b2080f6be901dad3019"
OLD_PARSER = "99ff0cccb999e950f1253a29d3f87ca9e22f067a"
NEW_PARSER = "bc30a72f6e8429387f0945d781a9ecc1c65dcb3a"
SKIPPED_SOURCE_DEPLOYMENT = "ef2caa23-6915-4a6c-9ef8-ed6b03cb4375"
SPEC = json.loads((ROOT / "docs/reference/r5_8_28/spec.json").read_text(encoding="utf-8"))
PREVIOUS = json.loads((ROOT / "docs/reference/r5_8_27/spec.json").read_text(encoding="utf-8"))
MIGRATION = (ROOT / "supabase/migrations/20261114190000_r5_8_28_repin_runtime_release.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/r5_8_28/rollback.sql").read_text(encoding="utf-8")


def _git(*args: str) -> str | None:
    try:
        return subprocess.check_output(("git", *args), cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError:
        return None


def test_only_the_pm2_release_pins_change():
    assert (PREVIOUS["deployment_id"], SPEC["deployment_id"]) == (OLD_DEPLOYMENT, NEW_DEPLOYMENT)
    assert PREVIOUS["semantic_commit"] == PREVIOUS["build_commit"] == OLD_COMMIT
    assert SPEC["semantic_commit"] == SPEC["build_commit"] == SPEC["deployment_commit"] == NEW_COMMIT
    assert (SPEC["branch"], SPEC["workflow_source_sha"]) == (PREVIOUS["branch"], PREVIOUS["workflow_source_sha"])
    assert SPEC["parser_version"] == PREVIOUS["parser_version"] == "0.42.2"
    changed = {k for k, v in SPEC["critical_hashes"].items() if PREVIOUS["critical_hashes"][k] != v}
    assert changed == {"parser.py"}
    assert (PREVIOUS["critical_hashes"]["parser.py"], SPEC["critical_hashes"]["parser.py"]) == (OLD_PARSER, NEW_PARSER)
    observed = SPEC["observed"]
    deployment = observed["railway_deployment"]
    assert (deployment["id"], deployment["status"], deployment["commitHash"]) == (NEW_DEPLOYMENT, "SUCCESS", NEW_COMMIT)
    # The persistent source is aligned to the released commit; the source-change deployment built nothing.
    assert deployment["service_source_after_release"]["commitSha"] == NEW_COMMIT
    assert deployment["service_source_after_release"]["rootDirectory"] == "services/cs2-demo-parser"
    assert SKIPPED_SOURCE_DEPLOYMENT in deployment["release_control"] and "SKIPPED" in deployment["release_control"]
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
    assert r5_8_11.target_md5(PREVIOUS) == SPEC["r5_8_27_recorder_target_md5"] == PREVIOUS["recorder_target_md5"]
    assert r5_8_11.target_md5(SPEC) == SPEC["recorder_target_md5"] == "99776ca5ef4fdbbb125e76433c927547"
    for name in r5_8_11.BOUNDARY:
        assert SPEC["r5_8_27_database_target_md5"][name] == PREVIOUS["database_target_md5"][name]
        assert r5_8_11.boundary_target_md5(name, SPEC) == SPEC["database_target_md5"][name]
    # Read-only md5 of the managed definitions after the same substitutions.
    assert SPEC["database_target_md5"]["assert_verified_parser_provenance"] == "1918875c864bce269f03777464b2ae38"
    assert SPEC["database_target_md5"]["enforce_approved_attestation_workflow"] == \
        PREVIOUS["database_target_md5"]["enforce_approved_attestation_workflow"]
    previous_body = r5_8_11.target_body(PREVIOUS)
    assert (previous_body.count(OLD_DEPLOYMENT), previous_body.count(OLD_COMMIT),
            previous_body.count(OLD_PARSER)) == (1, 4, 1)
    body = r5_8_11.target_body(SPEC)
    assert md5(body) == SPEC["recorder_target_md5"]
    assert (body.count(NEW_DEPLOYMENT), body.count(NEW_COMMIT), body.count(NEW_PARSER)) == (1, 4, 1)
    assert OLD_DEPLOYMENT not in body and OLD_COMMIT not in body and OLD_PARSER not in body
    back = body.replace(NEW_DEPLOYMENT, OLD_DEPLOYMENT).replace(NEW_COMMIT, OLD_COMMIT).replace(NEW_PARSER, OLD_PARSER)
    assert md5(back) == SPEC["r5_8_27_recorder_target_md5"]


def test_migration_is_forward_only_bounded_and_fail_closed():
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_PARSER, NEW_PARSER,
                  SPEC["recorder_target_md5"], SPEC["r5_8_27_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_27_database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["database_target_md5"]["enforce_approved_attestation_workflow"]):
        assert value in MIGRATION, value
    for marker in ("R5_8_28_UNEXPECTED_PIN_STATE", "R5_8_28_POSTCONDITION_INVALID",
                   "R5_8_28_FUNCTION_PROPERTIES_CHANGED", "R5_8_28_R5_8_12_WORKFLOW_STATE_MISSING",
                   "R5_8_28_ALREADY_AT_TARGET_STATE",
                   "_counts constant integer[][] := ARRAY[[1, 1], [4, 3], [1, 0]]"):
        assert marker in MIGRATION, marker
    assert "R5_8_27" not in MIGRATION and "0.42.0" not in MIGRATION
    for forbidden in ("CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in MIGRATION, forbidden
    prior = (ROOT / "supabase/migrations/20261114050000_r5_8_27_repin_runtime_release.sql").read_text(encoding="utf-8")
    assert OLD_DEPLOYMENT in prior and NEW_DEPLOYMENT not in prior and NEW_COMMIT not in prior and NEW_PARSER not in prior


def test_rollback_restores_the_r5_8_27_bodies_and_fails_closed():
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_PARSER, NEW_PARSER,
                  SPEC["recorder_target_md5"], SPEC["r5_8_27_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_27_database_target_md5"]["assert_verified_parser_provenance"]):
        assert value in ROLLBACK, value
    assert "R5_8_28_ROLLBACK_UNEXPECTED_PIN_STATE" in ROLLBACK
    assert "R5_8_28_ROLLBACK_POSTCONDITION_INVALID" in ROLLBACK
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
        assert NEW_PARSER in text and OLD_PARSER not in text, path
        for name, blob in SPEC["critical_hashes"].items():
            assert blob in text, (path, name)


def test_migration_comments_name_only_the_released_runtime():
    """The COMMENT statements are metadata read by people and audits: they must describe R5.8.28 only."""
    comments = MIGRATION[MIGRATION.index("COMMENT ON FUNCTION"):]
    assert comments.count("IS 'R5.8.28 re-pinned") == 2
    for value in (NEW_DEPLOYMENT, NEW_COMMIT, NEW_PARSER, "demoparser2 0.42.2"):
        assert value in comments, value
    for value in (OLD_DEPLOYMENT, OLD_COMMIT, OLD_PARSER, "R5.8.27", "0.42.0"):
        assert value not in comments, value
    rollback_comments = ROLLBACK[ROLLBACK.index("COMMENT ON FUNCTION"):]
    assert rollback_comments.count("IS 'R5.8.27 re-pinned") == 2
    assert NEW_DEPLOYMENT not in rollback_comments and NEW_COMMIT not in rollback_comments
