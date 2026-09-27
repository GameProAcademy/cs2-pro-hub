#!/usr/bin/env python3
"""Disposable real-PGMQ worker recovery probe; never claims full pipeline closure.

Only loopback Supabase CLI endpoints are accepted. Worker A and B are separate
processes, backed by a persisted invocation row in the disposable database.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlsplit
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/release-gates/f553-integration-evidence.json'


def clean_env():
    return {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG') if key in os.environ}


def database_env(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'postgresql' or parsed.hostname not in ('localhost', '127.0.0.1') or parsed.port != 54322:
        raise RuntimeError('Refused non-disposable database endpoint')
    env = clean_env()
    env.update(PGHOST=parsed.hostname, PGPORT='54322', PGUSER=parsed.username or 'postgres',
               PGPASSWORD=parsed.password or '', PGDATABASE=parsed.path.lstrip('/') or 'postgres',
               PGSSLMODE='disable', PGOPTIONS='-c statement_timeout=15000')
    return env


def sql(env, statement):
    result = subprocess.run(['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement],
                            env=env, cwd=ROOT, text=True, capture_output=True, timeout=30)
    if result.returncode:
        # Never persist connection strings, environment, or unrestricted stderr.
        detail = next((line[:200] for line in result.stderr.splitlines() if 'ERROR:' in line), 'database operation failed')
        raise RuntimeError(detail)
    return result.stdout.strip()


def worker(env, queue, identity, should_ack):
    # Real pgmq visibility, separate OS process, persisted idempotency key.
    message = sql(env, f"SELECT msg_id FROM pgmq.read('{queue}', 1, 1);")
    if not message.isdigit():
        raise RuntimeError(f'{identity} did not claim a message')
    sql(env, "INSERT INTO f553_disposable.parser_invocations(message_id, worker_id) "
             f"VALUES ({message}, '{identity}') ON CONFLICT (message_id) DO NOTHING;")
    if should_ack:
        if sql(env, f"SELECT pgmq.archive('{queue}', {message});") != 't':
            raise RuntimeError('Recovery worker could not archive message')
    return message


def main():
    required = ('F553_RUN_ID', 'F553_STARTED_AT', 'GITHUB_SHA', 'GITHUB_RUN_ID')
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise RuntimeError('Missing CI run identity: ' + ', '.join(missing))
    result = {'phase': 'F.5.3-CLOSURE.8-R5', 'run_id': os.environ['F553_RUN_ID'],
              'started_at': float(os.environ['F553_STARTED_AT']), 'commit_sha': os.environ['GITHUB_SHA'],
              'workflow_run_id': os.environ['GITHUB_RUN_ID'], 'result': 'BLOCKED',
              'scope': 'disposable PGMQ worker recovery only; not HOT/RAW/FINISHED lifecycle',
              'realDemAuthorized': False, 'canonicalAuthorized': False}
    queue = 'f553_' + uuid4().hex
    created = False
    try:
        status = subprocess.run(['supabase', 'status', '-o', 'json'], env=clean_env(),
                                cwd=ROOT, capture_output=True, text=True, timeout=30, check=True)
        env = database_env(json.loads(status.stdout).get('DB_URL', ''))
        sql(env, 'CREATE SCHEMA IF NOT EXISTS f553_disposable; '
                 'CREATE TABLE IF NOT EXISTS f553_disposable.parser_invocations ('
                 'message_id bigint PRIMARY KEY, worker_id text NOT NULL);')
        sql(env, f"SELECT pgmq.create('{queue}');")
        created = True
        message = sql(env, f"SELECT pgmq.send('{queue}', '{{\"fixture\":\"synthetic\"}}'::jsonb);")
        if not message.isdigit():
            raise RuntimeError('PGMQ did not issue a message ID')
        child_env = clean_env()
        child_env['F553_LOCAL_DB_URL'] = json.loads(status.stdout)['DB_URL']
        a = subprocess.run([sys.executable, __file__, '--worker', queue, 'worker-a', 'no-ack'],
                           cwd=ROOT, env=child_env, capture_output=True, text=True, timeout=30)
        if a.returncode or a.stdout.strip() != message:
            raise RuntimeError('Worker A failed to claim and persist the synthetic invocation')
        before = sql(env, f'SELECT message_id, worker_id FROM f553_disposable.parser_invocations WHERE message_id={message};')
        if sql(env, f"SELECT count(*) FROM pgmq.q_{queue} WHERE msg_id={message} AND vt > now();") != '1':
            raise RuntimeError('PGMQ did not hide Worker A message')
        time.sleep(2)
        b = subprocess.run([sys.executable, __file__, '--worker', queue, 'worker-b', 'ack'],
                           cwd=ROOT, env=child_env, capture_output=True, text=True, timeout=30)
        if b.returncode or b.stdout.strip() != message:
            raise RuntimeError('Fresh Worker B failed to reclaim and archive the message')
        count = sql(env, f'SELECT count(*) FROM f553_disposable.parser_invocations WHERE message_id={message};')
        archived = sql(env, f"SELECT count(*) FROM pgmq.a_{queue} WHERE msg_id={message};")
        after = sql(env, f'SELECT message_id, worker_id FROM f553_disposable.parser_invocations WHERE message_id={message};')
        if count != '1' or archived != '1' or sql(env, f"SELECT count(*) FROM pgmq.q_{queue} WHERE msg_id={message};") != '0':
            raise RuntimeError('PGMQ exactly-once idempotency or archive invariant failed')
        result.update(result='PASS_DISPOSABLE_QUEUE_ONLY', message_id=message,
                      worker_a_id='worker-a', worker_b_id='worker-b', parser_stub_invocation_count=int(count),
                      before_digest=hashlib.sha256(before.encode()).hexdigest(),
                      after_digest=hashlib.sha256(after.encode()).hexdigest(),
                      archived_count=int(archived), observed_at=time.time())
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, RuntimeError) as exc:
        result['error'] = str(exc)[:240]
    finally:
        if created:
            try:
                sql(env, f"SELECT pgmq.drop_queue('{queue}');")
            except (OSError, RuntimeError) as exc:
                result['cleanup_error'] = str(exc)[:200]
        OUT.write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps({key: result.get(key) for key in ('result', 'error', 'parser_stub_invocation_count', 'archived_count')}))
    return 0 if result['result'] == 'PASS_DISPOSABLE_QUEUE_ONLY' and not result.get('cleanup_error') else 1


if __name__ == '__main__':
    if len(sys.argv) == 5 and sys.argv[1] == '--worker':
        try:
            print(worker(database_env(os.environ.get('F553_LOCAL_DB_URL', '')), sys.argv[2], sys.argv[3], sys.argv[4] == 'ack'))
        except (OSError, RuntimeError) as error:
            print(str(error)[:200], file=sys.stderr)
            raise SystemExit(1)
    else:
        raise SystemExit(main())