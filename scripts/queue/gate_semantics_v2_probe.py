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
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/queue"))
sys.path.insert(0, str(ROOT / "scripts/repin"))
sys.path.insert(0, str(ROOT / "scripts/predem"))

import attestation_recorder_reconciliation_probe as probe  # noqa: E402
import managed_snapshot as ms  # noqa: E402
import r5_8_11  # noqa: E402
from validate_r5_8_9_disposable import repinned_prelude, run  # noqa: E402

# The disposable lineage fixture must sign the current candidate identity accepted by the R5.8.11 recorder.
SPEC = json.loads((ROOT / "docs/reference/r5_8_16/spec.json").read_text(encoding="utf-8"))
# R5.8.15 is no longer the chain head; its validations run under a rewound R5.8.16.
SPEC15 = json.loads((ROOT / "docs/reference/r5_8_15/spec.json").read_text(encoding="utf-8"))
# R5.8.14 is no longer the chain head; its validations run under a rewound R5.8.15.
SPEC14 = json.loads((ROOT / "docs/reference/r5_8_14/spec.json").read_text(encoding="utf-8"))
# R5.8.13 is no longer the chain head; its validations run under a rewound R5.8.14.
SPEC13 = json.loads((ROOT / "docs/reference/r5_8_13/spec.json").read_text(encoding="utf-8"))
COMMIT = SPEC["build_commit"]
SEMANTIC = SPEC["semantic_commit"]
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
    CASE WHEN _type = 'EXECUTION_INTENT' THEN NULL ELSE 'git:{SEMANTIC}' END,
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


def _psql(sql: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["psql", "-X", "-h", probe.HOST, "-p", probe.PORT, "-U", probe.USER, "-d", probe.DB,
         "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"],
        input=sql, capture_output=True, text=True, timeout=120, cwd=ROOT, env=os.environ.copy())


R5812_STATE_SQL = r"""
SELECT jsonb_build_object('functions', (SELECT jsonb_agg(jsonb_build_object(
  'signature', p.oid::regprocedure::text, 'md5', md5(p.prosrc),
  'owner', pg_catalog.pg_get_userbyid(p.proowner), 'secdef', p.prosecdef,
  'volatility', p.provolatile, 'config', p.proconfig,
  'service_role', pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'),
  'anon', pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
  'authenticated', pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'),
  'comment', pg_catalog.obj_description(p.oid, 'pg_proc')) ORDER BY p.oid)
  FROM pg_catalog.pg_proc p WHERE p.oid IN (
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure,
    'public.enforce_approved_attestation_workflow()'::regprocedure)))::text;
"""


def _r5812_state() -> dict:
    result = _psql(R5812_STATE_SQL)
    if result.returncode != 0:
        raise RuntimeError(f"R5_8_12_STATE_READ_FAILED: {result.stderr[-500:]}")
    lines = [line for line in result.stdout.splitlines() if line.startswith("{")]
    if len(lines) != 1:
        raise RuntimeError(f"R5_8_12_STATE_REPORT_INVALID: {result.stdout[-500:]}")
    return json.loads(lines[0])


def _validate_r5812_migration() -> None:
    migration = "supabase/migrations/20261017180000_r5_8_12_repin_workflow_source_sha.sql"
    before = _r5812_state()
    for _ in range(2):
        result = _psql(f"\\i {migration}\n")
        if result.returncode != 0:
            raise RuntimeError(f"R5_8_12_IDEMPOTENT_RERUN_FAILED: {(result.stderr + result.stdout)[-900:]}")
    after = _r5812_state()
    if after != before:
        raise RuntimeError("R5_8_12_IDEMPOTENT_RERUN_CHANGED_FUNCTION_STATE")

    for mode, expected in (("unknown", "R5_8_12_UNEXPECTED_WORKFLOW_PIN_STATE"),
                           ("mixed", "R5_8_12_UNEXPECTED_WORKFLOW_PIN_STATE")):
        if mode == "unknown":
            tamper = "_definition := pg_catalog.replace(_definition, _new, repeat('1', 40));"
        else:
            tamper = "_position := pg_catalog.strpos(_definition, _new); _definition := overlay(_definition placing _old from _position for pg_catalog.length(_new));"
        sql = f"""BEGIN;
DO $tamper$
DECLARE
  _fn constant regprocedure := 'public.assert_verified_parser_provenance(uuid)'::regprocedure;
  _definition text := pg_catalog.pg_get_functiondef(_fn);
  _new constant text := 'f5e8ffb19d03dca410591f8d2fd38dc47a3ca485';
  _old constant text := '523cee5b0fecc21c7ce2b5f538b42670eec3fed1';
  _position integer;
BEGIN
  IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new, ''))) / pg_catalog.length(_new) <> 2 THEN
    RAISE EXCEPTION 'TEST_PRECONDITION_R5_8_12_TARGET_COUNT_INVALID';
  END IF;
  {tamper}
  EXECUTE _definition;
END $tamper$;
\\i {migration}
"""
        result = _psql(sql)
        combined = result.stdout + result.stderr
        if result.returncode == 0 or expected not in combined:
            raise RuntimeError(f"R5_8_12_{mode.upper()}_STATE_NOT_REJECTED: {(combined)[-900:]}")
        if _r5812_state() != before:
            raise RuntimeError(f"R5_8_12_{mode.upper()}_STATE_NOT_ROLLED_BACK")


