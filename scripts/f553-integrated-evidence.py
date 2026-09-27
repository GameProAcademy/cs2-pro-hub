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
import urllib.error
import urllib.request
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


def local_http(api_url, key, path, method='GET', payload=None):
    parsed = urlsplit(api_url)
    if parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1') or parsed.port != 54321:
        raise RuntimeError('Refused non-disposable HTTP endpoint')
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}
    request = urllib.request.Request(api_url.rstrip('/') + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        # Auth errors can include sensitive response data; do not persist the body.
        raise RuntimeError(f'Local HTTP operation failed [{exc.code}]') from exc


def real_job_terminal_probe(env, api_url, key, user_id, outcome):
    """Use the real enqueue trigger, claim RPC and terminal RPC on disposable rows."""
    upload_id = str(uuid4())
    digest = hashlib.sha256(upload_id.encode()).hexdigest()
    sql(env, "INSERT INTO public.uploads(id,user_id,type,file_name,file_size,demo_sha256,status) "
        f"VALUES ('{upload_id}','{user_id}','demo','disposable-fixture.dem',64,'{digest}','pending');")
    enqueued = json.loads(sql(env, f"SELECT public.enqueue_demo_job('{upload_id}'::uuid,'{user_id}'::uuid);"))
    if enqueued.get('queued') is not True:
        raise RuntimeError('Real enqueue function did not queue the fixture')
    duplicate = json.loads(sql(env, f"SELECT public.enqueue_demo_job('{upload_id}'::uuid,'{user_id}'::uuid);"))
    if duplicate.get('queued') is not False or duplicate.get('job_id') != enqueued['job_id']:
        raise RuntimeError('Real enqueue was not idempotent')
    job_id = enqueued['job_id']
    before = sql(env, f"SELECT status,queue_message_id,dispatch_attempt FROM public.demo_jobs WHERE id='{job_id}';")
    claimed = json.loads(sql(env, f"SELECT public.claim_demo_parse_message('f553-{outcome}',60,1);"))
    if (claimed.get('status') != 'claimed' or claimed.get('job_id') != job_id
            or claimed.get('upload_id') != upload_id or claimed.get('demo_sha256') != digest):
        raise RuntimeError('Real queue claim does not match job/upload identity')
    message_id = claimed['message_id']
    if outcome == 'failed':
        terminal = json.loads(sql(env, "SELECT public.fail_demo_parse_message("
            f"'{job_id}'::uuid,{message_id},0,'f553-failed','PARSER_STUB_FAILURE','disposable fixture',true);"))
        expected = 'failed'
    else:
        cancellation = json.loads(sql(env, f"SELECT public.request_demo_job_cancel('{job_id}'::uuid,'{user_id}'::uuid);"))
        heartbeat = json.loads(sql(env, "SELECT public.heartbeat_demo_parse_message("
            f"'{job_id}'::uuid,{message_id},0,'f553-aborted',60,NULL);"))
        if cancellation.get('status') != 'cancel_requested' or heartbeat.get('cancelled') is not True:
            raise RuntimeError('Worker did not observe the cancellation')
        terminal = json.loads(sql(env, "SELECT public.fail_demo_parse_message("
            f"'{job_id}'::uuid,{message_id},0,'f553-aborted','CANCELLED','disposable fixture',true);"))
        expected = 'cancelled'
    after = sql(env, f"SELECT status,queue_message_id,dispatch_attempt FROM public.demo_jobs WHERE id='{job_id}';")
    archived = sql(env, f"SELECT count(*) FROM pgmq.a_demo_parse WHERE msg_id={message_id};")
    http_status, rows = local_http(api_url, key, f'/rest/v1/demo_jobs?id=eq.{job_id}&select=id,status,upload_id')
    if (terminal.get('accepted') is not True or terminal.get('status') != expected
            or after.split('|')[0] != expected or archived != '1' or http_status != 200
            or len(rows) != 1 or rows[0]['status'] != expected or rows[0]['upload_id'] != upload_id):
        raise RuntimeError('Real terminal state, queue archive or PostgREST read failed')
    return {'job_id': job_id, 'upload_id': upload_id, 'message_id': message_id,
            'attempt': claimed['attempt'], 'status': expected, 'archive_count': int(archived),
            'postgrest_status': http_status, 'duplicate_enqueue_rejected': True,
            'before_digest': hashlib.sha256(before.encode()).hexdigest(),
            'after_digest': hashlib.sha256(after.encode()).hexdigest(), 'observed_at': time.time()}


def main():
    required = ('F553_RUN_ID', 'F553_STARTED_AT', 'GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_WORKFLOW', 'GITHUB_JOB')
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise RuntimeError('Missing CI run identity: ' + ', '.join(missing))
    result = {'phase': 'F.5.3-CLOSURE.8-R5.1', 'run_id': os.environ['F553_RUN_ID'],
              'started_at': float(os.environ['F553_STARTED_AT']), 'commit_sha': os.environ['GITHUB_SHA'],
               'workflow_run_id': os.environ['GITHUB_RUN_ID'], 'workflow': os.environ['GITHUB_WORKFLOW'],
               'job': os.environ['GITHUB_JOB'], 'result': 'BLOCKED',
               'scope': 'disposable queue recovery and real FAILED/CANCELLED job paths; not FINISHED/HOT/RAW/Storage',
              'realDemAuthorized': False, 'canonicalAuthorized': False}
    queue = 'f553_' + uuid4().hex
    created = False
    try:
        status = subprocess.run(['supabase', 'status', '-o', 'json'], env=clean_env(),
                                cwd=ROOT, capture_output=True, text=True, timeout=30, check=True)
        stack = json.loads(status.stdout)
        env = database_env(stack.get('DB_URL', ''))
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
        api_url = stack.get('API_URL', '')
        key = stack.get('SERVICE_ROLE_KEY', '')
        if not key:
            raise RuntimeError('Local service identity unavailable')
        _, account = local_http(api_url, key, '/auth/v1/admin/users', 'POST',
                                {'email': f'f553-{uuid4().hex}@example.invalid',
                                 'email_confirm': True, 'password': uuid4().hex + uuid4().hex})
        user_id = account.get('id', '')
        if not isinstance(user_id, str) or len(user_id) != 36:
            raise RuntimeError('Disposable user creation did not return an identity')
        result['failed_job'] = real_job_terminal_probe(env, api_url, key, user_id, 'failed')
        result['cancelled_job'] = real_job_terminal_probe(env, api_url, key, user_id, 'aborted')
        result['result'] = 'PASS_DISPOSABLE_PARTIAL_LIFECYCLE_ONLY'
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