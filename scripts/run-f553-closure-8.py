#!/usr/bin/env python3
"""Fail-closed verification against an explicitly local, disposable Supabase stack.

Run only after `supabase start`. Never accepts a remote database URL or reads
production connection settings. All mandatory gates require executed evidence.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/release-gates/f553-full-schema-install.json'
DECISION_OUT = ROOT / 'docs/release-gates/f553-closure-8-final.json'
MIGRATIONS = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
MANDATORY = ('pgmq', 'postgrest', 'storage', 'finished', 'ack_loss', 'fresh_worker',
             'failed', 'aborted', 'queue_idempotency', 'hot_raw_identity',
             'raw_integrity', 'parser_exactly_once', 'race_matrix',
             'failure_matrix', 'docker', 'browser', 'parser_tests', 'final_ci')


def run(*args):
    # No inherited PG* credentials or remote database environment in children.
    env = {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG') if key in os.environ}
    return subprocess.run(args, cwd=ROOT, env=env, capture_output=True,
                          text=True, timeout=600, check=False)


def local_url(value, allowed_ports):
    parsed = urlsplit(value)
    return (parsed.hostname in ('127.0.0.1', 'localhost')
            and parsed.port in allowed_ports and not parsed.fragment)


def query(db_url, sql):
    # Keep credentials out of the process argv; psql gets local URL via PG* env.
    parsed = urlsplit(db_url)
    env = {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG') if key in os.environ}
    env.update(PGHOST=parsed.hostname, PGPORT=str(parsed.port),
               PGUSER=parsed.username or 'postgres', PGPASSWORD=parsed.password or '',
               PGDATABASE=parsed.path.lstrip('/') or 'postgres', PGSSLMODE='disable',
               PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000')
    proc = subprocess.run(['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
                           '-c', sql], cwd=ROOT, env=env, capture_output=True,
                          text=True, timeout=30, check=False)
    if proc.returncode:
        detail = next((line[:300] for line in proc.stderr.splitlines() if line.strip()), 'unknown psql error')
        raise RuntimeError(f'Local database catalog query failed: {detail}')
    return proc.stdout.strip()


def local_queue_probe(db_url):
    """Exercise real disposable pgmq; never connects outside loopback."""
    if not local_url(db_url, {54322}):
        raise RuntimeError('Refused non-local queue endpoint')
    parsed = urlsplit(db_url)
    env = {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG') if key in os.environ}
    env.update(PGHOST=parsed.hostname, PGPORT=str(parsed.port),
               PGUSER=parsed.username or 'postgres', PGPASSWORD=parsed.password or '',
               PGDATABASE=parsed.path.lstrip('/') or 'postgres', PGSSLMODE='disable',
               PGOPTIONS='-c statement_timeout=15000')
    queue = 'f553_' + uuid4().hex
    def sql(statement):
        proc = subprocess.run(['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement],
                              cwd=ROOT, env=env, capture_output=True, text=True, timeout=30)
        if proc.returncode:
            raise RuntimeError('Disposable queue operation failed: ' +
                               next((line[:220] for line in proc.stderr.splitlines() if 'ERROR:' in line),
                                    'unknown database error'))
        return proc.stdout.strip()
    created = False
    try:
        sql(f"SELECT pgmq.create('{queue}');")
        created = True
        message_id = sql(f"SELECT pgmq.send('{queue}', '{{\"fixture\":\"SYNTHETIC_INTEGRATION_FIXTURE\"}}'::jsonb);")
        if not message_id.isdigit():
            raise RuntimeError('Queue did not return a message ID')
        first = sql(f"SELECT msg_id FROM pgmq.read('{queue}', 1, 1);")
        hidden = sql(f"SELECT msg_id FROM pgmq.read('{queue}', 1, 1);")
        time.sleep(2)
        reappeared = sql(f"SELECT msg_id FROM pgmq.read('{queue}', 1, 1);")
        archived = sql(f"SELECT pgmq.archive('{queue}', {message_id});")
        time.sleep(2)
        after_ack = sql(f"SELECT msg_id FROM pgmq.read('{queue}', 1, 1);")
        if (first, hidden, reappeared, archived, after_ack) != (message_id, '', message_id, 't', ''):
            raise RuntimeError('Disposable queue visibility or ACK invariant failed')
        return {'result': 'PASS_DISPOSABLE_QUEUE_ONLY', 'message_id': message_id,
                'visibility_hidden': True, 'reappeared': True, 'archive_ack': True,
                'absent_after_ack': True}
    finally:
        if created:
            sql(f"SELECT pgmq.drop_queue('{queue}');")


def http_health(url, key, path):
    request = urllib.request.Request(url.rstrip('/') + path,
                                     headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return {'http_status': response.status, 'reachable': response.status < 400}
    except urllib.error.HTTPError as exc:
        return {'http_status': exc.code, 'reachable': False}
    except urllib.error.URLError:
        return {'http_status': None, 'reachable': False}


def executed_count(name, *, run_id, started_at):
    """Reject stale or duplicated matrix entries; never infer a gate from case count."""
    path = ROOT / f'docs/release-gates/f553-{name}-matrix.json'
    if not path.exists():
        return 0
    try:
        value = json.loads(path.read_text())
        if (not isinstance(value, dict) or value.get('run_id') != run_id
                or value.get('commit_sha') != os.environ.get('GITHUB_SHA')
                or value.get('workflow_run_id') != os.environ.get('GITHUB_RUN_ID')):
            return 0
        cases = value['cases']
        if not isinstance(cases, list) or len(cases) < 50:
            return 0
        identities = set()
        for case in cases:
            identity = (case['case_id'], case['fixture_id'], case['category'], case['operation'])
            if identity in identities or not all(isinstance(part, str) and part for part in identity):
                return 0
            identities.add(identity)
            if (case.get('executed') is not True or case.get('result') != 'PASS'
                    or not case.get('evidence') or not case.get('before_digest')
                    or not case.get('after_digest') or case.get('run_id') != run_id
                    or case.get('commit_sha') != os.environ.get('GITHUB_SHA')
                    or case.get('workflow_run_id') != os.environ.get('GITHUB_RUN_ID')
                    or not isinstance(case.get('timestamp'), (int, float))
                    or case['timestamp'] < started_at):
                return 0
        return len(identities)
    except (ValueError, KeyError, TypeError, OSError):
        return 0


def main():
    started_at = float(os.environ.get('F553_STARTED_AT', time.time()))
    run_id = os.environ.get('F553_RUN_ID') or uuid4().hex
    commit_sha = os.environ.get('GITHUB_SHA')
    workflow_run_id = os.environ.get('GITHUB_RUN_ID')
    evidence = dict(phase='F.5.3-CLOSURE.8-R10', evidence_version=10, result='BLOCKED',
                    final_decision='BLOCKED', environment='local_disposable_supabase',
                    run_id=run_id, started_at=started_at,
                    commit_sha=commit_sha, workflow_run_id=workflow_run_id,
                     workflow=os.environ.get('GITHUB_WORKFLOW'), job=os.environ.get('GITHUB_JOB'),
                     ref=os.environ.get('GITHUB_REF'), workflow_conclusion='NOT_PROVEN',
                    supabase_cli_version=None, postgres_version=None,
                     migration_count=len(MIGRATIONS), applied_versions=[],
                     missing_versions=[], extra_versions=[], duplicate_versions=[],
                    failed_migration=None, failed_migration_line=None, error=None,
                    schema_digest=None, auth='NOT_PROVEN', storage='NOT_PROVEN',
                     postgrest='NOT_PROVEN', pgmq='NOT_PROVEN', pgmq_execution='NOT_PROVEN', cluster_destroyed=False,
                    plain_postgres_probe='FAIL_NOT_FULL_STACK',
                    full_supabase_install='NOT_PROVEN',
                    race_cases_executed=0,
                    failure_cases_executed=0,
                    mandatory_gates={gate: 'NOT_PROVEN' for gate in MANDATORY})
    try:
        integration_path = ROOT / 'docs/release-gates/f553-integration-evidence.json'
        if integration_path.exists():
            observed = json.loads(integration_path.read_text())
            if (observed.get('phase') == evidence['phase']
                    and observed.get('evidence_version') == evidence['evidence_version']
                    and observed.get('run_id') == run_id and observed.get('commit_sha') == commit_sha
                    and observed.get('workflow_run_id') == workflow_run_id
                    and observed.get('started_at') == started_at
                     and observed.get('workflow') == os.environ.get('GITHUB_WORKFLOW')
                     and observed.get('job') == os.environ.get('GITHUB_JOB')
                    and observed.get('ref') == os.environ.get('GITHUB_REF')
                    and isinstance(observed.get('finished_at'), (int, float))
                    and observed['finished_at'] >= started_at
                     and observed.get('result') == 'PASS_DISPOSABLE_PARTIAL_LIFECYCLE_ONLY'):
                evidence['disposable_queue_recovery'] = observed
                contract = observed.get('finished_contract', {})
                if (contract.get('result') == 'PASS_DISPOSABLE_TERMINALIZATION_CONTRACT_ONLY'
                        and contract.get('disposable_fixture') is True
                        and contract.get('canonical_admission') is False
                        and contract.get('raw_committed') is False
                        and contract.get('hot_persisted') is False
                        and contract.get('queue_ack_proven') is False):
                    evidence['disposable_terminalization_contract'] = 'PASS_CONTRACT_ONLY_NOT_FINISHED_GATE'
                failed = observed.get('failed_job', {})
                cancelled = observed.get('cancelled_job', {})
                if (observed.get('archived_count') == 1
                        and observed.get('parser_stub_invocation_count') == 1
                        and failed.get('status') == 'failed' and failed.get('archive_count') == 1
                        and cancelled.get('status') == 'cancelled' and cancelled.get('archive_count') == 1
                        and failed.get('postgrest_status') == 200
                    and cancelled.get('postgrest_status') == 200):
                    # Partial terminal paths do not establish the integrated
                    # FAILED gate; cancellation is not an ABORTED execution proof.
                    # lease is revoked before the worker can observe it.
                    evidence['partial_lifecycle'] = 'PASS_FAILED_AND_CANCELLED_ONLY'
            else:
                evidence['disposable_queue_recovery'] = 'INVALID_OR_STALE'
        version = run('supabase', '--version')
        if version.returncode:
            raise RuntimeError('Supabase CLI not available for local disposable verification')
        evidence['supabase_cli_version'] = version.stdout.strip()
        status = run('supabase', 'status', '-o', 'json')
        if status.returncode:
            raise RuntimeError('Local disposable stack not running; full-stack reset was not executed')
        stack = json.loads(status.stdout)
        db_url = stack.get('DB_URL', '')
        api_url = stack.get('API_URL', '')
        key = stack.get('SERVICE_ROLE_KEY', '')
        # Hard refusal: no cloud hosts, arbitrary forwarded endpoints or remote DBs.
        if not (local_url(db_url, {54322}) and local_url(api_url, {54321}) and key):
            raise RuntimeError('Refused: stack does not expose expected loopback-only local endpoints')
        reset = run('supabase', 'db', 'reset', '--local') if os.environ.get('F553_CLEAN_RESET_COMPLETED') != '1' else None
        if reset is not None and reset.returncode:
            evidence['result'] = evidence['full_supabase_install'] = 'FAIL'
            # CLI output can include local connection credentials: retain only
            # the bounded migration error, never persist the full command log.
            lines = (reset.stderr + '\n' + reset.stdout).splitlines()
            evidence['error'] = next((line[:300] for line in reversed(lines)
                                      if 'ERROR:' in line or 'Error:' in line),
                                     'Local clean migration reset failed')
            matches = re.findall(r'Applying migration (\S+\.sql)', reset.stdout + reset.stderr)
            if matches:
                evidence['failed_migration'] = matches[-1]
            line_match = re.search(r'(?:^|\n)(?:ERROR:|Error:).*?(?:line|LINE)\s+(\d+)', reset.stderr + '\n' + reset.stdout)
            if line_match:
                evidence['failed_migration_line'] = int(line_match.group(1))
            raise RuntimeError('Local clean migration reset failed')
        evidence['postgres_version'] = query(db_url, 'SHOW server_version;')
        evidence['auth'] = 'PASS' if query(db_url, "SELECT to_regclass('auth.users') IS NOT NULL;") == 't' else 'FAIL'
        evidence['storage'] = 'PASS_SERVICE_PRESENT' if query(db_url, "SELECT to_regclass('storage.objects') IS NOT NULL;") == 't' else 'FAIL'
        evidence['pgmq'] = 'PASS_EXTENSION_PRESENT' if query(db_url, "SELECT count(*) FROM pg_extension WHERE extname='pgmq';") == '1' else 'FAIL'
        if evidence['pgmq'] == 'PASS_EXTENSION_PRESENT':
            evidence['pgmq_execution'] = local_queue_probe(db_url)
        evidence['postgrest'] = http_health(api_url, key, '/rest/v1/')
        storage_http = http_health(api_url, key, '/storage/v1/bucket')
        evidence['storage_http'] = storage_http
        versions = query(db_url, 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;').splitlines()
        evidence['applied_versions'] = versions
        expected = [re.match(r'^(\d+)', file.name).group(1) for file in MIGRATIONS]
        evidence['duplicate_versions'] = sorted({version for version in expected if expected.count(version) > 1})
        evidence['missing_versions'] = sorted(set(expected) - set(versions))
        evidence['extra_versions'] = sorted(set(versions) - set(expected))
        if evidence['duplicate_versions'] or evidence['missing_versions'] or evidence['extra_versions'] or versions != expected:
            evidence['failed_migration'] = next((file.name for file, version in zip(MIGRATIONS, expected)
                                                  if version in evidence['missing_versions']), None)
            evidence['result'] = evidence['full_supabase_install'] = 'FAIL'
            raise RuntimeError('Local applied migration history differs from ordered source migration history')
        catalog = query(db_url, "SELECT coalesce(string_agg(n.nspname||'.'||c.relname||':'||c.relkind::text, E'\\n' ORDER BY n.nspname,c.relname), '') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage','pgmq');")
        evidence['schema_digest'] = hashlib.sha256(catalog.encode()).hexdigest()
        evidence['full_supabase_install'] = ('PASS' if evidence['auth'] == 'PASS'
                                              and evidence['storage'] == 'PASS_SERVICE_PRESENT'
                                              and evidence['pgmq'] == 'PASS_EXTENSION_PRESENT'
                                              and evidence['postgrest']['reachable']
                                              and storage_http['reachable'] else 'FAIL')
        # Queue visibility and service presence do not establish the integrated gate.
        # Installation alone is not an integrated lifecycle/CI proof.
        # Evidence files must be generated by independently executed scenarios.
        evidence['race_cases_executed'] = executed_count('race', run_id=run_id, started_at=started_at)
        evidence['failure_cases_executed'] = executed_count('failure', run_id=run_id, started_at=started_at)
        # Counts alone cannot establish matrix provenance or case execution.
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        if evidence['error'] is None:
            evidence['error'] = str(exc)[:500]
    finally:
        evidence['finished_at'] = time.time()
        OUT.write_text(json.dumps(evidence, indent=2) + '\n')
        blocked = [gate for gate, result in evidence['mandatory_gates'].items() if result != 'PASS']
        # An in-progress workflow cannot certify its own conclusion: final_ci
        # must come from independently observed GitHub evidence after completion.
        # Keep this verifier blocked even if all in-job gates pass; external
        # attestation of the finished run is a separate prerequisite.
        decision = {key: evidence[key] for key in ('phase', 'final_decision', 'run_id',
                    'started_at', 'finished_at', 'commit_sha', 'workflow_run_id',
                    'workflow_conclusion', 'full_supabase_install', 'migration_count',
                    'applied_versions', 'schema_digest', 'race_cases_executed',
                    'failure_cases_executed', 'mandatory_gates', 'error')}
        decision.update(railway='LOCKED', real_dem='LOCKED', attempt_9='LOCKED',
                        canonical='LOCKED', realDemAuthorized=False,
                         canonicalAuthorized=False, railwayAuthorized=False,
                         productionWrites=False, blocked_gates=blocked,
                          blockers=[{'BLOCKER_CODE': 'F553_R10_INTEGRATED_CI_PROOF_INCOMPLETE',
                                   'COMMAND': 'python3 scripts/run-f553-closure-8.py',
                                   'ACTUAL_OUTPUT': evidence['error'] or 'No verified final CI conclusion or integrated gate evidence',
                                   'FILE': 'scripts/run-f553-closure-8.py',
                                   'LINE': 173,
                                   'MISSING_PROOF': ', '.join(blocked),
                                    'NEXT_ACTION': 'Execute and verify all full-stack lifecycle, matrix, Docker, browser, and parser gates in GitHub Actions on the exact commit.'}])
        DECISION_OUT.write_text(json.dumps(decision, indent=2) + '\n')
        print(json.dumps({key: evidence[key] for key in ('result', 'full_supabase_install',
                         'migration_count', 'failed_migration', 'error',
                         'race_cases_executed', 'failure_cases_executed')}))
    return 0 if evidence['final_decision'] == 'CLOSED' else 1


if __name__ == '__main__':
    raise SystemExit(main())
