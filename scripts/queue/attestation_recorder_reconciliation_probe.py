#!/usr/bin/env python3
"""Probe of migrations R5.8.7 and R5.8.8 and of the attestation controls, on a DISPOSABLE database.

Runs ONLY against a local database built from supabase/migrations; it refuses
any other host. Every scenario runs inside one transaction that is rolled back,
so nothing it writes survives, and it writes only synthetic attestations signed
with a throwaway key set for that transaction. It never reads a real secret,
never touches the managed database, and authorizes nothing.

What it proves:
- the migration turns a repository build into the managed recorder definition
  (md5 fe3250af…), keeps every property, is a no-op when re-run, fails closed
  on any other definition, and can be rolled back on repository builds;
- after it, an attestation carrying the managed worker blob (50a53b60…) is
  accepted and one carrying the old repository blob (dfc2e67f…) is rejected;
- R5.8.8 removes parser_runtime_provenance_deployment_identity_idx when it has
  the expected definition, is a no-op that changes nothing when it is absent
  (the managed database's state), and fails closed on anything unexpected;
- after both, two distinct attestations of one deployment coexist, while an
  exact replay, a reused nonce, a duplicated digest and invalid attestations
  (signature, digest, freshness, binding, critical hash, missing key) are
  rejected by the control responsible for each;
- the R5.8.8 rollback refuses rather than delete any attestation.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from queue_semantics_probe import DB, HOST, PORT, USER, refuse_non_local  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261012200000_r5_8_7_reconcile_attestation_recorder_live_definition.sql"
ROLLBACK = ROOT / "docs/rollback/20261012200000_r5_8_7_recorder_rollback_repository_builds_only.sql"
MIGRATION_R588 = ROOT / "supabase/migrations/20261012210000_r5_8_8_drop_deployment_identity_uniqueness.sql"
ROLLBACK_R588 = ROOT / "docs/rollback/20261012210000_r5_8_8_deployment_uniqueness_rollback_repository_builds_only.sql"
MANAGED_MD5 = "fe3250af2b461f03f459adf36b43ec21"
REPOSITORY_MD5 = "5ea1ffff4fc874ca50f0081b9c9a5e71"
MANAGED_BLOB = "50a53b607d26f00b4de05c5e8998611959e27bd1"
REPOSITORY_BLOB = "dfc2e67fcb3644be91108079f9096947c16119b3"
INDEX = "parser_runtime_provenance_deployment_identity_idx"
RESULTS: list[dict] = []
# The repository reset ends at R5.8.12. Legacy probes first rewind R5.8.12,
# then R5.8.11/11b and R5.8.10/10b inside their disposable transaction.
sys.path.insert(0, str(ROOT / "scripts/repin"))
import r5_8_11  # noqa: E402
R5816_SPEC = json.loads((ROOT / "docs/reference/r5_8_16/spec.json").read_text(encoding="utf-8"))
R5816_TARGET_MD5 = r5_8_11.target_md5(R5816_SPEC)
R5816_ROLLBACK = ROOT / "docs/reference/r5_8_16/rollback.sql"
R5815_SPEC = json.loads((ROOT / "docs/reference/r5_8_15/spec.json").read_text(encoding="utf-8"))
R5815_TARGET_MD5 = r5_8_11.target_md5(R5815_SPEC)
R5815_ROLLBACK = ROOT / "docs/reference/r5_8_15/rollback.sql"
R5814_SPEC = json.loads((ROOT / "docs/reference/r5_8_14/spec.json").read_text(encoding="utf-8"))
R5814_TARGET_MD5 = r5_8_11.target_md5(R5814_SPEC)
R5814_ROLLBACK = ROOT / "docs/reference/r5_8_14/rollback.sql"
R5813_SPEC = json.loads((ROOT / "docs/reference/r5_8_13/spec.json").read_text(encoding="utf-8"))
R5813_TARGET_MD5 = r5_8_11.target_md5(R5813_SPEC)
R5813_ROLLBACK = ROOT / "docs/reference/r5_8_13/rollback.sql"
R5812_SPEC = json.loads((ROOT / "docs/reference/r5_8_12/spec.json").read_text(encoding="utf-8"))
R5812_TARGET_MD5 = r5_8_11.target_md5(R5812_SPEC)
R5812_ROLLBACK = ROOT / "docs/reference/r5_8_12/rollback.sql"
R5811_ROLLBACK = ROOT / "docs/reference/r5_8_11/rollback.sql"
R5811B_ROLLBACK = ROOT / "docs/reference/r5_8_11/rollback_boundary.sql"
R5811_TARGET_MD5 = "72df9c518f5573db232a6759301e4360"
R589_ROLLBACK = ROOT / "docs/reference/r5_8_9/rollback.sql"
R589B_ROLLBACK = ROOT / "docs/reference/r5_8_9/rollback_boundary.sql"
R589_TARGET_MD5 = "d7c325bac1a98c6a7cac67a0f18ba08b"
R5810_ROLLBACK = ROOT / "docs/reference/r5_8_10/rollback.sql"
R5810B_ROLLBACK = ROOT / "docs/reference/r5_8_10/rollback_boundary.sql"
R5810_TARGET_MD5 = "4ee7be9d9d133adbeeafe6e6a5763112"

PRELUDE = r"""
\set ON_ERROR_STOP 1
BEGIN;
CREATE TEMP TABLE probe_baseline ON COMMIT DROP AS
  SELECT md5(p.prosrc) AS reset_md5 FROM pg_proc p
  WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
