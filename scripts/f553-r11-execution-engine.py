#!/usr/bin/env python3
"""R11.2 disposable execution engine. Never promotes partial probes to closure.

The runner has no connection to production. The only accepted database and API
endpoints are the exact ports of the local disposable CLI stack.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import quote, urlsplit
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent))
from f553.r11.job_bound import start as start_job_bound

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/release-gates/f553-r11-execution-evidence.json'
PHASE = 'F.5.3-CLOSURE.8-R11.2'
GATES = ('pgmq', 'postgrest', 'storage', 'finished', 'ack_loss', 'fresh_worker',
         'failed', 'aborted', 'queue_idempotency', 'hot_raw_identity',
         'raw_integrity', 'parser_exactly_once', 'race_matrix', 'failure_matrix',
         'docker', 'browser', 'parser_tests', 'final_ci')


def local_endpoint(value, scheme, port):
    parsed = urlsplit(value)
    return (parsed.scheme == scheme and parsed.hostname in ('localhost', '127.0.0.1')
            and parsed.port == port and not parsed.fragment)


def load_probe():
    spec = importlib.util.spec_from_file_location('legacy_disposable_probe', ROOT / 'scripts/f553-integrated-evidence.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def request(url, key, path, method='GET', body=None, content_type='application/octet-stream'):
    if not local_endpoint(url, 'http', 54321):
        raise RuntimeError('Refused non-disposable API endpoint')
    req = urllib.request.Request(url.rstrip('/') + path, data=body, method=method,
                                 headers={'apikey': key, 'Authorization': 'Bearer ' + key,
                                          'Content-Type': content_type})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        response_body = exc.read(8192).decode('utf-8', errors='replace')
        raise RuntimeError(f'local HTTP {exc.code} {method} {path}: {response_body}') from exc


def main():
    required = ('F553_RUN_ID', 'F553_STARTED_AT', 'GITHUB_SHA', 'GITHUB_RUN_ID',
                'GITHUB_RUN_ATTEMPT', 'GITHUB_WORKFLOW', 'GITHUB_JOB', 'GITHUB_REF')
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError('R11.2 requires GitHub run identity: ' + ', '.join(missing))
    started = float(os.environ['F553_STARTED_AT'])
    if started > time.time() or started <= 0 or not re.fullmatch(r'[0-9a-f]{40}', os.environ['GITHUB_SHA']):
        raise RuntimeError('Invalid R11.2 start time or commit SHA')
    evidence = {
        'phase': PHASE, 'evidence_version': 12, 'run_id': os.environ['F553_RUN_ID'],
        'started_at': started, 'commit_sha': os.environ['GITHUB_SHA'],
        'workflow_run_id': os.environ['GITHUB_RUN_ID'],
        'workflow_run_attempt': os.environ['GITHUB_RUN_ATTEMPT'],
        'workflow': os.environ['GITHUB_WORKFLOW'], 'job': os.environ['GITHUB_JOB'],
        'ref': os.environ['GITHUB_REF'], 'disposable': True, 'production': False,
        'realDemAuthorized': False, 'canonicalAuthorized': False,
        'railwayAuthorized': False, 'productionWrites': False,
        'gates': {name: 'NOT_PROVEN' for name in GATES}, 'observations': {}, 'blockers': [],
    }

    def attempt(gate, operation, check):
        try:
            observation = operation()
            evidence['observations'][gate] = observation
            if check(observation):
                evidence['gates'][gate] = 'PASS'
            else:
                raise RuntimeError('Observed operation did not satisfy the gate contract')
        except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError,
                urllib.error.URLError) as exc:
            evidence['gates'][gate] = 'FAIL'
            evidence['blockers'].append({'BLOCKER_CODE': f'R11_{gate.upper()}_FAILED',
                                         'COMMAND': 'python3 scripts/f553-r11-execution-engine.py',
                                         'ACTUAL_OUTPUT': str(exc)[:8192], 'FILE': __file__,
                                         'LINE': 0, 'RUN_ID': evidence['run_id'],
                                         'COMMIT_SHA': evidence['commit_sha'],
                                         'WORKFLOW_RUN_ID': evidence['workflow_run_id']})

    try:
        clean = {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG') if key in os.environ}
        status = subprocess.run(['supabase', 'status', '-o', 'json'], cwd=ROOT, env=clean,
                                capture_output=True, text=True, timeout=30, check=True)
        stack = json.loads(status.stdout)
        db_url, api_url = stack.get('DB_URL', ''), stack.get('API_URL', '')
        key = stack.get('SERVICE_ROLE_KEY', '')
        if not (local_endpoint(db_url, 'postgresql', 54322)
                and local_endpoint(api_url, 'http', 54321) and key):
            raise RuntimeError('Refused nonlocal disposable stack or missing local service identity')
        probe = load_probe()
        db = probe.database_env(db_url)

        def real_parser():
            return start_job_bound(db, db_url, api_url, key, probe.sql, request, ROOT)

        attempt('parser_exactly_once', real_parser,
                lambda o: o['parser_version'] == '0.42.0' and o['worker_exit_code'] == 0
                and o['players'] > 0 and o['rounds'] > 0 and o['events'] > 0)
        if evidence['gates']['parser_exactly_once'] == 'PASS':
            evidence['gates']['parser_exactly_once'] = 'NOT_PROVEN'
            evidence['observations']['parser_exactly_once']['scope'] = (
                'job-bound parser boundary; retries/recovery and RAW/HOT exactly-once not proven')

        def queue():
            queue_name = 'r11_' + uuid4().hex
            probe.sql(db, f"SELECT pgmq.create('{queue_name}');")
            try:
                msg = probe.sql(db, f"SELECT pgmq.send('{queue_name}', '{{\"r11\":true}}'::jsonb);")
                first = probe.sql(db, f"SELECT msg_id FROM pgmq.read('{queue_name}', 1, 1);")
                hidden = probe.sql(db, f"SELECT msg_id FROM pgmq.read('{queue_name}', 1, 1);")
                time.sleep(2)
                again = probe.sql(db, f"SELECT msg_id FROM pgmq.read('{queue_name}', 1, 1);")
                ack = probe.sql(db, f"SELECT pgmq.archive('{queue_name}', {msg});")
                absent = probe.sql(db, f"SELECT msg_id FROM pgmq.read('{queue_name}', 1, 1);")
                return {'message_id': msg, 'first': first, 'hidden': hidden,
                        'reappeared': again, 'archive': ack, 'after_archive': absent}
            finally:
                probe.sql(db, f"SELECT pgmq.drop_queue('{queue_name}');")

        attempt('pgmq', queue, lambda o: o['message_id'].isdigit() and o['first'] == o['reappeared'] == o['message_id'] and o['hidden'] == o['after_archive'] == '' and o['archive'] == 't')
        if evidence['gates']['pgmq'] == 'PASS':
            evidence['gates']['pgmq'] = 'NOT_PROVEN'
            evidence['observations']['pgmq']['scope'] = 'queue visibility only; no job-bound worker processing'

        def postgrest():
            status_code, body = request(api_url, key, '/rest/v1/demo_jobs?select=id&limit=1')
            return {'http_status': status_code, 'json_array': isinstance(json.loads(body), list)}

        attempt('postgrest', postgrest, lambda o: o['http_status'] == 200 and o['json_array'])

        def storage():
            bucket = 'cs2-raw-evidence'
            bucket_endpoint = f'/storage/v1/bucket/{bucket}'
            try:
                _, bucket_body = request(api_url, key, bucket_endpoint)
            except RuntimeError as exc:
                if 'local HTTP 404 GET' not in str(exc):
                    raise
                request(api_url, key, '/storage/v1/bucket', 'POST',
                        json.dumps({'id': bucket, 'name': bucket, 'public': False,
                                    'file_size_limit': 104857600}).encode(), 'application/json')
                _, bucket_body = request(api_url, key, bucket_endpoint)
            bucket_details = json.loads(bucket_body)
            if (bucket_details.get('id') != bucket or bucket_details.get('public') is not False
                    or bucket_details.get('file_size_limit') != 104857600):
                raise RuntimeError(f'Disposable RAW bucket configuration invalid: {bucket_details}')
            path = f'r11-disposable/{evidence["run_id"]}/{uuid4().hex}.bin'
            content = os.urandom(256)
            endpoint = f'/storage/v1/object/{bucket}/{quote(path)}'
            try:
                write_status, _ = request(api_url, key, endpoint, 'POST', content)
                read_status, read_back = request(api_url, key, endpoint)
                return {'bucket': bucket, 'bucket_state': bucket_details, 'path': path,
                        'method': 'POST', 'content_length': len(content),
                        'write_status': write_status,
                        'read_status': read_status, 'bytes': len(read_back),
                        'written_sha256': hashlib.sha256(content).hexdigest(),
                        'read_sha256': hashlib.sha256(read_back).hexdigest(),
                        'byte_identical': read_back == content,
                        'scope': 'standalone storage object; NOT RAW artifact binding'}
            finally:
                try:
                    request(api_url, key, endpoint, 'DELETE')
                except (urllib.error.URLError, RuntimeError):
                    pass

        attempt('storage', storage, lambda o: o['write_status'] in (200, 201)
                and o['read_status'] == 200 and o['byte_identical']
                and o['written_sha256'] == o['read_sha256'] and o['bytes'] == 256)
        if evidence['gates']['storage'] == 'PASS':
            evidence['gates']['storage'] = 'NOT_PROVEN'

        def failed():
            _, body = request(api_url, key, '/auth/v1/admin/users', 'POST',
                              json.dumps({'email': f'r11-{uuid4().hex}@example.invalid',
                                          'email_confirm': True, 'password': uuid4().hex + uuid4().hex}).encode(),
                              'application/json')
            user_id = json.loads(body)['id']
            return probe.real_job_terminal_probe(db, api_url, key, user_id, 'failed')

        attempt('failed', failed, lambda o: o['status'] == 'failed' and o['archive_count'] == 1
                and o['postgrest_status'] == 200 and o['duplicate_enqueue_rejected']
                and o['stale_terminal_retry_rejected'])
        # FAILED is a real terminal RPC probe, not proof of a parser failure inside
        # the worker. It must not be promoted as the integrated mandatory gate.
        if evidence['gates']['failed'] == 'PASS':
            evidence['gates']['failed'] = 'NOT_PROVEN'
            evidence['observations']['failed']['scope'] = 'terminal RPC only; parser failure boundary not executed'
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as exc:
        evidence['blockers'].append({'BLOCKER_CODE': 'R11_LOCAL_STACK_UNAVAILABLE',
                                     'COMMAND': 'supabase status -o json',
                                      'ACTUAL_OUTPUT': str(exc)[:8192], 'FILE': __file__, 'LINE': 0,
                                     'RUN_ID': evidence['run_id'], 'COMMIT_SHA': evidence['commit_sha'],
                                     'WORKFLOW_RUN_ID': evidence['workflow_run_id']})
    finally:
        if evidence['gates']['parser_exactly_once'] == 'FAIL':
            evidence['blockers'].append({
                'BLOCKER_CODE': 'R11_REAL_PARSER_EXECUTION_NOT_PROVEN',
                'COMMAND': 'python3 scripts/f553-r11-execution-engine.py',
                'ACTUAL_OUTPUT': 'The pinned disposable CS2 fixture did not complete the demoparser2 0.42.0 boundary.',
                'FILE': __file__, 'LINE': 0,
                'MISSING_PROOF': 'one real parser execution bound to the verified disposable fixture',
                'NEXT_ACTION': 'Inspect the parser subprocess observation and correct the first concrete failure.',
                'RUN_ID': evidence['run_id'], 'COMMIT_SHA': evidence['commit_sha'],
                'WORKFLOW_RUN_ID': evidence['workflow_run_id'],
            })
        else:
            evidence['blockers'].append({
                'BLOCKER_CODE': 'R11_INTEGRATED_LIFECYCLE_NOT_YET_PROVEN',
                'COMMAND': 'python3 scripts/f553-r11-execution-engine.py',
                'ACTUAL_OUTPUT': 'Job-bound parser remains partial; RAW/Storage/HOT/ACK and operation-backed matrices remain absent.',
                'FILE': __file__, 'LINE': 0,
                'MISSING_PROOF': 'integrated RAW/Storage/HOT/ACK, Worker A/B recovery, PROCESS_ABORTED, and 16/50/50 matrices',
                'NEXT_ACTION': 'Bind this parser result to one disposable upload/job/queue lifecycle and emit reconstructable snapshots.',
                'RUN_ID': evidence['run_id'], 'COMMIT_SHA': evidence['commit_sha'],
                'WORKFLOW_RUN_ID': evidence['workflow_run_id'],
            })
        evidence['finished_at'] = time.time()
        evidence['final_decision'] = 'BLOCKED'
        OUT.write_text(json.dumps(evidence, indent=2) + '\n')
        print(json.dumps({'final_decision': evidence['final_decision'],
                          'gates': evidence['gates'], 'blockers': evidence['blockers']}))
    return 1


if __name__ == '__main__':
    sys.exit(main())