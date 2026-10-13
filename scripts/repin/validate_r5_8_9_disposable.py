#!/usr/bin/env python3
"""Validate generated R5.8.9 SQL on a LOCAL DISPOSABLE database only.

Uses the machinery of scripts/queue/attestation_recorder_reconciliation_probe.py
(every scenario in a transaction that is rolled back, a throwaway HMAC key, a
signed synthetic attestation) with the attestation payload re-pinned to the
spec. The deployment id below is a TEST value: it names no real deployment and
must never reach a migration that is applied anywhere but a disposable database.
Build, semantic, critical blobs and workflow blob are the real candidates read
from git. This proves the SQL's mechanics, not production state.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/queue"))
sys.path.insert(0, str(ROOT / "scripts/repin"))

import attestation_recorder_reconciliation_probe as probe  # noqa: E402
import r5_8_9  # noqa: E402

TEST_DEPLOYMENT = "e9e9e9e9-0000-4000-8000-000000000589"  # synthetic, disposable only


def git(*args: str) -> str:
    return subprocess.check_output(("git", *args), cwd=ROOT, text=True).strip()


def test_spec(build: str, semantic: str) -> dict:
    return {
        "deployment_id": TEST_DEPLOYMENT, "branch": "main",
        "semantic_commit": semantic, "build_commit": build, "deployment_commit": build,
        "workflow_source_sha": git("rev-parse", "HEAD:.github/workflows/parser-runtime-attestation.yml"),
        "critical_hashes": {n: git("rev-parse", f"{build}:services/cs2-demo-parser/{n}") for n in r5_8_9.CRITICAL},
    }


def repinned_prelude(spec: dict) -> str:
    text = probe.PRELUDE_TEMPLATE
    swaps = [
        ("_sem text := 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'", f"_sem text := 'git:{spec['semantic_commit']}'"),
        ("'build_revision', _sem", f"'build_revision', 'git:{spec['build_commit']}'"),
        ("'infra/cs2-parser-worker-v8'", f"'{spec['branch']}'"),
        ("'5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'", f"'{spec['semantic_commit']}'"),
        ("'1b5778de-3eaf-46f1-9ea5-cba381d95313'", f"'{spec['deployment_id']}'"),
        ("'91aeee853200d0f461d0d36af1781d7fdfa40941'", f"'{spec['deployment_commit']}'"),
        ("'3070d8bae6c3f02093bbb2595138c913646c2e31'", f"'{spec['workflow_source_sha']}'"),
    ] + [(f"'{r5_8_9.OLD['critical'][n]}'", f"'{spec['critical_hashes'][n]}'")
         for n in r5_8_9.CRITICAL if n != "worker.py"]  # the worker blob is an argument of attest()
    for old, new in swaps:
        if old not in text:
            raise SystemExit(f"PRELUDE_FRAGMENT_MISSING:{old[:50]}")
        text = text.replace(old, new)
    return probe.render_prelude(text)


def run(prelude: str, body: str) -> dict:
    result = subprocess.run(
        ["psql", "-X", "-h", probe.HOST, "-p", probe.PORT, "-U", probe.USER, "-d", probe.DB, "-At", "-f", "-"],
        input=prelude + body + probe.EPILOGUE, capture_output=True, text=True, timeout=120)
    lines = [line for line in result.stdout.splitlines() if line.startswith("RESULT:")]
    if result.returncode != 0 or len(lines) != 1:
        raise RuntimeError((result.stderr.strip().splitlines() or ["psql failed"])[-1][:300])
    return json.loads(lines[0][len("RESULT:"):])


def q(sql: str) -> str:
    assert "$r589$" not in sql
    return "$r589$" + sql + "$r589$"


def have(commit: str) -> bool:
    return subprocess.run(("git", "cat-file", "-e", f"{commit}^{{commit}}"), cwd=ROOT).returncode == 0


def main() -> int:
    try:
        return validate()
    except Exception as exc:  # noqa: BLE001 - a crash is reported, never silent
        print("RESULT:" + json.dumps({"probe": "R5_8_9_DISPOSABLE", "status": "FAIL", "passed": 0, "total": 0,
                                      "target_md5": None, "database": "LOCAL_DISPOSABLE_ONLY",
                                      "test_deployment_id": TEST_DEPLOYMENT, "scenarios": [],
                                      "error": f"{type(exc).__name__}: {str(exc)[:300]}"}))
        return 1


COMMITTED_SPEC = ROOT / "docs/reference/r5_8_9/spec.json"
COMMITTED_MIGRATION = ROOT / "supabase/migrations/20261013130000_r5_8_9_repin_attestation_recorder.sql"
COMMITTED_ROLLBACK = ROOT / "docs/reference/r5_8_9/rollback.sql"
COMMITTED_BOUNDARY = ROOT / "supabase/migrations/20261013130100_r5_8_9b_repin_provenance_boundary.sql"
COMMITTED_BOUNDARY_ROLLBACK = ROOT / "docs/reference/r5_8_9/rollback_boundary.sql"


def validate() -> int:
    probe.refuse_non_local()
    if COMMITTED_SPEC.exists() and len(sys.argv) == 1:
        # The committed artifacts themselves: the spec observed after deployment
        # 09b50029 existed, and the migration/rollback generated from it. The
        # text must be exactly what the generator produces from that spec.
        spec = json.loads(COMMITTED_SPEC.read_text(encoding="utf-8"))
        migration, rollback = COMMITTED_MIGRATION.read_text(encoding="utf-8"), COMMITTED_ROLLBACK.read_text(encoding="utf-8")
        import r5_8_9_boundary  # noqa: PLC0415
        boundary = COMMITTED_BOUNDARY.read_text(encoding="utf-8")
        boundary_rollback = COMMITTED_BOUNDARY_ROLLBACK.read_text(encoding="utf-8")
        if (migration != r5_8_9.migration_sql(spec) or rollback != r5_8_9.rollback_sql(spec)
                or boundary != r5_8_9_boundary.migration_sql(spec)
                or boundary_rollback != r5_8_9_boundary.rollback_sql(spec)):
            raise RuntimeError("COMMITTED_R5_8_9_ARTIFACTS_DIFFER_FROM_GENERATOR_OUTPUT")
        # The recorder and the persistence boundary move together, in that order;
        # the rollback undoes them in reverse.
        migration, rollback = migration + "\n" + boundary, boundary_rollback + "\n" + rollback
        target = r5_8_9.target_md5(spec)
        build, semantic, values_source = spec["build_commit"], spec["semantic_commit"], "committed spec"
    else:
        build = sys.argv[1] if len(sys.argv) > 1 else "c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d"
        semantic = sys.argv[2] if len(sys.argv) > 2 else "10815fb44e165963adfaf07f71c474ca628f4b7f"
        values_source = "candidates"
        if not (have(build) and have(semantic)):
            # Shallow checkout (CI): validate the mechanics with HEAD's real blobs.
            build = semantic = git("rev-parse", "HEAD")
            values_source = "HEAD (candidate commits not in this checkout)"
        spec = test_spec(build, semantic)
        migration, rollback, target = r5_8_9.migration_sql(spec), r5_8_9.rollback_sql(spec), r5_8_9.target_md5(spec)
    new, old = repinned_prelude(spec), probe.PRELUDE
    worker_new, worker_old = spec["critical_hashes"]["worker.py"], r5_8_9.OLD["critical"]["worker.py"]
    results = []

    def scenario(name: str, prelude: str, body: str, check) -> None:
        try:
            observed = run(prelude, body)
            problems = check(observed)
            results.append({"scenario": name, "status": "FAIL" if problems else "PASS", "detail": problems or "ok",
                            "observed": observed})
        except Exception as exc:  # noqa: BLE001
            results.append({"scenario": name, "status": "FAIL", "detail": f"{type(exc).__name__}: {exc}"})

    def ok(o, key):
        return [] if (o.get(key) or {}).get("ok") is True else [f"{key}: {o.get(key)}"]

    def refused(o, key, prefix):
        v = o.get(key) or {}
        return [] if v.get("ok") is False and str(v.get("message", "")).startswith(prefix) else [f"{key}: {v}"]

    scenario("apply_pins_the_new_runtime_and_accepts_only_it", new, f"""
