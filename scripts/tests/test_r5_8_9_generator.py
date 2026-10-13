"""R5.8.9 generator: refuses any spec git or the observations contradict, and
emits SQL that only rewrites the recorder body. Real commits are used; the
deployment id is a synthetic test value (no deployment is pinned here)."""
import copy
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_9  # noqa: E402

BUILD = "c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d"     # image of deployment c0aa8a55 (observed 2026-10-13)
SEMANTIC = "10815fb44e165963adfaf07f71c474ca628f4b7f"  # first commit of main with worker tree 8120c12a
REMOVED_SEMANTIC = "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76"
TEST_DEPLOYMENT = "e9e9e9e9-0000-4000-8000-000000000589"


def git(*args):
    return subprocess.run(("git", *args), cwd=ROOT, capture_output=True, text=True).stdout.strip()


def history():
    if not all(git("cat-file", "-t", c) == "commit" for c in (BUILD, SEMANTIC, REMOVED_SEMANTIC)):
        assert not os.environ.get("GITHUB_ACTIONS"), "full history required on CI"
        pytest.skip("history not fetched")


def spec():
    hosts = ("https://parser.gamepro.network", "https://cs2-demo-parser-production.up.railway.app")
    return {
        "deployment_id": TEST_DEPLOYMENT, "branch": "main", "semantic_commit": SEMANTIC, "build_commit": BUILD,
        "deployment_commit": BUILD,
        "workflow_source_sha": git("rev-parse", "HEAD:.github/workflows/parser-runtime-attestation.yml"),
        "critical_hashes": {n: git("rev-parse", f"{BUILD}:services/cs2-demo-parser/{n}") for n in r5_8_9.CRITICAL},
        "observed": {
            "observed_at": "2026-10-13T00:00:00Z",
            "railway_deployment": {"id": TEST_DEPLOYMENT, "status": "SUCCESS", "commitHash": BUILD, "branch": "main"},
            "version_hosts": {h: {"build": {"commit": BUILD, "declared_revision_matches": True},
                                  "parser": {"build_revision": f"git:{BUILD}", "semantic_revision": f"git:{SEMANTIC}"}}
                              for h in hosts},
        },
    }


def test_a_consistent_spec_is_accepted_and_the_target_is_deterministic():
    history()
    assert r5_8_9.verify(spec()) == []
    assert r5_8_9.target_md5(spec()) == r5_8_9.target_md5(copy.deepcopy(spec()))
    assert r5_8_9.target_md5(spec()) != r5_8_9.START_MD5


def mutated(path, value):
    s = spec()
    node = s
    for key in path[:-1]:
        node = node[key]
    node[path[-1]] = value
    return s


@pytest.mark.parametrize("path, value, problem", [
    (("deployment_id",), "1b5778de-3eaf-46f1-9ea5-cba381d95313", "DEPLOYMENT_ID_IS_THE_REMOVED_ONE"),
    (("deployment_id",), "not-a-uuid", "DEPLOYMENT_ID_INVALID"),
    (("branch",), "infra/cs2-parser-worker-v8", "BRANCH_NOT_MAIN"),
    (("deployment_commit",), SEMANTIC, "BUILD_COMMIT_IS_NOT_THE_DEPLOYMENT_COMMIT"),
    (("semantic_commit",), REMOVED_SEMANTIC, "SEMANTIC_TREE_DIFFERS_FROM_BUILD_TREE"),
    (("semantic_commit",), "f" * 40, "SEMANTIC_COMMIT_UNKNOWN_TO_GIT"),
    (("critical_hashes", "worker.py"), "50a53b607d26f00b4de05c5e8998611959e27bd1", "CRITICAL_HASH_NOT_THE_BUILD_BLOB:worker.py"),
    (("workflow_source_sha",), "0" * 40, "WORKFLOW_BLOB_NOT_THE_ONE_IN_THIS_TREE"),
    (("observed", "railway_deployment", "status"), "REMOVED", "RAILWAY_OBSERVATION_DISAGREES"),
    (("observed", "railway_deployment", "id"), "3ad4b1fe-9b9e-4fec-b79a-4215d27aab29", "RAILWAY_OBSERVATION_DISAGREES"),
    (("observed", "version_hosts", "https://parser.gamepro.network", "build", "declared_revision_matches"), False,
     "VERSION_OBSERVATION_DISAGREES:https://parser.gamepro.network"),
    (("observed", "version_hosts", "https://parser.gamepro.network", "parser", "semantic_revision"),
     f"git:{REMOVED_SEMANTIC}", "VERSION_OBSERVATION_DISAGREES:https://parser.gamepro.network"),
    (("observed", "version_hosts", "https://parser.gamepro.network", "build", "commit"), SEMANTIC,
     "VERSION_OBSERVATION_DISAGREES:https://parser.gamepro.network"),
    (("observed", "observed_at"), "", "OBSERVATION_MISSING:observed_at"),
])
def test_every_contradiction_refuses_the_spec(path, value, problem):
    history()
    assert problem in r5_8_9.verify(mutated(path, value))


def test_two_hosts_are_required():
    history()
    s = spec()
    s["observed"]["version_hosts"].pop("https://parser.gamepro.network")
    assert "VERSION_OBSERVATION_NEEDS_BOTH_HOSTS" in r5_8_9.verify(s)


def test_generated_sql_only_rewrites_the_function_body():
    history()
    for sql in (r5_8_9.migration_sql(spec()), r5_8_9.rollback_sql(spec())):
        code = re.sub(r"'(?:[^']|'')*'", "''", re.sub(r"--[^\n]*", "", sql))
        assert not re.search(r"\b(INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|DROP|ALTER)\b", code, re.I)
        assert "EXECUTE _def" in code
    migration = r5_8_9.migration_sql(spec())
    assert r5_8_9.START_MD5 in migration and r5_8_9.target_md5(spec()) in migration
    assert "R5_8_9_R5_8_8_STATE_MISSING" in migration and "R5_8_9_RECORDER_UNEXPECTED_DEFINITION" in migration
    assert migration.count("R5_8_9_FRAGMENT_COUNT_INVALID") == len(r5_8_9.substitutions(spec())) == 13


def test_the_reference_definition_is_the_managed_one():
    assert r5_8_9.target_md5  # import ok
    r5_8_9.reference_body()  # raises unless md5 == fe3250af
