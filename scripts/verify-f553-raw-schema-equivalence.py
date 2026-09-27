#!/usr/bin/env python3
"""Compare read-only live RAW catalog with a fresh disposable source migration.

This is a scoped catalog comparison, never an authorization for production execution.
"""
import hashlib
import json
import os
import pathlib
import random
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/release-gates"
SOURCE = ROOT / "supabase/migrations/20260926070000_reconcile_raw_evidence_schema.sql"

CATALOG = """
SELECT jsonb_object_agg(c.relname, jsonb_build_object(
 'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_get_constraintdef(x.oid,true)) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('name',i.indexname,'definition',i.indexdef) ORDER BY i.indexname) FROM pg_indexes i WHERE i.schemaname='public' AND i.tablename=c.relname),
 'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'roles',(SELECT jsonb_agg(r.rolname ORDER BY r.rolname) FROM pg_roles r WHERE r.oid=ANY(p.polroles)),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid,true)) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'grants',jsonb_build_object(
   'anon',(SELECT jsonb_build_object('select',has_table_privilege('anon',c.oid,'SELECT'),'insert',has_table_privilege('anon',c.oid,'INSERT'),'update',has_table_privilege('anon',c.oid,'UPDATE'),'delete',has_table_privilege('anon',c.oid,'DELETE'))),
   'authenticated',(SELECT jsonb_build_object('select',has_table_privilege('authenticated',c.oid,'SELECT'),'insert',has_table_privilege('authenticated',c.oid,'INSERT'),'update',has_table_privilege('authenticated',c.oid,'UPDATE'),'delete',has_table_privilege('authenticated',c.oid,'DELETE'))),
   'service_role',(SELECT jsonb_build_object('select',has_table_privilege('service_role',c.oid,'SELECT'),'insert',has_table_privilege('service_role',c.oid,'INSERT'),'update',has_table_privilege('service_role',c.oid,'UPDATE'),'delete',has_table_privilege('service_role',c.oid,'DELETE'))),
   'sandbox_exec',(SELECT jsonb_build_object('select',has_table_privilege('sandbox_exec',c.oid,'SELECT'),'insert',has_table_privilege('sandbox_exec',c.oid,'INSERT'),'update',has_table_privilege('sandbox_exec',c.oid,'UPDATE'),'delete',has_table_privilege('sandbox_exec',c.oid,'DELETE')))
  ),
 'dependencies',(SELECT jsonb_agg(jsonb_build_object('constraint',x.conname,'referenced',x.confrelid::regclass::text) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid AND x.contype='f'),
 'comment',obj_description(c.oid,'pg_class')
)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('raw_evidence_artifacts','raw_evidence_chunks')
"""


def invoke(command, *, env, timeout=30, input=None):
    return subprocess.run(command, input=input, env=env, text=True, capture_output=True,
                          timeout=timeout, check=True).stdout.strip()


def digest(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def write(path, obj):
    path.write_text(json.dumps(obj, indent=2, sort_keys=True) + '\n')


def main():
    if not os.environ.get('PGHOST'):
        raise SystemExit('Live read-only catalog connection unavailable; refusing to invent snapshot')
    read_env = {**os.environ, 'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=15000'}
    live = json.loads(invoke(['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', CATALOG], env=read_env))
    if set(live) != {'raw_evidence_artifacts', 'raw_evidence_chunks'}:
        raise SystemExit('Live RAW catalog incomplete; refusing partial snapshot')
    snapshot = {'scope': 'RAW tables only; not full application schema', 'catalog': live,
                'digest': digest(live), 'source': 'live database, read-only SELECT'}
    write(OUT / 'f553-live-raw-schema.snapshot.json', snapshot)

    base = pathlib.Path(tempfile.mkdtemp(prefix='f553-raw-schema-', dir='/tmp'))
    data = base / 'data'
    port = random.randint(21000, 47000)
    local_env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    local_env.update({'HOME': '/tmp', 'LANG': 'C'})
    user = ['setpriv', '--reuid=lovable', '--regid=lovable', '--clear-groups'] if os.geteuid() == 0 else []
    if user:
        shutil.chown(base, user='lovable', group='lovable')
    started = False
    try:
        invoke(user + ['initdb', '-D', str(data), '-A', 'trust', '--no-locale'], env=local_env)
        invoke(user + ['pg_ctl', '-D', str(data), '-l', str(base / 'postgres.log'),
                       '-o', f"-k {base} -p {port} -h ''", '-w', 'start'], env=local_env)
        started = True
        def sql(query):
            return invoke(user + ['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
                                  '-h', str(base), '-p', str(port), '-d', 'postgres', '-c', query],
                          env=local_env)
        sql("CREATE ROLE postgres; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE sandbox_exec; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$; CREATE TABLE public.uploads(id uuid PRIMARY KEY); CREATE TABLE public.demo_jobs(id uuid PRIMARY KEY);")
        sql(SOURCE.read_text())
        # Reproduce historical live metadata ONLY in the disposable catalog.
        # Neither owner nor legacy sandbox privileges belong to desired source policy.
        sql("ALTER TABLE public.raw_evidence_artifacts OWNER TO postgres; ALTER TABLE public.raw_evidence_chunks OWNER TO postgres; GRANT SELECT, INSERT ON public.raw_evidence_artifacts, public.raw_evidence_chunks TO sandbox_exec;")
        disposable = json.loads(sql(CATALOG))
    finally:
        if started:
            invoke(user + ['pg_ctl', '-D', str(data), '-m', 'immediate', '-w', 'stop'], env=local_env)
        shutil.rmtree(base)
    mismatch = []
    for table in sorted(live):
        for field in sorted(live[table]):
            if live[table][field] != disposable[table].get(field):
                mismatch.append({'table': table, 'field': field,
                                 'live': live[table][field], 'disposable': disposable[table].get(field)})
    result = {'phase': 'F.5.3-CLOSURE.7', 'scope': snapshot['scope'],
              'source_version': SOURCE.name, 'source_schema_digest': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              'live_schema_digest': digest(live), 'disposable_schema_digest': digest(disposable),
               'mismatches': mismatch, 'result': 'PASS' if not mismatch else 'BLOCKED',
               'live_equivalence': 'PASS' if not mismatch else 'FAIL',
               'desired_security_state': 'SOURCE_EXCLUDES_LEGACY_SANDBOX_GRANT',
               'disposable_legacy_grants_only': ['sandbox_exec:SELECT', 'sandbox_exec:INSERT'],
              'full_schema_equivalence': 'NOT_PROVEN'}
    write(OUT / 'f553-schema-equivalence.json', result)
    print(json.dumps({'result': result['result'], 'mismatch_fields': [f"{m['table']}.{m['field']}" for m in mismatch],
                      'full_schema_equivalence': 'NOT_PROVEN'}))
    if mismatch:
        raise SystemExit(1)


if __name__ == '__main__':
    main()