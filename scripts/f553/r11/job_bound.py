"""A real, fail-closed disposable worker boundary for one claimed CS2 job."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from uuid import uuid4

from f553.r11.integrated import run_integrated
from f553.r11.lifecycle import database_env, http, ident, object_path, sql


def recover_terminal(db_url: str, expected: dict) -> dict:
    """Run in a fresh process and consume a redelivered terminal message without parsing."""
    db = database_env(db_url)
    worker_id = 'r11-disposable-recovery-' + uuid4().hex
    started_at = time.time()
    observed = json.loads(sql(db, f"SELECT public.claim_demo_parse_message('{worker_id}',60,1);"))
    archived = sql(db, f"SELECT count(*) FROM pgmq.a_demo_parse WHERE msg_id={int(expected['message_id'])};")
    queued = sql(db, f"SELECT count(*) FROM pgmq.q_demo_parse WHERE msg_id={int(expected['message_id'])};")
    state = sql(db, f"SELECT status FROM public.demo_jobs WHERE id='{ident(expected['job_id'])}';")
    if (observed.get('status') != 'rejected' or observed.get('reason') != 'processed'
            or archived != '1' or queued != '0' or state != 'processed'):
        raise RuntimeError('R11_TERMINAL_RECOVERY_MISMATCH')
    return {'worker_id': worker_id, 'worker_pid': os.getpid(), 'worker_start': started_at,
            'worker_end': time.time(), 'worker_exit_code': 0, 'claim': observed,
            'job_id': expected['job_id'], 'upload_id': expected['upload_id'],
            'message_id': expected['message_id'], 'parser_execution_count': 0,
            'archive_count': int(archived), 'queue_count': int(queued),
            'checkpoint': 'TERMINAL_REDELIVERY_ACKNOWLEDGED'}


def process_claim(db_url: str, api_url: str, key: str, expected: dict,
                  inject_parser_failure: bool = False, defer_ack: bool = False,
                  checkpoint_file: str | None = None, hold_after_claim: bool = False) -> dict:
    db = database_env(db_url)
    worker_id = 'r11-disposable-' + uuid4().hex
    started_at = time.time()
    claimed = json.loads(sql(db, f"SELECT public.claim_demo_parse_message('{worker_id}',900,1);"))
    if claimed.get('status') != 'claimed':
        raise RuntimeError('R11_EXPECTED_JOB_NOT_CLAIMED')
    if (ident(claimed['job_id']) != ident(expected['job_id'])
            or ident(claimed['upload_id']) != ident(expected['upload_id'])
            or int(claimed['message_id']) != int(expected['message_id'])
            or claimed['storage_path'] != expected['storage_path']
            or claimed['demo_sha256'] != expected['demo_sha256']
            or int(claimed['attempt_number']) != expected['attempt_number']):
        raise RuntimeError('R11_CLAIM_IDENTITY_MISMATCH')
    result = {'worker_id': worker_id, 'worker_pid': os.getpid(), 'worker_start': started_at,
              'claim': claimed, 'checkpoint': 'CLAIMED'}
    if checkpoint_file:
        Path(checkpoint_file).write_text(json.dumps(result))
    if hold_after_claim:
        while True:
            time.sleep(1)
    _, content = http(api_url, key, object_path('demos', claimed['storage_path']))
    digest = hashlib.sha256(content).hexdigest()
    if (len(content) != claimed['file_size'] or digest != claimed['demo_sha256']
            or len(content) != expected['upload_storage']['bytes']
            or digest != expected['upload_storage']['written_sha256']
            or digest != expected['upload_storage']['read_sha256']):
        raise RuntimeError('R11_STORAGE_INPUT_IDENTITY_MISMATCH')
    result['input'] = {'input_source': 'claimed_job_storage_path', 'storage_bucket': 'demos',
                       'storage_path': claimed['storage_path'], 'uploaded_size': expected['upload_storage']['bytes'],
                       'uploaded_sha256': expected['upload_storage']['written_sha256'],
                       'worker_read_size': len(content), 'worker_read_sha256': digest}
    with tempfile.TemporaryDirectory(prefix='r11-claimed-parser-') as tmp:
        parser_input = Path(tmp) / 'claimed.dem'
        parser_output = Path(tmp) / 'parsed.json'
        parser_input.write_bytes(content)
        input_sha = hashlib.sha256(parser_input.read_bytes()).hexdigest()
        if parser_input.stat().st_size != claimed['file_size'] or input_sha != digest:
            raise RuntimeError('R11_PARSER_INPUT_MISMATCH')
        result['input'].update(parser_input_size=parser_input.stat().st_size,
                               parser_input_sha256=input_sha)
        command = [sys.executable, str(Path(__file__).with_name('parser_process.py')),
                   str(parser_input), str(parser_output)]
        if inject_parser_failure:
            # Exercise the actual parser boundary with a damaged disposable copy.
            # The original object and its verified input digest remain untouched.
            parser_input.write_bytes(b'R11_INVALID_DEMO_HEADER' + content[23:])
            result['checkpoint'] = 'VERIFIED_STORAGE_INPUT_PARSER_FAILURE_INJECTED'
        process = subprocess.run(command, capture_output=True, text=True, timeout=600)
        if inject_parser_failure:
            if process.returncode == 0 or parser_output.is_file():
                raise RuntimeError('R11_INJECTED_PARSER_FAILURE_NOT_OBSERVED')
            terminal = json.loads(sql(db, "SELECT public.fail_demo_parse_message("
                f"'{ident(expected['job_id'])}'::uuid,{int(expected['message_id'])},"
                f"{int(claimed['attempt'])},'{worker_id}',"
                "'PARSER_FAILURE_INJECTED','Disposable parser rejected corrupted input',true);"))
            if terminal.get('accepted') is not True or terminal.get('status') != 'failed':
                raise RuntimeError('R11_PARSER_FAILURE_NOT_TERMINAL')
            result['failure'] = {'parser_exit_code': process.returncode, 'terminal': terminal,
                                 'parser_execution_count': 1}
            result['checkpoint'] = 'PARSER_FAILED_TERMINALIZED'
            result['worker_end'] = time.time()
            result['worker_exit_code'] = 0
            return result
        if process.returncode or not parser_output.is_file():
            raise RuntimeError('R11_CLAIMED_PARSER_FAILED')
        parsed = json.loads(parser_output.read_text())
        if (parsed['parser_version'] != '0.42.0' or parsed['parser_exit_code'] != 0
                or parsed['parser_result'] != 'PASS' or not parsed['raw_evidence_present']):
            raise RuntimeError('R11_CLAIMED_PARSER_RESULT_INVALID')
        result['parser'] = {field: parsed[field] for field in (
            'parser_execution_id', 'parser_version', 'parser_contract', 'parser_start',
            'parser_finish', 'parser_exit_code', 'parser_result', 'parser_output_digest',
            'worker_pid', 'players', 'rounds', 'events', 'raw_evidence_present')}
        result['checkpoint'] = 'PARSER_COMPLETED'
        result.update(run_integrated(db, api_url, key, claimed, worker_id, parsed,
                                     acknowledge_message=not defer_ack))
        if checkpoint_file:
            Path(checkpoint_file).write_text(json.dumps(result))
        if defer_ack:
            while True:
                time.sleep(1)
    result['worker_end'] = time.time()
    result['worker_exit_code'] = 0
    return result


def main() -> int:
    if len(sys.argv) < 3 or sys.argv[1] != '--expected-json':
        raise RuntimeError('R11_WORKER_EXPECTED_FILE_REQUIRED')
    flags = set(sys.argv[3:])
    if not flags.issubset({'--inject-parser-failure', '--defer-ack', '--hold-after-claim', '--recover-terminal'}):
        raise RuntimeError('R11_WORKER_FLAG_INVALID')
    expected = json.loads(Path(sys.argv[2]).read_text())
    db_url = os.environ.get('F553_LOCAL_DB_URL', '')
    if '--recover-terminal' in flags:
        result = recover_terminal(db_url, expected)
    else:
        result = process_claim(db_url, os.environ.get('F553_LOCAL_API_URL', ''),
                               os.environ.get('F553_LOCAL_SERVICE_KEY', ''), expected,
                               inject_parser_failure='--inject-parser-failure' in flags,
                               defer_ack='--defer-ack' in flags,
                               checkpoint_file=os.environ.get('F553_CHECKPOINT_FILE'),
                               hold_after_claim='--hold-after-claim' in flags)
    print(json.dumps(result, separators=(',', ':')), flush=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as exc:
        print(str(exc)[:200], file=sys.stderr)
        raise SystemExit(1) from exc