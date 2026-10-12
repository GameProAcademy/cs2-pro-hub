#!/usr/bin/env python3
"""Probe of migration R5.8.7 and of provenance uniqueness, on a DISPOSABLE database.

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
- with parser_runtime_provenance_deployment_identity_idx (repository builds) a
  second, distinct attestation for the same deployment is rejected, while the
  same attestation without the index (as on the managed database) is accepted;
- an exact replay is rejected in both cases (nonce primary key);
- restoring the index over two attestations of one deployment fails.
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
MANAGED_MD5 = "fe3250af2b461f03f459adf36b43ec21"
REPOSITORY_MD5 = "5ea1ffff4fc874ca50f0081b9c9a5e71"
MANAGED_BLOB = "50a53b607d26f00b4de05c5e8998611959e27bd1"
REPOSITORY_BLOB = "dfc2e67fcb3644be91108079f9096947c16119b3"
INDEX = "parser_runtime_provenance_deployment_identity_idx"
RESULTS: list[dict] = []

PRELUDE = r"""
\set ON_ERROR_STOP 1
BEGIN;
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
CREATE FUNCTION pg_temp.attest(_run text, _worker_blob text) RETURNS jsonb LANGUAGE plpgsql AS $f$
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
  _canonical := _payload::text;
  _digest := encode(extensions.digest(convert_to(_canonical, 'UTF8'), 'sha256'), 'hex');
  _signature := encode(extensions.hmac(convert_to(_canonical, 'UTF8'),
    convert_to(current_setting('app.settings.parser_attestation_hmac_secret'), 'UTF8'), 'sha256'), 'hex');
  BEGIN
    _id := public.record_parser_runtime_attestation(_canonical, _payload, _digest, _signature,
      _payload -> 'release_gate_evidence', _at, _nonce);
    RETURN jsonb_build_object('ok', true, 'digest', _digest);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE, _message = MESSAGE_TEXT, _constraint = CONSTRAINT_NAME;
    RETURN jsonb_build_object('ok', false, 'sqlstate', _state, 'message', _message, 'constraint', _constraint);
  END;
END $f$;
"""
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


MIGRATE = f"pg_temp.run({literal(MIGRATION)})" if MIGRATION.exists() else "NULL"
ROLL_BACK = f"pg_temp.run({literal(ROLLBACK)})" if ROLLBACK.exists() else "NULL"


def main() -> int:
    refuse_non_local()

    scenario("reset_build_has_managed_definition_and_properties", """
INSERT INTO probe_result SELECT 'recorder', pg_temp.recorder();
""", lambda o: expect(o, "recorder", md5=MANAGED_MD5, owner="postgres", secdef=True,
                     config=['search_path=""'], service_role=True, anon=False, authenticated=False))

    scenario("rerun_is_a_no_op", f"""
INSERT INTO probe_result SELECT 'before', pg_temp.recorder();
INSERT INTO probe_result SELECT 'migration', {MIGRATE};
INSERT INTO probe_result SELECT 'after', pg_temp.recorder();
""", lambda o: expect(o, "migration", ok=True) + expect(o, "after", md5=MANAGED_MD5, xmin=(o.get("before") or {}).get("xmin")))

    scenario("unexpected_definition_fails_closed_and_changes_nothing", f"""
DO $d$ BEGIN EXECUTE replace(pg_get_functiondef('public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure),
  'PARSER_ATTESTATION_INVALID_INPUT', 'PARSER_ATTESTATION_INVALID_INPUT_PROBE'); END $d$;
INSERT INTO probe_result SELECT 'diverged', pg_temp.recorder();
INSERT INTO probe_result SELECT 'migration', {MIGRATE};
INSERT INTO probe_result SELECT 'after', pg_temp.recorder();
""", lambda o: expect(o, "migration", ok=False, sqlstate="55000")
        + ([] if str((o.get("migration") or {}).get("message", "")).startswith("R5_8_7_RECORDER_UNEXPECTED_DEFINITION")
           else ["migration message is not R5_8_7_RECORDER_UNEXPECTED_DEFINITION"])
        + expect(o, "after", md5=(o.get("diverged") or {}).get("md5"), xmin=(o.get("diverged") or {}).get("xmin")))

    scenario("changed_grant_fails_closed", f"""
GRANT EXECUTE ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) TO anon;
INSERT INTO probe_result SELECT 'migration', {MIGRATE};
""", lambda o: expect(o, "migration", ok=False, sqlstate="55000"))

    scenario("rollback_restores_repository_definition_and_migration_reapplies", f"""
