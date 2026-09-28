"""Disposable Storage→queue→worker→parser→RAW→HOT→FINISHED→ACK lifecycle."""
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
from f553.r11.lifecycle import ensure_bucket


def start(db, db_url, api_url, key, sql, request, root):
    fixture_path, fixture = acquire()
    user_email = f'r11-{uuid4().hex}@example.invalid'
    _, user_body = request(api_url, key, '/auth/v1/admin/users', 'POST',
                           json.dumps({'email': user_email, 'email_confirm': True,
                                       'password': uuid4().hex + uuid4().hex}).encode(), 'application/json')
    user_id = json.loads(user_body)['id']
    bucket = 'demos'
    bucket_details = ensure_bucket(api_url, key, request, bucket, 104857600)
    upload_id = str(uuid4())
    object_path = f'{user_id}/{upload_id}.dem'
    content = fixture_path.read_bytes()
    if len(content) != fixture['bytes'] or hashlib.sha256(content).hexdigest() != fixture['sha256']:
        raise RuntimeError('Fixture bytes changed before upload')
    request(api_url, key, f'/storage/v1/object/{bucket}/{quote(object_path)}', 'POST', content)
    size, digest = len(content), fixture['sha256']
    sql(db, 'INSERT INTO public.uploads(id,user_id,type,file_name,file_size,mime_type,demo_sha256,storage_path,status) '
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
            'F553_LOCAL_API_URL': api_url, 'F553_LOCAL_SERVICE_KEY': key,
            'F553_WORKER_ID': worker_id}
    launched = time.time()
    process = subprocess.run([sys.executable, str(Path(__file__)), '--worker', str(output)], cwd=root, env=env,
                             capture_output=True, text=True, timeout=600)
    ended = time.time()
    if process.returncode or not output.is_file():
        raise RuntimeError('Job-bound parser worker failed: ' + process.stderr[:300])
    observed = json.loads(output.read_text())
    claim, parsed, lifecycle = observed['claim'], observed['parser'], observed['lifecycle']
    if (claim.get('job_id') != job_id or claim.get('upload_id') != upload_id
            or str(claim.get('message_id')) != queue_message_id
            or claim.get('demo_sha256') != digest or claim.get('user_id') != user_id
            or parsed.get('worker_pid') != observed['parser_pid']
            or parsed.get('parser_version') != '0.42.0' or parsed.get('parser_exit_code') != 0
            or parsed.get('raw_evidence_present') is not True
            or lifecycle.get('terminal_state') != 'processed'
            or lifecycle.get('ack', {}).get('acknowledged') is not True):
        raise RuntimeError('Job-bound worker/parser identity mismatch')
    state = sql(db, f"SELECT status,coalesce(worker_id,'') FROM public.demo_jobs WHERE id='{job_id}';")
    if state != 'processed|':
        raise RuntimeError('Job did not retain the terminal ACK state')
    return {'fixture': fixture, 'upload_id': upload_id, 'job_id': job_id,
            'queue_message_id': int(queue_message_id), 'attempt_number': claim['attempt_number'],
            'dispatch_attempt': claim['attempt'], 'demo_sha256': digest,
            'worker_id': worker_id, 'worker_pid': observed['pid'],
            'parser_pid': observed['parser_pid'], 'worker_start': launched,
            'worker_end': ended, 'worker_exit_code': process.returncode,
            'parser_execution_id': parsed['parser_execution_id'],
            'parser_version': parsed['parser_version'], 'parser_output_digest': parsed['parser_output_digest'],
            'players': parsed['players'], 'rounds': parsed['rounds'], 'events': parsed['events'],
            'storage_bucket': bucket, 'storage_path': object_path,
            'uploaded_size': size, 'uploaded_sha256': digest,
            'worker_read_size': lifecycle['input']['worker_read_size'],
            'worker_read_sha256': lifecycle['input']['worker_read_sha256'],
            'parser_input_size': lifecycle['input']['parser_input_size'],
            'parser_input_sha256': lifecycle['input']['parser_input_sha256'],
            'job_state': state, 'raw': lifecycle['raw'], 'hot': lifecycle['hot'],
            'ack': lifecycle['ack'], 'snapshots': lifecycle['snapshots'],
            'scope': 'integrated disposable success lifecycle'}