def _validate_r5813_migration() -> None:
    """R5.8.13 is idempotent at its target and rejects unknown or mixed deployment pins."""
    migration = "supabase/migrations/20261018050000_r5_8_13_repin_runtime_deployment.sql"
    before = _r5812_state()
    hashes = {item["signature"].split("(")[0].split(".")[-1]: item["md5"] for item in before["functions"]}
    if hashes.get("record_parser_runtime_attestation") != SPEC13["recorder_target_md5"] or hashes.get(
            "assert_verified_parser_provenance") != SPEC13["database_target_md5"]["assert_verified_parser_provenance"]:
        raise RuntimeError(f"R5_8_13_NOT_AT_TARGET_AFTER_RESET: {hashes}")
    for _ in range(2):
        result = _psql(f"\\i {migration}\n")
        if result.returncode != 0 or "R5_8_13_ALREADY_AT_TARGET_STATE" not in result.stdout + result.stderr:
            raise RuntimeError(f"R5_8_13_IDEMPOTENT_RERUN_FAILED: {(result.stderr + result.stdout)[-900:]}")
    if _r5812_state() != before:
        raise RuntimeError("R5_8_13_IDEMPOTENT_RERUN_CHANGED_FUNCTION_STATE")
    for mode in ("unknown", "mixed"):
        if mode == "unknown":
            tamper = "_definition := pg_catalog.replace(_definition, _new, '00000000-0000-4000-8000-000000000000');"
        else:
            # One function carrying both the old and the new deployment pin.
            tamper = "_definition := pg_catalog.replace(_definition, 'BEGIN', 'BEGIN -- ' || _old);"
        sql = f"""BEGIN;
DO $tamper$
DECLARE
  _fn constant regprocedure := 'public.assert_verified_parser_provenance(uuid)'::regprocedure;
  _definition text := pg_catalog.pg_get_functiondef(_fn);
  _new constant text := '{SPEC13["deployment_id"]}';
  _old constant text := 'ce9b760d-c92f-4da1-a3e6-dd105d49585c';
BEGIN
  IF pg_catalog.strpos(_definition, _new) = 0 THEN
    RAISE EXCEPTION 'TEST_PRECONDITION_R5_8_13_TARGET_MISSING';
  END IF;
  {tamper}
  EXECUTE _definition;
END $tamper$;
\\i {migration}
"""
        result = _psql(sql)
        combined = result.stdout + result.stderr
        if result.returncode == 0 or "R5_8_13_UNEXPECTED_DEPLOYMENT_PIN_STATE" not in combined:
            raise RuntimeError(f"R5_8_13_{mode.upper()}_STATE_NOT_REJECTED: {combined[-900:]}")
        if _r5812_state() != before:
            raise RuntimeError(f"R5_8_13_{mode.upper()}_STATE_NOT_ROLLED_BACK")