DO $baseline$
DECLARE _md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_proc p
  WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
  IF __R5816_UNDO__ AND _md5 = '__R5816_TARGET__' THEN
    EXECUTE __R5816_ROLLBACK__;
    SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_proc p
    WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
    IF _md5 <> '__R5815_TARGET__' THEN RAISE EXCEPTION 'PROBE_BASELINE_R5_8_16_ROLLBACK_MISMATCH: %', _md5; END IF;
  END IF;
  IF __R5815_UNDO__ AND _md5 = '__R5815_TARGET__' THEN
    EXECUTE __R5815_ROLLBACK__;
    SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_proc p
    WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
    IF _md5 <> '__R5814_TARGET__' THEN RAISE EXCEPTION 'PROBE_BASELINE_R5_8_15_ROLLBACK_MISMATCH: %', _md5; END IF;
  END IF;
  IF __R5814_UNDO__ AND _md5 = '__R5814_TARGET__' THEN
    EXECUTE __R5814_ROLLBACK__;
    SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_proc p
    WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
    IF _md5 <> '__R5813_TARGET__' THEN RAISE EXCEPTION 'PROBE_BASELINE_R5_8_14_ROLLBACK_MISMATCH: %', _md5; END IF;
  END IF;
  IF __R5813_UNDO__ AND _md5 = '__R5813_TARGET__' THEN
    EXECUTE __R5813_ROLLBACK__;
    SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_proc p
    WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
    IF _md5 <> '__R5812_TARGET__' THEN RAISE EXCEPTION 'PROBE_BASELINE_R5_8_13_ROLLBACK_MISMATCH: %', _md5; END IF;
  END IF;
  IF __R5812_UNDO__ AND _md5 = '__R5812_TARGET__' THEN
    EXECUTE __R5812_ROLLBACK__;
    SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_proc p
    WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
    IF _md5 <> '__R5811_TARGET__' THEN RAISE EXCEPTION 'PROBE_BASELINE_R5_8_12_ROLLBACK_MISMATCH: %', _md5; END IF;
  END IF;
  IF __R5811_UNDO__ AND _md5 = '__R5811_TARGET__' THEN
    -- Boundary and recorder are separate functions. Roll them back in migration
    -- order; only assert the recorder fingerprint after its own rollback.
    EXECUTE __R5811B_ROLLBACK__;
    EXECUTE __R5811_ROLLBACK__;
    SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_proc p
    WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
    IF _md5 <> '__R5810_TARGET__' THEN RAISE EXCEPTION 'PROBE_BASELINE_R5_8_11_ROLLBACK_MISMATCH: %', _md5; END IF;
  END IF;
  IF _md5 = '__R5810_TARGET__' THEN
    EXECUTE __R5810B_ROLLBACK__;
    EXECUTE __R5810_ROLLBACK__;
    SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_proc p
    WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
    IF __R589_UNDO__ AND _md5 <> '__R589_TARGET__' THEN
      RAISE EXCEPTION 'PROBE_BASELINE_R5_8_10_ROLLBACK_MISMATCH: %', _md5;
    END IF;
  END IF;
  IF __R589_UNDO__ AND _md5 = '__R589_TARGET__' THEN
    EXECUTE __R589B_ROLLBACK__;
    EXECUTE __R589_ROLLBACK__;
    SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_proc p
    WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
  END IF;
