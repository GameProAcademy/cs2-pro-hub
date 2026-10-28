"""R5.8.14 re-pins the runtime after the D13 parser release (PR #159), forward-only.

Released 2026-10-20 under a watch-pattern freeze as ONE controlled Railway deployment of
the exact merge commit 7f70141b (deployment 3acb47c5): semantic = build = 7f70141b, and
only the parser.py critical blob changed. Both /version hosts reported that identity with
declared_revision_matches=true before any pin moved.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

OLD_DEPLOYMENT = "ece1c582-5cba-403d-b25c-a60faaf1aed5"
NEW_DEPLOYMENT = "3acb47c5-d9a4-43f2-acff-9ead7cb12b30"
OLD_SEMANTIC = "c2e045b0f71a7699c935b65ffe514fe526889de3"
OLD_BUILD = "eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1"
NEW_COMMIT = "7f70141b7c3ae231fbbca4c37058c4cdbdd7aacd"
OLD_PARSER = "981f6261c7e38334dfab5c93088e9d5ad1f56f6e"
NEW_PARSER = "8f75eb61f82f6746881b361234a6f5e3a59a4225"
SPEC = json.loads((ROOT / "docs/reference/r5_8_14/spec.json").read_text(encoding="utf-8"))
PREVIOUS = json.loads((ROOT / "docs/reference/r5_8_13/spec.json").read_text(encoding="utf-8"))
MIGRATION = (ROOT / "supabase/migrations/20261020080000_r5_8_14_repin_runtime_release.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/r5_8_14/rollback.sql").read_text(encoding="utf-8")


def _git(*args: str) -> str | None:
    try:
        return subprocess.check_output(("git", *args), cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError:
        return None


def test_only_the_parser_release_pins_change():
    assert (PREVIOUS["deployment_id"], SPEC["deployment_id"]) == (OLD_DEPLOYMENT, NEW_DEPLOYMENT)
    assert (PREVIOUS["semantic_commit"], PREVIOUS["build_commit"]) == (OLD_SEMANTIC, OLD_BUILD)
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


def test_critical_hashes_are_the_blobs_of_the_released_commit():
    if _git("cat-file", "-e", f"{NEW_COMMIT}^{{commit}}") is None:
        return  # shallow checkout without the release commit; the gate checks it remotely
    for name, blob in SPEC["critical_hashes"].items():
        assert _git("rev-parse", f"{NEW_COMMIT}:services/cs2-demo-parser/{name}") == blob, name
    assert _git("merge-base", "--is-ancestor", OLD_BUILD, NEW_COMMIT) == ""


def test_targets_are_the_generator_output():
    md5 = lambda text: hashlib.md5(text.encode()).hexdigest()  # noqa: E731
    assert r5_8_11.target_md5(PREVIOUS) == SPEC["r5_8_13_recorder_target_md5"] == PREVIOUS["recorder_target_md5"]
    assert r5_8_11.target_md5(SPEC) == SPEC["recorder_target_md5"] == "19a352c2be59dca326d5905c9dacb251"
    for name in r5_8_11.BOUNDARY:
        assert SPEC["r5_8_13_database_target_md5"][name] == PREVIOUS["database_target_md5"][name]
        assert r5_8_11.boundary_target_md5(name, SPEC) == SPEC["database_target_md5"][name]
    assert SPEC["database_target_md5"]["assert_verified_parser_provenance"] == "df0dc1b394d38a1f58f2a27afe0ea0cf"
    # The workflow guard carries no runtime pin and is unchanged.
    assert SPEC["database_target_md5"]["enforce_approved_attestation_workflow"] == \
        PREVIOUS["database_target_md5"]["enforce_approved_attestation_workflow"]
    # The recorder body from the generator carries each pin at the counts the migration checks.
    previous_body = r5_8_11.target_body(PREVIOUS)
    assert (previous_body.count(OLD_DEPLOYMENT), previous_body.count(OLD_SEMANTIC),
            previous_body.count(OLD_BUILD), previous_body.count(OLD_PARSER)) == (1, 2, 2, 1)
    body = r5_8_11.target_body(SPEC)
    assert md5(body) == SPEC["recorder_target_md5"]
    assert body.count(NEW_COMMIT) == 4 and body.count(NEW_DEPLOYMENT) == 1 and body.count(NEW_PARSER) == 1


def test_migration_is_forward_only_bounded_and_fail_closed():
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_SEMANTIC, OLD_BUILD, NEW_COMMIT, OLD_PARSER, NEW_PARSER,
                  SPEC["recorder_target_md5"], SPEC["r5_8_13_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_13_database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["database_target_md5"]["enforce_approved_attestation_workflow"]):
        assert value in MIGRATION, value
    for marker in ("R5_8_14_UNEXPECTED_PIN_STATE", "R5_8_14_POSTCONDITION_INVALID",
                   "R5_8_14_FUNCTION_PROPERTIES_CHANGED", "R5_8_14_R5_8_12_WORKFLOW_STATE_MISSING",
                   "R5_8_14_ALREADY_AT_TARGET_STATE", "_deployment_count constant integer[] := ARRAY[1, 1]",
                   "_semantic_count constant integer[] := ARRAY[2, 2]", "_build_count constant integer[] := ARRAY[2, 1]",
                   "_parser_blob_count constant integer[] := ARRAY[1, 0]"):
        assert marker in MIGRATION, marker
    for forbidden in ("CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in MIGRATION, forbidden
    # The prior link is never rewritten.
    prior = (ROOT / "supabase/migrations/20261018050000_r5_8_13_repin_runtime_deployment.sql").read_text(encoding="utf-8")
    assert OLD_DEPLOYMENT in prior and NEW_DEPLOYMENT not in prior and NEW_COMMIT not in prior


def test_rollback_restores_the_r5_8_13_bodies_and_fails_closed():
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_SEMANTIC, OLD_BUILD, NEW_COMMIT, OLD_PARSER, NEW_PARSER,
                  SPEC["recorder_target_md5"], SPEC["r5_8_13_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_13_database_target_md5"]["assert_verified_parser_provenance"]):
        assert value in ROLLBACK, value
    assert "R5_8_14_ROLLBACK_UNEXPECTED_PIN_STATE" in ROLLBACK
    assert "R5_8_14_ROLLBACK_POSTCONDITION_INVALID" in ROLLBACK
    for forbidden in ("UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in ROLLBACK, forbidden


def test_rollback_contexts_restore_the_r5_8_13_recorder_body_exactly():
    """semantic = build in R5.8.14, so the rollback separates them by SQL context."""
    md5 = lambda text: hashlib.md5(text.encode()).hexdigest()  # noqa: E731
    body = r5_8_11.target_body(SPEC)
    for old, new in (
        (NEW_DEPLOYMENT, OLD_DEPLOYMENT), (NEW_PARSER, OLD_PARSER),
        (f"build_revision'<>'git:{NEW_COMMIT}", f"build_revision'<>'git:{OLD_BUILD}"),
        (f"build_revision<>'git:{NEW_COMMIT}", f"build_revision<>'git:{OLD_BUILD}"),
        (f"source_commit'<>'{NEW_COMMIT}", f"source_commit'<>'{OLD_BUILD}"),
        (NEW_COMMIT, OLD_SEMANTIC),
    ):
        body = body.replace(old, new)
    assert md5(body) == SPEC["r5_8_13_recorder_target_md5"]


def test_every_active_repository_pin_names_the_released_runtime():
    """R5.8.14 is historical since R5.8.15 (D13b), and R5.8.15 since R5.8.16 (D22)."""
    r5815 = json.loads((ROOT / "docs/reference/r5_8_15/spec.json").read_text(encoding="utf-8"))
    assert r5815["observed"]["before"]["deployment_id"] == NEW_DEPLOYMENT
    r5816 = json.loads((ROOT / "docs/reference/r5_8_20/spec.json").read_text(encoding="utf-8"))  # active head
    for path in ("scripts/parser_runtime_attestation.py", "scripts/h3e91_live_preflight.py",
                 "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert r5816["deployment_id"] in text and r5815["deployment_id"] not in text, path
        assert NEW_DEPLOYMENT not in text and OLD_DEPLOYMENT not in text, path
        assert NEW_COMMIT not in text and OLD_BUILD not in text, path
    adapter = (ROOT / "src/lib/pipeline/parser/adapter.ts").read_text(encoding="utf-8")
    assert f'DEPLOYED_WORKER_REVISION = "git:{r5816["semantic_commit"]}"' in adapter
    for path in ("scripts/parser_runtime_attestation.py", "src/lib/parserAttestation.ts"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert NEW_PARSER not in text and OLD_PARSER not in text, path
