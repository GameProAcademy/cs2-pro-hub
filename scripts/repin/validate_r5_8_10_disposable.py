#!/usr/bin/env python3
"""Validate the committed R5.8.10 re-pin on a LOCAL DISPOSABLE database only.

Every scenario runs in a transaction that is rolled back (machinery of
scripts/queue/attestation_recorder_reconciliation_probe.py: throwaway HMAC key,
signed synthetic attestations). The baseline keeps the R5.8.9 targets (the state
read back from the managed database on 2026-10-14), so R5.8.10 is exercised from
exactly the state it will start from. The committed migrations and rollbacks must
be byte-identical to the generator output for the committed spec.

This proves the SQL's mechanics on PostgreSQL, never the managed database's state.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/queue"))
sys.path.insert(0, str(ROOT / "scripts/repin"))

import attestation_recorder_reconciliation_probe as probe  # noqa: E402
import r5_8_10  # noqa: E402
import r5_8_9  # noqa: E402
from validate_r5_8_9_disposable import q, repinned_prelude, run  # noqa: E402

SPEC = ROOT / "docs/reference/r5_8_10/spec.json"
MIGRATION = ROOT / "supabase/migrations/20261014210000_r5_8_10_repin_attestation_recorder.sql"
ROLLBACK = ROOT / "docs/reference/r5_8_10/rollback.sql"
BOUNDARY = ROOT / "supabase/migrations/20261014210100_r5_8_10b_repin_provenance_boundary.sql"
BOUNDARY_ROLLBACK = ROOT / "docs/reference/r5_8_10/rollback_boundary.sql"
R589_ROLLBACK = ROOT / "docs/reference/r5_8_9/rollback.sql"
R589B_ROLLBACK = ROOT / "docs/reference/r5_8_9/rollback_boundary.sql"
ASSERT_FN = "public.assert_verified_parser_provenance(uuid)"
ENFORCE_FN = "public.enforce_approved_attestation_workflow()"


def boundary_md5s() -> str:
    return f"""jsonb_build_object(
  'assert', (SELECT md5(prosrc) FROM pg_proc WHERE oid = '{ASSERT_FN}'::regprocedure),
  'enforce', (SELECT md5(prosrc) FROM pg_proc WHERE oid = '{ENFORCE_FN}'::regprocedure),
  'assert_xmin', (SELECT xmin::text FROM pg_proc WHERE oid = '{ASSERT_FN}'::regprocedure),
  'enforce_xmin', (SELECT xmin::text FROM pg_proc WHERE oid = '{ENFORCE_FN}'::regprocedure),
  'assert_comment', obj_description('{ASSERT_FN}'::regprocedure, 'pg_proc'),
  'enforce_comment', obj_description('{ENFORCE_FN}'::regprocedure, 'pg_proc'))"""


def validate() -> int:
    probe.refuse_non_local()
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    previous = r5_8_10.PREVIOUS_SPEC
    texts = {p: p.read_text(encoding="utf-8") for p in (MIGRATION, ROLLBACK, BOUNDARY, BOUNDARY_ROLLBACK)}
    if (texts[MIGRATION] != r5_8_10.recorder_migration_sql(spec)
            or texts[ROLLBACK] != r5_8_10.recorder_rollback_sql(spec)
            or texts[BOUNDARY] != r5_8_10.boundary_migration_sql(spec)
            or texts[BOUNDARY_ROLLBACK] != r5_8_10.boundary_rollback_sql(spec)):
        raise RuntimeError("COMMITTED_R5_8_10_ARTIFACTS_DIFFER_FROM_GENERATOR_OUTPUT")
    # The recorder and the boundary move together, in that order; the rollback undoes them in reverse.
    migration = texts[MIGRATION] + "\n" + texts[BOUNDARY]
    rollback = texts[BOUNDARY_ROLLBACK] + "\n" + texts[ROLLBACK]
    r589_rollback = R589B_ROLLBACK.read_text(encoding="utf-8") + "\n" + R589_ROLLBACK.read_text(encoding="utf-8")
    targets = r5_8_10.targets(spec)
    target = targets["record_parser_runtime_attestation"]
    new = repinned_prelude(spec, keep_r589=True)
    old = repinned_prelude(previous, keep_r589=True)
    stale_raw = dict(spec, critical_hashes=dict(spec["critical_hashes"],
                                                **{"raw_evidence.py": previous["critical_hashes"]["raw_evidence.py"]}))
    stale = repinned_prelude(stale_raw, keep_r589=True)
    worker = spec["critical_hashes"]["worker.py"]
    results: list[dict] = []

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

    def md5_is(o, key, want):
        return [] if (o.get(key) or {}).get("md5") == want else [f"{key}.md5={(o.get(key) or {}).get('md5')}"]

    scenario("baseline_is_the_r5_8_9_target_and_accepts_its_runtime", old, f"""