INSERT INTO probe_result SELECT 'rollback', {ROLL_BACK};
INSERT INTO probe_result SELECT 'rolled_back', pg_temp.recorder();
INSERT INTO probe_result SELECT 'managed_blob_on_old_definition', pg_temp.attest('probe-rollback-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'old_blob_on_old_definition', pg_temp.attest('probe-rollback-b', '{REPOSITORY_BLOB}');
INSERT INTO probe_result SELECT 'migration', {MIGRATE};
INSERT INTO probe_result SELECT 'reapplied', pg_temp.recorder();
""", lambda o: expect(o, "rollback", ok=True) + expect(o, "rolled_back", md5=REPOSITORY_MD5)
        + expect(o, "managed_blob_on_old_definition", ok=False, message="PARSER_ATTESTATION_CRITICAL_HASH_MISMATCH")
        + expect(o, "old_blob_on_old_definition", ok=True)
        + expect(o, "migration", ok=True)
        + expect(o, "reapplied", md5=MANAGED_MD5, owner="postgres", secdef=True,
                 service_role=True, anon=False, authenticated=False))

    scenario("managed_blob_accepted_old_blob_rejected", f"""
INSERT INTO probe_result SELECT 'managed_blob', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'old_blob', pg_temp.attest('probe-x', '{REPOSITORY_BLOB}');
""", lambda o: expect(o, "managed_blob", ok=True)
        + expect(o, "old_blob", ok=False, message="PARSER_ATTESTATION_CRITICAL_HASH_MISMATCH"))

    scenario("with_deployment_index_second_attestation_rejected_replay_rejected", f"""
INSERT INTO probe_result SELECT 'index_present', to_jsonb(to_regclass('public.{INDEX}') IS NOT NULL);
INSERT INTO probe_result SELECT 'first', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'replay', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'second', pg_temp.attest('probe-b', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'rows', to_jsonb((SELECT count(*) FROM public.parser_runtime_provenance
  WHERE deployment_id = '1b5778de-3eaf-46f1-9ea5-cba381d95313'));
""", lambda o: ([] if o.get("index_present") is True else ["index absent on a repository build"])
        + expect(o, "first", ok=True)
        + expect(o, "replay", ok=False, sqlstate="23505", constraint="parser_attestation_nonces_pkey")
        + expect(o, "second", ok=False, sqlstate="23505", constraint=INDEX)
        + ([] if o.get("rows") == 1 else [f"rows={o.get('rows')} expected 1"]))

    scenario("without_deployment_index_second_attestation_accepted", f"""
DROP INDEX public.{INDEX};
INSERT INTO probe_result SELECT 'first', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'second', pg_temp.attest('probe-b', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'replay', pg_temp.attest('probe-a', '{MANAGED_BLOB}');
INSERT INTO probe_result SELECT 'rows', to_jsonb((SELECT count(*) FROM public.parser_runtime_provenance
  WHERE deployment_id = '1b5778de-3eaf-46f1-9ea5-cba381d95313'));
INSERT INTO probe_result SELECT 'restore_index', pg_temp.run('CREATE UNIQUE INDEX {INDEX} ON public.parser_runtime_provenance (railway_project_id, railway_service_id, railway_environment_id, deployment_id, deployment_commit, semantic_revision, build_revision)');
""", lambda o: expect(o, "first", ok=True) + expect(o, "second", ok=True)
        + expect(o, "replay", ok=False, sqlstate="23505", constraint="parser_attestation_nonces_pkey")
        + ([] if o.get("rows") == 2 else [f"rows={o.get('rows')} expected 2"])
        + expect(o, "restore_index", ok=False, sqlstate="23505"))

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