END $baseline$;
SELECT set_config('app.settings.parser_attestation_hmac_secret', repeat('s', 48), true);
CREATE TEMP TABLE probe_result(k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
CREATE FUNCTION pg_temp.recorder() RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('md5', md5(p.prosrc), 'xmin', p.xmin::text,
    'owner', pg_get_userbyid(p.proowner), 'secdef', p.prosecdef, 'config', p.proconfig,
    'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE'),
    'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'comment', obj_description(p.oid, 'pg_proc'))
  FROM pg_proc p
  WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure
$f$;
CREATE FUNCTION pg_temp.run(_sql text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE _state text; _message text;
BEGIN
  EXECUTE _sql;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE, _message = MESSAGE_TEXT;
  RETURN jsonb_build_object('ok', false, 'sqlstate', _state, 'message', _message);
END $f$;
CREATE FUNCTION pg_temp.attest(_run text, _worker_blob text, _tamper text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  _at timestamptz := date_trunc('milliseconds', now()) - interval '1 second';
  _nonce text := md5(_run) || md5(_run || ':nonce');
  _wf text := substr(md5(_run || ':wf') || md5(_run || ':wf2'), 1, 40);
  _wf_file text := repeat('b', 40);
  _tree text := repeat('c', 40);
  _sem text := 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76';
  _version jsonb;
  _payload jsonb;
  _canonical text;
  _digest text;
  _signature text;
  _id uuid;
  _state text; _message text; _constraint text;
BEGIN
  IF _tamper = 'stale' THEN _at := _at - interval '10 minutes'; END IF;
  _version := jsonb_build_object('revision', _sem, 'semantic_revision', _sem, 'build_revision', _sem);
  _payload := jsonb_build_object(
    'schema_version', '3', 'repository', 'GameProAcademy/cs2-pro-hub',
    'railway_branch', 'infra/cs2-parser-worker-v8', 'git_commit', '5703b1d88f21ee57fdd1d83722edf30e0f0c6f76',
    'deployment_id', '1b5778de-3eaf-46f1-9ea5-cba381d95313',
    'railway_project_id', 'aa2176ec-0e35-45f0-8cfa-9f8c0707dca4',
    'railway_service_id', '706fa246-a263-484f-a986-c74516be862b',
    'railway_environment_id', '2385d707-795d-4e32-a00b-0afaba0a9b7e',
    'parser_name', 'demoparser2', 'parser_version', '0.42.0', 'contract_version', 1,
    'semantic_revision', _sem, 'build_revision', _sem, 'git_tree', _tree,
    'runtime_identity', jsonb_build_object('repository', 'GameProAcademy/cs2-pro-hub',
      'branch', 'infra/cs2-parser-worker-v8', 'commit', '5703b1d88f21ee57fdd1d83722edf30e0f0c6f76',
      'tree', _tree, 'branch_contains_commit', true),
    'workflow_identity', jsonb_build_object('provider', 'github_actions', 'repository', 'GameProAcademy/cs2-pro-hub',
      'ref_name', 'main', 'workflow_sha', _wf, 'trigger_commit_sha', _wf, 'workflow_file_commit_sha', _wf_file,
      'workflow_ref', 'GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/main',
      'workflow_path', '.github/workflows/parser-runtime-attestation.yml',
      'workflow_source_sha', '3070d8bae6c3f02093bbb2595138c913646c2e31',
      'event_name', 'workflow_dispatch', 'run_id', _run, 'run_attempt', '1'),
    'attestor_source_identity', jsonb_build_object('repository', 'GameProAcademy/cs2-pro-hub', 'branch', 'main',
      'workflow_sha', _wf, 'trigger_commit_sha', _wf, 'workflow_file_commit_sha', _wf_file,
      'workflow_path', '.github/workflows/parser-runtime-attestation.yml',
      'workflow_source_sha', '3070d8bae6c3f02093bbb2595138c913646c2e31'),
    'deployment_evidence', jsonb_build_object('verification_source', 'RAILWAY_API', 'independently_verified', true,
      'deployment_id', '1b5778de-3eaf-46f1-9ea5-cba381d95313', 'source_branch', 'infra/cs2-parser-worker-v8',
      'source_commit', '91aeee853200d0f461d0d36af1781d7fdfa40941'),
    'custom_domain_version', _version, 'railway_domain_version', _version,
    'runtime_health', jsonb_build_object('status', 'ok'),
    'release_gate_evidence', jsonb_build_object('probe', 'synthetic'),
    'mapping_release', jsonb_build_object('release_id', 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87',
      'inventory_version', 'canonical-demo-v2',
      'inventory_digest', 'cf0549c2dfbdc4df25b42ce8204edf8705071c586e99696e9ef596c1e742d7b1',
      'matrix_digest', 'a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702',
      'row_count', 105, 'generic_count', 0, 'authorized_count', 0, 'verified_count', 0, 'status', 'BLOCKED'),
    'critical_file_hashes', jsonb_build_object(
      'services/cs2-demo-parser/parser.py', jsonb_build_object('observed', '9d21670e47ddf330881e95a9d78c19074ccc0aea', 'match', true),
      'services/cs2-demo-parser/adapter.py', jsonb_build_object('observed', '34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71', 'match', true),
      'services/cs2-demo-parser/worker.py', jsonb_build_object('observed', _worker_blob, 'match', true),
      'services/cs2-demo-parser/raw_evidence.py', jsonb_build_object('observed', '750195c1218abd53cfc77b6e8d2fb4a88e31579e', 'match', true),
      'services/cs2-demo-parser/settings.py', jsonb_build_object('observed', '35eecfb06223812137a4a2f17114aae57cb7fe54', 'match', true)),
    'attested_at', to_char(_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'nonce', _nonce);
  IF _tamper = 'deployment' THEN
    _payload := jsonb_set(_payload, '{deployment_id}', to_jsonb('3ad4b1fe-9b9e-4fec-b79a-4215d27aab29'::text));
  ELSIF _tamper = 'workflow' THEN
    _payload := jsonb_set(_payload, '{workflow_identity,workflow_source_sha}', to_jsonb(repeat('0', 40)));
    _payload := jsonb_set(_payload, '{attestor_source_identity,workflow_source_sha}', to_jsonb(repeat('0', 40)));
  END IF;
  _canonical := _payload::text;
  _digest := encode(extensions.digest(convert_to(_canonical, 'UTF8'), 'sha256'), 'hex');
  _signature := encode(extensions.hmac(convert_to(_canonical, 'UTF8'),
    convert_to(current_setting('app.settings.parser_attestation_hmac_secret'), 'UTF8'), 'sha256'), 'hex');
  IF _tamper = 'signature' THEN _signature := repeat('0', 64); END IF;
  IF _tamper = 'digest' THEN _digest := repeat('0', 64); END IF;
  IF _tamper = 'nosecret' THEN PERFORM set_config('app.settings.parser_attestation_hmac_secret', '', true); END IF;
  BEGIN
    _id := public.record_parser_runtime_attestation(_canonical, _payload, _digest, _signature,
      _payload -> 'release_gate_evidence', _at, _nonce);
    IF _tamper = 'nosecret' THEN PERFORM set_config('app.settings.parser_attestation_hmac_secret', repeat('s', 48), true); END IF;
    RETURN jsonb_build_object('ok', true, 'digest', _digest);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE, _message = MESSAGE_TEXT, _constraint = CONSTRAINT_NAME;
    IF _tamper = 'nosecret' THEN PERFORM set_config('app.settings.parser_attestation_hmac_secret', repeat('s', 48), true); END IF;
    RETURN jsonb_build_object('ok', false, 'sqlstate', _state, 'message', _message, 'constraint', _constraint);
  END;
END $f$;
CREATE FUNCTION pg_temp.drift(_alter text, _sql text) RETURNS jsonb LANGUAGE plpgsql AS $f$
-- Apply a drift, run _sql against it, then undo the drift by raising: the result
-- travels out in the error detail, so every case starts from the same state.
DECLARE _detail text;
BEGIN
  BEGIN
    BEGIN
      EXECUTE _alter;
    EXCEPTION WHEN OTHERS THEN
      -- A drift that cannot be set up is a probe defect, never a migration result.
      RAISE EXCEPTION 'PROBE_DRIFT_SETUP_FAILED' USING ERRCODE = 'P0002',
        DETAIL = SQLSTATE || ': ' || SQLERRM;
    END;
    RAISE EXCEPTION 'PROBE_UNDO' USING DETAIL = pg_temp.run(_sql)::text;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _detail = PG_EXCEPTION_DETAIL;
  END;
  RETURN _detail::jsonb;
END $f$;
CREATE FUNCTION pg_temp.catalog() RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object(
    'relations', (SELECT md5(string_agg(c.oid::text || ':' || c.relname || ':' || c.relkind::text || ':' || c.xmin::text, ',' ORDER BY c.oid))
                  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace),
    'constraints', (SELECT md5(string_agg(c.oid::text || ':' || c.xmin::text, ',' ORDER BY c.oid))
                    FROM pg_constraint c WHERE c.connamespace = 'public'::regnamespace),
    'functions', (SELECT md5(string_agg(p.oid::text || ':' || p.xmin::text, ',' ORDER BY p.oid))
                  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace),
    'object_set', (SELECT md5(string_agg(c.relname || ':' || c.relkind::text, ',' ORDER BY c.relname))
                   FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
                     AND c.relname <> 'parser_runtime_provenance_deployment_identity_idx'),
    'provenance', (SELECT jsonb_build_object('rows', count(*), 'md5', md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), '')))
                   FROM public.parser_runtime_provenance t),
    'nonces', (SELECT jsonb_build_object('rows', count(*), 'md5', md5(coalesce(string_agg(t::text, ',' ORDER BY t.nonce), '')))
               FROM public.parser_attestation_nonces t))
$f$;
CREATE FUNCTION pg_temp.controls() RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object(
    'deployment_index', to_regclass('public.parser_runtime_provenance_deployment_identity_idx') IS NOT NULL,
    'provenance_digest_key', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.parser_runtime_provenance'::regclass
      AND conname = 'parser_runtime_provenance_attestation_digest_key' AND pg_get_constraintdef(oid) = 'UNIQUE (attestation_digest)'),
    'nonce_pkey', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.parser_attestation_nonces'::regclass
      AND contype = 'p' AND pg_get_constraintdef(oid) = 'PRIMARY KEY (nonce)'),
    'nonce_digest_key', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.parser_attestation_nonces'::regclass
      AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (attestation_digest)'))