INSERT INTO probe_result SELECT 'recorder', pg_temp.recorder();
INSERT INTO probe_result SELECT 'boundary', {boundary_md5s()};
INSERT INTO probe_result SELECT 'previous_identity', pg_temp.attest('r5810-0', '{worker}');
""", lambda o: md5_is(o, "recorder", r5_8_10.START_MD5) + ok(o, "previous_identity")
        + ([] if (o["boundary"]["assert"], o["boundary"]["enforce"]) == tuple(r5_8_10.BOUNDARY_START_MD5.values())
           else [f"boundary {o['boundary']}"]))
    scenario("apply_pins_the_serving_runtime_and_accepts_only_it", new, f"""
INSERT INTO probe_result SELECT 'migration', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'recorder', pg_temp.recorder();
INSERT INTO probe_result SELECT 'boundary', {boundary_md5s()};
INSERT INTO probe_result SELECT 'new_identity', pg_temp.attest('r5810-a', '{worker}');
INSERT INTO probe_result SELECT 'other_deployment', pg_temp.attest('r5810-b', '{worker}', 'deployment');
INSERT INTO probe_result SELECT 'replay', pg_temp.attest('r5810-a', '{worker}');
""", lambda o: ok(o, "migration") + md5_is(o, "recorder", target)
        + ([] if o["recorder"].get("comment") == r5_8_10.comment(spec) else ["recorder comment"])
        + ([] if (o["boundary"]["assert"], o["boundary"]["enforce"]) == (
            targets["assert_verified_parser_provenance"], targets["enforce_approved_attestation_workflow"])
           else [f"boundary {o['boundary']}"])
        + ok(o, "new_identity")
        + refused(o, "other_deployment", "PARSER_ATTESTATION_BINDING_INVALID")
        + refused(o, "replay", "duplicate key value violates unique constraint"))
    scenario("the_r5_8_9_runtime_is_refused_after_the_repin", old, f"""
INSERT INTO probe_result SELECT 'migration', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'previous_runtime', pg_temp.attest('r5810-c', '{worker}');
""", lambda o: ok(o, "migration") + refused(o, "previous_runtime", "PARSER_ATTESTATION_"))
    scenario("the_pre_60099ed3_raw_evidence_blob_is_refused", stale, f"""
INSERT INTO probe_result SELECT 'migration', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'stale_raw_evidence', pg_temp.attest('r5810-d', '{worker}');
""", lambda o: ok(o, "migration") + refused(o, "stale_raw_evidence", "PARSER_ATTESTATION_CRITICAL_HASH_MISMATCH"))
    scenario("rerun_is_a_no_op", new, f"""
INSERT INTO probe_result SELECT 'first', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'before', pg_temp.recorder();
INSERT INTO probe_result SELECT 'boundary_before', {boundary_md5s()};
INSERT INTO probe_result SELECT 'second', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'after', pg_temp.recorder();
INSERT INTO probe_result SELECT 'boundary_after', {boundary_md5s()};
""", lambda o: ok(o, "first") + ok(o, "second")
        + ([] if o["before"]["xmin"] == o["after"]["xmin"] else ["recorder rewritten"])
        + ([] if o["boundary_before"] == o["boundary_after"] else ["boundary rewritten"]))
    scenario("rollback_restores_the_r5_8_9_targets_and_runtime", old, f"""
INSERT INTO probe_result SELECT 'migration', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'rollback', pg_temp.run({q(rollback)});
INSERT INTO probe_result SELECT 'recorder', pg_temp.recorder();
INSERT INTO probe_result SELECT 'boundary', {boundary_md5s()};
INSERT INTO probe_result SELECT 'previous_identity', pg_temp.attest('r5810-e', '{worker}');
INSERT INTO probe_result SELECT 'reapply', pg_temp.run({q(migration)});
""", lambda o: ok(o, "migration") + ok(o, "rollback") + ok(o, "previous_identity") + ok(o, "reapply")
        + md5_is(o, "recorder", r5_8_10.START_MD5)
        + ([] if o["recorder"].get("comment") == r5_8_9.comment(previous) else ["recorder comment not restored"])
        + ([] if (o["boundary"]["assert"], o["boundary"]["enforce"]) == tuple(r5_8_10.BOUNDARY_START_MD5.values())
           else [f"boundary {o['boundary']}"]))
    scenario("a_start_other_than_the_r5_8_9_target_fails_closed", new, f"""
