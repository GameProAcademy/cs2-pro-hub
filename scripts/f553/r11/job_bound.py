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

from f553.r11.lifecycle import database_env, http, ident, object_path, sql


def process_claim(db_url: str, api_url: str, key: str, expected: dict) -> dict:
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
    _, content = http(api_url, key, object_path('demos', claimed['storage_path']))
    digest = hashlib.sha256(content).hexdigest()
    if len(content) != claimed['file_size'] or digest != claimed['demo_sha256']:
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
        process = subprocess.run(command, capture_output=True, text=True, timeout=600)
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
        result['checkpoint'] = 'PARSER_COMPLETED_RAW_NOT_PERSISTED'
    result['worker_end'] = time.time()
    result['worker_exit_code'] = 0
    return result


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] != '--expected-json':
        raise RuntimeError('R11_WORKER_EXPECTED_FILE_REQUIRED')
    expected = json.loads(Path(sys.argv[2]).read_text())
    result = process_claim(os.environ.get('F553_LOCAL_DB_URL', ''),
                           os.environ.get('F553_LOCAL_API_URL', ''),
                           os.environ.get('F553_LOCAL_SERVICE_KEY', ''), expected)
    print(json.dumps(result, separators=(',', ':')), flush=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as exc:
        print(str(exc)[:200], file=sys.stderr)
        raise SystemExit(1) from exc