INSERT INTO probe_result SELECT 'migration', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'recorder', pg_temp.recorder();
INSERT INTO probe_result SELECT 'comment', to_jsonb(obj_description('{r5_8_9.FUNCTION}'::regprocedure, 'pg_proc'));
INSERT INTO probe_result SELECT 'new_identity', pg_temp.attest('r589-a', '{worker_new}');
INSERT INTO probe_result SELECT 'old_worker_blob', pg_temp.attest('r589-b', '{worker_old}');
INSERT INTO probe_result SELECT 'other_deployment', pg_temp.attest('r589-c', '{worker_new}', 'deployment');
INSERT INTO probe_result SELECT 'replay', pg_temp.attest('r589-a', '{worker_new}');
""", lambda o: ok(o, "migration") + ([] if o["recorder"].get("md5") == target else [f"md5 {o['recorder']}"])
        + ([] if o.get("comment") == r5_8_9.comment(spec) else ["comment"])
        + ok(o, "new_identity")
        + refused(o, "old_worker_blob", "PARSER_ATTESTATION_CRITICAL_HASH_MISMATCH")
        + refused(o, "other_deployment", "PARSER_ATTESTATION_BINDING_INVALID")
        + refused(o, "replay", "duplicate key value violates unique constraint"))
    scenario("the_removed_runtime_is_refused_after_the_repin", old, f"""
