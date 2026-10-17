#!/usr/bin/env python3
"""Gate semantics v2 on a LOCAL DISPOSABLE database (Supabase local, built from
supabase/migrations). Every scenario runs in one transaction that is rolled back.

Proves, with the real snapshot function (schema 4) and the real evaluator:
* the attempt-authorization registry is identity-bound, append-only and invisible
  to client roles, and `attempt_9_absent` v2 follows it (and fails when a recorded
  authorization stops matching its job);
* verified lineage counts a match only through the whole chain (its own upload's
  processed job, approved RAW audit, successful H3E91 execution, VERIFIED parser
  provenance of that build and semantic revision recorded by the real recorder),
  and every broken link, or a quarantine, removes it.

Synthetic fixtures only; never evidence about the managed database.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/queue"))
sys.path.insert(0, str(ROOT / "scripts/repin"))
sys.path.insert(0, str(ROOT / "scripts/predem"))

import attestation_recorder_reconciliation_probe as probe  # noqa: E402
import managed_snapshot as ms  # noqa: E402
from validate_r5_8_9_disposable import repinned_prelude, run  # noqa: E402

# The disposable lineage fixture must sign the current candidate identity accepted by the R5.8.11 recorder.
SPEC = json.loads((ROOT / "docs/reference/r5_8_11/spec.json").read_text(encoding="utf-8"))
COMMIT = SPEC["build_commit"]
WORKER = SPEC["critical_hashes"]["worker.py"]

FIXTURES = r"""
CREATE TEMP TABLE probe_fx(k text PRIMARY KEY, u uuid, up uuid, job uuid, sha text, match uuid) ON COMMIT DROP;
CREATE FUNCTION pg_temp.make_job(_k text, _attempt int) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE _u uuid := gen_random_uuid(); _up uuid := gen_random_uuid(); _job uuid;
        _sha text := md5(_k || clock_timestamp()::text) || md5(_k || random()::text);
BEGIN
  INSERT INTO auth.users(id, email) VALUES (_u, _u::text || '@probe.invalid');
  INSERT INTO public.uploads(id, user_id, type, file_name, storage_path, file_size, demo_sha256)
  VALUES (_up, _u, 'demo', 'probe.dem', _u::text || '/' || _up::text || '.dem', 520, _sha);
  _job := (public.enqueue_demo_job(_up, _u) ->> 'job_id')::uuid;
  ALTER TABLE public.demo_jobs DISABLE TRIGGER USER;
  UPDATE public.demo_jobs SET attempt_number = _attempt WHERE id = _job;
  ALTER TABLE public.demo_jobs ENABLE TRIGGER USER;
  INSERT INTO probe_fx VALUES (_k, _u, _up, _job, _sha, NULL);
  RETURN _job;
