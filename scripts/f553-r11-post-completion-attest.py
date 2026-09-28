#!/usr/bin/env python3
"""Read-only post-job R11 attestation; never authorizes production.

This verifier runs in a separate CI job after the disposable execution job.
It does not execute parser, database, or application code.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import zipfile

REPO = 'GameProAcademy/cs2-pro-hub'
PHASE = 'F.5.3-CLOSURE.8-R11.2'
GATES = ('pgmq', 'postgrest', 'storage', 'finished', 'ack_loss', 'fresh_worker',
         'failed', 'aborted', 'queue_idempotency', 'hot_raw_identity',
         'raw_integrity', 'parser_exactly_once', 'race_matrix', 'failure_matrix',
         'docker', 'browser', 'parser_tests')
LOCKS = ('realDemAuthorized', 'canonicalAuthorized', 'railwayAuthorized', 'productionWrites')
ARTIFACT = 'f553-r11-disposable-evidence'
EXECUTION_JOB = 'F553 R11.2 EXECUTION'


def github_json(path, token):
    if not path.startswith(f'/repos/{REPO}/'):
        raise ValueError('GitHub path outside the configured repository')
    request = urllib.request.Request('https://api.github.com' + path,
                                     headers={'Authorization': 'Bearer ' + token,
                                              'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def archive_bytes(path, token):
    url = 'https://api.github.com' + path
    opener = urllib.request.build_opener(NoRedirect)
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token,
                                                    'Accept': 'application/vnd.github+json'})
    try:
        opener.open(request, timeout=30)
        raise RuntimeError('Artifact endpoint did not redirect')
    except urllib.error.HTTPError as exc:
        location = exc.headers.get('Location')
        if exc.code not in (302, 303) or not location:
            raise RuntimeError(f'Artifact download failed [{exc.code}]') from exc
    parsed = urlsplit(location)
    # GitHub serves artifact archives from its signed actions storage URL. Never
    # send the GitHub token to that destination or accept a non-TLS redirect.
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise RuntimeError('Untrusted artifact redirect')
    with urllib.request.urlopen(urllib.request.Request(location), timeout=90) as response:
        data = response.read(100 * 1024 * 1024 + 1)
    if len(data) > 100 * 1024 * 1024:
        raise RuntimeError('Artifact exceeded the attestation size limit')
    return data


def inspect_evidence(payloads, identity):
    issues = []
    try:
        evidence = json.loads(payloads['f553-r11-execution-evidence.json'])
    except (KeyError, ValueError, TypeError):
        return ['R11_EXECUTION_EVIDENCE_MISSING_OR_INVALID']
    for field, expected in identity.items():
        if evidence.get(field) != expected:
            issues.append('R11_PROVENANCE_' + field.upper())
    if evidence.get('phase') != PHASE or evidence.get('evidence_version') != 12:
        issues.append('R11_EVIDENCE_VERSION_MISMATCH')
    if evidence.get('disposable') is not True or any(evidence.get(lock) is not False for lock in LOCKS):
        issues.append('R11_PRODUCTION_LOCK_VIOLATION')
    start, end = evidence.get('started_at'), evidence.get('finished_at')
    if not (isinstance(start, (int, float)) and isinstance(end, (int, float))
            and 0 < start <= end <= time.time() + 5):
        issues.append('R11_INVALID_TIMESTAMPS')
    gates = evidence.get('gates')
    if not isinstance(gates, dict) or set(gates) != set(GATES) | {'final_ci'}:
        issues.append('R11_INCOMPLETE_GATE_INVENTORY')
    else:
        for gate in GATES:
            if gates[gate] != 'PASS':
                issues.append('R11_GATE_' + gate.upper() + '_NOT_PROVEN')
        # Only this post-completion job may attest final_ci. Reject self-attestation.
        if gates['final_ci'] == 'PASS':
            issues.append('R11_SELF_ATTESTATION')
    for name, minimum in (('race', 50), ('failure', 50), ('raw-corruption', 16)):
        try:
            matrix = json.loads(payloads[f'f553-r11-{name}-matrix.json'])
            cases = matrix['cases']
            if (matrix.get('phase') != PHASE or matrix.get('evidence_version') != 12
                    or any(matrix.get(field) != value for field, value in identity.items())
                    or not isinstance(cases, list) or len(cases) < minimum):
                raise ValueError('Matrix provenance or count mismatch')
            ids = set()
            fixtures = set()
            for case in cases:
                if not isinstance(case, dict):
                    raise ValueError('Invalid case')
                cid = case.get('case_id')
                fixture = case.get('fixture_id')
                if (not cid or cid in ids or not fixture or fixture in fixtures
                        or case.get('executed') is not True or case.get('result') != 'PASS'
                        or not case.get('category') or not case.get('operation')
                        or not case.get('before_digest') or not case.get('after_digest')
                        or not case.get('evidence')
                        or any(case.get(field) != value for field, value in identity.items())
                        or not isinstance(case.get('timestamp'), (float, int))
                        or not isinstance(start, (float, int)) or not isinstance(end, (float, int))
                        or not start <= case['timestamp'] <= end):
                    raise ValueError('Invalid or duplicate case')
                ids.add(cid)
                fixtures.add(fixture)
        except (KeyError, ValueError, TypeError):
            issues.append('R11_' + name.upper().replace('-', '_') + '_MATRIX_NOT_PROVEN')
    return issues


def attest(run, jobs, artifacts, archive, identity):
    issues = []
    if (run.get('status') != 'completed' or run.get('conclusion') != 'success'
            or run.get('head_sha') != identity['commit_sha']
            or str(run.get('id')) != identity['workflow_run_id']
            or str(run.get('run_attempt')) != identity['workflow_run_attempt']
            or run.get('name') != identity['workflow'] or run.get('path') != '.github/workflows/quality-gates.yml'):
        issues.append('R11_WORKFLOW_NOT_SUCCESSFUL_OR_PROVENANCE_MISMATCH')
    job = next((entry for entry in jobs.get('jobs', []) if entry.get('name') == EXECUTION_JOB), None)
    if not job or job.get('status') != 'completed' or job.get('conclusion') != 'success':
        issues.append('R11_EXECUTION_JOB_NOT_SUCCESSFUL')
    else:
        if job.get('head_sha') != identity['commit_sha']:
            issues.append('R11_JOB_SHA_MISMATCH')
    artifact = next((entry for entry in artifacts.get('artifacts', []) if entry.get('name') == ARTIFACT), None)
    if not artifact or artifact.get('expired') is not False or not artifact.get('digest'):
        return issues + ['R11_ARTIFACT_MISSING_OR_EXPIRED'], None
    digest = 'sha256:' + hashlib.sha256(archive).hexdigest()
    if digest != artifact['digest']:
        return issues + ['R11_ARTIFACT_DIGEST_MISMATCH'], digest
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            names = zipped.namelist()
            if any(zipped.getinfo(name).file_size > 20 * 1024 * 1024 for name in names):
                raise ValueError('Oversized evidence member')
            if (len(names) != len(set(names)) or len(names) > 64
                    or any(Path(name).is_absolute() or '..' in Path(name).parts for name in names)):
                raise ValueError('Invalid archive entries')
            payloads = {Path(name).name: zipped.read(name) for name in names if not name.endswith('/')}
            if len(payloads) != len([name for name in names if not name.endswith('/')]):
                raise ValueError('Duplicate evidence basenames')
        issues.extend(inspect_evidence(payloads, identity))
    except (zipfile.BadZipFile, ValueError, RuntimeError, KeyError):
        issues.append('R11_ARTIFACT_CONTENT_INVALID')
    return issues, digest


def main():
    # The attestation workflow has a different run identity from the execution
    # workflow. These expected fields come from the completed workflow_run event.
    identity = {field: os.environ.get(variable) for field, variable in (
        ('commit_sha', 'F553_SOURCE_SHA'), ('workflow_run_id', 'F553_SOURCE_RUN_ID'),
        ('workflow_run_attempt', 'F553_SOURCE_RUN_ATTEMPT'),
        ('workflow', 'F553_SOURCE_WORKFLOW'), ('ref', 'F553_SOURCE_REF'))}
    token = os.environ.get('GITHUB_TOKEN')
    issues = []
    digest = None
    try:
        if not token or not all(identity.values()):
            raise RuntimeError('Missing GitHub run identity or CI token')
        run_id = identity['workflow_run_id']
        base = f'/repos/{REPO}/actions/runs/{run_id}'
        run = github_json(base, token)
        jobs = github_json(base + '/jobs?per_page=100', token)
        artifacts = github_json(base + '/artifacts?per_page=100', token)
        artifact = next((entry for entry in artifacts.get('artifacts', [])
                         if entry.get('name') == ARTIFACT), None)
        archive = archive_bytes(f'/repos/{REPO}/actions/artifacts/{artifact["id"]}/zip', token) if artifact else b''
        issues, digest = attest(run, jobs, artifacts, archive, identity)
    except (OSError, KeyError, ValueError, RuntimeError, urllib.error.URLError) as exc:
        issues.append('R11_ATTESTATION_UNAVAILABLE_' + type(exc).__name__.upper())
    decision = 'CLOSED' if not issues else 'BLOCKED'
    result = {'phase': PHASE, 'evidence_version': 12, **identity,
              'final_decision': decision, 'final_ci': 'PASS' if not issues else 'NOT_PROVEN',
              'artifact_digest': digest, 'issues': issues,
              **{lock: False for lock in LOCKS}, 'verified_at': time.time()}
    path = Path(os.environ.get('F553_ATTESTATION_OUT', '/tmp/f553-r11-post-completion.json'))
    path.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'final_decision': decision, 'issues': issues, 'artifact_digest': digest}))
    return 0 if not issues else 1


if __name__ == '__main__':
    sys.exit(main())
