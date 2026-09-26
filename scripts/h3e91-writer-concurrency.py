"""Disposable PostgreSQL proof; synthetic identities only, never a DEM or live DB."""
import concurrent.futures
import hashlib
import json
import os
import pathlib
import random
import shutil
import subprocess
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATIONS = (
    "20260926020606_0ba1725a-4f21-4c1e-8d4a-68d3b81b0037.sql",
    "20260926030030_f488bae4-e05f-48cb-a00d-bd396e374e49.sql",
    "20260926030143_2adf7bc6-223e-454f-a120-e81a157f3e0b.sql",
    "20260926030840_c41e0dea-f0d1-4596-9f5d-6b1d1ba34912.sql",
    "20260926031500_8a2e6d53-36cb-44ab-9998-a4fe3210bd1a.sql",
)
BASE = (ROOT / "supabase/migrations/20260926013427_db74f397-2274-4c39-ba28-c6a87d80e314.sql").read_text().split(
    "-- Correct the previously deployed mutable-job diagnostic:"
)[0]


def quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def main():
    root = pathlib.Path(tempfile.mkdtemp(prefix="h3e91-writer-", dir="/tmp"))
    data = root / "data"
    port = random.randint(21000, 47000)
    user = ["setpriv", "--reuid=lovable", "--regid=lovable", "--clear-groups"] if os.geteuid() == 0 else []
    if user:
        shutil.chown(root, user="lovable", group="lovable")
    env = {"PATH": os.environ["PATH"], "HOME": "/tmp", "LANG": "C", "PGOPTIONS": "-c statement_timeout=10000 -c lock_timeout=8000"}

    def run(command, **kw):
        result = subprocess.run(user + command, env=env, text=True, capture_output=True, timeout=20, **kw)
        if result.returncode:
            raise RuntimeError(result.stderr.strip())
        return result.stdout.strip()

    def sql(command):
        return run(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", str(root), "-p", str(port), "-d", "postgres", "-c", command])

    started = False
    try:
        run(["initdb", "-D", str(data), "-A", "trust", "--no-locale"])
        run(["pg_ctl", "-D", str(data), "-l", str(root / "postgres.log"), "-o", f"-k {root} -p {port} -h ''", "-w", "start"])
        started = True
        sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE sandbox_exec; CREATE ROLE service_role; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;")
        sql(BASE)
        for migration in MIGRATIONS:
            sql((ROOT / "supabase/migrations" / migration).read_text())
        assert sql("SELECT has_table_privilege('service_role','public.h3e91_execution_evidence_ledger','INSERT')") == "f"
        assert sql("SELECT has_function_privilege('service_role',p.oid,'EXECUTE') FROM pg_proc p WHERE proname='h3e91_record_execution_event'") == "t"

        def event(kind, base=None):
            if base is None:
                base = [str(uuid.uuid4()), str(uuid.uuid4()), "EXECUTION_INTENT",
                        str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4()), 1,
                        None, None, None, None, None, "APP_REMOTE_PARSER", "APP", None, None, 1]
            row = base.copy()
            row[0], row[2] = str(uuid.uuid4()), kind
            if kind != "EXECUTION_INTENT":
                row[7:12] = ["a" * 64, 520, "parser", "0.42.0", "git:synthetic"]
            if kind in ("EXECUTION_FINISHED", "EXECUTION_FAILED", "EXECUTION_ABORTED"):
                row[15] = "PARSE_SUCCEEDED" if kind == "EXECUTION_FINISHED" else "WORKER_INTERRUPTED"
            return row

        def call(values):
            return json.loads(sql("SELECT public.h3e91_record_execution_event(" + ",".join(map(quote, values)) + ")::text"))

        def assert_result(row, status, code=None):
            result = call(row)
            assert result["status"] == status and (code is None or result.get("code") == code), result
            return result

        # Each case uses a fresh synthetic execution. Paired calls use separate psql
        # processes and independent PostgreSQL connections; only the DB serializes them.
        names = (
            "identical_intent", "conflicting_intent", "identical_started", "conflicting_started",
            "duplicate_finished", "finished_failed", "finished_aborted", "failed_aborted",
            "duplicate_terminal", "started_finished", "started_failed", "started_aborted",
            "stable_intent", "changed_intent_id", "lost_response", "identity_conflict",
            "parser_conflict", "demo_conflict", "cross_execution_id", "terminal_after_terminal",
            "started_without_intent", "finished_without_started", "failed_without_started",
            "aborted_without_intent", "aborted_after_started", "full_lifecycle_replay",
            "concurrent_full_lifecycle", "writer_error_rollback", "failed_insert_no_partial", "production_untouched",
        )
        for case, name in enumerate(names, 1):
            intent = event("EXECUTION_INTENT")
            execution = intent[1]
            started_row = event("EXECUTION_STARTED", intent)
            finished = event("EXECUTION_FINISHED", intent)
            failed = event("EXECUTION_FAILED", intent)
            aborted = event("EXECUTION_ABORTED", intent)
            prior = []
            pair = None
            expected = None
            if name in ("identical_intent", "stable_intent", "lost_response"):
                pair, expected = [intent, intent.copy()], [("INSERTED", None), ("IDEMPOTENT_REPLAY", None)]
            elif name in ("conflicting_intent", "changed_intent_id"):
                other = intent.copy(); other[0] = str(uuid.uuid4())
                pair, expected = [intent, other], [("INSERTED", None), ("REJECTED", "TRANSITION_CONFLICT")]
            elif name in ("identical_started", "conflicting_started", "parser_conflict", "demo_conflict"):
                prior = [intent]
                other = started_row.copy()
                if name == "conflicting_started": other[0] = str(uuid.uuid4())
                if name == "parser_conflict": other[0], other[11] = str(uuid.uuid4()), "git:other"
                if name == "demo_conflict": other[0], other[7] = str(uuid.uuid4()), "b" * 64
                pair = [started_row, other]
                expected = [("INSERTED", None), ("REJECTED", "TRANSITION_CONFLICT")] if name != "identical_started" else [("INSERTED", None), ("IDEMPOTENT_REPLAY", None)]
            elif name in ("duplicate_finished", "finished_failed", "finished_aborted", "failed_aborted", "duplicate_terminal"):
                prior = [intent, started_row]
                pair = {
                    "duplicate_finished": [finished, finished.copy()], "finished_failed": [finished, failed],
                    "finished_aborted": [finished, aborted], "failed_aborted": [failed, aborted],
                    "duplicate_terminal": [failed, failed.copy()],
                }[name]
                expected = [("INSERTED", None), ("IDEMPOTENT_REPLAY", None)] if pair[0] == pair[1] else [("INSERTED", None), ("REJECTED", "INVALID_TRANSITION")]
            elif name in ("started_finished", "started_failed", "started_aborted"):
                prior = [intent]
                pair = [started_row, {"started_finished": finished, "started_failed": failed, "started_aborted": aborted}[name]]
                # The terminal may win first and be rejected; or STARTED wins and
                # the terminal follows. Assert only a valid serialized lifecycle.
            elif name == "identity_conflict":
                prior = [intent]
                other = started_row.copy(); other[0], other[3] = str(uuid.uuid4()), str(uuid.uuid4())
                pair = [started_row, other]
            elif name == "cross_execution_id":
                other = event("EXECUTION_INTENT"); other[0] = intent[0]
                pair, expected = [intent, other], [("INSERTED", None), ("REJECTED", "EVENT_ID_CONFLICT")]
            elif name == "terminal_after_terminal":
                prior = [intent, started_row, finished]
                assert_result(failed, "REJECTED", "INVALID_TRANSITION")
            elif name in ("started_without_intent", "finished_without_started", "failed_without_started", "aborted_without_intent"):
                if name in ("finished_without_started", "failed_without_started"): prior = [intent]
                rejected = {"started_without_intent": started_row, "finished_without_started": finished,
                            "failed_without_started": failed, "aborted_without_intent": aborted}[name]
                for row in prior: assert_result(row, "INSERTED")
                assert_result(rejected, "REJECTED", "INVALID_TRANSITION")
                prior = []
            elif name == "aborted_after_started": prior = [intent, started_row, aborted]
            elif name == "full_lifecycle_replay": prior = [intent, started_row, finished]
            elif name == "concurrent_full_lifecycle":
                pair, expected = [intent, intent.copy()], [("INSERTED", None), ("IDEMPOTENT_REPLAY", None)]
            elif name == "writer_error_rollback":
                bad = intent.copy(); bad[16] = 2
                assert_result(bad, "REJECTED", "UNSUPPORTED_VERSION")
                prior = [intent]
            elif name == "failed_insert_no_partial":
                bad = intent.copy(); bad[12] = "INVALID"
                assert_result(bad, "REJECTED", "UNSUPPORTED_SURFACE")
                prior = [intent]
            elif name == "production_untouched": prior = [intent]

            for row in prior: assert_result(row, "INSERTED")
            if pair:
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                    futures = [pool.submit(call, row) for row in pair]
                    results = [f.result(timeout=15) for f in futures]
                statuses = sorted((r["status"], r.get("code")) for r in results)
                if expected:
                    assert statuses == sorted(expected), (name, results)
                else:
                    assert sorted(r["status"] for r in results) in (["INSERTED", "INSERTED"], ["INSERTED", "REJECTED"]), (name, results)
                    if name == "identity_conflict":
                        assert sorted(r["status"] for r in results) == ["INSERTED", "REJECTED"]
                        assert next(r["code"] for r in results if r["status"] == "REJECTED") in ("EXECUTION_IDENTITY_CONFLICT", "TRANSITION_CONFLICT")
            if name in ("concurrent_full_lifecycle",):
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                    assert sorted(r["status"] for r in [f.result() for f in [pool.submit(call, started_row), pool.submit(call, started_row)]]) == ["IDEMPOTENT_REPLAY", "INSERTED"]
                    assert sorted(r["status"] for r in [f.result() for f in [pool.submit(call, finished), pool.submit(call, finished)]]) == ["IDEMPOTENT_REPLAY", "INSERTED"]
            if name == "full_lifecycle_replay":
                for row in (intent, started_row, finished): assert_result(row, "IDEMPOTENT_REPLAY")
            rows = json.loads(sql(f"SELECT coalesce(json_agg(event_type ORDER BY event_at, created_at, id)::text,'[]') FROM public.h3e91_execution_evidence_ledger WHERE execution_id='{execution}'"))
            assert len(rows) == len(set(rows)) and rows.count("EXECUTION_INTENT") <= 1, (name, rows)
            assert sum(t in rows for t in ("EXECUTION_FINISHED", "EXECUTION_FAILED", "EXECUTION_ABORTED")) <= 1, (name, rows)
            if "EXECUTION_STARTED" in rows: assert "EXECUTION_INTENT" in rows
            if any(t in rows for t in ("EXECUTION_FINISHED", "EXECUTION_FAILED")): assert "EXECUTION_STARTED" in rows
            if len(rows) > 1: assert rows[0] == "EXECUTION_INTENT", (name, rows)
            if len(rows) == 3: assert rows[1] == "EXECUTION_STARTED", (name, rows)
            if name == "lost_response": assert_result(intent, "IDEMPOTENT_REPLAY")
            if name == "identical_intent":
                actual = sql(f"SELECT event_digest FROM public.h3e91_execution_evidence_ledger WHERE execution_id='{execution}'")
                # Writer canonical array begins with version and omits version
                # from the end of the caller's argument order.
                canonical = json.dumps([intent[16], *intent[:16]], ensure_ascii=False)
                assert actual == hashlib.sha256(canonical.encode("utf8")).hexdigest(), (actual, canonical)
            print(f"case {case}/30 {name}: {','.join(rows) or 'none'}")
        # Fifty isolated executions compete on independent PostgreSQL connections
        # for each transition. No in-process lock or shared result cache is used.
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            def stress_one(_):
                intent = event("EXECUTION_INTENT")
                started_row = event("EXECUTION_STARTED", intent)
                finished = event("EXECUTION_FINISHED", intent)
                for row in (intent, started_row, finished):
                    futures = [pool.submit(call, row), pool.submit(call, row)]
                    results = sorted(f.result(timeout=15)["status"] for f in futures)
                    assert results == ["IDEMPOTENT_REPLAY", "INSERTED"], results
                rows = json.loads(sql(f"SELECT json_agg(event_type ORDER BY event_at)::text FROM public.h3e91_execution_evidence_ledger WHERE execution_id='{intent[1]}'"))
                assert rows == ["EXECUTION_INTENT", "EXECUTION_STARTED", "EXECUTION_FINISHED"], rows
            # Submit successive executions from the parent; each transition itself
            # races in two psql subprocesses, each opening its own DB session.
            for i in range(50):
                stress_one(i)
        print("PASS: 30 disposable scenarios + 50 independent-session lifecycle stress executions; no live database access")
    finally:
        if started:
            run(["pg_ctl", "-D", str(data), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(root)


if __name__ == "__main__":
    main()