END $f$;
CREATE FUNCTION pg_temp.set_job(_k text, _set text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  ALTER TABLE public.demo_jobs DISABLE TRIGGER USER;
  EXECUTE format('UPDATE public.demo_jobs SET %s WHERE id = %L', _set, (SELECT job FROM probe_fx WHERE k = _k));
  ALTER TABLE public.demo_jobs ENABLE TRIGGER USER;
END $f$;
CREATE FUNCTION pg_temp.authorize(_k text, _attempt int) RETURNS jsonb LANGUAGE plpgsql AS $f$
BEGIN
  RETURN pg_temp.run(format(
    'INSERT INTO public.h3e_attempt_authorizations(job_id, upload_id, attempt_number, demo_sha256, decision_ref, authorized_by, evidence) '
    'SELECT job, up, %s, sha, %L, %L, %L::jsonb FROM probe_fx WHERE k = %L',
    _attempt, 'probe decision', 'probe', '{"probe": true}', _k));
END $f$;
CREATE FUNCTION pg_temp.snap() RETURNS jsonb LANGUAGE sql AS $f$ SELECT public.h3e_predem_managed_snapshot() $f$;
CREATE FUNCTION pg_temp.as_client(_role text, _sql text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE _state text; _message text;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', _role);
    EXECUTE _sql;
    RESET ROLE;
    RETURN jsonb_build_object('ok', true);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE, _message = MESSAGE_TEXT;
    RESET ROLE;
    RETURN jsonb_build_object('ok', false, 'sqlstate', _state, 'message', _message);
  END;
END $f$;
"""


def attempts_body() -> str:
    return FIXTURES + r"""
INSERT INTO probe_result SELECT 'before', pg_temp.snap() -> 'attempts';
SELECT pg_temp.make_job('nine', 9);
SELECT pg_temp.make_job('ten', 10);
INSERT INTO probe_result SELECT 'unauthorized', pg_temp.snap() -> 'attempts';
INSERT INTO probe_result SELECT 'wrong_attempt', pg_temp.authorize('nine', 10);
INSERT INTO probe_result SELECT 'below_nine', pg_temp.run($q$INSERT INTO public.h3e_attempt_authorizations(job_id, upload_id, attempt_number, demo_sha256, decision_ref, authorized_by, evidence) SELECT job, up, 8, sha, 'x', 'x', '{}'::jsonb FROM probe_fx WHERE k = 'nine'$q$);
INSERT INTO probe_result SELECT 'authorize_nine', pg_temp.authorize('nine', 9);
INSERT INTO probe_result SELECT 'one_authorized', pg_temp.snap() -> 'attempts';
INSERT INTO probe_result SELECT 'authorize_ten', pg_temp.authorize('ten', 10);
INSERT INTO probe_result SELECT 'all_authorized', pg_temp.snap();
INSERT INTO probe_result SELECT 'update', pg_temp.run($q$UPDATE public.h3e_attempt_authorizations SET decision_ref = 'changed'$q$);
INSERT INTO probe_result SELECT 'delete', pg_temp.run($q$DELETE FROM public.h3e_attempt_authorizations$q$);
INSERT INTO probe_result SELECT 'truncate', pg_temp.run($q$TRUNCATE public.h3e_attempt_authorizations$q$);
INSERT INTO probe_result SELECT 'delete_job', pg_temp.run(format('DELETE FROM public.demo_jobs WHERE id = %L', (SELECT job FROM probe_fx WHERE k = 'nine')));
INSERT INTO probe_result SELECT 'anon_read', pg_temp.as_client('anon', 'SELECT * FROM public.h3e_attempt_authorizations');
INSERT INTO probe_result SELECT 'authenticated_read', pg_temp.as_client('authenticated', 'SELECT * FROM public.h3e_attempt_authorizations');
INSERT INTO probe_result SELECT 'authenticated_insert', pg_temp.as_client('authenticated', $q$INSERT INTO public.h3e_attempt_authorizations(job_id, upload_id, attempt_number, demo_sha256, decision_ref, authorized_by, evidence) VALUES (gen_random_uuid(), gen_random_uuid(), 9, repeat('a', 64), 'x', 'x', '{}')$q$);
SELECT pg_temp.set_job('ten', 'attempt_number = 11');
INSERT INTO probe_result SELECT 'drifted', pg_temp.snap();
"""


def lineage_body(breaks: str) -> str:
    """Build the full chain for one match, then apply `breaks` (SQL) and measure."""
    return FIXTURES + f"""
INSERT INTO probe_result SELECT 'before', pg_temp.snap();
INSERT INTO probe_result SELECT 'attest', pg_temp.attest('gsv2-lineage', '{WORKER}');
SELECT pg_temp.make_job('m', 1);
INSERT INTO probe_result SELECT 'persist', public.persist_canonical_observation_attached(
  (SELECT jsonb_set(__BUNDLE__::jsonb, '{{observation,fingerprint}}', to_jsonb(sha)) FROM probe_fx WHERE k = 'm'),
  NULL, (SELECT up FROM probe_fx WHERE k = 'm'));
UPDATE probe_fx SET match = (SELECT m.id FROM public.matches m WHERE m.content_fingerprint = probe_fx.sha) WHERE k = 'm';
SELECT pg_temp.set_job('m', $s$status = 'processed'$s$);
ALTER TABLE public.raw_evidence_artifacts DISABLE TRIGGER USER;
INSERT INTO public.raw_evidence_artifacts(job_id, upload_id, user_id, attempt_number, demo_sha256, storage_bucket,
  storage_prefix, manifest_storage_path, schema_version, status, raw_status, audit_status, root_digest, total_bytes,
  total_chunks, total_rows, ready_at)
SELECT job, up, u, 1, sha, 'cs2-raw-evidence', 'probe/' || job, 'probe/' || job || '/manifest.json', 1, 'ready', 'ready',
  'approved', repeat('d', 64), 1, 1, 1, now() FROM probe_fx WHERE k = 'm';
ALTER TABLE public.raw_evidence_artifacts ENABLE TRIGGER USER;
CREATE FUNCTION pg_temp.event(_type text, _exec uuid, _outcome text) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT public.h3e91_record_execution_event(gen_random_uuid(), _exec, _type, f.up, _exec, f.job, 1, f.sha, 520,
    CASE WHEN _type = 'EXECUTION_INTENT' THEN NULL ELSE 'demoparser2' END,
    CASE WHEN _type = 'EXECUTION_INTENT' THEN NULL ELSE '0.42.0' END,
    CASE WHEN _type = 'EXECUTION_INTENT' THEN NULL ELSE 'git:{COMMIT}' END,
    'RAILWAY_DURABLE_WORKER', 'RAILWAY', NULL, _outcome, 1, '{COMMIT}')
  FROM probe_fx f WHERE f.k = 'm' $f$;
CREATE TEMP TABLE probe_exec ON COMMIT DROP AS SELECT gen_random_uuid() AS id;
INSERT INTO probe_result SELECT 'intent', pg_temp.event('EXECUTION_INTENT', (SELECT id FROM probe_exec), NULL);
INSERT INTO probe_result SELECT 'started', pg_temp.event('EXECUTION_STARTED', (SELECT id FROM probe_exec), NULL);
INSERT INTO probe_result SELECT 'finished', pg_temp.event('EXECUTION_FINISHED', (SELECT id FROM probe_exec), 'PARSE_SUCCEEDED');
INSERT INTO probe_result SELECT 'chain', pg_temp.snap();
{breaks}
INSERT INTO probe_result SELECT 'after', pg_temp.snap();
INSERT INTO probe_result SELECT 'fixture', to_jsonb(f) FROM probe_fx f WHERE k = 'm';
"""


def lineage(snapshot: dict) -> int:
    return int(snapshot["canonical"]["unquarantined_with_status_and_verified_lineage"])


BREAKS = {
    "full_chain": ("", 1),
    "raw_audit_not_approved": ("""ALTER TABLE public.raw_evidence_artifacts DISABLE TRIGGER USER;
UPDATE public.raw_evidence_artifacts SET audit_status = 'blocked' WHERE job_id = (SELECT job FROM probe_fx WHERE k = 'm');
ALTER TABLE public.raw_evidence_artifacts ENABLE TRIGGER USER;""", 0),
    "job_not_processed": ("SELECT pg_temp.set_job('m', $s$status = 'failed'$s$);", 0),
    "execution_of_another_build": ("""ALTER TABLE public.h3e91_execution_evidence_ledger DISABLE TRIGGER USER;
UPDATE public.h3e91_execution_evidence_ledger SET worker_build_commit = repeat('e', 40)
 WHERE job_id = (SELECT job FROM probe_fx WHERE k = 'm');
ALTER TABLE public.h3e91_execution_evidence_ledger ENABLE TRIGGER USER;""", 0),
    "execution_not_successful": ("""ALTER TABLE public.h3e91_execution_evidence_ledger DISABLE TRIGGER USER;
UPDATE public.h3e91_execution_evidence_ledger SET outcome_code = 'PARSER_ERROR'
 WHERE job_id = (SELECT job FROM probe_fx WHERE k = 'm') AND event_type = 'EXECUTION_FINISHED';
ALTER TABLE public.h3e91_execution_evidence_ledger ENABLE TRIGGER USER;""", 0),
    "match_quarantined": ("""INSERT INTO public.canonical_match_quarantine(match_id, reason, decision_ref, quarantined_by, evidence)
SELECT match, 'PRE_PROVENANCE_CANONICAL_ROW', 'probe', 'probe', '{}'::jsonb FROM probe_fx WHERE k = 'm';""", 0),
}


def main() -> int:
    probe.refuse_non_local()
    prelude = repinned_prelude(SPEC, keep_current=True)
    # repinned_prelude keeps the generic legacy attestation fixture. This probe
    # explicitly keeps R5.8.11 current, so the synthetic signed payload must use
    # the same candidate identity the real recorder now enforces. Restrict these
    # substitutions to pg_temp.attest only; rollback SQL embedded elsewhere in
    # the prelude must retain its historical pins byte-for-byte.
    start = prelude.index("CREATE FUNCTION pg_temp.attest(")
    end = prelude.index("CREATE FUNCTION pg_temp.drift(", start)
    attest_sql = prelude[start:end]
    candidate_pins = {
        "infra/cs2-parser-worker-v8": SPEC["branch"],
        "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76": SPEC["semantic_commit"],
        "1b5778de-3eaf-46f1-9ea5-cba381d95313": SPEC["deployment_id"],
        "3070d8bae6c3f02093bbb2595138c913646c2e31": SPEC["workflow_source_sha"],
        "91aeee853200d0f461d0d36af1781d7fdfa40941": SPEC["deployment_commit"],
        "9d21670e47ddf330881e95a9d78c19074ccc0aea": SPEC["critical_hashes"]["parser.py"],
        "750195c1218abd53cfc77b6e8d2fb4a88e31579e": SPEC["critical_hashes"]["raw_evidence.py"],
        "35eecfb06223812137a4a2f17114aae57cb7fe54": SPEC["critical_hashes"]["settings.py"],
    }
    for old_pin, current_pin in candidate_pins.items():
        if old_pin not in attest_sql:
            raise SystemExit(f"GATE_SEMANTICS_FIXTURE_PIN_NOT_FOUND:{old_pin}")
        attest_sql = attest_sql.replace(old_pin, current_pin)
    prelude = prelude[:start] + attest_sql + prelude[end:]
    sys.path.insert(0, str(ROOT / "scripts/queue"))
    from canonical_persistence_probe import bundle  # noqa: PLC0415
    payload = json.dumps(bundle("placeholder")).replace("'", "''")
    results: list[dict] = []

    def scenario(name: str, body: str, check) -> None:
        try:
            observed = run(prelude, body)
            problems = check(observed)
            results.append({"scenario": name, "status": "FAIL" if problems else "PASS", "detail": problems or "ok"})
        except Exception as exc:  # noqa: BLE001
            results.append({"scenario": name, "status": "FAIL", "detail": f"{type(exc).__name__}: {str(exc)[:400]}"})

    def gate(snapshot: dict, name: str) -> dict:
        result = ms.evaluate(snapshot, now=time.time(), expected_recorder_md5=snapshot["database"]["recorder_md5"])
        return result["gates"][name]

    def refused(o, key, prefix):
        v = o.get(key) or {}
        return [] if v.get("ok") is False and str(v.get("message", "")).startswith(prefix) else [f"{key}: {v}"]

    def check_attempts(o):
        problems = []
        before, unauth, one = o["before"], o["unauthorized"], o["one_authorized"]
        base_nine, base_auth = before["jobs_attempt_9_or_more"], before["jobs_attempt_9_or_more_authorized"]
        if unauth["jobs_attempt_9_or_more"] != base_nine + 2 or unauth["jobs_attempt_9_or_more_authorized"] != base_auth:
            problems.append(f"unauthorized {unauth}")
        problems += refused(o, "wrong_attempt", "H3E_ATTEMPT_AUTHORIZATION_IDENTITY_MISMATCH")
        problems += refused(o, "below_nine", "H3E_ATTEMPT_AUTHORIZATION_IDENTITY_MISMATCH")
        if (o.get("authorize_nine") or {}).get("ok") is not True:
            problems.append(f"authorize_nine {o.get('authorize_nine')}")
        if one["jobs_attempt_9_or_more_authorized"] != base_auth + 1:
            problems.append(f"one_authorized {one}")
        snap = o["all_authorized"]
        if snap["attempts"]["jobs_attempt_9_or_more_authorized"] != base_auth + 2:
            problems.append(f"all_authorized {snap['attempts']}")
        if base_nine == base_auth:  # nothing else at >= 9 in this database: the gate must be VERIFIED
            g = gate(snap, "attempt_9_absent")
            if (g["status"], g["reason"]) != ("VERIFIED", "EVERY_JOB_AT_ATTEMPT_9_OR_MORE_AUTHORIZED"):
                problems.append(f"gate {g}")
        for key in ("update", "delete", "truncate"):
            problems += refused(o, key, "H3E_ATTEMPT_AUTHORIZATION_IMMUTABLE")
        if (o.get("delete_job") or {}).get("ok") is not False:
            problems.append(f"delete_job: {o.get('delete_job')}")
        for key in ("anon_read", "authenticated_read", "authenticated_insert"):
            problems += refused(o, key, "permission denied")
        drifted = o["drifted"]
        if drifted["attempts"]["authorization_rows_not_matching_job"] != 1:
            problems.append(f"drifted {drifted['attempts']}")
        g = gate(drifted, "attempt_9_absent")
        if (g["status"], g["reason"]) != ("FAIL", "AUTHORIZATION_NO_LONGER_MATCHES_ITS_JOB"):
            problems.append(f"drifted gate {g}")
        return problems

    scenario("attempt_authorizations_are_identity_bound_append_only_and_drive_the_v2_gate",
             attempts_body(), check_attempts)

    for name, (breaks, expected) in BREAKS.items():
        def check(o, expected=expected):
            problems = []
            for key in ("intent", "started", "finished"):
                if (o.get(key) or {}).get("status") != "INSERTED":
                    problems.append(f"{key}: {o.get(key)}")
            if (o.get("attest") or {}).get("ok") is not True:
                problems.append(f"attest: {o.get('attest')}")
            if not (o.get("fixture") or {}).get("match"):
                problems.append(f"no match persisted: {o.get('persist')}")
            base, chain, after = lineage(o["before"]), lineage(o["chain"]), lineage(o["after"])
            if chain != base + 1:
                problems.append(f"full chain counted {chain - base}, expected 1")
            if after != base + expected:
                problems.append(f"after break counted {after - base}, expected {expected}")
            return problems
        scenario(f"lineage_{name}", lineage_body(breaks).replace("__BUNDLE__", f"'{payload}'"), check)

    passed = sum(r["status"] == "PASS" for r in results)
    print(json.dumps({"probe": "GATE_SEMANTICS_V2", "status": "PASS" if passed == len(results) else "FAIL",
                      "passed": passed, "total": len(results), "database": "LOCAL_DISPOSABLE_ONLY",
                      "synthetic_fixture_only": True, "scenarios": results}, indent=1, sort_keys=True))
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