INSERT INTO probe_result SELECT 'to_r5_8_8_state', pg_temp.run({q(r589_rollback)});
INSERT INTO probe_result SELECT 'before', pg_temp.recorder();
INSERT INTO probe_result SELECT 'migration', pg_temp.run({q(migration)});
INSERT INTO probe_result SELECT 'after', pg_temp.recorder();
""", lambda o: ok(o, "to_r5_8_8_state") + refused(o, "migration", "R5_8_10_RECORDER_UNEXPECTED_DEFINITION")
        + md5_is(o, "after", r5_8_9.START_MD5) + ([] if o["before"]["xmin"] == o["after"]["xmin"] else ["changed"]))
    scenario("a_drifted_boundary_fails_closed", new, f"""
INSERT INTO probe_result SELECT 'migration', pg_temp.drift($a$DO $d$ BEGIN EXECUTE replace(pg_get_functiondef('{ASSERT_FN}'::regprocedure), 'BEGIN', 'BEGIN '); END $d$$a$, {q(texts[BOUNDARY])});
""", lambda o: refused(o, "migration", "R5_8_10B_UNEXPECTED_DEFINITION"))
    scenario("missing_r5_8_8_state_fails_closed", new, f"""
INSERT INTO probe_result SELECT 'migration', pg_temp.drift($a$ALTER TABLE public.parser_attestation_nonces DROP CONSTRAINT parser_attestation_nonces_attestation_digest_key$a$, {q(migration)});
""", lambda o: refused(o, "migration", "R5_8_10_R5_8_8_STATE_MISSING"))
    # The recorder rollback refuses the R5.8.9 state; the boundary rollback is idempotent there
    # (already in its target state, like R5.8.9b's) and refuses any drifted definition.
    scenario("rollback_refuses_any_other_state", new, f"""
INSERT INTO probe_result SELECT 'rollback', pg_temp.run({q(texts[ROLLBACK])});
INSERT INTO probe_result SELECT 'boundary_before', {boundary_md5s()};
INSERT INTO probe_result SELECT 'boundary_rollback_noop', pg_temp.run({q(texts[BOUNDARY_ROLLBACK])});
INSERT INTO probe_result SELECT 'boundary_after', {boundary_md5s()};
INSERT INTO probe_result SELECT 'boundary_rollback_drifted', pg_temp.drift($a$DO $d$ BEGIN EXECUTE replace(pg_get_functiondef('{ASSERT_FN}'::regprocedure), 'BEGIN', 'BEGIN '); END $d$$a$, {q(texts[BOUNDARY_ROLLBACK])});
""", lambda o: refused(o, "rollback", "R5_8_10_ROLLBACK_UNEXPECTED_DEFINITION")
        + ok(o, "boundary_rollback_noop")
        + ([] if o["boundary_before"] == o["boundary_after"] else ["boundary rewritten by a no-op rollback"])
        + refused(o, "boundary_rollback_drifted", "R5_8_10B_UNEXPECTED_DEFINITION"))

    passed = sum(r["status"] == "PASS" for r in results)
    print("RESULT:" + json.dumps({"probe": "R5_8_10_DISPOSABLE", "status": "PASS" if passed == len(results) else "FAIL",
                                  "passed": passed, "total": len(results), "target_md5": target,
                                  "boundary_targets": {k: v for k, v in targets.items() if k in r5_8_10.BOUNDARY},
                                  "database": "LOCAL_DISPOSABLE_ONLY", "deployment_id": spec["deployment_id"],
                                  "values_source": "committed spec", "build_commit": spec["build_commit"],
                                  "semantic_commit": spec["semantic_commit"], "scenarios": results},
                                 sort_keys=True, indent=1))
    return 0 if passed == len(results) else 1


def main() -> int:
    try:
        return validate()
    except Exception as exc:  # noqa: BLE001 - a crash is reported, never silent
        print("RESULT:" + json.dumps({"probe": "R5_8_10_DISPOSABLE", "status": "FAIL", "passed": 0, "total": 0,
                                      "target_md5": None, "database": "LOCAL_DISPOSABLE_ONLY", "scenarios": [],
                                      "error": f"{type(exc).__name__}: {str(exc)[:300]}"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