INSERT INTO probe_result SELECT 'migration', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'removed_runtime', pg_temp.attest('r589-d', '{worker_old}');
""", lambda o: ok(o, "migration") + refused(o, "removed_runtime", "PARSER_ATTESTATION_"))
    scenario("rerun_is_a_no_op", new, f"""
INSERT INTO probe_result SELECT 'first', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'xmin_before', to_jsonb((SELECT xmin::text FROM pg_proc WHERE oid = '{r5_8_9.FUNCTION}'::regprocedure));
INSERT INTO probe_result SELECT 'second', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'xmin_after', to_jsonb((SELECT xmin::text FROM pg_proc WHERE oid = '{r5_8_9.FUNCTION}'::regprocedure));
""", lambda o: ok(o, "first") + ok(o, "second") + ([] if o["xmin_before"] == o["xmin_after"] else ["function rewritten"]))
    scenario("rollback_restores_the_previous_recorder", old, f"""
INSERT INTO probe_result SELECT 'migration', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'rollback', pg_temp.run({q(rollback)});
INSERT INTO probe_result SELECT 'recorder', pg_temp.recorder();
INSERT INTO probe_result SELECT 'previous_identity', pg_temp.attest('r589-e', '{worker_old}');
INSERT INTO probe_result SELECT 'reapply', pg_temp.run({q(migration)});
""", lambda o: ok(o, "migration") + ok(o, "rollback") + ok(o, "previous_identity") + ok(o, "reapply")
        + ([] if o["recorder"].get("md5") == r5_8_9.START_MD5 else [f"md5 {o['recorder']}"]))
    scenario("unexpected_start_fails_closed", new, f"""
INSERT INTO probe_result SELECT 'to_repository_definition', pg_temp.run({probe.literal(probe.ROLLBACK)});
INSERT INTO probe_result SELECT 'migration', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'recorder', pg_temp.recorder();
""", lambda o: ok(o, "to_repository_definition") + refused(o, "migration", "R5_8_9_RECORDER_UNEXPECTED_DEFINITION")
        + ([] if o["recorder"].get("md5") == "5ea1ffff4fc874ca50f0081b9c9a5e71" else ["changed"]))
    scenario("missing_r5_8_8_state_fails_closed", new, f"""
INSERT INTO probe_result SELECT 'migration', pg_temp.drift($a$ALTER TABLE public.parser_attestation_nonces DROP CONSTRAINT parser_attestation_nonces_attestation_digest_key$a$, {q(migration)});
""", lambda o: refused(o, "migration", "R5_8_9_R5_8_8_STATE_MISSING"))
    scenario("rollback_refuses_any_other_state", new, f"""
INSERT INTO probe_result SELECT 'rollback', pg_temp.run({q(rollback)});
""", lambda o: refused(o, "rollback", "R5_8_9_ROLLBACK_UNEXPECTED_DEFINITION"))

    passed = sum(r["status"] == "PASS" for r in results)
    print("RESULT:" + json.dumps({"probe": "R5_8_9_DISPOSABLE", "status": "PASS" if passed == len(results) else "FAIL",
                                  "passed": passed, "total": len(results), "target_md5": target,
                                  "database": "LOCAL_DISPOSABLE_ONLY", "deployment_id": spec["deployment_id"],
                                  "values_source": values_source, "build_commit": build, "semantic_commit": semantic,
                                  "scenarios": results}, sort_keys=True, indent=1))
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
