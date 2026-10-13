"""The R11 failure matrix: every case on its own fixture, terminal-state cases
on their own processed job; the producer refuses repeated identities.

The database is faked here (answers shaped like the disposable stack's), so
these tests prove the producer's bookkeeping, not the database behaviour; the
latter is exercised for real by the F553 R11.2 EXECUTION job on every PR.
"""
import importlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
matrices = importlib.import_module("f553.r11.matrices")

EVIDENCE = {"run_id": "11111111-2222-3333-4444-555555555555", "commit_sha": "a" * 40, "workflow_run_id": 1,
            "workflow_run_attempt": 1, "workflow": "Quality Gates", "job": "F553 R11.2 EXECUTION", "ref": "refs/heads/x"}


class FakeDb:
    def __init__(self):
        self.jobs = {}

    def sql(self, _db, statement):
        if "pgmq.send" in statement:
            return "7"
        if "pgmq.archive" in statement and "900000000" in statement or "pgmq.archive" in statement and ", 9" in statement:
            return "f"
        if "pgmq.archive" in statement:
            self.archived = getattr(self, "archived", 0) + 1
            return "t" if self.archived % 2 else "f"
        if "count(*) FROM pgmq.a_" in statement:
            return "1"
        if "count(*) FROM pgmq.q_" in statement:
            return "0"
        if "pgmq.read" in statement:
            return ""
        if "SELECT status FROM public.demo_jobs" in statement:
            return "processed"
        if "fail_demo_parse_message" in statement:
            return json.dumps({"accepted": False})
        if "enqueue_demo_job" in statement:
            return json.dumps({"queued": False, "duplicate": True, "status": "processed"})
        return ""


@pytest.fixture()
def fake(monkeypatch, tmp_path):
    db = FakeDb()
    monkeypatch.setattr(matrices, "sql", db.sql)
    monkeypatch.setattr(matrices, "DOCS", tmp_path)
    return db


def producer():
    calls = []

    def processed_job(index):
        n = len(calls)
        calls.append(index)
        return {"identity": {"job_id": f"job-{n}", "upload_id": f"upload-{n}", "user_id": f"user-{n}",
                             "message_id": 100 + n, "attempt_number": 1},
                "worker_id": f"worker-{n}", "scope": "real upload/queue/claim/Storage GET/parser/RAW/read-back/HOT/FINISHED/ACK"}

    return processed_job, calls


def test_failure_matrix_has_fifty_distinct_fixtures_and_twenty_independent_processed_jobs(fake):
    processed_job, calls = producer()
    result = matrices.run_failure_matrix({}, EVIDENCE, {"identity": {"upload_id": "shared"}}, processed_job)
    cases = result["cases"]
    assert result["case_count"] == 50
    assert len({c["fixture_id"] for c in cases}) == 50
    assert len({c["case_id"] for c in cases}) == 50
    assert calls == [i for i in range(50) if i % 5 in (3, 4)]
    terminal = [c for c in cases if c["category"] in ("terminal_replay_rejection", "terminal_enqueue_rejection")]
    assert len(terminal) == 20
    assert len({c["evidence"]["job_id"] for c in terminal}) == 20
    assert all(c["fixture_id"].startswith("upload-") for c in terminal)
    assert "shared" not in {c["fixture_id"] for c in cases}  # the lifecycle job is never reused
    assert all(c["evidence"]["produced_by"].endswith("FINISHED/ACK") for c in terminal)
    written = json.loads((matrices.DOCS / "f553-r11-failure-matrix.json").read_text())
    assert written["case_count"] == 50


def test_a_producer_that_reuses_a_processed_job_is_refused(fake):
    def reused(index):
        return {"identity": {"job_id": "job-x", "upload_id": "upload-x", "user_id": "u", "message_id": 1,
                             "attempt_number": 1}, "worker_id": "w", "scope": "s"}

    with pytest.raises(RuntimeError, match="R11_MATRIX_DUPLICATE_FIXTURE_ID:failure"):
        matrices.run_failure_matrix({}, EVIDENCE, {}, reused)


@pytest.mark.parametrize("field", ["case_id", "fixture_id"])
def test_any_matrix_with_a_repeated_or_empty_identity_is_refused(field):
    cases = [{"case_id": "A", "fixture_id": "f1"}, {"case_id": "B", "fixture_id": "f2"}]
    cases[1][field] = cases[0][field]
    with pytest.raises(RuntimeError, match=f"R11_MATRIX_DUPLICATE_{field.upper()}"):
        matrices._base(EVIDENCE, "race", cases)
    cases[1][field] = ""
    with pytest.raises(RuntimeError, match=f"R11_MATRIX_DUPLICATE_{field.upper()}"):
        matrices._base(EVIDENCE, "race", cases)


def test_a_failing_terminal_case_stops_the_matrix(fake, monkeypatch):
    processed_job, _ = producer()
    original = fake.sql

    def accepting(db, statement):
        if "fail_demo_parse_message" in statement:
            return json.dumps({"accepted": True})
        return original(db, statement)

    monkeypatch.setattr(matrices, "sql", accepting)
    with pytest.raises(RuntimeError, match="R11_FAILURE_CASE_FAILED:4"):
        matrices.run_failure_matrix({}, EVIDENCE, {}, processed_job)


def test_the_engine_gives_every_terminal_case_a_new_job():
    source = (ROOT / "scripts/f553-r11-execution-engine.py").read_text()
    block = source[source.index("def processed_job(index):"):source.index("matrices = run_all(")]
    assert "claimed_job_parser()" in block and "R11_MATRIX_FIXTURE_NOT_PROCESSED" in block
    assert "run_all(db, api_url, key, evidence, lifecycle_observation, processed_job)" in source
