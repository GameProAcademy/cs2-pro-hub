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
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/release-gates/f553-full-schema-install.json'
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
               PGDATABASE=parsed.path.lstrip('/') or 'postgres',
               PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000')
    proc = subprocess.run(['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
                           '-c', sql], cwd=ROOT, env=env, capture_output=True,
                          text=True, timeout=30, check=False)
    if proc.returncode:
        raise RuntimeError('Local database catalog query failed')
    return proc.stdout.strip()


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


def executed_count(name):
    path = ROOT / f'docs/release-gates/f553-{name}-matrix.json'
    if not path.exists():
        return 0
    try:
        value = json.loads(path.read_text())
        cases = value if isinstance(value, list) else value['cases']
        return sum(case.get('executed') is True and case.get('result') == 'PASS'
                   and bool(case.get('evidence')) for case in cases)
    except (ValueError, KeyError, TypeError):
        return 0


def main():
    evidence = dict(result='NOT_PROVEN', environment='local_disposable_supabase',
                    supabase_cli_version=None, postgres_version=None,
                    migration_count=len(MIGRATIONS), applied_versions=[],
                    failed_migration=None, failed_migration_line=None, error=None,
                    schema_digest=None, auth='NOT_PROVEN', storage='NOT_PROVEN',
                    postgrest='NOT_PROVEN', pgmq='NOT_PROVEN', cluster_destroyed=False,
                    plain_postgres_probe='FAIL_NOT_FULL_STACK',
                    full_supabase_install='NOT_PROVEN',
                    race_cases_executed=executed_count('race'),
                    failure_cases_executed=executed_count('failure'),
                    mandatory_gates={gate: 'NOT_PROVEN' for gate in MANDATORY})
    try:
        version = run('supabase', '--version')
        if version.returncode:
            raise RuntimeError('Supabase CLI not available for local disposable verification')
        evidence['supabase_cli_version'] = version.stdout.strip()
        status = run('supabase', 'status', '-o', 'json')
        if status.returncode:
            raise RuntimeError('Local Supabase stack not running; start it before verification')
        stack = json.loads(status.stdout)
        db_url = stack.get('DB_URL', '')
        api_url = stack.get('API_URL', '')
        key = stack.get('SERVICE_ROLE_KEY', '')
        # Hard refusal: no cloud hosts, arbitrary forwarded endpoints or remote DBs.
        if not (local_url(db_url, {54322}) and local_url(api_url, {54321}) and key):
            raise RuntimeError('Refused: stack does not expose expected loopback-only local endpoints')
        reset = run('supabase', 'db', 'reset', '--local')
        if reset.returncode:
            evidence['result'] = evidence['full_supabase_install'] = 'FAIL'
            # CLI output can include local connection credentials: retain only
            # the bounded migration error, never persist the full command log.
            lines = (reset.stderr + '\n' + reset.stdout).splitlines()
            evidence['error'] = next((line[:300] for line in reversed(lines)
                                      if 'ERROR:' in line or 'Error:' in line),
                                     'Local clean migration reset failed')
            match = re.search(r'Applying migration (\S+\.sql)', reset.stdout + reset.stderr)
            if match:
                evidence['failed_migration'] = match.group(1)
            raise RuntimeError('Local clean migration reset failed')
        evidence['postgres_version'] = query(db_url, 'SHOW server_version;')
        evidence['auth'] = 'PASS' if query(db_url, "SELECT to_regclass('auth.users') IS NOT NULL;") == 't' else 'FAIL'
        evidence['storage'] = 'PASS_SERVICE_PRESENT' if query(db_url, "SELECT to_regclass('storage.objects') IS NOT NULL;") == 't' else 'FAIL'
        evidence['pgmq'] = 'PASS_EXTENSION_PRESENT' if query(db_url, "SELECT count(*) FROM pg_extension WHERE extname='pgmq';") == '1' else 'FAIL'
        evidence['postgrest'] = http_health(api_url, key, '/rest/v1/')
        storage_http = http_health(api_url, key, '/storage/v1/bucket')
        evidence['storage_http'] = storage_http
        versions = query(db_url, 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;').splitlines()
        evidence['applied_versions'] = versions
        expected = [re.match(r'^(\d+)', file.name).group(1) for file in MIGRATIONS]
        if len(expected) != len(set(expected)):
            raise RuntimeError('Duplicate source migration versions')
        missing = [file.name for file, version in zip(MIGRATIONS, expected) if version not in versions]
        if missing:
            evidence['failed_migration'] = missing[0]
            evidence['result'] = evidence['full_supabase_install'] = 'FAIL'
            raise RuntimeError('Local stack has unapplied source migrations')
        catalog = query(db_url, "SELECT coalesce(string_agg(n.nspname||'.'||c.relname||':'||c.relkind, E'\\n' ORDER BY n.nspname,c.relname), '') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage','pgmq');")
        evidence['schema_digest'] = hashlib.sha256(catalog.encode()).hexdigest()
        evidence['full_supabase_install'] = ('PASS' if evidence['auth'] == 'PASS'
                                              and evidence['storage'] == 'PASS_SERVICE_PRESENT'
                                              and evidence['pgmq'] == 'PASS_EXTENSION_PRESENT'
                                              and evidence['postgrest']['reachable']
                                              and storage_http['reachable'] else 'FAIL')
        evidence['result'] = evidence['full_supabase_install']
        # Installation alone is not an integrated lifecycle/CI proof.
        # Evidence files must be generated by independently executed scenarios.
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        if evidence['error'] is None:
            evidence['error'] = str(exc)[:500]
    finally:
        OUT.write_text(json.dumps(evidence, indent=2) + '\n')
        print(json.dumps({key: evidence[key] for key in ('result', 'full_supabase_install',
                         'migration_count', 'failed_migration', 'error',
                         'race_cases_executed', 'failure_cases_executed')}))
    return 0 if (evidence['full_supabase_install'] == 'PASS'
                 and evidence['race_cases_executed'] >= 50
                 and evidence['failure_cases_executed'] >= 50
                 and all(value == 'PASS' for value in evidence['mandatory_gates'].values())) else 1


if __name__ == '__main__':
    raise SystemExit(main())