def run_worker():
    if len(sys.argv) != 3 or sys.argv[1] != '--worker':
        raise RuntimeError('Worker requires output path')
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
    api_url = os.environ['F553_LOCAL_API_URL']
    key = os.environ['F553_LOCAL_SERVICE_KEY']
    if urlsplit(api_url).hostname not in ('localhost', '127.0.0.1'):
        raise RuntimeError('Refusing remote worker API')
    claim = json.loads(probe.sql(db, "SELECT public.claim_demo_parse_message("
                                 f"'{os.environ['F553_WORKER_ID']}',900,1);"))
    if claim.get('status') != 'claimed':
        raise RuntimeError('Worker did not claim real queue message')
    from f553.r11.lifecycle import storage_get, persist_raw, persist_hot_and_finish
    downloaded = storage_get(api_url, key, probe_request(api_url, key), 'demos', claim['storage_path'])
    digest = hashlib.sha256(downloaded).hexdigest()
    if len(downloaded) != claim['file_size'] or digest != claim['demo_sha256']:
        raise RuntimeError('JOB_STORAGE_DIGEST_MISMATCH')
    temp = Path(tempfile.mkdtemp(prefix='f553-r11-parse-'))
    parser_input, parser_out = temp / 'job-input.dem', temp / 'parser.json'
    parser_input.write_bytes(downloaded)
    command = [sys.executable, str(root / 'scripts/f553/r11/parser_process.py'),
                str(parser_input), str(parser_out)]
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=600)
    if result.returncode or not parser_out.is_file():
        raise RuntimeError('Job-bound parser failed: ' + result.stderr[:300])
    parsed = json.loads(parser_out.read_text()); parser_data = parsed.pop('output')
    raw = persist_raw(db, probe.sql, api_url, key, probe_request(api_url, key), claim, parser_data, parsed)
    hot = persist_hot_and_finish(db, probe.sql, claim, parser_data, parsed, raw)
    ack = json.loads(probe.sql(db, "SELECT public.finalize_demo_parse_message("
                              f"'{claim['job_id']}'::uuid,{claim['message_id']},{claim['attempt']},"
                              f"'{os.environ['F553_WORKER_ID']}');"))
    snapshots = {
        'queue_after_ack': probe.sql(db, f"SELECT count(*) FROM pgmq.read('demo_parse',1,100) WHERE msg_id={claim['message_id']};"),
        'raw_count': probe.sql(db, f"SELECT count(*) FROM public.raw_evidence_artifacts WHERE job_id='{claim['job_id']}';"),
        'hot_count': probe.sql(db, f"SELECT count(*) FROM public.match_sources WHERE upload_id='{claim['upload_id']}' AND source='demo';"),
    }
    lifecycle={'input':{'worker_read_size':len(downloaded),'worker_read_sha256':digest,
                        'parser_input_size':parser_input.stat().st_size,
                        'parser_input_sha256':hashlib.sha256(parser_input.read_bytes()).hexdigest()},
               'raw':raw,'hot':hot,'terminal_state':'processed','ack':ack,'snapshots':snapshots}
    Path(sys.argv[2]).write_text(json.dumps({'claim': claim, 'parser': parsed, 'lifecycle': lifecycle,
                                             'pid': os.getpid(), 'parser_pid': parsed['worker_pid']}))


def probe_request(api_url, key):
    root = Path(__file__).resolve().parents[3]
    spec = __import__('importlib').util.spec_from_file_location('r11_engine_request', root / 'scripts/f553-r11-execution-engine.py')
    module = __import__('importlib').util.module_from_spec(spec); spec.loader.exec_module(module)
    return module.request


if __name__ == '__main__':
    run_worker()