$f$;
"""
def _sql_literal(path: Path, tag: str) -> str:
    text = path.read_text(encoding="utf-8")
    assert tag not in text
    return tag + text + tag


def _r589_literal(path: Path = R589_ROLLBACK) -> str:
    return _sql_literal(path, "$r589_rollback$")


def _r5811_literal(path: Path) -> str:
    return _sql_literal(path, "$r5811b_rollback$")


def _r5812_literal(path: Path = R5812_ROLLBACK) -> str:
    return _sql_literal(path, "$r5812_rollback$")


def _r5813_literal(path: Path = R5813_ROLLBACK) -> str:
    return _sql_literal(path, "$r5813_rollback$")


def _r5814_literal(path: Path = R5814_ROLLBACK) -> str:
    return _sql_literal(path, "$r5814_rollback$")


def _r5815_literal(path: Path = R5815_ROLLBACK) -> str:
    return _sql_literal(path, "$r5815_rollback$")


def _r5816_literal(path: Path = R5816_ROLLBACK) -> str:
    return _sql_literal(path, "$r5816_rollback$")


def render_prelude(template: str, *, keep_r589: bool = False, keep_current: bool = False) -> str:
    """Render a transaction-local recorder baseline for the caller.

    By default rewind R5.8.16, R5.8.15, R5.8.14, R5.8.13, R5.8.12, R5.8.11/11b and R5.8.10/10b, leaving
    the R5.8.9 target expected by legacy R5.8.7/R5.8.8 reconciliation. keep_r589
    preserves the R5.8.9 target; keep_current preserves the R5.8.16 head.
    Every rollback remains inside the disposable transaction and is undone by
    the probe epilogue.
    """
    return (template.replace("__R5816_UNDO__", "false" if keep_current else "true")
            .replace("__R5816_TARGET__", R5816_TARGET_MD5)
            .replace("__R5816_ROLLBACK__", _r5816_literal())
            .replace("__R5815_UNDO__", "false" if keep_current else "true")
            .replace("__R5815_TARGET__", R5815_TARGET_MD5)
            .replace("__R5815_ROLLBACK__", _r5815_literal())
            .replace("__R5814_UNDO__", "false" if keep_current else "true")
            .replace("__R5814_TARGET__", R5814_TARGET_MD5)
            .replace("__R5814_ROLLBACK__", _r5814_literal())
            .replace("__R5813_UNDO__", "false" if keep_current else "true")
            .replace("__R5813_TARGET__", R5813_TARGET_MD5)
            .replace("__R5813_ROLLBACK__", _r5813_literal())
            .replace("__R5812_UNDO__", "false" if keep_current else "true")
            .replace("__R5812_TARGET__", R5812_TARGET_MD5)
            .replace("__R5812_ROLLBACK__", _r5812_literal())
            .replace("__R5811_UNDO__", "false" if keep_current else "true")
            .replace("__R5811_TARGET__", R5811_TARGET_MD5)
            .replace("__R5811B_ROLLBACK__", _r5811_literal(R5811B_ROLLBACK))
            .replace("__R5811_ROLLBACK__", _r5811_literal(R5811_ROLLBACK))
            .replace("__R5810_TARGET__", R5810_TARGET_MD5)
            .replace("__R5810B_ROLLBACK__", _r589_literal(R5810B_ROLLBACK))
            .replace("__R5810_ROLLBACK__", _r589_literal(R5810_ROLLBACK))
            .replace("__R589_UNDO__", "false" if keep_r589 or keep_current else "true")
            .replace("__R589_TARGET__", R589_TARGET_MD5)
            .replace("__R589B_ROLLBACK__", _r589_literal(R589B_ROLLBACK))
            .replace("__R589_ROLLBACK__", _r589_literal()))


PRELUDE_TEMPLATE = PRELUDE
# Base R5.8.7/R5.8.8 reconciliation expects the R5.8.10 recorder fingerprint.
# The current Gate Semantics probe explicitly requests keep_current=True.
PRELUDE = render_prelude(PRELUDE_TEMPLATE)
EPILOGUE = r"""
SELECT 'RESULT:' || coalesce(jsonb_object_agg(k, v), '{}'::jsonb)::text FROM probe_result;
ROLLBACK;
"""


def literal(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    assert "$probe_sql$" not in text
    return "$probe_sql$" + text + "$probe_sql$"


def run_script(body: str) -> dict:
    result = subprocess.run(
        ["psql", "-X", "-h", HOST, "-p", PORT, "-U", USER, "-d", DB, "-At", "-f", "-"],
        input=PRELUDE + body + EPILOGUE, capture_output=True, text=True, env={**os.environ}, timeout=120)
    lines = [line for line in result.stdout.splitlines() if line.startswith("RESULT:")]
    if result.returncode != 0 or len(lines) != 1:
        raise RuntimeError((result.stderr.strip().splitlines() or ["psql failed"])[-1][:300])
    return json.loads(lines[0][len("RESULT:"):])


def scenario(name: str, body: str, check) -> None:
    try:
        observed = run_script(body)
        problems = check(observed)
        RESULTS.append({"scenario": name, "status": "FAIL" if problems else "PASS",
                        "detail": problems or "ok", "observed": observed})
    except Exception as exc:  # noqa: BLE001
        RESULTS.append({"scenario": name, "status": "FAIL", "detail": f"{type(exc).__name__}: {exc}"})


def expect(observed: dict, key: str, **wanted) -> list[str]:
    value = observed.get(key) or {}
    return [f"{key}.{field}={value.get(field)!r} expected {want!r}" for field, want in wanted.items()
            if value.get(field) != want]


MIGRATE = f"pg_temp.run({literal(MIGRATION)})"
ROLL_BACK = f"pg_temp.run({literal(ROLLBACK)})"
MIGRATE_R588 = f"pg_temp.run({literal(MIGRATION_R588)})"
ROLL_BACK_R588 = f"pg_temp.run({literal(ROLLBACK_R588)})"
DEPLOYMENT_ROWS = """to_jsonb((SELECT count(*) FROM public.parser_runtime_provenance
  WHERE deployment_id = '1b5778de-3eaf-46f1-9ea5-cba381d95313' AND status = 'VERIFIED'))"""
ORIGINAL_INDEX = (f"CREATE UNIQUE INDEX {INDEX} ON public.parser_runtime_provenance (railway_project_id, "
                  "railway_service_id, railway_environment_id, deployment_id, deployment_commit, semantic_revision, build_revision)")


def failed(o: dict, key: str, prefix: str, sqlstate: str = "55000") -> list[str]:
    value = o.get(key) or {}
    problems = expect(o, key, ok=False, sqlstate=sqlstate)
    if not str(value.get("message", "")).startswith(prefix):
        problems.append(f"{key}.message={value.get('message')!r} expected prefix {prefix!r}")
    return problems


def main() -> int:
    refuse_non_local()

    # ----- R5.8.16 is the repository migration-chain head; the legacy prelude
    # then rewinds it transaction-locally before testing R5.8.7/R5.8.8 behavior.
    scenario("r5816_reset_build_has_current_recorder", """
