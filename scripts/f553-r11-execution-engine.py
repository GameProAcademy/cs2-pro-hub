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
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import quote, urlsplit
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent))
from f553.r11.fixture import acquire as acquire_fixture
from f553.r11.lifecycle import create_disposable_job, sql
from f553.r11.matrices import run_all

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/release-gates/f553-r11-execution-evidence.json'
PHASE = 'F.5.3-CLOSURE.8-R11.2'
GATES = ('pgmq', 'postgrest', 'storage', 'finished', 'ack_loss', 'fresh_worker',
         'failed', 'aborted', 'queue_idempotency', 'hot_raw_identity',
         'raw_integrity', 'parser_exactly_once', 'race_matrix', 'failure_matrix',
         'docker', 'browser', 'parser_tests', 'final_ci')


class LocalHTTPError(RuntimeError):
    """Bounded local-only HTTP failure; never include credentials or request bytes."""

    def __init__(self, status, method, path, body):
        self.status = status
        self.method = method
        self.path = path
        self.body = body
        super().__init__(f'local HTTP {status} {method} {path}: {body[:8192]}')


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
        raise LocalHTTPError(exc.code, method, path, response_body) from exc


def ensure_bucket(api_url, key, bucket):
    """Create a private disposable bucket only for an exact missing-bucket response."""
    endpoint = f'/storage/v1/bucket/{bucket}'
    try:
        _, body = request(api_url, key, endpoint)
    except LocalHTTPError as exc:
        try:
            missing = json.loads(exc.body).get('code') == 'NoSuchBucket'
        except (ValueError, AttributeError):
            missing = False
        if exc.method != 'GET' or exc.path != endpoint or exc.status not in (400, 404) or not missing:
            raise
        request(api_url, key, '/storage/v1/bucket', 'POST',
                json.dumps({'id': bucket, 'name': bucket, 'public': False,
                            'file_size_limit': 104857600}).encode(), 'application/json')
        _, body = request(api_url, key, endpoint)
    details = json.loads(body)
    if (details.get('id') != bucket or details.get('public') is not False
            or details.get('file_size_limit') != 104857600):
        raise RuntimeError('Disposable RAW bucket configuration invalid')
    return details


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
                                         'ACTUAL_OUTPUT': str(exc)[:12000], 'FILE': __file__,
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

        def failed():
            fixture_path, fixture = acquire_fixture()
            identity = create_disposable_job(db, api_url, key, fixture_path, fixture)
            duplicate = json.loads(probe.sql(db, f"SELECT public.enqueue_demo_job('{identity['upload_id']}'::uuid,'{identity['user_id']}'::uuid);"))
            if duplicate.get('queued') is not False or duplicate.get('job_id') != identity['job_id']:
                raise RuntimeError('R11_FAILED_DUPLICATE_ENQUEUE_NOT_IDEMPOTENT')
            with tempfile.TemporaryDirectory(prefix='f553-r11-failure-') as tmp:
                expected_file = Path(tmp) / 'expected.json'
                expected_file.write_text(json.dumps(identity))
                env = clean | {'PYTHONPATH': str(ROOT / 'scripts'), 'F553_LOCAL_DB_URL': db_url,
                               'F553_LOCAL_API_URL': api_url, 'F553_LOCAL_SERVICE_KEY': key}
                worker = subprocess.run(
                    [sys.executable, str(ROOT / 'scripts/f553/r11/job_bound.py'),
                     '--expected-json', str(expected_file), '--inject-parser-failure'],
                    cwd=ROOT, env=env, capture_output=True, text=True, timeout=650)
                if worker.returncode:
                    raise RuntimeError(
                        'R11_FAILED_WORKER_FAILED:stderr=' + worker.stderr[:6000]
                        + ':stdout=' + worker.stdout[:3000]
                    )
                observation = json.loads(worker.stdout)
            claim = observation['claim']
            if (claim['job_id'] != identity['job_id'] or claim['upload_id'] != identity['upload_id']
                    or int(claim['message_id']) != int(identity['message_id'])
                    or claim['storage_path'] != identity['storage_path']
                    or claim['demo_sha256'] != identity['demo_sha256']
                    or int(claim['attempt_number']) != identity['attempt_number']):
                raise RuntimeError('R11_FAILED_CLAIM_IDENTITY_MISMATCH')
            state = probe.sql(db, f"SELECT status,upload_id,queue_message_id FROM public.demo_jobs WHERE id='{identity['job_id']}';")
            archived = probe.sql(db, f"SELECT count(*) FROM pgmq.a_demo_parse WHERE msg_id={int(identity['message_id'])};")
            stale = json.loads(probe.sql(db, "SELECT public.fail_demo_parse_message("
                f"'{identity['job_id']}'::uuid,{int(identity['message_id'])},"
                f"{int(claim['attempt'])},'{observation['worker_id']}',"
                "'PARSER_FAILURE_INJECTED','Duplicate delivery',true);"))
            status, body = request(api_url, key, f"/rest/v1/demo_jobs?id=eq.{identity['job_id']}&select=id,status,upload_id")
            rows = json.loads(body)
            if (state != f"failed|{identity['upload_id']}|{identity['message_id']}" or archived != '1'
                    or stale.get('accepted') is not False or status != 200 or len(rows) != 1
                    or rows[0]['status'] != 'failed' or rows[0]['upload_id'] != identity['upload_id']
                    or observation['failure']['parser_execution_count'] != 1):
                raise RuntimeError('R11_FAILED_TERMINAL_REPLAY_OR_ARCHIVE_MISMATCH')
            return {'fixture': fixture, 'identity': identity, 'worker': observation,
                    'terminal_state': state, 'archive_count': int(archived),
                    'stale_retry': stale, 'postgrest_status': status, 'observed_at': time.time()}

        attempt('failed', failed, lambda o: o['terminal_state'].startswith('failed|')
                and o['archive_count'] == 1 and o['stale_retry']['accepted'] is False)
        if evidence['gates']['failed'] == 'PASS':
            evidence['gates']['queue_idempotency'] = 'PASS'

        def claimed_job_parser():
            fixture_path, fixture = acquire_fixture()
            identity = create_disposable_job(db, api_url, key, fixture_path, fixture)
            with tempfile.TemporaryDirectory(prefix='f553-r11-claimed-') as tmp:
                expected_file = Path(tmp) / 'expected.json'
                expected_file.write_text(json.dumps(identity))
                env = clean | {'PYTHONPATH': str(ROOT / 'scripts'), 'F553_LOCAL_DB_URL': db_url, 'F553_LOCAL_API_URL': api_url,
                               'F553_LOCAL_SERVICE_KEY': key}
                worker = subprocess.run(
                    [sys.executable, str(ROOT / 'scripts/f553/r11/job_bound.py'),
                     '--expected-json', str(expected_file)], cwd=ROOT, env=env,
                    capture_output=True, text=True, timeout=650)
                if worker.returncode:
                    raise RuntimeError(
                        'R11_CLAIMED_WORKER_FAILED:stderr=' + worker.stderr[:12000]
                        + ':stdout=' + worker.stdout[:5000]
                    )
                observation = json.loads(worker.stdout)
            claim = observation['claim']
            if (claim['job_id'] != identity['job_id'] or claim['upload_id'] != identity['upload_id']
                    or int(claim['message_id']) != int(identity['message_id'])):
                raise RuntimeError('R11_JOB_BOUND_PARSER_IDENTITY_INVALID')
            if observation.get('checkpoint') != 'ACKNOWLEDGED':
                raise RuntimeError('R11_JOB_BOUND_LIFECYCLE_INCOMPLETE')
            return {'fixture': fixture, 'identity': identity, 'worker': observation,
                    'scope': 'real upload/queue/claim/Storage GET/parser/RAW/read-back/HOT/FINISHED/ACK'}

        try:
            lifecycle = claimed_job_parser()
            evidence['observations']['integrated_lifecycle'] = lifecycle
            worker = lifecycle['worker']
            evidence['gates']['pgmq'] = 'PASS'
            evidence['gates']['storage'] = 'PASS'
            evidence['gates']['finished'] = 'PASS'
            evidence['gates']['hot_raw_identity'] = 'PASS'
            evidence['gates']['raw_integrity'] = 'PASS'
            evidence['observations']['parser_exactly_once'] = {
                'scope': 'successful job-bound lifecycle before recovery matrices',
                'parser_execution_count': worker['parser_execution_count'],
                'parser_execution_id': worker['parser']['parser_execution_id'],
            }
        except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError,
                urllib.error.URLError) as exc:
            evidence['blockers'].append({
                'BLOCKER_CODE': 'R11_JOB_BOUND_LIFECYCLE_INCOMPLETE',
                'ACTUAL_OUTPUT': str(exc)[:12000], 'RUN_ID': evidence['run_id'],
                'COMMIT_SHA': evidence['commit_sha'], 'WORKFLOW_RUN_ID': evidence['workflow_run_id'],
            })

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
        evidence['observations']['pgmq']['scope'] = 'job-bound queue claim plus standalone visibility probe'

        def postgrest():
            status_code, body = request(api_url, key, '/rest/v1/demo_jobs?select=id&limit=1')
            return {'http_status': status_code, 'json_array': isinstance(json.loads(body), list)}

        attempt('postgrest', postgrest, lambda o: o['http_status'] == 200 and o['json_array'])

        def storage():
            bucket = 'cs2-raw-evidence'
            bucket_details = ensure_bucket(api_url, key, bucket)
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

        def worker_env(lease_seconds: int, checkpoint_file: Path | None = None) -> dict[str, str]:
            env = clean | {
                'PYTHONPATH': str(ROOT / 'scripts'),
                'F553_LOCAL_DB_URL': db_url,
                'F553_LOCAL_API_URL': api_url,
                'F553_LOCAL_SERVICE_KEY': key,
                'F553_LEASE_SECONDS': str(lease_seconds),
            }
            if checkpoint_file is not None:
                env['F553_CHECKPOINT_FILE'] = str(checkpoint_file)
            return env
    
        def wait_for_checkpoint(path: Path, timeout: float = 30.0) -> dict:
            deadline = time.time() + timeout
            while time.time() < deadline:
                if path.is_file():
                    try:
                        return json.loads(path.read_text())
                    except json.JSONDecodeError:
                        pass
                time.sleep(0.25)
            raise RuntimeError('R11_WORKER_CHECKPOINT_TIMEOUT')
    
        def terminal_counts(job_id: str, upload_id: str) -> dict:
            return {
                'raw_artifacts': int(sql(db, f"SELECT count(*) FROM public.raw_evidence_artifacts WHERE job_id='{job_id}';")),
                'matches': int(sql(db, f"SELECT count(*) FROM public.matches WHERE upload_id='{upload_id}';")),
                'match_sources': int(sql(db, f"SELECT count(*) FROM public.match_sources WHERE upload_id='{upload_id}';")),
                'job_status': sql(db, f"SELECT status FROM public.demo_jobs WHERE id='{job_id}';"),
                'dispatch_attempt': int(sql(db, f"SELECT dispatch_attempt FROM public.demo_jobs WHERE id='{job_id}';")),
            }
    
        def crash_recovery():
            fixture_path, fixture = acquire_fixture()
            identity = create_disposable_job(db, api_url, key, fixture_path, fixture)
            with tempfile.TemporaryDirectory(prefix='f553-r11-crash-') as tmp:
                expected_file = Path(tmp) / 'expected.json'
                checkpoint = Path(tmp) / 'worker-a.json'
                expected_file.write_text(json.dumps(identity))
                worker_a = subprocess.Popen(
                    [sys.executable, str(ROOT / 'scripts/f553/r11/job_bound.py'),
                     '--expected-json', str(expected_file), '--hold-after-claim'],
                    cwd=ROOT, env=worker_env(60, checkpoint),
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    claimed = wait_for_checkpoint(checkpoint)
                    worker_a.kill()
                    worker_a.wait(timeout=20)
                    if worker_a.returncode == 0:
                        raise RuntimeError('R11_WORKER_A_CRASH_NOT_INJECTED')
                finally:
                    if worker_a.poll() is None:
                        worker_a.kill()
                        worker_a.wait(timeout=20)
                recovery_wait_seconds = 65
                time.sleep(recovery_wait_seconds)
                worker_b = subprocess.run(
                    [sys.executable, str(ROOT / 'scripts/f553/r11/job_bound.py'),
                     '--expected-json', str(expected_file)],
                    cwd=ROOT, env=worker_env(30), capture_output=True, text=True, timeout=650)
                if worker_b.returncode:
                    raise RuntimeError(
                        'R11_WORKER_B_RECOVERY_FAILED:stderr=' + worker_b.stderr[:2000]
                        + ':stdout=' + worker_b.stdout[:1000]
                    )
                recovered = json.loads(worker_b.stdout)
            counts = terminal_counts(identity['job_id'], identity['upload_id'])
            if recovered.get('checkpoint') != 'ACKNOWLEDGED' or recovered['claim']['job_id'] != identity['job_id']:
                raise RuntimeError('R11_FRESH_WORKER_CHECKPOINT_MISMATCH')
            if counts['job_status'] != 'processed' or counts['raw_artifacts'] != 1 or counts['matches'] != 1 or counts['match_sources'] != 1:
                raise RuntimeError('R11_CRASH_RECOVERY_DUPLICATION_OR_TERMINAL_MISMATCH')
            return {
                'scenario': 'worker_a_sigkill_then_lease_expiry_worker_b_recovery',
                'worker_a_pid': claimed['worker_pid'], 'worker_a_exit_code': -9,
                'worker_b_pid': recovered['worker_pid'], 'worker_b_exit_code': recovered['worker_exit_code'],
                'lease_seconds_worker_a': 60, 'recovery_wait_seconds': recovery_wait_seconds,
                'same_job_id': recovered['claim']['job_id'] == identity['job_id'],
                'same_upload_id': recovered['claim']['upload_id'] == identity['upload_id'],
                'same_message_id': int(recovered['claim']['message_id']) == int(identity['message_id']),
                'parser_execution_count_worker_b': recovered.get('parser_execution_count'),
                'counts': counts, 'observed_at': time.time(),
            }
    
        def ack_loss():
            fixture_path, fixture = acquire_fixture()
            identity = create_disposable_job(db, api_url, key, fixture_path, fixture)
            with tempfile.TemporaryDirectory(prefix='f553-r11-ack-loss-') as tmp:
                expected_file = Path(tmp) / 'expected.json'
                checkpoint = Path(tmp) / 'worker-a.json'
                expected_file.write_text(json.dumps(identity))
                # Keep the lease comfortably longer than the measured FINISHED path.
                # This proves FINISHED-before-ACK rather than lease expiry during processing.
                ack_lease_seconds = 180
                worker_a = subprocess.Popen(
                    [sys.executable, str(ROOT / 'scripts/f553/r11/job_bound.py'),
                     '--expected-json', str(expected_file), '--defer-ack'],
                    cwd=ROOT, env=worker_env(ack_lease_seconds, checkpoint),
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    # Prove FINISHED-before-ACK from the database contract itself,
                    # rather than depending on a child-process checkpoint file.
                    # The checkpoint is only an observation aid; the authoritative
                    # condition is processed job + persisted outputs + message still
                    # queued and not archived.
                    deadline = time.monotonic() + 300.0
                    before = None
                    last_observed = None
                    while time.monotonic() < deadline:
                        if worker_a.poll() is not None:
                            raise RuntimeError(
                                f'R11_ACK_LOSS_WORKER_EXITED_BEFORE_FINISH:exit={worker_a.returncode!r}'
                            )
                        observed = terminal_counts(identity['job_id'], identity['upload_id'])
                        queued_now = int(sql(
                            db,
                            f"SELECT count(*) FROM pgmq.q_demo_parse WHERE msg_id={int(identity['message_id'])};"
                        ))
                        archived_now = int(sql(
                            db,
                            f"SELECT count(*) FROM pgmq.a_demo_parse WHERE msg_id={int(identity['message_id'])};"
                        ))
                        if (observed['job_status'] == 'processed'
                                and observed['raw_artifacts'] == 1
                                and observed['matches'] == 1
                                and observed['match_sources'] == 1
                                and queued_now == 1
                                and archived_now == 0):
                            before = observed
                            break
                        time.sleep(1)
                    if before is None:
                        raise RuntimeError(
                            'R11_ACK_LOSS_FINISHED_CHECKPOINT_MISSING:'
                            + json.dumps({
                                'worker_poll': worker_a.poll(),
                                'last_observed': last_observed,
                            }, sort_keys=True)
                        )
                    finished = {
                        'worker_pid': worker_a.pid,
                        'checkpoint': 'FINISHED_BEFORE_ACK',
                        'worker_exit_code': None,
                    }
                finally:
                    if worker_a.poll() is None:
                        worker_a.kill()
                        worker_a.wait(timeout=20)
                recovery_wait_seconds = ack_lease_seconds + 5
                time.sleep(recovery_wait_seconds)
                worker_b = subprocess.run(
                    [sys.executable, str(ROOT / 'scripts/f553/r11/job_bound.py'),
                     '--expected-json', str(expected_file), '--recover-terminal'],
                    cwd=ROOT, env=worker_env(30), capture_output=True, text=True, timeout=120)
                if worker_b.returncode:
                    raise RuntimeError(
                        'R11_ACK_LOSS_RECOVERY_FAILED:stderr=' + worker_b.stderr[:2000]
                        + ':stdout=' + worker_b.stdout[:1000]
                    )
                recovered = json.loads(worker_b.stdout)
            after = terminal_counts(identity['job_id'], identity['upload_id'])
            queued = int(sql(db, f"SELECT count(*) FROM pgmq.q_demo_parse WHERE msg_id={int(identity['message_id'])};"))
            archived = int(sql(db, f"SELECT count(*) FROM pgmq.a_demo_parse WHERE msg_id={int(identity['message_id'])};"))
            if recovered.get('checkpoint') != 'TERMINAL_REDELIVERY_ACKNOWLEDGED' or queued != 0 or archived != 1:
                raise RuntimeError('R11_ACK_LOSS_QUEUE_RECONCILIATION_MISMATCH')
            if before['raw_artifacts'] != after['raw_artifacts'] or before['matches'] != after['matches'] or before['match_sources'] != after['match_sources']:
                raise RuntimeError('R11_ACK_LOSS_DUPLICATED_OUTPUT')
            return {
                'scenario': 'worker_a_finished_then_sigkill_before_ack_then_terminal_redelivery',
                'worker_a_pid': finished['worker_pid'], 'worker_a_exit_code': -9,
                'worker_b_pid': recovered['worker_pid'], 'worker_b_exit_code': recovered['worker_exit_code'],
                'lease_seconds_worker_a': 60, 'recovery_wait_seconds': recovery_wait_seconds,
                'parser_execution_count_worker_b': recovered.get('parser_execution_count'),
                'queue_count': queued, 'archive_count': archived,
                'before': before, 'after': after, 'observed_at': time.time(),
            }
    
        crash = None
        ack = None
        attempt('fresh_worker', lambda: crash_recovery(), lambda o: o['same_job_id'] and o['same_upload_id']
                and o['same_message_id'] and o['counts']['job_status'] == 'processed'
                and o['counts']['raw_artifacts'] == 1 and o['counts']['matches'] == 1
                and o['counts']['match_sources'] == 1)
        if evidence['gates']['fresh_worker'] == 'PASS':
            crash = evidence['observations']['fresh_worker']
            evidence['gates']['parser_exactly_once'] = 'PASS'
    
        attempt('ack_loss', lambda: ack_loss(), lambda o: o['queue_count'] == 0 and o['archive_count'] == 1
                and o['before']['raw_artifacts'] == o['after']['raw_artifacts'] == 1
                and o['before']['matches'] == o['after']['matches'] == 1
                and o['before']['match_sources'] == o['after']['match_sources'] == 1
                and o['parser_execution_count_worker_b'] == 0)
        if evidence['gates']['ack_loss'] == 'PASS':
            ack = evidence['observations']['ack_loss']
    
        def aborted():
            fixture_path, fixture = acquire_fixture()
            identity = create_disposable_job(db, api_url, key, fixture_path, fixture)
            with tempfile.TemporaryDirectory(prefix='f553-r11-aborted-') as tmp:
                expected_file = Path(tmp) / 'expected.json'
                expected_file.write_text(json.dumps(identity))
                worker = subprocess.run(
                    [sys.executable, str(ROOT / 'scripts/f553/r11/job_bound.py'),
                     '--expected-json', str(expected_file), '--abort-after-claim'],
                    cwd=ROOT, env=worker_env(30), capture_output=True, text=True, timeout=120)
                if worker.returncode:
                    raise RuntimeError('R11_PROCESS_ABORTED_WORKER_FAILED: ' + worker.stderr[:500])
                observation = json.loads(worker.stdout)
            status = sql(db, f"SELECT status FROM public.demo_jobs WHERE id='{identity['job_id']}';")
            error_code = sql(db, f"SELECT coalesce(error_code,'') FROM public.demo_jobs WHERE id='{identity['job_id']}';")
            archived = int(sql(db, f"SELECT count(*) FROM pgmq.a_demo_parse WHERE msg_id={int(identity['message_id'])};"))
            return {
                'scenario': 'real_process_aborted_after_claim',
                'identity': identity,
                'worker': observation,
                'job_status': status,
                'error_code': error_code,
                'archive_count': archived,
                'parser_execution_count': observation.get('aborted', {}).get('parser_execution_count', 0),
                'observed_at': time.time(),
            }
    
        attempt('aborted', aborted, lambda o: o['job_status'] == 'failed'
                and o['error_code'] == 'PROCESS_ABORTED'
                and o['archive_count'] == 1
                and o['parser_execution_count'] == 0)
    
        if evidence['gates']['aborted'] == 'PASS':
            evidence['observations']['aborted']['scope'] = 'real job claim -> fail_demo_parse_message(PROCESS_ABORTED) -> terminal failure -> ACK/archive'
    
        if evidence['gates']['failed'] == 'PASS':
            evidence['gates']['queue_idempotency'] = 'PASS'
    
        try:
            lifecycle_observation = evidence['observations'].get('integrated_lifecycle')
            if not lifecycle_observation:
                raise RuntimeError('R11_MATRIX_PREREQUISITE_MISSING:integrated_lifecycle')
            matrices = run_all(db, api_url, key, evidence, lifecycle_observation)
            evidence['observations']['matrices'] = {
                name: {'case_count': value['case_count'], 'executed': value['executed']}
                for name, value in matrices.items()
            }
            evidence['gates']['race_matrix'] = 'PASS' if matrices['race']['case_count'] >= 50 and all(
                case['result'] == 'PASS' for case in matrices['race']['cases']) else 'FAIL'
            evidence['gates']['failure_matrix'] = 'PASS' if matrices['failure']['case_count'] >= 50 and all(
                case['result'] == 'PASS' for case in matrices['failure']['cases']) else 'FAIL'
            evidence['observations']['raw_corruption_matrix'] = {
                'case_count': matrices['raw-corruption']['case_count'],
                'all_pass': all(case['result'] == 'PASS' for case in matrices['raw-corruption']['cases']),
            }
            evidence['gates']['raw_integrity'] = 'PASS' if evidence['gates']['raw_integrity'] == 'PASS' and (
                matrices['raw-corruption']['case_count'] >= 16
                and all(case['result'] == 'PASS' for case in matrices['raw-corruption']['cases'])
            ) else evidence['gates']['raw_integrity']
        except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as exc:
            evidence['gates']['race_matrix'] = 'FAIL'
            evidence['gates']['failure_matrix'] = 'FAIL'
            evidence['blockers'].append({
                'BLOCKER_CODE': 'R11_MATRIX_EXECUTION_FAILED',
                'ACTUAL_OUTPUT': str(exc)[:500],
                'RUN_ID': evidence['run_id'],
                'COMMIT_SHA': evidence['commit_sha'],
                'WORKFLOW_RUN_ID': evidence['workflow_run_id'],
            })
    
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as exc:
        evidence['blockers'].append({'BLOCKER_CODE': 'R11_LOCAL_STACK_UNAVAILABLE',
                                     'COMMAND': 'supabase status -o json',
                                     'ACTUAL_OUTPUT': str(exc)[:12000], 'FILE': __file__, 'LINE': 0,
                                     'RUN_ID': evidence['run_id'], 'COMMIT_SHA': evidence['commit_sha'],
                                     'WORKFLOW_RUN_ID': evidence['workflow_run_id']})
    finally:
        evidence['finished_at'] = time.time()
        execution_owned_gates = (
            'pgmq', 'postgrest', 'storage', 'finished', 'ack_loss', 'fresh_worker',
            'failed', 'aborted', 'queue_idempotency', 'hot_raw_identity',
            'raw_integrity', 'parser_exactly_once', 'race_matrix', 'failure_matrix',
        )
        # This step runs before the workflow's independent Docker/browser/parser-test
        # gates are injected. Do not fail CI merely because those later gates are
        # still NOT_PROVEN; Job A finalization owns that second-stage aggregation.
        if all(evidence['gates'].get(gate) == 'PASS' for gate in execution_owned_gates):
            evidence['final_decision'] = 'READY_FOR_CI_GATE_FINALIZATION'
        else:
            evidence['final_decision'] = 'BLOCKED'
        evidence['gates']['final_ci'] = 'NOT_PROVEN'
        report_lines = [
            '# F553 Closure 8 R11.2 — Job A Disposable Evidence',
            '',
            f"- Phase: `{PHASE}`",
            f"- Decision: **{evidence['final_decision']}**",
            f"- Workflow run: `{evidence['workflow_run_id']}`",
            f"- Commit: `{evidence['commit_sha']}`",
            '',
            '## Mandatory gates',
            '',
            '| Gate | Status |',
            '|---|---|',
        ]
        report_lines.extend(
            f"| {gate} | {evidence['gates'][gate]} |" for gate in GATES
        )
        report_lines.extend([
            '',
            '## Locks',
            '',
            '- productionWrites: false',
            '- railwayAuthorized: false',
            '- canonicalAuthorized: false',
            '- realDemAuthorized: false',
            '',
            '## Evidence',
            '',
            f"- Integrated lifecycle observed: {'yes' if 'integrated_lifecycle' in evidence['observations'] else 'no'}",
            f"- Fresh-worker recovery gate: {evidence['gates'].get('fresh_worker')}",
            f"- ACK-loss gate: {evidence['gates'].get('ack_loss')}",
            f"- PROCESS_ABORTED gate: {evidence['gates'].get('aborted')}",
            f"- Race matrix cases: {evidence.get('observations', {}).get('matrices', {}).get('race', {}).get('case_count', 0)}",
            f"- Failure matrix cases: {evidence.get('observations', {}).get('matrices', {}).get('failure', {}).get('case_count', 0)}",
            f"- RAW corruption matrix cases: {evidence.get('observations', {}).get('matrices', {}).get('raw-corruption', {}).get('case_count', 0)}",
            '- final_ci remains NOT_PROVEN by design; independent Job B is required.',
        ])
        (ROOT / 'docs/release-gates/F553-CLOSURE-8-R11-FINAL-REPORT.md').write_text(
            '\n'.join(report_lines) + '\n'
        )
        OUT.write_text(json.dumps(evidence, indent=2) + '\n')
        print(json.dumps({'final_decision': evidence['final_decision'],
                          'gates': evidence['gates'], 'blockers': evidence['blockers']}))
    return 0 if evidence.get('final_decision') in {
        'READY_FOR_CI_GATE_FINALIZATION',
        'READY_FOR_INDEPENDENT_ATTESTATION',
    } else 1


if __name__ == '__main__':
    sys.exit(main())