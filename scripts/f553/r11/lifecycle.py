"""Local disposable R11 job and Storage operations; never accepts remote endpoints."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request
from urllib.parse import quote, urlsplit
from uuid import UUID, uuid4


def local_url(url: str, scheme: str, port: int) -> bool:
    parsed = urlsplit(url)
    return (parsed.scheme == scheme and parsed.hostname in ('127.0.0.1', 'localhost')
            and parsed.port == port and not parsed.fragment and not parsed.query
            and (scheme != 'http' or not parsed.username))


def database_env(url: str) -> dict[str, str]:
    if not local_url(url, 'postgresql', 54322):
        raise RuntimeError('R11_DISPOSABLE_DB_REQUIRED')
    parsed = urlsplit(url)
    env = {name: os.environ[name] for name in ('PATH', 'HOME', 'LANG') if name in os.environ}
    env.update(PGHOST=parsed.hostname or 'localhost', PGPORT='54322',
               PGUSER=parsed.username or 'postgres', PGPASSWORD=parsed.password or '',
               PGDATABASE=parsed.path.lstrip('/') or 'postgres', PGSSLMODE='disable',
               PGOPTIONS='-c statement_timeout=30000')
    return env


def sql(db: dict[str, str], statement: str) -> str:
    """Execute one disposable SQL statement and preserve each scalar row losslessly.

    psql's unaligned mode normally emits one row per line, but a large JSON scalar
    must never be reconstructed by guessing physical line boundaries. Use a NUL
    record separator so embedded/newline-formatted output cannot be mistaken for
    row boundaries. JSON text itself cannot contain a raw NUL, so this delimiter is
    unambiguous for the JSON-producing queries used by the R11 harness.
    """
    result = subprocess.run(
        ['psql', '-X', '-A', '-t', '-q', '-P', 'recordsep_zero=on',
         '-v', 'ON_ERROR_STOP=1', '-c', statement],
        env=db, capture_output=True, text=True, timeout=40,
    )
    if result.returncode:
        error = next((line[:200] for line in result.stderr.splitlines() if 'ERROR:' in line),
                     'R11_DATABASE_OPERATION_FAILED')
        raise RuntimeError(error)

    records = [record for record in result.stdout.split('\x00') if record]
    if not records:
        return ''

    # With -t/-q, successful DML may still expose a command tag. Keep the
    # actual scalar row and discard only a terminal PostgreSQL command tag.
    while len(records) > 1 and re.fullmatch(
        r'(?:INSERT|UPDATE|DELETE|MERGE)\s+\d+(?:\s+\d+)?',
        records[-1].strip(), re.IGNORECASE,
    ):
        records.pop()

    return ''.join(records).strip()


def ident(value: str) -> str:
    return str(UUID(value))


def http(api_url: str, key: str, path: str, method: str = 'GET',
         content: bytes | None = None, content_type: str = 'application/octet-stream') -> tuple[int, bytes]:
    if not local_url(api_url, 'http', 54321) or not key or not path.startswith('/'):
        raise RuntimeError('R11_DISPOSABLE_API_REQUIRED')
    req = urllib.request.Request(api_url.rstrip('/') + path, data=content, method=method,
                                 headers={'apikey': key, 'Authorization': 'Bearer ' + key,
                                          'Content-Type': content_type})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return response.status, response.read(100 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as error:
        detail = error.read(1024).decode('utf-8', 'replace')
        raise RuntimeError(f'R11_LOCAL_HTTP_{error.code}_{method}_{path}: {detail}') from error


def private_bucket(api_url: str, key: str, bucket: str, size: int = 104857600) -> dict:
    endpoint = f'/storage/v1/bucket/{bucket}'
    try:
        _, body = http(api_url, key, endpoint)
    except RuntimeError as exc:
        if not any(str(exc).startswith(f'R11_LOCAL_HTTP_{code}_GET_{endpoint}:')
                   and '"NoSuchBucket"' in str(exc) for code in (400, 404)):
            raise
        http(api_url, key, '/storage/v1/bucket', 'POST',
             json.dumps({'id': bucket, 'name': bucket, 'public': False,
                         'file_size_limit': size}).encode(), 'application/json')
        _, body = http(api_url, key, endpoint)
    details = json.loads(body)
    if details.get('id') != bucket or details.get('public') is not False or details.get('file_size_limit') != size:
        raise RuntimeError('R11_PRIVATE_BUCKET_MISMATCH')
    return {'id': bucket, 'public': False, 'file_size_limit': size}


def object_path(bucket: str, path: str) -> str:
    if bucket not in ('demos', 'cs2-raw-evidence') or not path or path.startswith('/') or '..' in path.split('/'):
        raise RuntimeError('R11_OBJECT_PATH_INVALID')
    return f'/storage/v1/object/{bucket}/{quote(path, safe="/")}'


def put_verified(api_url: str, key: str, bucket: str, path: str, content: bytes) -> dict:
    endpoint = object_path(bucket, path)
    status, _ = http(api_url, key, endpoint, 'POST', content)
    read_status, readback = http(api_url, key, endpoint)
    digest = hashlib.sha256(content).hexdigest()
    if status not in (200, 201) or read_status != 200 or readback != content:
        raise RuntimeError('R11_STORAGE_READBACK_MISMATCH')
    return {'bucket': bucket, 'path': path, 'bytes': len(readback),
            'written_sha256': digest, 'read_sha256': hashlib.sha256(readback).hexdigest(),
            'write_status': status, 'read_status': read_status}


def create_disposable_job(db: dict[str, str], api_url: str, key: str,
                          fixture_path: Path, fixture: dict) -> dict:
    """Persist the pinned bytes, a real reservation, and the database-generated job/PGMQ message."""
    if fixture_path.stat().st_size != fixture['bytes'] or hashlib.sha256(fixture_path.read_bytes()).hexdigest() != fixture['sha256']:
        raise RuntimeError('R11_FIXTURE_MISMATCH_BEFORE_UPLOAD')
    private_bucket(api_url, key, 'demos')
    email = f'r11-{uuid4().hex}@example.invalid'
    _, body = http(api_url, key, '/auth/v1/admin/users', 'POST',
                   json.dumps({'email': email, 'email_confirm': True,
                               'password': uuid4().hex + uuid4().hex}).encode(), 'application/json')
    user_id = ident(json.loads(body)['id'])
    upload_id = str(uuid4())  # Reservation RPC persists and returns this exact upload identity.
    reserved = json.loads(sql(db, "SELECT public.reserve_demo_upload("
                             f"'{user_id}'::uuid,'{upload_id}'::uuid,'{fixture['filename']}',"
                             f"{fixture['bytes']},'{fixture['sha256']}');"))
    if reserved.get('upload_id') != upload_id or reserved.get('attempt_number') != 1 or reserved.get('job_id'):
        raise RuntimeError('R11_UPLOAD_RESERVATION_INVALID')
    storage_path = reserved['storage_path']
    stored = put_verified(api_url, key, 'demos', storage_path, fixture_path.read_bytes())
    enqueued = json.loads(sql(db, f"SELECT public.enqueue_demo_job('{upload_id}'::uuid,'{user_id}'::uuid);"))
    job_id = ident(enqueued['job_id'])
    if enqueued.get('queued') is not True or enqueued.get('attempt_number') != 1:
        raise RuntimeError('R11_JOB_NOT_QUEUED')
    row = sql(db, 'SELECT row_to_json(j) FROM (SELECT id,upload_id,user_id,storage_path,demo_sha256,'
              f"file_size,attempt_number,queue_message_id,dispatch_attempt,status FROM public.demo_jobs WHERE id='{job_id}') j;")
    job = json.loads(row)
    if (job['id'] != job_id or job['upload_id'] != upload_id or job['user_id'] != user_id
            or job['storage_path'] != storage_path or job['demo_sha256'] != fixture['sha256']
            or job['file_size'] != fixture['bytes'] or job['attempt_number'] != 1
            or job['queue_message_id'] is None or job['dispatch_attempt'] != 0):
        raise RuntimeError('R11_JOB_QUEUE_IDENTITY_MISMATCH')
    return {'user_id': user_id, 'upload_id': upload_id, 'job_id': job_id,
            'attempt_number': 1, 'message_id': job['queue_message_id'],
            'storage_path': storage_path, 'demo_sha256': fixture['sha256'],
            'upload_storage': stored, 'job_snapshot': job}