def _validate_r5812_migration_under_r5813_head() -> None:
    """R5.8.12 is no longer the chain head: its migration rewrites the function comments,
    so it is idempotent only in its own state. Rewind R5.8.13 with its committed rollback,
    validate R5.8.12 there, re-apply R5.8.13 and require the head state back exactly
    (bodies, properties, grants and comments)."""
    head = _r5812_state()
    result = _psql("\\i docs/reference/r5_8_13/rollback.sql\n")
    if result.returncode != 0:
        raise RuntimeError(f"R5_8_13_ROLLBACK_FAILED: {(result.stderr + result.stdout)[-900:]}")
    rewound = {item["signature"].split("(")[0].split(".")[-1]: item["md5"] for item in _r5812_state()["functions"]}
    expected = {"record_parser_runtime_attestation": SPEC13["r5_8_12_recorder_target_md5"],
                **SPEC13["r5_8_12_database_target_md5"]}
    if rewound != expected:
        raise RuntimeError(f"R5_8_13_ROLLBACK_NOT_AT_R5_8_12_TARGETS: {rewound} != {expected}")
    try:
        _validate_r5812_migration()
    finally:
        result = _psql("\\i supabase/migrations/20261018050000_r5_8_13_repin_runtime_deployment.sql\n")
        if result.returncode != 0:
            raise RuntimeError(f"R5_8_13_REAPPLY_FAILED: {(result.stderr + result.stdout)[-900:]}")
    if _r5812_state() != head:
        raise RuntimeError("R5_8_13_REAPPLY_DID_NOT_RESTORE_HEAD_STATE")


def _validate_r5814_migration() -> None:
    """R5.8.14 is idempotent at its target and rejects unknown or mixed runtime pins."""
    migration = "supabase/migrations/20261020080000_r5_8_14_repin_runtime_release.sql"
    before = _r5812_state()
    hashes = {item["signature"].split("(")[0].split(".")[-1]: item["md5"] for item in before["functions"]}
    if hashes.get("record_parser_runtime_attestation") != SPEC14["recorder_target_md5"] or hashes.get(
            "assert_verified_parser_provenance") != SPEC14["database_target_md5"]["assert_verified_parser_provenance"]:
        raise RuntimeError(f"R5_8_14_NOT_AT_TARGET_AFTER_RESET: {hashes}")
    for _ in range(2):
        result = _psql(f"\\i {migration}\n")
        if result.returncode != 0 or "R5_8_14_ALREADY_AT_TARGET_STATE" not in result.stdout + result.stderr:
            raise RuntimeError(f"R5_8_14_IDEMPOTENT_RERUN_FAILED: {(result.stderr + result.stdout)[-900:]}")
    if _r5812_state() != before:
        raise RuntimeError("R5_8_14_IDEMPOTENT_RERUN_CHANGED_FUNCTION_STATE")
    for mode in ("unknown", "mixed"):
        if mode == "unknown":
            tamper = "_definition := pg_catalog.replace(_definition, _new, '00000000-0000-4000-8000-000000000000');"
        else:
            # One function carrying both the new and the previous (R5.8.13) deployment pin.
            tamper = "_definition := pg_catalog.replace(_definition, 'BEGIN', 'BEGIN -- ' || _old);"
        sql = f"""BEGIN;
DO $tamper$
DECLARE
  _fn constant regprocedure := 'public.assert_verified_parser_provenance(uuid)'::regprocedure;
  _definition text := pg_catalog.pg_get_functiondef(_fn);
  _new constant text := '{SPEC14["deployment_id"]}';
  _old constant text := '{SPEC13["deployment_id"]}';
BEGIN
  IF pg_catalog.strpos(_definition, _new) = 0 THEN
    RAISE EXCEPTION 'TEST_PRECONDITION_R5_8_14_TARGET_MISSING';
  END IF;
  {tamper}
  EXECUTE _definition;
END $tamper$;
\\i {migration}
"""
        result = _psql(sql)
        combined = result.stdout + result.stderr
        if result.returncode == 0 or "R5_8_14_UNEXPECTED_PIN_STATE" not in combined:
            raise RuntimeError(f"R5_8_14_{mode.upper()}_STATE_NOT_REJECTED: {combined[-900:]}")
        if _r5812_state() != before:
            raise RuntimeError(f"R5_8_14_{mode.upper()}_STATE_NOT_ROLLED_BACK")


def _validate_r5813_chain_under_r5814_head() -> None:
    """Rewind R5.8.14 with its committed rollback to the exact R5.8.13 targets, run the
    R5.8.13 and R5.8.12 validations there, re-apply R5.8.14 and require the head state
    back exactly (bodies, properties, grants and comments)."""
    head = _r5812_state()
    result = _psql("\\i docs/reference/r5_8_14/rollback.sql\n")
    if result.returncode != 0:
        raise RuntimeError(f"R5_8_14_ROLLBACK_FAILED: {(result.stderr + result.stdout)[-900:]}")
    rewound = {item["signature"].split("(")[0].split(".")[-1]: item["md5"] for item in _r5812_state()["functions"]}
    expected = {"record_parser_runtime_attestation": SPEC14["r5_8_13_recorder_target_md5"],
                **SPEC14["r5_8_13_database_target_md5"]}
    if rewound != expected:
        raise RuntimeError(f"R5_8_14_ROLLBACK_NOT_AT_R5_8_13_TARGETS: {rewound} != {expected}")
    try:
        _validate_r5813_migration()
        _validate_r5812_migration_under_r5813_head()
    finally:
        result = _psql("\\i supabase/migrations/20261020080000_r5_8_14_repin_runtime_release.sql\n")
        if result.returncode != 0:
            raise RuntimeError(f"R5_8_14_REAPPLY_FAILED: {(result.stderr + result.stdout)[-900:]}")
    if _r5812_state() != head:
        raise RuntimeError("R5_8_14_REAPPLY_DID_NOT_RESTORE_HEAD_STATE")