INSERT INTO probe_result SELECT 'reset_md5', to_jsonb((SELECT reset_md5 FROM probe_baseline));
""", lambda o: [] if o.get("reset_md5") == R5816_TARGET_MD5 else [f"reset_md5={o.get('reset_md5')!r}"])

    # ----- R5.8.7 (D1): recorder definition
    scenario("d1_reset_build_has_managed_recorder_and_properties", """
INSERT INTO probe_result SELECT 'recorder', pg_temp.recorder();
""", lambda o: expect(o, "recorder", md5=MANAGED_MD5, owner="postgres", secdef=True,
                     config=['search_path=""'], service_role=True, anon=False, authenticated=False))

    scenario("d1_rerun_is_a_no_op", f"""
INSERT INTO probe_result SELECT 'before', pg_temp.recorder();
INSERT INTO probe_result SELECT 'migration', {MIGRATE};
INSERT INTO probe_result SELECT 'after', pg_temp.recorder();
""", lambda o: expect(o, "migration", ok=True) + expect(o, "after", md5=MANAGED_MD5, xmin=(o.get("before") or {}).get("xmin")))

    scenario("d1_unexpected_definition_fails_closed_and_changes_nothing", f"""
DO $d$ BEGIN EXECUTE replace(pg_get_functiondef('public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure),
  'PARSER_ATTESTATION_INVALID_INPUT', 'PARSER_ATTESTATION_INVALID_INPUT_PROBE'); END $d$;
INSERT INTO probe_result SELECT 'diverged', pg_temp.recorder();
INSERT INTO probe_result SELECT 'migration', {MIGRATE};
INSERT INTO probe_result SELECT 'after', pg_temp.recorder();
""", lambda o: failed(o, "migration", "R5_8_7_RECORDER_UNEXPECTED_DEFINITION")
        + expect(o, "after", md5=(o.get("diverged") or {}).get("md5"), xmin=(o.get("diverged") or {}).get("xmin")))

    scenario("d1_changed_grant_fails_closed", f"""
GRANT EXECUTE ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) TO anon;
INSERT INTO probe_result SELECT 'migration', {MIGRATE};
""", lambda o: failed(o, "migration", "R5_8_7_RECORDER_GRANTS_INVALID"))

    scenario("d1_rollback_restores_repository_definition_and_migration_reapplies", f"""
