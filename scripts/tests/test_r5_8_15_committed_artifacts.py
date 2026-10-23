"""R5.8.15 re-pins the runtime after the D13b parser release (PR #162), forward-only.

Released 2026-10-20 under a watch-pattern freeze as ONE controlled Railway deployment of
the exact merge commit a5d8c425 (deployment 01998834, after Railway incident JUA1PC5H paused
builds): semantic = build = a5d8c425, and only the parser.py critical blob changed. Both
/version hosts reported that identity with declared_revision_matches=true before any pin moved.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

OLD_DEPLOYMENT = "3acb47c5-d9a4-43f2-acff-9ead7cb12b30"
NEW_DEPLOYMENT = "01998834-4c35-43c2-b3e4-976f76a21fd5"
OLD_COMMIT = "7f70141b7c3ae231fbbca4c37058c4cdbdd7aacd"
NEW_COMMIT = "a5d8c425839e1e0e7e6f5506ae141bc85359726b"
OLD_PARSER = "8f75eb61f82f6746881b361234a6f5e3a59a4225"
NEW_PARSER = "024c1dd48abfdd5f7d34881860b8dbd2a87a3b8a"
SPEC = json.loads((ROOT / "docs/reference/r5_8_15/spec.json").read_text(encoding="utf-8"))
PREVIOUS = json.loads((ROOT / "docs/reference/r5_8_14/spec.json").read_text(encoding="utf-8"))
MIGRATION = (ROOT / "supabase/migrations/20261020210000_r5_8_15_repin_runtime_release.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/r5_8_15/rollback.sql").read_text(encoding="utf-8")


def _git(*args: str) -> str | None:
    try:
        return subprocess.check_output(("git", *args), cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError:
        return None


def test_only_the_parser_release_pins_change():
    assert (PREVIOUS["deployment_id"], SPEC["deployment_id"]) == (OLD_DEPLOYMENT, NEW_DEPLOYMENT)
    assert PREVIOUS["semantic_commit"] == PREVIOUS["build_commit"] == OLD_COMMIT
    assert SPEC["semantic_commit"] == SPEC["build_commit"] == SPEC["deployment_commit"] == NEW_COMMIT
    assert (SPEC["branch"], SPEC["workflow_source_sha"]) == (PREVIOUS["branch"], PREVIOUS["workflow_source_sha"])
    changed = {k for k, v in SPEC["critical_hashes"].items() if PREVIOUS["critical_hashes"][k] != v}
    assert changed == {"parser.py"}
    assert (PREVIOUS["critical_hashes"]["parser.py"], SPEC["critical_hashes"]["parser.py"]) == (OLD_PARSER, NEW_PARSER)
    observed = SPEC["observed"]
    assert observed["railway_deployment"]["id"] == NEW_DEPLOYMENT
    assert observed["railway_deployment"]["status"] == "SUCCESS"
    assert observed["railway_deployment"]["commitHash"] == NEW_COMMIT
    assert len(observed["version_hosts"]) == 2
    for host in observed["version_hosts"].values():
        assert host["build"]["commit"] == NEW_COMMIT and host["build"]["declared_revision_matches"] is True
        assert host["parser"]["semantic_revision"] == host["parser"]["build_revision"] == f"git:{NEW_COMMIT}"
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
    assert r5_8_11.target_md5(PREVIOUS) == SPEC["r5_8_14_recorder_target_md5"] == PREVIOUS["recorder_target_md5"]
    assert r5_8_11.target_md5(SPEC) == SPEC["recorder_target_md5"] == "d9328086d1541927c4bf3b508c8c307b"
    for name in r5_8_11.BOUNDARY:
        assert SPEC["r5_8_14_database_target_md5"][name] == PREVIOUS["database_target_md5"][name]
        assert r5_8_11.boundary_target_md5(name, SPEC) == SPEC["database_target_md5"][name]
    assert SPEC["database_target_md5"]["assert_verified_parser_provenance"] == "39418665644987bcdd25c7456634d410"
    assert SPEC["database_target_md5"]["enforce_approved_attestation_workflow"] == \
        PREVIOUS["database_target_md5"]["enforce_approved_attestation_workflow"]
    previous_body = r5_8_11.target_body(PREVIOUS)
    assert (previous_body.count(OLD_DEPLOYMENT), previous_body.count(OLD_COMMIT), previous_body.count(OLD_PARSER)) == (1, 4, 1)
    body = r5_8_11.target_body(SPEC)
    assert md5(body) == SPEC["recorder_target_md5"]
    assert body.count(NEW_COMMIT) == 4 and body.count(NEW_DEPLOYMENT) == 1 and body.count(NEW_PARSER) == 1
    # Forward then rollback substitutions restore the R5.8.14 body exactly.
    back = body.replace(NEW_DEPLOYMENT, OLD_DEPLOYMENT).replace(NEW_PARSER, OLD_PARSER).replace(NEW_COMMIT, OLD_COMMIT)
    assert md5(back) == SPEC["r5_8_14_recorder_target_md5"]


def test_migration_is_forward_only_bounded_and_fail_closed():
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_PARSER, NEW_PARSER,
                  SPEC["recorder_target_md5"], SPEC["r5_8_14_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_14_database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["database_target_md5"]["enforce_approved_attestation_workflow"]):
        assert value in MIGRATION, value
    for marker in ("R5_8_15_UNEXPECTED_PIN_STATE", "R5_8_15_POSTCONDITION_INVALID",
                   "R5_8_15_FUNCTION_PROPERTIES_CHANGED", "R5_8_15_R5_8_12_WORKFLOW_STATE_MISSING",
                   "R5_8_15_ALREADY_AT_TARGET_STATE", "_deployment_count constant integer[] := ARRAY[1, 1]",
                   "_commit_count constant integer[] := ARRAY[4, 3]",
                   "_parser_blob_count constant integer[] := ARRAY[1, 0]"):
        assert marker in MIGRATION, marker
    for forbidden in ("CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in MIGRATION, forbidden
    prior = (ROOT / "supabase/migrations/20261020080000_r5_8_14_repin_runtime_release.sql").read_text(encoding="utf-8")
    assert OLD_DEPLOYMENT in prior and NEW_DEPLOYMENT not in prior and NEW_COMMIT not in prior


def test_rollback_restores_the_r5_8_14_bodies_and_fails_closed():
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_PARSER, NEW_PARSER,
                  SPEC["recorder_target_md5"], SPEC["r5_8_14_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_14_database_target_md5"]["assert_verified_parser_provenance"]):
        assert value in ROLLBACK, value
    assert "R5_8_15_ROLLBACK_UNEXPECTED_PIN_STATE" in ROLLBACK
    assert "R5_8_15_ROLLBACK_POSTCONDITION_INVALID" in ROLLBACK
    for forbidden in ("UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in ROLLBACK, forbidden


def test_every_active_repository_pin_names_the_released_runtime():
    """R5.8.15 is historical since R5.8.16 (D22): no active pin may still name it."""
    r5816 = json.loads((ROOT / "docs/reference/r5_8_16/spec.json").read_text(encoding="utf-8"))
    assert r5816["observed"]["before"]["deployment_id"] == NEW_DEPLOYMENT
    r5817 = json.loads((ROOT / "docs/reference/r5_8_17/spec.json").read_text(encoding="utf-8"))
    for path in ("scripts/parser_runtime_attestation.py", "scripts/h3e91_live_preflight.py",
                 "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert r5817["deployment_id"] in text and r5816["deployment_id"] not in text, path
        assert NEW_DEPLOYMENT not in text and OLD_DEPLOYMENT not in text, path
        assert NEW_COMMIT not in text and OLD_COMMIT not in text, path
    adapter = (ROOT / "src/lib/pipeline/parser/adapter.ts").read_text(encoding="utf-8")
    assert f'DEPLOYED_WORKER_REVISION = "git:{r5817["semantic_commit"]}"' in adapter
    for path in ("scripts/parser_runtime_attestation.py", "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert NEW_PARSER not in text and OLD_PARSER not in text, path