def _validate_r5815_migration() -> None:
    """R5.8.15 is idempotent at its target and rejects unknown or mixed runtime pins."""
    migration = "supabase/migrations/20261020210000_r5_8_15_repin_runtime_release.sql"
    before = _r5812_state()
    hashes = {item["signature"].split("(")[0].split(".")[-1]: item["md5"] for item in before["functions"]}
    if hashes.get("record_parser_runtime_attestation") != SPEC15["recorder_target_md5"] or hashes.get(
            "assert_verified_parser_provenance") != SPEC15["database_target_md5"]["assert_verified_parser_provenance"]:
        raise RuntimeError(f"R5_8_15_NOT_AT_TARGET_AFTER_RESET: {hashes}")
    for _ in range(2):
        result = _psql(f"\\i {migration}\n")
        if result.returncode != 0 or "R5_8_15_ALREADY_AT_TARGET_STATE" not in result.stdout + result.stderr:
            raise RuntimeError(f"R5_8_15_IDEMPOTENT_RERUN_FAILED: {(result.stderr + result.stdout)[-900:]}")
    if _r5812_state() != before:
        raise RuntimeError("R5_8_15_IDEMPOTENT_RERUN_CHANGED_FUNCTION_STATE")
    for mode in ("unknown", "mixed"):
        if mode == "unknown":
            tamper = "_definition := pg_catalog.replace(_definition, _new, '00000000-0000-4000-8000-000000000000');"
        else:
            # One function carrying both the new and the previous (R5.8.14) deployment pin.
            tamper = "_definition := pg_catalog.replace(_definition, 'BEGIN', 'BEGIN -- ' || _old);"
        sql = f"""BEGIN;
DO $tamper$
DECLARE
  _fn constant regprocedure := 'public.assert_verified_parser_provenance(uuid)'::regprocedure;
  _definition text := pg_catalog.pg_get_functiondef(_fn);
  _new constant text := '{SPEC15["deployment_id"]}';
  _old constant text := '{SPEC14["deployment_id"]}';
BEGIN
  IF pg_catalog.strpos(_definition, _new) = 0 THEN
    RAISE EXCEPTION 'TEST_PRECONDITION_R5_8_15_TARGET_MISSING';
  END IF;
  {tamper}
  EXECUTE _definition;
END $tamper$;
\\i {migration}
"""
        result = _psql(sql)
        combined = result.stdout + result.stderr
        if result.returncode == 0 or "R5_8_15_UNEXPECTED_PIN_STATE" not in combined:
            raise RuntimeError(f"R5_8_15_{mode.upper()}_STATE_NOT_REJECTED: {combined[-900:]}")
        if _r5812_state() != before:
            raise RuntimeError(f"R5_8_15_{mode.upper()}_STATE_NOT_ROLLED_BACK")


def _validate_r5814_chain_under_r5815_head() -> None:
    """Rewind R5.8.15 with its committed rollback to the exact R5.8.14 targets, run the
    R5.8.14 validation and the nested R5.8.13/R5.8.12 chain there, re-apply R5.8.15 and
    require the head state back exactly (bodies, properties, grants and comments)."""
    head = _r5812_state()
    result = _psql("\\i docs/reference/r5_8_15/rollback.sql\n")
    if result.returncode != 0:
        raise RuntimeError(f"R5_8_15_ROLLBACK_FAILED: {(result.stderr + result.stdout)[-900:]}")
    rewound = {item["signature"].split("(")[0].split(".")[-1]: item["md5"] for item in _r5812_state()["functions"]}
    expected = {"record_parser_runtime_attestation": SPEC15["r5_8_14_recorder_target_md5"],
                **SPEC15["r5_8_14_database_target_md5"]}
    if rewound != expected:
        raise RuntimeError(f"R5_8_15_ROLLBACK_NOT_AT_R5_8_14_TARGETS: {rewound} != {expected}")
    try:
        _validate_r5814_migration()
        _validate_r5813_chain_under_r5814_head()
    finally:
        result = _psql("\\i supabase/migrations/20261020210000_r5_8_15_repin_runtime_release.sql\n")
        if result.returncode != 0:
            raise RuntimeError(f"R5_8_15_REAPPLY_FAILED: {(result.stderr + result.stdout)[-900:]}")
    if _r5812_state() != head:
        raise RuntimeError("R5_8_15_REAPPLY_DID_NOT_RESTORE_HEAD_STATE")


