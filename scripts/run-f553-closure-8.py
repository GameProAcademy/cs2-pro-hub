#!/usr/bin/env python3
"""Fail-closed disposable clean migration probe (never connects to production).

This probe is NOT a replacement for a full Supabase stack. It records the
first actual SQL error, then destroys its private cluster. Exit 0 requires
all full-stack gates; therefore this probe presently always exits nonzero.
"""
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/release-gates/f553-full-schema-install.json'
FILES = sorted((ROOT / 'supabase/migrations').glob('*.sql'))


def main():
    root = Path(tempfile.mkdtemp(prefix='f553-closure-8-', dir='/tmp'))
    data = root / 'data'
    port = random.randint(22000, 49000)
    user = ['setpriv', '--reuid=lovable', '--regid=lovable', '--clear-groups'] if os.geteuid() == 0 else []
    if user:
        shutil.chown(root, user='lovable', group='lovable')
    # Do not inherit managed production PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.
    env = {'PATH': os.environ['PATH'], 'HOME': '/tmp', 'LANG': 'C',
           'PGOPTIONS': '-c statement_timeout=15000 -c lock_timeout=5000'}
    evidence = {'result': 'NOT_PROVEN', 'scope': 'isolated PostgreSQL migration probe; not full Supabase stack',
                'migration_count': len(FILES), 'applied_versions': [], 'failed_migration': None,
                'error': None, 'schema_digest': None, 'objects': None,
                'pgmq': 'NOT_PROVEN', 'postgrest': 'NOT_PROVEN', 'storage': 'NOT_PROVEN',
                'cluster_destroyed': False}
    started = False

    def run(args, *, stdin=None):
        return subprocess.run(user + args, input=stdin, env=env, text=True,
                              capture_output=True, timeout=40)

    def sql(text):
        return run(['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
                    '-h', str(root), '-p', str(port), '-d', 'postgres'], stdin=text)

    try:
        for args in (['initdb', '-D', str(data), '-A', 'trust', '--no-locale'],
                     ['pg_ctl', '-D', str(data), '-l', str(root / 'postgres.log'),
                      '-o', f"-k {root} -p {port} -h ''", '-w', 'start']):
            result = run(args)
            if result.returncode:
                raise RuntimeError(result.stderr.strip()[:2000])
            if args[0] == 'pg_ctl':
                started = True
        evidence['postgres_version'] = sql('SHOW server_version;').stdout.strip()
        # Standard Supabase-owned schemas are NOT faked: this isolates exactly
        # why a plain PostgreSQL cluster cannot prove a full-stack install.
        for file in FILES:
            result = sql(file.read_text())
            if result.returncode:
                evidence['result'] = 'FAIL'
                evidence['failed_migration'] = file.name
                evidence['error'] = result.stderr.strip()[-2000:]
                break
            evidence['applied_versions'].append(file.name)
        if not evidence['failed_migration']:
            catalog = sql("SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema');")
            evidence['objects'] = json.loads(catalog.stdout)
            evidence['schema_digest'] = hashlib.sha256(catalog.stdout.encode()).hexdigest()
            evidence['result'] = 'NOT_PROVEN'  # services still required
    except Exception as exc:
        evidence['error'] = str(exc)[:2000]
    finally:
        if started:
            stop = run(['pg_ctl', '-D', str(data), '-m', 'immediate', '-w', 'stop'])
            evidence['shutdown_success'] = stop.returncode == 0
        shutil.rmtree(root)
        evidence['cluster_destroyed'] = not root.exists()
        OUT.write_text(json.dumps(evidence, indent=2) + '\n')
        print(json.dumps({key: evidence[key] for key in ('result', 'migration_count', 'failed_migration', 'error', 'cluster_destroyed')}))
    return 1


if __name__ == '__main__':
    raise SystemExit(main())