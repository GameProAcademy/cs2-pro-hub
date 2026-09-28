"""First disposable lifecycle boundary: stored upload, queued job, worker claim, parser.

This is not RAW/HOT completion or an exactly-once proof. The caller must keep
those gates NOT_PROVEN until they are exercised against this same job.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote
from uuid import uuid4

from f553.r11.fixture import acquire


def start(db, db_url, api_url, key, sql, request, root):
    fixture_path, fixture = acquire()
    user_email = f'r11-{uuid4().hex}@example.invalid'
    _, user_body = request(api_url, key, '/auth/v1/admin/users', 'POST',
                           json.dumps({'email': user_email, 'email_confirm': True,
                                       'password': uuid4().hex + uuid4().hex}).encode(), 'application/json')
    user_id = json.loads(user_body)['id']
    # Storage is always local. The path is relative to its private bucket.
    bucket = 'demos'
    try:
        _, body = request(api_url, key, f'/storage/v1/bucket/{bucket}')
    except RuntimeError as exc:
        if 'local HTTP 404 GET' not in str(exc):
            raise
        request(api_url, key, '/storage/v1/bucket', 'POST',
                json.dumps({'id': bucket, 'name': bucket, 'public': False,
                            'file_size_limit': 104857600}).encode(), 'application/json')
        _, body = request(api_url, key, f'/storage/v1/bucket/{bucket}')
    if json.loads(body).get('public') is not False:
        raise RuntimeError('Disposable demo bucket must be private')
    upload_id = str(uuid4())
    object_path = f'{user_id}/{upload_id}.dem'
    content = fixture_path.read_bytes()
    if len(content) != fixture['bytes'] or hashlib.sha256(content).hexdigest() != fixture['sha256']:
        raise RuntimeError('Fixture bytes changed before upload')
    request(api_url, key, f'/storage/v1/object/{bucket}/{quote(object_path)}', 'POST', content)
    size, digest = len(content), fixture['sha256']
    sql(db, 'INSERT INTO public.uploads(id,user_id,type,file_name,file_size,content_type,demo_sha256,storage_path,status) '
        f"VALUES ('{upload_id}','{user_id}','demo','test_demo.dem',{size},"
        f"'application/octet-stream','{digest}','{object_path}','pending');")
    enqueued = json.loads(sql(db, f"SELECT public.enqueue_demo_job('{upload_id}'::uuid,'{user_id}'::uuid);"))
    job_id = enqueued['job_id']
    if enqueued.get('queued') is not True:
        raise RuntimeError('Disposable job was not queued')
    queue_message_id = sql(db, f"SELECT queue_message_id FROM public.demo_jobs WHERE id='{job_id}';")
    if not queue_message_id.isdigit():
        raise RuntimeError('Real job has no queue message')
    output = Path(tempfile.mkdtemp(prefix='f553-r11-bound-')) / 'worker-output.json'
    worker_id = 'r11-disposable-' + uuid4().hex
    env = {**os.environ, 'F553_LOCAL_DB_URL': db_url,
           'F553_WORKER_ID': worker_id}
    launched = time.time()
    process = subprocess.run([sys.executable, str(Path(__file__)), '--worker',
                              str(fixture_path), str(output)], cwd=root, env=env,
                             capture_output=True, text=True, timeout=600)
    ended = time.time()
    if process.returncode or not output.is_file():
        raise RuntimeError('Job-bound parser worker failed: ' + process.stderr[:300])
    observed = json.loads(output.read_text())
    claim, parsed = observed['claim'], observed['parser']
    if (claim.get('job_id') != job_id or claim.get('upload_id') != upload_id
            or str(claim.get('message_id')) != queue_message_id
            or claim.get('demo_sha256') != digest or claim.get('user_id') != user_id
            or parsed.get('worker_pid') != observed['pid']
            or parsed.get('parser_version') != '0.42.0' or parsed.get('parser_exit_code') != 0):
        raise RuntimeError('Job-bound worker/parser identity mismatch')
    state = sql(db, f"SELECT status,worker_id,queue_message_id FROM public.demo_jobs WHERE id='{job_id}';")
    if state != f'processing|{worker_id}|{queue_message_id}':
        raise RuntimeError('Job state did not retain the real worker lease')
    return {'fixture': fixture, 'upload_id': upload_id, 'job_id': job_id,
            'queue_message_id': int(queue_message_id), 'attempt_number': claim['attempt_number'],
            'dispatch_attempt': claim['attempt'], 'demo_sha256': digest,
            'worker_id': worker_id, 'worker_pid': observed['pid'], 'worker_start': launched,
            'worker_end': ended, 'worker_exit_code': process.returncode,
            'parser_execution_id': parsed['parser_execution_id'],
            'parser_version': parsed['parser_version'], 'parser_output_digest': parsed['parser_output_digest'],
            'players': parsed['players'], 'rounds': parsed['rounds'], 'events': parsed['events'],
            'storage_path': object_path, 'job_state': state,
            'scope': 'job-bound parser boundary only; RAW, HOT, terminal and ACK not proven'}


def run_worker():
    if len(sys.argv) != 4 or sys.argv[1] != '--worker':
        raise RuntimeError('Worker requires fixture and output path')
    from urllib.parse import urlsplit
    source = urlsplit(os.environ['F553_LOCAL_DB_URL'])
    if source.scheme != 'postgresql' or source.hostname not in ('localhost', '127.0.0.1') or source.port != 54322:
        raise RuntimeError('Refusing remote worker database')
    # Load the existing local-only SQL helper without importing the engine.
    import importlib.util
    root = Path(__file__).resolve().parents[3]
    spec = importlib.util.spec_from_file_location('disposable_probe', root / 'scripts/f553-integrated-evidence.py')
    probe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(probe)
    db = probe.database_env(os.environ['F553_LOCAL_DB_URL'])
    claim = json.loads(probe.sql(db, "SELECT public.claim_demo_parse_message("
                                 f"'{os.environ['F553_WORKER_ID']}',900,1);"))
    if claim.get('status') != 'claimed':
        raise RuntimeError('Worker did not claim real queue message')
    parser_out = Path(tempfile.mkdtemp(prefix='f553-r11-parse-')) / 'parser.json'
    command = [sys.executable, str(root / 'scripts/f553/r11/parser_process.py'),
               sys.argv[2], str(parser_out)]
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=600)
    if result.returncode or not parser_out.is_file():
        raise RuntimeError('Job-bound parser failed: ' + result.stderr[:300])
    parsed = json.loads(parser_out.read_text())
    parsed.pop('output', None)
    Path(sys.argv[3]).write_text(json.dumps({'claim': claim, 'parser': parsed, 'pid': os.getpid()}))


if __name__ == '__main__':
    run_worker()