INSERT INTO probe_result SELECT 'rollback', {ROLL_BACK};
INSERT INTO probe_result SELECT 'rolled_back', pg_temp.recorder();
INSERT INTO probe_result SELECT 'managed_blob_on_old_definition', pg_temp.attest('probe-rollback-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'old_blob_on_old_definition', pg_temp.attest('probe-rollback-b', '{REPOSITORY_BLOB}');
INSERT INTO probe_result SELECT 'r588_needs_reconciled_recorder', {MIGRATE_R588};
INSERT INTO probe_result SELECT 'migration', {MIGRATE};
INSERT INTO probe_result SELECT 'reapplied', pg_temp.recorder();
""", lambda o: expect(o, "rollback", ok=True) + expect(o, "rolled_back", md5=REPOSITORY_MD5)
        + expect(o, "managed_blob_on_old_definition", ok=False, message="PARSER_ATTESTATION_CRITICAL_HASH_MISMATCH")
        + expect(o, "old_blob_on_old_definition", ok=True)
        + failed(o, "r588_needs_reconciled_recorder", "R5_8_8_RECORDER_NOT_RECONCILED")
        + expect(o, "migration", ok=True)
        + expect(o, "reapplied", md5=MANAGED_MD5, owner="postgres", secdef=True,
                 service_role=True, anon=False, authenticated=False))

    fn = "public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)"
    scenario("d1_property_drift_fails_closed", f"""
INSERT INTO probe_result SELECT 'comment', pg_temp.drift($a$COMMENT ON FUNCTION {fn} IS 'probe'$a$, {literal(MIGRATION)});
INSERT INTO probe_result SELECT 'owner', pg_temp.drift($a$CREATE ROLE r5_8_7_probe_owner NOLOGIN; GRANT r5_8_7_probe_owner TO CURRENT_USER; GRANT USAGE, CREATE ON SCHEMA public TO r5_8_7_probe_owner; ALTER FUNCTION {fn} OWNER TO r5_8_7_probe_owner$a$, {literal(MIGRATION)});
INSERT INTO probe_result SELECT 'search_path', pg_temp.drift($a$ALTER FUNCTION {fn} SET search_path = public$a$, {literal(MIGRATION)});
INSERT INTO probe_result SELECT 'security_invoker', pg_temp.drift($a$ALTER FUNCTION {fn} SECURITY INVOKER$a$, {literal(MIGRATION)});
INSERT INTO probe_result SELECT 'public_execute', pg_temp.drift($a$GRANT EXECUTE ON FUNCTION {fn} TO PUBLIC$a$, {literal(MIGRATION)});
INSERT INTO probe_result SELECT 'service_role_revoked', pg_temp.drift($a$REVOKE EXECUTE ON FUNCTION {fn} FROM service_role$a$, {literal(MIGRATION)});
INSERT INTO probe_result SELECT 'unchanged', pg_temp.recorder();
""", lambda o: failed(o, "comment", "R5_8_7_RECORDER_COMMENT_INVALID")
        + failed(o, "owner", "R5_8_7_RECORDER_PROPERTIES_INVALID")
        + failed(o, "search_path", "R5_8_7_RECORDER_PROPERTIES_INVALID")
        + failed(o, "security_invoker", "R5_8_7_RECORDER_PROPERTIES_INVALID")
        + failed(o, "public_execute", "R5_8_7_RECORDER_GRANTS_INVALID")
        + failed(o, "service_role_revoked", "R5_8_7_RECORDER_GRANTS_INVALID")
        + expect(o, "unchanged", md5=MANAGED_MD5, owner="postgres", secdef=True, config=['search_path=""'],
                 service_role=True, anon=False))

    managed_history = ("ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS created_by text; "
                       "INSERT INTO supabase_migrations.schema_migrations (version, created_by) "
                       "VALUES ('29991231000000', 'apikey@lovable.dev')")
    scenario("rollbacks_refuse_on_a_managed_database", f"""
INSERT INTO probe_result SELECT 'before', pg_temp.catalog();
INSERT INTO probe_result SELECT 'r587_rollback', pg_temp.drift($a${managed_history}$a$, {literal(ROLLBACK)});
INSERT INTO probe_result SELECT 'r588_rollback', pg_temp.drift($a${managed_history}$a$, {literal(ROLLBACK_R588)});
INSERT INTO probe_result SELECT 'after', pg_temp.catalog();
INSERT INTO probe_result SELECT 'recorder', pg_temp.recorder();
""", lambda o: failed(o, "r587_rollback", "R5_8_7_ROLLBACK_REFUSED_ON_MANAGED_DATABASE")
        + failed(o, "r588_rollback", "R5_8_8_ROLLBACK_REFUSED_ON_MANAGED_DATABASE")
        + ([] if o.get("before") == o.get("after") else ["data or objects changed"])
        + expect(o, "recorder", md5=MANAGED_MD5))

    # ----- R5.8.8 (D3 option a): deployment-scoped uniqueness
    scenario("r588_reset_build_has_no_deployment_uniqueness_and_keeps_replay_controls", """
INSERT INTO probe_result SELECT 'controls', pg_temp.controls();
""", lambda o: expect(o, "controls", deployment_index=False, provenance_digest_key=True,
                     nonce_pkey=True, nonce_digest_key=True))

    scenario("r588_absent_index_rerun_changes_no_data_or_object", f"""
INSERT INTO probe_result SELECT 'a', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'b', pg_temp.attest('probe-b', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'before', pg_temp.catalog();
INSERT INTO probe_result SELECT 'migration', {MIGRATE_R588};
INSERT INTO probe_result SELECT 'after', pg_temp.catalog();
""", lambda o: expect(o, "a", ok=True) + expect(o, "b", ok=True) + expect(o, "migration", ok=True)
        + ([] if o.get("before") == o.get("after") else ["catalog or data changed by a no-op run"])
        + ([] if ((o.get("before") or {}).get("provenance") or {}).get("rows") == 2 else ["expected 2 provenance rows"]))

    scenario("r588_drops_index_with_expected_definition_only", f"""
INSERT INTO probe_result SELECT 'before', pg_temp.catalog();
INSERT INTO probe_result SELECT 'create', pg_temp.run('{ORIGINAL_INDEX}');
INSERT INTO probe_result SELECT 'controls_before', pg_temp.controls();
INSERT INTO probe_result SELECT 'migration', {MIGRATE_R588};
INSERT INTO probe_result SELECT 'controls_after', pg_temp.controls();
INSERT INTO probe_result SELECT 'after', pg_temp.catalog();
""", lambda o: expect(o, "create", ok=True) + expect(o, "controls_before", deployment_index=True)
        + expect(o, "migration", ok=True)
        + expect(o, "controls_after", deployment_index=False, provenance_digest_key=True, nonce_pkey=True, nonce_digest_key=True)
        + [f"{k} changed" for k in ("object_set", "constraints", "functions", "provenance", "nonces")
           if (o.get("before") or {}).get(k) != (o.get("after") or {}).get(k)])

    scenario("r588_unexpected_index_definition_fails_closed", f"""
INSERT INTO probe_result SELECT 'create', pg_temp.run('CREATE UNIQUE INDEX {INDEX} ON public.parser_runtime_provenance (deployment_id)');
INSERT INTO probe_result SELECT 'migration', {MIGRATE_R588};
INSERT INTO probe_result SELECT 'controls', pg_temp.controls();
""", lambda o: expect(o, "create", ok=True) + failed(o, "migration", "R5_8_8_UNEXPECTED_INDEX_DEFINITION")
        + expect(o, "controls", deployment_index=True))

    scenario("r588_other_deployment_uniqueness_fails_closed", f"""
INSERT INTO probe_result SELECT 'create', pg_temp.run('CREATE UNIQUE INDEX probe_other_deployment_key ON public.parser_runtime_provenance (build_revision, semantic_revision, deployment_commit, deployment_id, railway_environment_id, railway_service_id, railway_project_id)');
INSERT INTO probe_result SELECT 'migration', {MIGRATE_R588};
""", lambda o: expect(o, "create", ok=True) + failed(o, "migration", "R5_8_8_UNEXPECTED_DEPLOYMENT_UNIQUENESS"))

    scenario("r588_missing_digest_key_fails_closed", f"""
ALTER TABLE public.parser_runtime_provenance DROP CONSTRAINT parser_runtime_provenance_attestation_digest_key;
INSERT INTO probe_result SELECT 'migration', {MIGRATE_R588};
""", lambda o: failed(o, "migration", "R5_8_8_REPLAY_CONTROLS_MISSING"))

    scenario("r588_missing_nonce_controls_fail_closed", f"""
INSERT INTO probe_result SELECT 'nonce_pkey', pg_temp.drift($a$ALTER TABLE public.parser_attestation_nonces DROP CONSTRAINT parser_attestation_nonces_pkey$a$, {literal(MIGRATION_R588)});
INSERT INTO probe_result SELECT 'nonce_digest', pg_temp.drift($a$ALTER TABLE public.parser_attestation_nonces DROP CONSTRAINT parser_attestation_nonces_attestation_digest_key$a$, {literal(MIGRATION_R588)});
INSERT INTO probe_result SELECT 'controls', pg_temp.controls();
""", lambda o: failed(o, "nonce_pkey", "R5_8_8_REPLAY_CONTROLS_MISSING")
        + failed(o, "nonce_digest", "R5_8_8_REPLAY_CONTROLS_MISSING")
        + expect(o, "controls", nonce_pkey=True, nonce_digest_key=True, provenance_digest_key=True))

    scenario("r588_constraint_backed_index_fails_closed", f"""
INSERT INTO probe_result SELECT 'case', pg_temp.drift($a${ORIGINAL_INDEX}; ALTER TABLE public.parser_runtime_provenance ADD CONSTRAINT {INDEX} UNIQUE USING INDEX {INDEX}$a$, {literal(MIGRATION_R588)});
""", lambda o: failed(o, "case", "R5_8_8_UNEXPECTED_INDEX_DEFINITION"))

    # ----- controls after both migrations
    scenario("two_distinct_attestations_of_one_deployment_coexist", f"""
INSERT INTO probe_result SELECT 'a', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'b', pg_temp.attest('probe-b', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'verified_rows', {DEPLOYMENT_ROWS};
""", lambda o: expect(o, "a", ok=True) + expect(o, "b", ok=True)
        + ([] if o.get("verified_rows") == 2 else [f"verified_rows={o.get('verified_rows')} expected 2"]))

    scenario("replay_reused_nonce_and_duplicate_digest_rejected", f"""
INSERT INTO probe_result SELECT 'a', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'replay', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'stale_reuse_of_nonce', pg_temp.run($q$INSERT INTO public.parser_attestation_nonces
  (nonce, attestation_digest, workflow_run_id, workflow_run_attempt, attested_at, expires_at)
  SELECT nonce, repeat('e', 64), 'probe-reuse', '1', attested_at, expires_at FROM public.parser_attestation_nonces LIMIT 1$q$);
INSERT INTO probe_result SELECT 'nonce_digest', pg_temp.run($q$INSERT INTO public.parser_attestation_nonces
  (nonce, attestation_digest, workflow_run_id, workflow_run_attempt, attested_at, expires_at)
  SELECT repeat('f', 64), attestation_digest, 'probe-reuse', '1', attested_at, expires_at FROM public.parser_attestation_nonces LIMIT 1$q$);
INSERT INTO probe_result SELECT 'provenance_digest', pg_temp.run($q$INSERT INTO public.parser_runtime_provenance
  SELECT (jsonb_populate_record(NULL::public.parser_runtime_provenance, to_jsonb(p) || jsonb_build_object('id', gen_random_uuid()))).*
  FROM public.parser_runtime_provenance p LIMIT 1$q$);
INSERT INTO probe_result SELECT 'rows', {DEPLOYMENT_ROWS};
""", lambda o: expect(o, "a", ok=True)
        + expect(o, "replay", ok=False, sqlstate="23505", constraint="parser_attestation_nonces_pkey")
        + expect(o, "stale_reuse_of_nonce", ok=False, sqlstate="23505")
        + expect(o, "nonce_digest", ok=False, sqlstate="23505")
        + expect(o, "provenance_digest", ok=False, sqlstate="23505")
        + [m for m in (str((o.get("nonce_digest") or {}).get("message", "")),) if "attestation_digest_key" not in m]
        + [m for m in (str((o.get("provenance_digest") or {}).get("message", "")),)
           if "parser_runtime_provenance_attestation_digest_key" not in m]
        + ([] if o.get("rows") == 1 else [f"rows={o.get('rows')} expected 1"]))

    scenario("invalid_attestations_rejected_by_their_controls", f"""
INSERT INTO probe_result SELECT 'signature', pg_temp.attest('probe-s', '{MANAGED_BLOB}', 'signature');
INSERT INTO probe_result SELECT 'digest', pg_temp.attest('probe-d', '{MANAGED_BLOB}', 'digest');
INSERT INTO probe_result SELECT 'stale', pg_temp.attest('probe-t', '{MANAGED_BLOB}', 'stale');
INSERT INTO probe_result SELECT 'deployment', pg_temp.attest('probe-p', '{MANAGED_BLOB}', 'deployment');
INSERT INTO probe_result SELECT 'old_blob', pg_temp.attest('probe-h', '{REPOSITORY_BLOB}');
INSERT INTO probe_result SELECT 'no_key', pg_temp.attest('probe-k', '{MANAGED_BLOB}', 'nosecret');
INSERT INTO probe_result SELECT 'rows', to_jsonb((SELECT count(*) FROM public.parser_runtime_provenance));
""", lambda o: expect(o, "signature", ok=False, message="PARSER_ATTESTATION_SIGNATURE_INVALID")
        + expect(o, "digest", ok=False, message="PARSER_ATTESTATION_DIGEST_MISMATCH")
        + expect(o, "stale", ok=False, message="PARSER_ATTESTATION_FRESHNESS_INVALID")
        + expect(o, "deployment", ok=False, message="PARSER_ATTESTATION_BINDING_INVALID")
        + expect(o, "old_blob", ok=False, message="PARSER_ATTESTATION_CRITICAL_HASH_MISMATCH")
        + expect(o, "no_key", ok=False, message="PARSER_ATTESTATION_SECRET_NOT_CONFIGURED")
        + ([] if o.get("rows") == 0 else [f"rows={o.get('rows')} expected 0"]))

    scenario("r588_rollback_never_deletes_attestations", f"""
INSERT INTO probe_result SELECT 'a', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'b', pg_temp.attest('probe-b', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'before', pg_temp.catalog();
INSERT INTO probe_result SELECT 'rollback_over_two', {ROLL_BACK_R588};
INSERT INTO probe_result SELECT 'after', pg_temp.catalog();
INSERT INTO probe_result SELECT 'controls', pg_temp.controls();
""", lambda o: expect(o, "a", ok=True) + expect(o, "b", ok=True)
        + failed(o, "rollback_over_two", "R5_8_8_ROLLBACK_WOULD_REQUIRE_DELETING_ATTESTATIONS")
        + ([] if o.get("before") == o.get("after") else ["rollback changed data or objects"])
        + expect(o, "controls", deployment_index=False))

    scenario("r588_rollback_and_reapply_on_a_single_attestation", f"""
INSERT INTO probe_result SELECT 'a', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'rollback', {ROLL_BACK_R588};
INSERT INTO probe_result SELECT 'restored', pg_temp.controls();
INSERT INTO probe_result SELECT 'b_with_index', pg_temp.attest('probe-b', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'migration', {MIGRATE_R588};
INSERT INTO probe_result SELECT 'b_without_index', pg_temp.attest('probe-b2', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'rows', {DEPLOYMENT_ROWS};
""", lambda o: expect(o, "a", ok=True) + expect(o, "rollback", ok=True) + expect(o, "restored", deployment_index=True)
        + expect(o, "b_with_index", ok=False, sqlstate="23505", constraint=INDEX)
        + expect(o, "migration", ok=True) + expect(o, "b_without_index", ok=True)
        + ([] if o.get("rows") == 2 else [f"rows={o.get('rows')} expected 2"]))

    ok = all(item["status"] == "PASS" for item in RESULTS)
    print(json.dumps({
        "probe": "ATTESTATION_RECORDER_RECONCILIATION",
        "status": "PASS" if ok else "FAIL",
        "database": "LOCAL_DISPOSABLE_ONLY",
        "synthetic_fixture_only": True,
        "transactions": "ROLLED_BACK",
        "admits_real_data": False,
        "scenarios": RESULTS,
    }, indent=1, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
