"""R5.8.25 re-pins the runtime after the demoparser2 0.42.0 -> 0.42.2 release (PR #275), forward-only.

demoparser2 0.42.0 raises EntityNotFound on every parse_event of current CS2 demos; 0.42.2 reads them.
Released under the standing watch-pattern freeze as ONE controlled Railway deployment of the merge commit
c3593d48 (deployment d57b9089): semantic = build = c3593d48. Pins that change: deployment, commit, the
parser runtime version literal and the parser.py, adapter.py, raw_evidence.py and settings.py critical blobs.
Both /version hosts are proven by the H.3-E activation gate.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402

OLD_DEPLOYMENT = "0ff96670-e373-4beb-90c9-f1967eee3195"
NEW_DEPLOYMENT = "d57b9089-ea97-44b0-b236-6868f84459e2"
OLD_COMMIT = "4badf6060e4e69a589179567f488f5d58a4a58dc"
NEW_COMMIT = "c3593d48e3b8923048def625cf59144100f59892"
OLD_BLOBS = {"parser.py": "4102f6174e4dc01d97637174f4f70fe53629c285",
             "adapter.py": "b95811681be20b9e849672e57a07b1de5d18e6e8",
             "raw_evidence.py": "5b7b674c88a77f85ab8791f84a47a188889b5802",
             "settings.py": "dc76db86c9b0b8c0916d58501ae0c21af95dfe38"}
NEW_BLOBS = {"parser.py": "5d39478c611b57b2dd17f93c9cdce8faa84860f9",
             "adapter.py": "4e6f43c7916bb7d855cfd1abcd26637bb0f3f942",
             "raw_evidence.py": "a71a99e8df282f761326e4e8211f80a64c4083e5",
             "settings.py": "8bcadce307bb39895965fa7583fc272e2763b39d"}
OLD_RECORDER_VERSION = "_payload->>'parser_version'<>'0.42.0'"
NEW_RECORDER_VERSION = "_payload->>'parser_version'<>'0.42.2'"
SPEC = json.loads((ROOT / "docs/reference/r5_8_25/spec.json").read_text(encoding="utf-8"))
PREVIOUS = json.loads((ROOT / "docs/reference/r5_8_24/spec.json").read_text(encoding="utf-8"))
MIGRATION = (ROOT / "supabase/migrations/20261113040000_r5_8_25_repin_runtime_release.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/r5_8_25/rollback.sql").read_text(encoding="utf-8")


def _git(*args: str) -> str | None:
    try:
        return subprocess.check_output(("git", *args), cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError:
        return None


def test_only_the_demoparser2_0_42_2_release_pins_change():
    assert (PREVIOUS["deployment_id"], SPEC["deployment_id"]) == (OLD_DEPLOYMENT, NEW_DEPLOYMENT)
    assert PREVIOUS["semantic_commit"] == PREVIOUS["build_commit"] == OLD_COMMIT
    assert SPEC["semantic_commit"] == SPEC["build_commit"] == SPEC["deployment_commit"] == NEW_COMMIT
    assert (SPEC["branch"], SPEC["workflow_source_sha"]) == (PREVIOUS["branch"], PREVIOUS["workflow_source_sha"])
    assert "parser_version" not in PREVIOUS and SPEC["parser_version"] == "0.42.2"
    changed = {k for k, v in SPEC["critical_hashes"].items() if PREVIOUS["critical_hashes"][k] != v}
    assert changed == set(NEW_BLOBS)
    for name in NEW_BLOBS:
        assert (PREVIOUS["critical_hashes"][name], SPEC["critical_hashes"][name]) == (OLD_BLOBS[name], NEW_BLOBS[name])
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
    requirements = _git("show", f"{NEW_COMMIT}:services/cs2-demo-parser/requirements.txt") or ""
    assert "demoparser2==0.42.2" in requirements.splitlines()


def test_targets_are_the_generator_output():
    md5 = lambda text: hashlib.md5(text.encode()).hexdigest()  # noqa: E731
    assert r5_8_11.target_md5(PREVIOUS) == SPEC["r5_8_24_recorder_target_md5"] == PREVIOUS["recorder_target_md5"]
    assert r5_8_11.target_md5(SPEC) == SPEC["recorder_target_md5"] == "cbb03f77e6e3dae28c567483c3ba252b"
    for name in r5_8_11.BOUNDARY:
        assert SPEC["r5_8_24_database_target_md5"][name] == PREVIOUS["database_target_md5"][name]
        assert r5_8_11.boundary_target_md5(name, SPEC) == SPEC["database_target_md5"][name]
    # Observed read-only on the managed database (md5 of prosrc after the same substitutions) and reproduced
    # by applying the migration to the exact managed function definitions on a disposable PostgreSQL 16.
    assert SPEC["database_target_md5"]["assert_verified_parser_provenance"] == "a3401a4b1da8553296b6d541afd44bf4"
    assert SPEC["database_target_md5"]["enforce_approved_attestation_workflow"] == \
        PREVIOUS["database_target_md5"]["enforce_approved_attestation_workflow"]
    previous_body = r5_8_11.target_body(PREVIOUS)
    assert (previous_body.count(OLD_DEPLOYMENT), previous_body.count(OLD_COMMIT),
            previous_body.count(OLD_RECORDER_VERSION)) == (1, 4, 1)
    assert all(previous_body.count(blob) == 1 for blob in OLD_BLOBS.values())
    body = r5_8_11.target_body(SPEC)
    assert md5(body) == SPEC["recorder_target_md5"]
    assert (body.count(NEW_COMMIT), body.count(NEW_DEPLOYMENT), body.count(NEW_RECORDER_VERSION),
            body.count(OLD_RECORDER_VERSION)) == (4, 1, 1, 0)
    assert all(body.count(blob) == 1 for blob in NEW_BLOBS.values())
    # Forward then rollback substitutions restore the R5.8.24 body exactly.
    back = body.replace(NEW_DEPLOYMENT, OLD_DEPLOYMENT).replace(NEW_COMMIT, OLD_COMMIT)
    back = back.replace(NEW_RECORDER_VERSION, OLD_RECORDER_VERSION)
    for name, blob in NEW_BLOBS.items():
        back = back.replace(blob, OLD_BLOBS[name])
    assert md5(back) == SPEC["r5_8_24_recorder_target_md5"]


def test_specs_without_a_parser_version_keep_the_0_42_0_literal():
    body = r5_8_11.target_body(PREVIOUS)
    assert body.count(OLD_RECORDER_VERSION) == 1 and NEW_RECORDER_VERSION not in body
    assert r5_8_11.target_body(dict(PREVIOUS, parser_version="0.42.0")) == body


def test_migration_is_forward_only_bounded_and_fail_closed():
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, *OLD_BLOBS.values(), *NEW_BLOBS.values(),
                  SPEC["recorder_target_md5"], SPEC["r5_8_24_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_24_database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["database_target_md5"]["enforce_approved_attestation_workflow"],
                  "'_payload->>''parser_version''<>''0.42.0'''", "'_payload->>''parser_version''<>''0.42.2'''",
                  "'_p.parser_version<>''0.42.0'''", "'_p.parser_version<>''0.42.2'''"):
        assert value in MIGRATION, value
    for marker in ("R5_8_25_UNEXPECTED_PIN_STATE", "R5_8_25_POSTCONDITION_INVALID",
                   "R5_8_25_FUNCTION_PROPERTIES_CHANGED", "R5_8_25_R5_8_12_WORKFLOW_STATE_MISSING",
                   "R5_8_25_ALREADY_AT_TARGET_STATE",
                   "_counts constant integer[][] := ARRAY[[1, 1], [4, 3], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [0, 1]]"):
        assert marker in MIGRATION, marker
    assert "R5_8_24" not in MIGRATION
    for forbidden in ("CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "DROP ", "TRUNCATE", "GRANT ", "REVOKE "):
        assert forbidden not in MIGRATION, forbidden
    prior = (ROOT / "supabase/migrations/20261112090000_r5_8_24_repin_runtime_release.sql").read_text(encoding="utf-8")
    assert OLD_DEPLOYMENT in prior and NEW_DEPLOYMENT not in prior and NEW_COMMIT not in prior


def test_rollback_restores_the_r5_8_24_bodies_and_fails_closed():
    for value in (OLD_DEPLOYMENT, NEW_DEPLOYMENT, OLD_COMMIT, NEW_COMMIT, *OLD_BLOBS.values(), *NEW_BLOBS.values(),
                  SPEC["recorder_target_md5"], SPEC["r5_8_24_recorder_target_md5"],
                  SPEC["database_target_md5"]["assert_verified_parser_provenance"],
                  SPEC["r5_8_24_database_target_md5"]["assert_verified_parser_provenance"]):
        assert value in ROLLBACK, value
    assert "R5_8_25_ROLLBACK_UNEXPECTED_PIN_STATE" in ROLLBACK
    assert "R5_8_25_ROLLBACK_POSTCONDITION_INVALID" in ROLLBACK
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
        for name in NEW_BLOBS:
            assert NEW_BLOBS[name] in text and OLD_BLOBS[name] not in text, (path, name)
    # The runtime version is pinned in the app, the attestor and both preflights.
    assert 'parserVersion: "0.42.2"' in (ROOT / "src/lib/parserAttestation.ts").read_text(encoding="utf-8")
    assert 'PARSER_VERSION = "0.42.2"' in (ROOT / "src/config/pipeline.ts").read_text(encoding="utf-8")
    for path in ("scripts/parser_runtime_attestation.py", "scripts/h3e91_live_preflight.py",
                 "scripts/r5_8_3_release_preflight.py"):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert '"0.42.2"' in text and '"0.42.0"' not in text, path


def test_migration_comments_name_only_the_released_runtime():
    """The COMMENT statements are metadata read by people and audits: they must describe R5.8.25 only."""
    comments = MIGRATION[MIGRATION.index("COMMENT ON FUNCTION"):]
    assert comments.count("IS 'R5.8.25 re-pinned") == 2
    for value in (NEW_DEPLOYMENT, NEW_COMMIT, *NEW_BLOBS.values(), "demoparser2 0.42.2"):
        assert value in comments, value
    for value in (OLD_DEPLOYMENT, OLD_COMMIT, *OLD_BLOBS.values(), "R5.8.24", "0.42.0"):
        assert value not in comments, value
    rollback_comments = ROLLBACK[ROLLBACK.index("COMMENT ON FUNCTION"):]
    assert rollback_comments.count("IS 'R5.8.24 re-pinned") == 2
    assert NEW_DEPLOYMENT not in rollback_comments and NEW_COMMIT not in rollback_comments
