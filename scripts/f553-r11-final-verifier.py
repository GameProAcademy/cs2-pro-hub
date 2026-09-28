#!/usr/bin/env python3
"""Independent, fail-closed R11.2 Job A verifier; never executes business logic."""
import hashlib
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1] / 'docs/release-gates'
PHASE = 'F.5.3-CLOSURE.8-R11.2'
GATES = ('pgmq', 'postgrest', 'storage', 'finished', 'ack_loss', 'fresh_worker',
         'failed', 'aborted', 'queue_idempotency', 'hot_raw_identity', 'raw_integrity',
         'parser_exactly_once', 'race_matrix', 'failure_matrix', 'docker', 'browser',
         'parser_tests', 'final_ci')
LOCKS = ('realDemAuthorized', 'canonicalAuthorized', 'railwayAuthorized', 'productionWrites')


def read(name):
    path = ROOT / name
    return json.loads(path.read_text()) if path.is_file() else None


def main():
    evidence = read('f553-r11-execution-evidence.json')
    expected = {field: os.environ.get(variable) for field, variable in (
        ('run_id', 'F553_RUN_ID'), ('commit_sha', 'GITHUB_SHA'),
        ('workflow_run_id', 'GITHUB_RUN_ID'), ('workflow_run_attempt', 'GITHUB_RUN_ATTEMPT'),
        ('workflow', 'GITHUB_WORKFLOW'), ('job', 'GITHUB_JOB'), ('ref', 'GITHUB_REF'))}
    issues = []
    if not evidence:
        issues.append('R11 execution evidence missing')
    elif (not all(expected.values()) or evidence.get('phase') != PHASE
          or evidence.get('evidence_version') != 12
          or any(evidence.get(field) != value for field, value in expected.items())):
        issues.append('R11 provenance differs from the current workflow execution')
    else:
        start, end = evidence.get('started_at'), evidence.get('finished_at')
        if (not isinstance(start, (float, int)) or not isinstance(end, (float, int))
                or start != float(os.environ.get('F553_STARTED_AT', 0))
                or not start <= end <= time.time() + 5):
            issues.append('Invalid execution timestamps')
        if evidence.get('disposable') is not True or any(evidence.get(lock) is not False for lock in LOCKS):
            issues.append('Disposable/production lock invariant violated')

    gates = evidence.get('gates', {}) if isinstance(evidence, dict) else {}
    if not isinstance(gates, dict) or set(gates) != set(GATES):
        issues.append('Incomplete mandatory gate inventory')
        gates = {}
    for gate in GATES:
        if gates.get(gate) != 'PASS':
            issues.append(f'{gate}: {gates.get(gate, "NOT_PROVEN")}')
    for name, minimum in (('race', 50), ('failure', 50), ('raw-corruption', 16)):
        matrix = read(f'f553-r11-{name}-matrix.json')
        if not matrix or not evidence:
            issues.append(f'{name}: no executed matrix')
            continue
        cases = matrix.get('cases')
        if (matrix.get('phase') != PHASE or matrix.get('evidence_version') != 12
                or any(matrix.get(field) != value for field, value in expected.items())
                or not isinstance(cases, list) or len(cases) < minimum):
            issues.append(f'{name}: invalid provenance or too few cases')
            continue
        seen = set()
        for case in cases:
            if not isinstance(case, dict):
                issues.append(f'{name}: invalid case'); break
            identifier = case.get('case_id')
            if (not identifier or identifier in seen or case.get('executed') is not True
                    or case.get('result') != 'PASS' or not case.get('fixture_id')
                    or not case.get('category') or not case.get('operation')
                    or not case.get('before_digest') or not case.get('after_digest')
                    or not case.get('evidence') or any(case.get(field) != value for field, value in expected.items())
                    or not isinstance(case.get('timestamp'), (int, float))
                    or not evidence['started_at'] <= case['timestamp'] <= evidence['finished_at']):
                issues.append(f'{name}: invalid or duplicate executed case'); break
            seen.add(identifier)
    decision = {'phase': PHASE, 'evidence_version': 12, **expected,
                'final_decision': 'BLOCKED', 'mandatory_gates': {gate: gates.get(gate, 'NOT_PROVEN') for gate in GATES},
                'issues': issues, **{lock: False for lock in LOCKS},
                'verified_at': time.time(),
                'execution_evidence_sha256': hashlib.sha256((ROOT / 'f553-r11-execution-evidence.json').read_bytes()).hexdigest() if evidence else None,
                'final_ci': 'NOT_PROVEN'}
    # A running job cannot attest its own GitHub conclusion or artifact digest.
    # Post-completion independent attestation is required even with no issues.
    (ROOT / 'f553-r11-final.json').write_text(json.dumps(decision, indent=2) + '\n')
    print(json.dumps({'final_decision': 'BLOCKED', 'issues': issues}))
    return 1


if __name__ == '__main__':
    sys.exit(main())