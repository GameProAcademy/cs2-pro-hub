#!/usr/bin/env python3
"""Executable probe of the durable demo-parse queue semantics.

Runs ONLY against a disposable local database built from supabase/migrations
(the R11.2 job's local stack, or any throwaway Postgres with pgmq). It refuses
any non-local host. It never talks to the managed database.

Each scenario asserts the behaviour the SQL functions have TODAY, including
the ones that are defects (marked KNOWN_DEFECT). The point is evidence: what
is actually guaranteed (at-least-once delivery, single active lease, fenced
stale workers) and what is not (a bound on redeliveries).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor

HOST = os.environ.get("QUEUE_PROBE_PGHOST", "127.0.0.1")
PORT = os.environ.get("QUEUE_PROBE_PGPORT", "54322")
USER = os.environ.get("QUEUE_PROBE_PGUSER", "postgres")
DB = os.environ.get("QUEUE_PROBE_PGDATABASE", "postgres")
LOCAL = ("127.0.0.1", "localhost", "::1")


def refuse_non_local() -> None:
    if not (HOST in LOCAL or HOST.startswith("/")):
        raise SystemExit("QUEUE_PROBE_REFUSES_NON_LOCAL_DATABASE")


def sql(query: str) -> str:
    result = subprocess.run(
        ["psql", "-h", HOST, "-p", PORT, "-U", USER, "-d", DB, "-Atq", "-v", "ON_ERROR_STOP=1", "-c", query],
        capture_output=True, text=True, check=False, env={**os.environ},
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip().splitlines()[0] if result.stderr.strip() else "psql failed")
    return result.stdout.strip()


def js(query: str) -> dict:
    return json.loads(sql(query))


def new_job() -> dict:
    user, upload = str(uuid.uuid4()), str(uuid.uuid4())
    sha = uuid.uuid4().hex + uuid.uuid4().hex
    sql(f"insert into auth.users(id,email) values ('{user}','{user}@probe.invalid')")
    sql("insert into public.uploads(id,user_id,type,file_name,storage_path,file_size,demo_sha256) "
        f"values ('{upload}','{user}','demo','probe.dem','{user}/{upload}.dem',520,'{sha}')")
    queued = js(f"select public.enqueue_demo_job('{upload}','{user}')")
    return {"user": user, "upload": upload, "job": queued["job_id"], "sha": sha}


def job(job_id: str) -> dict:
    return js("select to_jsonb(j) from (select status, stage, retry_count, max_retries, queue_message_id, "
              "dispatch_attempt, worker_id, error_code, lease_expires_at > now() as lease_live "
              f"from public.demo_jobs where id='{job_id}') j")


def claim(worker: str) -> dict:
    return js(f"select public.claim_demo_parse_message('{worker}', 60, 1)")


def expire_lease(job_id: str) -> None:
    """Simulate the passage of time: the lease and the message visibility lapse."""
    sql(f"update public.demo_jobs set lease_expires_at = now() - interval '1 second' where id='{job_id}'")
    sql("update pgmq.q_demo_parse set vt = now() - interval '1 second' "
        f"where (message->>'job_id') = '{job_id}'")


def drain() -> None:
    """Leave no live lease or visible message behind between scenarios."""
    sql("update public.demo_jobs set status='failed', stage='failed', lease_expires_at=null "
        "where status in ('pending','processing')")
    sql("select pgmq.purge_queue('demo_parse')")


def read_ct(job_id: str) -> int:
    return int(sql(f"select coalesce(max(read_ct),0) from pgmq.q_demo_parse where (message->>'job_id')='{job_id}'") or 0)


RESULTS: list[dict] = []


def scenario(name: str, kind: str = "GUARANTEE"):
    def wrap(fn):
        def run():
            drain()
            try:
                facts = fn() or {}
                RESULTS.append({"scenario": name, "kind": kind, "status": "PASS", **facts})
            except AssertionError as error:
                RESULTS.append({"scenario": name, "kind": kind, "status": "FAIL", "detail": str(error)[:300]})
            except Exception as error:  # noqa: BLE001 - reported, never hidden
                RESULTS.append({"scenario": name, "kind": kind, "status": "ERROR",
                                "detail": f"{type(error).__name__}: {str(error)[:300]}"})
        run.__name__ = fn.__name__
        return run
    return wrap


@scenario("duplicate_enqueue_creates_one_job_and_one_message")
def s_duplicate_enqueue():
    item = new_job()
    with ThreadPoolExecutor(8) as pool:
        answers = list(pool.map(lambda _: js(f"select public.enqueue_demo_job('{item['upload']}','{item['user']}')"), range(8)))
    jobs = int(sql(f"select count(*) from public.demo_jobs where upload_id='{item['upload']}'"))
    messages = int(sql(f"select count(*) from pgmq.q_demo_parse where (message->>'job_id')='{item['job']}'"))
    assert jobs == 1 and messages == 1, (jobs, messages)
    assert all(answer["duplicate"] is True and answer["queued"] is False for answer in answers)
    return {"jobs": jobs, "messages": messages}


@scenario("concurrent_claims_grant_exactly_one_lease")
def s_single_lease():
    item = new_job()
    with ThreadPoolExecutor(8) as pool:
        answers = list(pool.map(lambda i: claim(f"worker-{i}"), range(8)))
    claimed = [a for a in answers if a.get("status") == "claimed"]
    assert len(claimed) == 1, [a.get("status") for a in answers]
    assert all(a.get("status") in ("claimed", "busy", "empty") for a in answers)
    assert job(item["job"])["status"] == "processing"
    return {"claimed": 1, "others": sorted({a.get("status") for a in answers} - {"claimed"})}


@scenario("stale_worker_is_fenced_after_reclaim")
def s_fencing():
    item = new_job()
    first = claim("worker-old")
    expire_lease(item["job"])
    second = claim("worker-new")
    assert second["status"] == "claimed" and second["message_id"] == first["message_id"]
    args = f"'{item['job']}', {first['message_id']}, {first['attempt']}, 'worker-old'"
    heartbeat = js(f"select public.heartbeat_demo_parse_message({args}, 60, 'parsing')")
    assert heartbeat.get("accepted") is not True, heartbeat
    failed = js(f"select public.fail_demo_parse_message({args}, 'PARSER_ERROR', 'late', false)")
    assert failed.get("accepted") is not True, failed
    finalized = js(f"select public.finalize_demo_parse_message({args})")
    assert finalized.get("acknowledged") is not True, finalized
    state = job(item["job"])
    assert state["status"] == "processing" and state["worker_id"] == "worker-new", state
    return {"heartbeat": heartbeat, "fail": failed, "finalize": finalized}


@scenario("finalize_requires_a_terminal_job_status")
def s_finalize_needs_terminal():
    item = new_job()
    lease = claim("worker-a")
    args = f"'{item['job']}', {lease['message_id']}, {lease['attempt']}, 'worker-a'"
    answer = js(f"select public.finalize_demo_parse_message({args})")
    assert answer.get("acknowledged") is not True, answer
    assert read_ct(item["job"]) == 1  # message still in the queue, not archived
    return {"finalize_while_processing": answer}


@scenario("transient_failures_are_bounded_by_max_retries")
def s_transient_bounded():
    item = new_job()
    history = []
    for _ in range(6):
        lease = claim("worker-a")
        if lease.get("status") != "claimed":
            break
        args = f"'{item['job']}', {lease['message_id']}, {lease['attempt']}, 'worker-a'"
        answer = js(f"select public.fail_demo_parse_message({args}, 'PARSER_ERROR', 'probe', false)")
        history.append((lease["attempt"], answer.get("status"), answer.get("retry")))
    state = job(item["job"])
    assert state["status"] == "failed", state
    assert len(history) == state["max_retries"] + 1, history
    assert [entry[0] for entry in history] == list(range(state["max_retries"] + 1))
    return {"deliveries": len(history), "final_retry_count": state["retry_count"]}


@scenario("permanent_failure_stops_at_once")
def s_permanent():
    item = new_job()
    lease = claim("worker-a")
    args = f"'{item['job']}', {lease['message_id']}, {lease['attempt']}, 'worker-a'"
    answer = js(f"select public.fail_demo_parse_message({args}, 'CORRUPTED_DEMO', 'probe', true)")
    assert answer.get("status") == "failed" and answer.get("retry") is False, answer
    assert claim("worker-a").get("status") == "empty"
    return {}


def delivery_cap_installed() -> bool:
    return sql("select pg_get_functiondef('public.claim_demo_parse_message(text,integer,integer)'::regprocedure) "
               "like '%delivery_limit%'") == "t"


def s_crashed_worker_redelivery():
    """A worker that dies mid-parse never calls fail. The lease lapses and the
    same message is delivered again. Without a delivery cap retry_count never
    moves and nothing bounds the loop; with the cap the job ends failed."""
    capped = delivery_cap_installed()
    name = "crashed_worker_redelivery_is_bounded" if capped else "crashed_worker_redelivery_is_unbounded"
    kind = "GUARANTEE" if capped else "KNOWN_DEFECT"

    @scenario(name, kind=kind)
    def run():
        item = new_job()
        claimed = rejected = 0
        for index in range(40):
            lease = claim(f"worker-{index:02d}")
            if lease.get("status") == "claimed":
                claimed += 1
                expire_lease(item["job"])
            elif lease.get("status") == "rejected":
                rejected += 1
            else:
                break
            if not capped and claimed == 12:
                break
        state = job(item["job"])
        if not capped:
            assert state["status"] == "processing" and state["retry_count"] == 0, state
            assert claimed == 12 and read_ct(item["job"]) == 12
            assert claimed > state["max_retries"] + 1
            return {"deliveries_without_fail": claimed, "retry_count": state["retry_count"],
                    "max_retries": state["max_retries"], "pgmq_read_ct": 12}
        # Two deliveries per dispatch (the original and one redelivery), for
        # the first dispatch and each retry, then a terminal JOB_STALE.
        assert state["status"] == "failed" and state["error_code"] == "JOB_STALE", state
        assert claimed == 2 * (state["max_retries"] + 1), (claimed, state)
        assert state["lease_live"] is not True
        assert claim("worker-last").get("status") == "empty"
        return {"deliveries_before_terminal": claimed, "delivery_limit_rejections": rejected,
                "final_retry_count": state["retry_count"]}

    run()


@scenario("stale_sweep_ignores_a_job_that_keeps_being_reclaimed", kind="OBSERVATION")
def s_stale_sweep_starved():
    """recover_stale_demo_jobs needs an old heartbeat, but every re-claim writes
    a fresh one, so a live poller keeps the poison job away from the sweep."""
    item = new_job()
    claim("worker-a")
    expire_lease(item["job"])
    swept_fresh = int(sql("select public.recover_stale_demo_jobs(30)"))
    assert swept_fresh == 0 and job(item["job"])["status"] == "processing"
    sql(f"update public.demo_jobs set heartbeat_at = now() - interval '31 minutes' where id='{item['job']}'")
    swept_old = int(sql("select public.recover_stale_demo_jobs(30)"))
    state = job(item["job"])
    assert swept_old == 1 and state["status"] == "pending" and state["retry_count"] == 1, (swept_old, state)
    return {"swept_with_fresh_heartbeat": swept_fresh, "swept_with_31min_old_heartbeat": swept_old}


@scenario("stale_sweep_is_bounded_when_it_does_run")
def s_stale_sweep_bounded():
    item = new_job()
    statuses = []
    rejected_stale_messages = 0
    for _ in range(12):
        lease = claim("worker-a")
        if lease.get("status") == "rejected":
            # The superseded message of the previous dispatch is archived, not executed.
            assert lease.get("reason") in ("stale_or_invalid_message", "failed"), lease
            rejected_stale_messages += 1
            continue
        if lease.get("status") != "claimed":
            break
        expire_lease(item["job"])
        sql(f"update public.demo_jobs set heartbeat_at = now() - interval '31 minutes' where id='{item['job']}'")
        sql("select public.recover_stale_demo_jobs(30)")
        statuses.append(job(item["job"])["status"])
    state = job(item["job"])
    assert state["status"] == "failed" and state["error_code"] == "JOB_STALE", state
    assert len(statuses) == state["max_retries"] + 1, statuses
    return {"sweeps": len(statuses), "sequence": statuses,
            "superseded_messages_rejected": rejected_stale_messages}


def ledger(event_type: str, ids: dict, outcome: str | None = None, event_id: str | None = None) -> dict:
    with_parser = event_type != "EXECUTION_INTENT"
    q = lambda value: "null" if value is None else f"'{value}'"
    return js(
        "select public.h3e91_record_execution_event("
        f"'{event_id or uuid.uuid4()}', '{ids['execution']}', '{event_type}', '{ids['upload']}', "
        f"'{ids['correlation']}', '{ids['job']}', 1, '{ids['sha']}', 520, "
        f"{q('demoparser2' if with_parser else None)}, {q('0.42.0' if with_parser else None)}, "
        f"{q('git:' + 'a' * 40 if with_parser else None)}, 'RAILWAY_DURABLE_WORKER', 'RAILWAY', null, {q(outcome)}, 1)"
    )


@scenario("execution_ledger_allows_one_start_and_one_terminal_per_execution")
def s_ledger_single_terminal():
    item = new_job()
    ids = {**item, "execution": str(uuid.uuid4()), "correlation": str(uuid.uuid4())}
    intent_id = str(uuid.uuid4())
    assert ledger("EXECUTION_INTENT", ids, event_id=intent_id)["status"] == "INSERTED"
    # The same intent again (a re-delivered message) is recognised, not re-inserted.
    assert ledger("EXECUTION_INTENT", ids, event_id=intent_id)["status"] == "IDEMPOTENT_REPLAY"
    # A second, different intent for the same execution is refused.
    assert ledger("EXECUTION_INTENT", ids)["status"] == "REJECTED"
    assert ledger("EXECUTION_FINISHED", ids, "PARSE_SUCCEEDED")["status"] == "REJECTED"  # no start yet
    assert ledger("EXECUTION_STARTED", ids)["status"] == "INSERTED"
    with ThreadPoolExecutor(8) as pool:
        terminals = list(pool.map(
            lambda i: ledger("EXECUTION_FINISHED" if i % 2 else "EXECUTION_FAILED", ids,
                             "PARSE_SUCCEEDED" if i % 2 else "PARSER_ERROR")["status"], range(8)))
    assert terminals.count("INSERTED") == 1, terminals
    rows = int(sql(f"select count(*) from public.h3e91_execution_evidence_ledger where execution_id='{ids['execution']}'"))
    assert rows == 3, rows
    assert ledger("EXECUTION_STARTED", ids)["status"] == "REJECTED"  # nothing after a terminal
    return {"concurrent_terminals": 8, "inserted": 1, "ledger_rows": rows}


def as_role(role: str, user: str | None, query: str) -> str:
    claim = f"set local request.jwt.claim.sub = '{user}';" if user else ""
    return sql(f"begin; set local role {role}; {claim} {query}; rollback;")


@scenario("client_roles_cannot_call_queue_or_persistence_functions")
def s_client_denied():
    denied = []
    for role in ("anon", "authenticated"):
        for call in ("public.claim_demo_parse_message('worker-x', 60, 1)",
                     "public.recover_stale_demo_jobs(30)",
                     f"public.fail_demo_parse_message('{uuid.uuid4()}', 1, 0, 'worker-x', 'PARSER_ERROR', 'x', false)",
                     f"public.finalize_demo_parse_message('{uuid.uuid4()}', 1, 0, 'worker-x')",
                     "public.persist_canonical_observation('{}'::jsonb)"):
            try:
                as_role(role, None, f"select {call}")
            except RuntimeError as error:
                assert "permission denied" in str(error), str(error)
                denied.append(role)
                continue
            raise AssertionError(f"{role} could execute {call.split('(')[0]}")
    return {"denied_calls": len(denied)}


@scenario("row_level_security_isolates_one_user_from_another")
def s_rls():
    mine, theirs = new_job(), new_job()
    visible = {}
    for table, column in (("demo_jobs", "id"), ("uploads", "id")):
        own = mine["job"] if table == "demo_jobs" else mine["upload"]
        other = theirs["job"] if table == "demo_jobs" else theirs["upload"]
        own_count = int(as_role("authenticated", mine["user"], f"select count(*) from public.{table} where {column}='{own}'").splitlines()[-1])
        other_count = int(as_role("authenticated", mine["user"], f"select count(*) from public.{table} where {column}='{other}'").splitlines()[-1])
        try:
            anon_count = int(as_role("anon", None, f"select count(*) from public.{table}").splitlines()[-1])
        except RuntimeError as error:  # no table privilege at all is stricter than an empty result
            assert "permission denied" in str(error), str(error)
            anon_count = 0
        assert (own_count, other_count, anon_count) == (1, 0, 0), (table, own_count, other_count, anon_count)
        visible[table] = {"own": own_count, "other_user": other_count, "anon": anon_count}
    for query in (f"update public.demo_jobs set status='processed' where id='{mine['job']}' returning 1",
                  f"delete from public.demo_jobs where id='{mine['job']}' returning 1"):
        try:
            changed = as_role("authenticated", mine["user"], query)
        except RuntimeError as error:
            assert "permission denied" in str(error) or "row-level security" in str(error), str(error)
            continue
        assert "1" not in changed.splitlines(), changed  # a job owner cannot rewrite or delete the job
    no_rls = int(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                     "where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"))
    assert no_rls == 0, no_rls
    return {"visible": visible, "public_tables_without_rls": no_rls}


SCENARIOS = [s_ledger_single_terminal, s_client_denied, s_rls,
             s_duplicate_enqueue, s_single_lease, s_fencing, s_finalize_needs_terminal, s_transient_bounded,
             s_permanent, s_crashed_worker_redelivery, s_stale_sweep_starved, s_stale_sweep_bounded]


def main() -> int:
    refuse_non_local()
    for run in SCENARIOS:
        run()
    drain()
    ok = all(item["status"] == "PASS" for item in RESULTS)
    report = {
        "probe": "DEMO_PARSE_QUEUE_SEMANTICS",
        "status": "PASS" if ok else "FAIL",
        "database": "LOCAL_DISPOSABLE_ONLY",
        "delivery_semantics": "AT_LEAST_ONCE_WITH_SINGLE_ACTIVE_LEASE_AND_FENCING",
        "exactly_once": "NOT_CLAIMED",
        "delivery_cap_installed": delivery_cap_installed(),
        "known_defects": [item["scenario"] for item in RESULTS if item["kind"] == "KNOWN_DEFECT" and item["status"] == "PASS"],
        "scenarios": RESULTS,
    }
    print(json.dumps(report, indent=1, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