def _validate_r5816_migration() -> None:
    """R5.8.16 is idempotent at its target and rejects unknown or mixed runtime pins."""
    migration = "supabase/migrations/20261022234000_r5_8_16_repin_runtime_release.sql"
    before = _r5812_state()
    hashes = {item["signature"].split("(")[0].split(".")[-1]: item["md5"] for item in before["functions"]}
    if hashes.get("record_parser_runtime_attestation") != SPEC["recorder_target_md5"] or hashes.get(
            "assert_verified_parser_provenance") != SPEC["database_target_md5"]["assert_verified_parser_provenance"]:
        raise RuntimeError(f"R5_8_16_NOT_AT_TARGET_AFTER_RESET: {hashes}")
    for _ in range(2):
        result = _psql(f"\\i {migration}\n")
        if result.returncode != 0 or "R5_8_16_ALREADY_AT_TARGET_STATE" not in result.stdout + result.stderr:
            raise RuntimeError(f"R5_8_16_IDEMPOTENT_RERUN_FAILED: {(result.stderr + result.stdout)[-900:]}")
    if _r5812_state() != before:
        raise RuntimeError("R5_8_16_IDEMPOTENT_RERUN_CHANGED_FUNCTION_STATE")
    for mode in ("unknown", "mixed"):
        if mode == "unknown":
            tamper = "_definition := pg_catalog.replace(_definition, _new, '00000000-0000-4000-8000-000000000000');"
        else:
            # One function carrying both the new and the previous (R5.8.15) deployment pin.
            tamper = "_definition := pg_catalog.replace(_definition, 'BEGIN', 'BEGIN -- ' || _old);"
        sql = f"""BEGIN;
DO $tamper$
DECLARE
  _fn constant regprocedure := 'public.assert_verified_parser_provenance(uuid)'::regprocedure;
  _definition text := pg_catalog.pg_get_functiondef(_fn);
  _new constant text := '{SPEC["deployment_id"]}';
  _old constant text := '{SPEC15["deployment_id"]}';
BEGIN
  IF pg_catalog.strpos(_definition, _new) = 0 THEN
    RAISE EXCEPTION 'TEST_PRECONDITION_R5_8_16_TARGET_MISSING';
  END IF;
  {tamper}
  EXECUTE _definition;
END $tamper$;
\\i {migration}
"""
        result = _psql(sql)
        combined = result.stdout + result.stderr
        if result.returncode == 0 or "R5_8_16_UNEXPECTED_PIN_STATE" not in combined:
            raise RuntimeError(f"R5_8_16_{mode.upper()}_STATE_NOT_REJECTED: {combined[-900:]}")
        if _r5812_state() != before:
            raise RuntimeError(f"R5_8_16_{mode.upper()}_STATE_NOT_ROLLED_BACK")


def _validate_r5815_chain_under_r5816_head() -> None:
    """Rewind R5.8.16 with its committed rollback to the exact R5.8.15 targets, run the
    R5.8.15 validation and the nested R5.8.14/R5.8.13/R5.8.12 chain there, re-apply R5.8.16
    and require the head state back exactly."""
    head = _r5812_state()
    result = _psql("\\i docs/reference/r5_8_16/rollback.sql\n")
    if result.returncode != 0:
        raise RuntimeError(f"R5_8_16_ROLLBACK_FAILED: {(result.stderr + result.stdout)[-900:]}")
    rewound = {item["signature"].split("(")[0].split(".")[-1]: item["md5"] for item in _r5812_state()["functions"]}
    expected = {"record_parser_runtime_attestation": SPEC["r5_8_15_recorder_target_md5"],
                **SPEC["r5_8_15_database_target_md5"]}
    if rewound != expected:
        raise RuntimeError(f"R5_8_16_ROLLBACK_NOT_AT_R5_8_15_TARGETS: {rewound} != {expected}")
    try:
        _validate_r5815_migration()
        _validate_r5814_chain_under_r5815_head()
    finally:
        result = _psql("\\i supabase/migrations/20261022234000_r5_8_16_repin_runtime_release.sql\n")
        if result.returncode != 0:
            raise RuntimeError(f"R5_8_16_REAPPLY_FAILED: {(result.stderr + result.stdout)[-900:]}")
    if _r5812_state() != head:
        raise RuntimeError("R5_8_16_REAPPLY_DID_NOT_RESTORE_HEAD_STATE")


