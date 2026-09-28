"""Negative-only checks: incomplete or forged R11 artifacts never close."""
import importlib.util
import io
import hashlib
import json
from pathlib import Path
import time
import unittest
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / 'f553-r11-post-completion-attest.py'
spec = importlib.util.spec_from_file_location('f553_r11_attestation', SCRIPT)
attest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(attest)

IDENTITY = {'commit_sha': 'a' * 40, 'workflow_run_id': '123',
            'workflow_run_attempt': '1', 'workflow': 'Quality Gates',
            'ref': 'refs/heads/main'}


def archive(payloads):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as zipped:
        for name, payload in payloads.items():
            zipped.writestr(name, json.dumps(payload))
    return out.getvalue()


def fixture():
    now = time.time()
    evidence = {'phase': attest.PHASE, 'evidence_version': 12, **IDENTITY,
                'disposable': True, 'started_at': now - 5, 'finished_at': now,
                'gates': {gate: 'PASS' for gate in attest.GATES} | {'final_ci': 'NOT_PROVEN'},
                **{lock: False for lock in attest.LOCKS}}
    matrices = {}
    for name, count in [('race', 50), ('failure', 50), ('raw-corruption', 16)]:
        matrices[f'f553-r11-{name}-matrix.json'] = {
            'phase': attest.PHASE, 'evidence_version': 12, **IDENTITY,
            'cases': [{'case_id': f'{name}-{i}', 'fixture_id': f'{name}-fixture-{i}',
                       'executed': True, 'result': 'PASS', 'category': name,
                       'operation': name, 'before_digest': 'a' * 64,
                       'after_digest': 'b' * 64, 'evidence': {'observed': True},
                       'timestamp': now - 1, **IDENTITY} for i in range(count)]}
    return {'f553-r11-execution-evidence.json': evidence, **matrices}


def assess(payloads, conclusion='success', digest_override=None, status='completed'):
    data = archive(payloads)
    digest = digest_override or 'sha256:' + hashlib.sha256(data).hexdigest()
    run = {'status': status, 'conclusion': conclusion, 'head_sha': IDENTITY['commit_sha'],
           'id': 123, 'run_attempt': 1, 'name': IDENTITY['workflow'],
           'path': '.github/workflows/quality-gates.yml'}
    jobs = {'jobs': [{'name': attest.EXECUTION_JOB, 'status': 'completed',
                      'conclusion': 'success', 'head_sha': IDENTITY['commit_sha']}]}
    artifacts = {'artifacts': [{'name': attest.ARTIFACT, 'expired': False, 'digest': digest}]}
    return attest.attest(run, jobs, artifacts, data, IDENTITY)[0]


class FailClosedAttestation(unittest.TestCase):
    def test_self_reported_baseline_cannot_close(self):
        self.assertIn('R11_INTEGRATED_BOUNDARY_NOT_INDEPENDENTLY_RECONSTRUCTED', assess(fixture()))

    def test_missing_evidence(self):
        data = fixture()
        del data['f553-r11-execution-evidence.json']
        self.assertIn('R11_EXECUTION_EVIDENCE_MISSING_OR_INVALID', assess(data))

    def test_wrong_sha_and_run(self):
        for field in ('commit_sha', 'workflow_run_id', 'workflow'):
            with self.subTest(field=field):
                data = fixture()
                data['f553-r11-execution-evidence.json'][field] = 'wrong'
                self.assertTrue(assess(data))

    def test_future_timestamp(self):
        data = fixture()
        data['f553-r11-execution-evidence.json']['finished_at'] = time.time() + 100
        self.assertIn('R11_INVALID_TIMESTAMPS', assess(data))

    def test_duplicate_case_or_fixture(self):
        for field in ('case_id', 'fixture_id'):
            with self.subTest(field=field):
                data = fixture()
                cases = data['f553-r11-race-matrix.json']['cases']
                cases[1][field] = cases[0][field]
                self.assertIn('R11_RACE_MATRIX_NOT_PROVEN', assess(data))

    def test_insufficient_matrices(self):
        for name in ('race', 'failure', 'raw-corruption'):
            with self.subTest(name=name):
                data = fixture()
                data[f'f553-r11-{name}-matrix.json']['cases'].pop()
                self.assertTrue(assess(data))

    def test_gate_and_lock(self):
        for value in ('FAIL', 'NOT_PROVEN'):
            data = fixture()
            data['f553-r11-execution-evidence.json']['pgmq'] = value
            data['f553-r11-execution-evidence.json']['gates']['pgmq'] = value
            self.assertIn('R11_GATE_PGMQ_NOT_PROVEN', assess(data))
        data = fixture()
        data['f553-r11-execution-evidence.json']['productionWrites'] = True
        self.assertIn('R11_PRODUCTION_LOCK_VIOLATION', assess(data))

    def test_artifact_digest_and_run_conclusion(self):
        data = fixture()
        self.assertIn('R11_ARTIFACT_DIGEST_MISMATCH', assess(data, digest_override='sha256:' + '0' * 64))
        self.assertIn('R11_WORKFLOW_NOT_SUCCESSFUL_OR_PROVENANCE_MISMATCH', assess(data, conclusion='failure'))
        self.assertIn('R11_WORKFLOW_NOT_SUCCESSFUL_OR_PROVENANCE_MISMATCH', assess(data, status='in_progress'))

    def test_self_attestation(self):
        data = fixture()
        data['f553-r11-execution-evidence.json']['gates']['final_ci'] = 'PASS'
        self.assertIn('R11_SELF_ATTESTATION', assess(data))


if __name__ == '__main__':
    unittest.main()
