"""R5.8.30 re-pins the runtime after the PM3 telemetry release (PR #310), forward-only.

PR #310 adds, in adapter.py, weapon_fire shooter/weapon/silenced, damage hitgroup and remaining health,
kill hitgroup/through-smoke/in-air, grenade detonation positions and inferno_startburn; raw_evidence.py
maps those fields. Released as ONE Railway deployment of the merge commit 768646ea (deployment
3335c88d), with the persistent service source aligned to that commit in the same controlled operation
(the source-change deployment 12cb2d07 was skipped by the watch-pattern freeze and built nothing).
Pins that change: deployment, commit and the adapter.py and raw_evidence.py critical blobs. Parser version
0.42.2 and every other blob stay.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

OLD_DEPLOYMENT = "3375b68b-c996-445f-b979-ed6318c89970"
NEW_DEPLOYMENT = "3335c88d-2a0f-461c-8919-5d6086b518fd"
OLD_COMMIT = "47ba6ffef76feae95dc98075cf3fb8089e02ce8f"
NEW_COMMIT = "768646ea76646219b1749f9fd2e757703292a24c"
OLD_ADAPTER = "3e4f4a049e952064f68f0a39614f5e6539d5a88a"
NEW_ADAPTER = "1eaf38401a09baceebbf9d959adf2f30ded5e962"
OLD_RAW = "6e6721b0245c99f7966b8083bbedef9b9cd0282b"
NEW_RAW = "81c0f7e5d690fcf9796838eaad6901446901a586"
SKIPPED_SOURCE_DEPLOYMENT = "12cb2d07-e51e-4637-b07c-03d65eb3f489"
SPEC = json.loads((ROOT / "docs/reference/r5_8_30/spec.json").read_text(encoding="utf-8"))
PREVIOUS = json.loads((ROOT / "docs/reference/r5_8_29/spec.json").read_text(encoding="utf-8"))
MIGRATION = (ROOT / "supabase/migrations/20261117120000_r5_8_30_repin_runtime_release.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/r5_8_30/rollback.sql").read_text(encoding="utf-8")


def _git(*args: str) -> str | None:
    try:
        return subprocess.check_output(("git", *args), cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError:
        return None


def test_only_the_pm3_telemetry_release_pins_change():
    assert (PREVIOUS["deployment_id"], SPEC["deployment_id"]) == (OLD_DEPLOYMENT, NEW_DEPLOYMENT)
    assert PREVIOUS["semantic_commit"] == PREVIOUS["build_commit"] == OLD_COMMIT
    assert SPEC["semantic_commit"] == SPEC["build_commit"] == SPEC["deployment_commit"] == NEW_COMMIT
    assert (SPEC["branch"], SPEC["workflow_source_sha"]) == (PREVIOUS["branch"], PREVIOUS["workflow_source_sha"])
    assert SPEC["parser_version"] == PREVIOUS["parser_version"] == "0.42.2"
    changed = {k for k, v in SPEC["critical_hashes"].items() if PREVIOUS["critical_hashes"][k] != v}
    assert changed == {"adapter.py", "raw_evidence.py"}
    assert (PREVIOUS["critical_hashes"]["adapter.py"], SPEC["critical_hashes"]["adapter.py"]) == (OLD_ADAPTER, NEW_ADAPTER)
    assert (PREVIOUS["critical_hashes"]["raw_evidence.py"], SPEC["critical_hashes"]["raw_evidence.py"]) == (OLD_RAW, NEW_RAW)
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
    assert r5_8_11.target_md5(PREVIOUS) == SPEC["r5_8_29_recorder_target_md5"] == PREVIOUS["recorder_target_md5"]
    assert r5_8_11.target_md5(SPEC) == SPEC["recorder_target_md5"] == "b46f6701d4d930c6771148a443ead4bc"
    for name in r5_8_11.BOUNDARY:
        assert SPEC["r5_8_29_database_target_md5"][name] == PREVIOUS["database_target_md5"][name]
        assert r5_8_11.boundary_target_md5(name, SPEC) == SPEC["database_target_md5"][name]
    # Read-only md5 of the managed definitions after the same substitutions.
    assert SPEC["database_target_md5"]["assert_verified_parser_provenance"] == "95dc9e5f05d76376b3e31488b3c1f058"
    assert SPEC["database_target_md5"]["enforce_approved_attestation_workflow"] == \
        PREVIOUS["database_target_md5"]["enforce_approved_attestation_workflow"]
    previous_body = r5_8_11.target_body(PREVIOUS)
    assert (previous_body.count(OLD_DEPLOYMENT), previous_body.count(OLD_COMMIT),
            previous_body.count(OLD_ADAPTER), previous_body.count(OLD_RAW)) == (1, 4, 1, 1)
    body = r5_8_11.target_body(SPEC)
    assert md5(body) == SPEC["recorder_target_md5"]
    assert (body.count(NEW_DEPLOYMENT), body.count(NEW_COMMIT), body.count(NEW_ADAPTER), body.count(NEW_RAW)) == (1, 4, 1, 1)
    assert OLD_DEPLOYMENT not in body and OLD_COMMIT not in body and OLD_ADAPTER not in body and OLD_RAW not in body
    back = body.replace(NEW_DEPLOYMENT, OLD_DEPLOYMENT).replace(NEW_COMMIT, OLD_COMMIT).replace(NEW_ADAPTER, OLD_ADAPTER)
    back = back.replace(NEW_RAW, OLD_RAW)
    assert md5(back) == SPEC["r5_8_29_recorder_target_md5"]


def test_migration_is_forward_only_bounded_and_fail_closed():
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_ADAPTER, NEW_ADAPTER, OLD_RAW, NEW_RAW,
                  SPEC["recorder_target_md5"], SPEC["r5_8_29_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_29_database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["database_target_md5"]["enforce_approved_attestation_workflow"]):
        assert value in MIGRATION, value
    for marker in ("R5_8_30_UNEXPECTED_PIN_STATE", "R5_8_30_POSTCONDITION_INVALID",
                   "R5_8_30_FUNCTION_PROPERTIES_CHANGED", "R5_8_30_R5_8_12_WORKFLOW_STATE_MISSING",
                   "R5_8_30_ALREADY_AT_TARGET_STATE",
                   "_counts constant integer[][] := ARRAY[[1, 1], [4, 3], [1, 0], [1, 0]]"):
        assert marker in MIGRATION, marker
    assert "R5_8_29" not in MIGRATION and "0.42.0" not in MIGRATION
    for forbidden in ("CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in MIGRATION, forbidden
    prior = (ROOT / "supabase/migrations/20261114230000_r5_8_29_repin_runtime_release.sql").read_text(encoding="utf-8")
    assert OLD_DEPLOYMENT in prior and NEW_DEPLOYMENT not in prior and NEW_COMMIT not in prior and NEW_ADAPTER not in prior and NEW_RAW not in prior


def test_rollback_restores_the_r5_8_29_bodies_and_fails_closed():
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, OLD_ADAPTER, NEW_ADAPTER, OLD_RAW, NEW_RAW,
                  SPEC["recorder_target_md5"], SPEC["r5_8_29_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_29_database_target_md5"]["assert_verified_parser_provenance"]):
        assert value in ROLLBACK, value
    assert "R5_8_30_ROLLBACK_UNEXPECTED_PIN_STATE" in ROLLBACK
    assert "R5_8_30_ROLLBACK_POSTCONDITION_INVALID" in ROLLBACK
    for forbidden in ("UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in ROLLBACK, forbidden


def test_every_active_repository_pin_names_the_released_runtime():
    """R5.8.30 is historical since R5.8.31 (PM4 round economy): no active pin may still name it."""
    successor = json.loads((ROOT / "docs/reference/r5_8_31/spec.json").read_text(encoding="utf-8"))  # active head
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
    # adapter.py stays active from R5.8.30; raw_evidence.py moved on again in R5.8.31.
    for path in ("scripts/parser_runtime_attestation.py", "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert NEW_ADAPTER in text and OLD_ADAPTER not in text, path
        assert NEW_RAW not in text and OLD_RAW not in text, path
        for name, blob in successor["critical_hashes"].items():
            assert blob in text, (path, name)


def test_migration_comments_name_only_the_released_runtime():
    """The COMMENT statements are metadata read by people and audits: they must describe R5.8.30 only."""
    comments = MIGRATION[MIGRATION.index("COMMENT ON FUNCTION"):]
    assert comments.count("IS 'R5.8.30 re-pinned") == 2
    for value in (NEW_DEPLOYMENT, NEW_COMMIT, NEW_ADAPTER, NEW_RAW, "demoparser2 0.42.2"):
        assert value in comments, value
    for value in (OLD_DEPLOYMENT, OLD_COMMIT, OLD_ADAPTER, OLD_RAW, "R5.8.29", "0.42.0"):
        assert value not in comments, value
    rollback_comments = ROLLBACK[ROLLBACK.index("COMMENT ON FUNCTION"):]
    assert rollback_comments.count("IS 'R5.8.29 re-pinned") == 2
    assert NEW_DEPLOYMENT not in rollback_comments and NEW_COMMIT not in rollback_comments