def main() -> int:
    probe.refuse_non_local()
    prelude = repinned_prelude(SPEC, keep_current=True)
    # repinned_prelude applies the candidate SPEC pins itself, including the
    # real deployment ID. Do not post-process its rendered payload: doing so
    # reintroduces historical fixture assumptions and causes false failures.
    sys.path.insert(0, str(ROOT / "scripts/queue"))
    from canonical_persistence_probe import bundle  # noqa: PLC0415
    payload = json.dumps(bundle("placeholder")).replace("'", "''")
    results: list[dict] = []

    # Candidate boundary MD5s must be regenerated for R5.8.12, not copied from
    # the historical R5.8.11 target. Include both values in the report if stale.
    declared_boundary_targets = SPEC.get("database_target_md5", {})
    live_state = _r5812_state()
    live_hashes = {item["signature"].split("(")[0].split(".")[-1]: item["md5"]
                   for item in live_state.get("functions", [])}
    computed_boundary_targets = {name: live_hashes.get(name) for name in declared_boundary_targets}
    computed_recorder_target = r5_8_11.target_md5(SPEC)
    live_recorder_target = live_hashes.get("record_parser_runtime_attestation")
    results.append({
        "scenario": "r5_8_16_boundary_and_recorder_targets_match_database",
        "status": "PASS" if (declared_boundary_targets == computed_boundary_targets
                             and live_recorder_target == computed_recorder_target) else "FAIL",
        "detail": {
            "declared_boundary": declared_boundary_targets,
            "computed_boundary_from_pg_proc": computed_boundary_targets,
            "live_recorder_md5": live_recorder_target,
            "generated_recorder_target_md5": computed_recorder_target,
        },
    })

    try:
        _validate_r5816_migration()
        results.append({"scenario": "r5_8_16_idempotence_and_fail_closed_states", "status": "PASS", "detail": "rerun stable; unknown and mixed runtime pins rejected and transaction rolled back"})
    except Exception as exc:  # noqa: BLE001 - preserve the failure in the machine-readable report
        results.append({"scenario": "r5_8_16_idempotence_and_fail_closed_states", "status": "FAIL", "detail": f"{type(exc).__name__}: {str(exc)[:900]}"})

    try:
        _validate_r5815_chain_under_r5816_head()
        results.append({"scenario": "r5_8_15_r5_8_14_r5_8_13_and_r5_8_12_idempotence_and_fail_closed_states", "status": "PASS", "detail": "under a rewound R5.8.16: R5.8.15, R5.8.14, R5.8.13 and R5.8.12 reruns stable, unknown and mixed pins rejected; each head restored exactly"})
    except Exception as exc:  # noqa: BLE001 - preserve the failure in the machine-readable report
        results.append({"scenario": "r5_8_15_r5_8_14_r5_8_13_and_r5_8_12_idempotence_and_fail_closed_states", "status": "FAIL", "detail": f"{type(exc).__name__}: {str(exc)[:900]}"})

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

    def check_invalid_workflow_binding(o):
        value = o.get("attest") or {}
        return [] if (value.get("ok") is False and value.get("message") == "PARSER_ATTESTATION_BINDING_INVALID"
                      and value.get("sqlstate") == "55000") else [f"stale workflow binding was not rejected: {value}"]

    scenario("attestation_rejects_stale_workflow_binding",
             FIXTURES + "INSERT INTO probe_result SELECT 'attest', pg_temp.attest('gsv2-invalid-workflow', "
             f"'{WORKER}', 'workflow');", check_invalid_workflow_binding)

    passed = sum(r["status"] == "PASS" for r in results)
    print(json.dumps({"probe": "GATE_SEMANTICS_V2", "status": "PASS" if passed == len(results) else "FAIL",
                      "passed": passed, "total": len(results), "database": "LOCAL_DISPOSABLE_ONLY",
                      "synthetic_fixture_only": True, "scenarios": results}, indent=1, sort_keys=True))
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
