#!/usr/bin/env python3
"""Integrated recovery probe: claim -> parse -> RAW -> ACK -> retry/replay -> terminal.

Runs the production durable consumer loop as real processes against a loopback
bridge backed by the real queue functions and the real execution ledger in a
DISPOSABLE local database. Crashes are real SIGKILLs; lost requests and lost
acknowledgements are dropped connections at an exact protocol point; the
passage of time is an expired lease.

It refuses any non-local database and never touches a managed environment.
See scripts/queue/recovery/bridge_double.py for what is real and what is not.

usage: recovery_protocol_probe.py [--protocol recovery|legacy] [--worker-tree DIR] [--only NAME]
  legacy    reproduces the behaviour before the recovery protocol (main's
            migrations and worker tree) so the defects it fixes are on record.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "recovery"))

from queue_semantics_probe import drain, expire_lease, js, new_job, refuse_non_local, sql  # noqa: E402
from bridge_double import BridgeDouble, install_effects_schema  # noqa: E402

ARGS: argparse.Namespace
DOUBLE: BridgeDouble
BRIDGE_URL = ""
STATE: Path
WORKERS: list[subprocess.Popen] = []
RESULTS: list[dict] = []


# ---- processes -----------------------------------------------------------
def start_worker(worker_id: str = "railway-parser-1", heartbeat: float = 0.2) -> subprocess.Popen:
    process = subprocess.Popen(
        [sys.executable, str(HERE / "recovery" / "harness_worker.py"), ARGS.worker_tree, BRIDGE_URL, worker_id, str(STATE)],
        env={**os.environ, "HARNESS_HEARTBEAT_SECONDS": str(heartbeat)},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )
    WORKERS.append(process)
    return process


def stop_workers() -> None:
    for process in WORKERS:
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        process.wait()
    WORKERS.clear()


def wait_for(condition, timeout: float = 20.0, what: str = "condition"):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = condition()
        if value:
            return value
        time.sleep(0.05)
    raise AssertionError(f"timed out waiting for {what}")


def plan(**steps) -> None:
    (STATE / "plan.json").write_text(json.dumps({key.lstrip("n"): value for key, value in steps.items()}))


def checkpoint(job_id: str, ordinal: int) -> dict:
    path = STATE / f"{job_id}.checkpoint"

    def read():
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text())
        except ValueError:
            return None
        return data if data.get("ordinal") == ordinal else None
    return wait_for(read, what=f"parser execution {ordinal}")


# ---- observations --------------------------------------------------------
def job(job_id: str) -> dict:
    extra = ", delivery_count" if ARGS.protocol == "recovery" else ""
    return js("select to_jsonb(j) from (select status, stage, retry_count, max_retries, dispatch_attempt, queue_message_id, "
              f"worker_id, error_code, error_message, lease_expires_at > now() as lease_live{extra} "
              f"from public.demo_jobs where id='{job_id}') j")


def terminal(job_id: str) -> dict | None:
    state = job(job_id)
    return state if state["status"] in ("processed", "failed", "cancelled") else None


def ledger(job_id: str) -> list[dict]:
    return json.loads(sql("select coalesce(jsonb_agg(jsonb_build_object('execution', execution_id, 'type', event_type, "
                          "'outcome', outcome_code) order by id), '[]'::jsonb) "
                          f"from public.h3e91_execution_evidence_ledger where job_id='{job_id}'"))


def facts(job_id: str) -> dict:
    events = ledger(job_id)
    state = job(job_id)
    closures = []
    if ARGS.protocol == "recovery":
        closures = json.loads(sql("select coalesce(jsonb_agg(jsonb_build_object('dispatch', dispatch_attempt, 'reason', reason, "
                                  "'lifecycle', lifecycle, 'deliveries', delivery_count, 'retried', retried) order by id), "
                                  f"'[]'::jsonb) from public.demo_job_dispatch_closures where job_id='{job_id}'"))
    path = STATE / f"{job_id}.executions"
    return {
        "job_status": state["status"], "error_code": state["error_code"], "retry_count": state["retry_count"],
        "parser_executions": int(path.read_text()) if path.exists() else 0,
        "ledger_started": sum(1 for e in events if e["type"] == "EXECUTION_STARTED"),
        "ledger_identities": len({e["execution"] for e in events}),
        "ledger_terminals": sorted(f"{e['type'].replace('EXECUTION_', '')}:{e['outcome']}" for e in events
                                   if e["type"] in ("EXECUTION_FINISHED", "EXECUTION_FAILED", "EXECUTION_ABORTED")),
        "raw_effects": int(sql(f"select count(*) from queue_probe.effects where job_id='{job_id}' and kind='raw'")),
        "observation_effects": int(sql(f"select count(*) from queue_probe.effects where job_id='{job_id}' and kind='observation'")),
        "raw_commit_attempts": int(sql(f"select count(*) from queue_probe.effect_attempts where job_id='{job_id}' and kind='raw'")),
        "queued_messages": int(sql(f"select count(*) from pgmq.q_demo_parse where (message->>'job_id')='{job_id}'")),
        "archived_messages": int(sql(f"select count(*) from pgmq.a_demo_parse where (message->>'job_id')='{job_id}'")),
        "leases_granted": sum(1 for call in DOUBLE.calls if call["point"] == "claim" and call["job"] == job_id and call["status"] == "claimed"),
        "complete_calls": sum(1 for call in DOUBLE.calls if call["point"] == "complete" and call["job"] == job_id),
        "fail_calls": sum(1 for call in DOUBLE.calls if call["point"] == "fail" and call["job"] == job_id),
        "closures": closures,
    }


def invariants(job_id: str, observed: dict) -> None:
    """Hold for every scenario, whatever was injected."""
    assert observed["raw_effects"] <= 1 and observed["observation_effects"] <= 1, "duplicate committed effect"
    assert observed["parser_executions"] == observed["ledger_started"], "a parser execution is missing from the ledger"
    if observed["job_status"] == "processed":
        assert observed["raw_effects"] == 1 and observed["observation_effects"] == 1, "processed without a committed result"
        assert any(item.startswith("FINISHED:") for item in observed["ledger_terminals"]), "processed without FINISHED"
    if observed["job_status"] == "failed":
        assert observed["observation_effects"] == 0, "failed job with a committed observation"
        assert observed["error_code"], "terminal failure without a code"
    if observed["job_status"] in ("processed", "failed"):
        assert observed["queued_messages"] == 0, "terminal job still has a queue message"
    # One terminal per execution identity is enforced by the ledger itself.
    per_identity: dict[str, int] = {}
    for event in ledger(job_id):
        if event["type"] in ("EXECUTION_FINISHED", "EXECUTION_FAILED", "EXECUTION_ABORTED"):
            per_identity[event["execution"]] = per_identity.get(event["execution"], 0) + 1
    assert all(count == 1 for count in per_identity.values()), "two terminals for one execution"


def scenario(name: str):
    def wrap(fn):
        def run():
            stop_workers()
            drain()
            DOUBLE.faults.clear()
            DOUBLE.calls.clear()
            for path in STATE.glob("*"):
                path.unlink()
            plan(default={"outcome": "ok"})
            item = new_job()
            entry = {"scenario": name}
            try:
                expected = fn(item) or {}
                # The job turns terminal one statement before its message is
                # acknowledged; observe after that has settled.
                settle = time.monotonic() + 3
                while time.monotonic() < settle and terminal(item["job"]) and facts(item["job"])["queued_messages"]:
                    time.sleep(0.1)
                observed = facts(item["job"])
                entry.update(observed)
                invariants(item["job"], observed)
                for key, value in expected.items():
                    assert observed[key] == value, f"{key}: expected {value!r}, observed {observed[key]!r}"
                entry["status"] = "PASS"
            except AssertionError as error:
                entry.setdefault("job_status", None)
                try:
                    entry.update(facts(item["job"]))
                except Exception:  # noqa: BLE001
                    pass
                entry.update({"status": "FAIL", "detail": str(error)[:300],
                              "last_bridge_calls": [f"{c['point']}={c['status']}" for c in DOUBLE.calls if c['status'] != 'busy' and c['status'] != 'empty'][-14:]})
            except Exception as error:  # noqa: BLE001 - reported, never hidden
                entry.update({"status": "ERROR", "detail": f"{type(error).__name__}: {str(error)[:300]}"})
            finally:
                stop_workers()
            RESULTS.append(entry)
        run.__name__ = name
        return run
    return wrap


def done(item: dict, timeout: float = 25.0) -> dict:
    return wait_for(lambda: terminal(item["job"]), timeout, "a terminal job status")


def redeliver(item: dict) -> None:
    """Time passes: the lease and the message visibility lapse."""
    expire_lease(item["job"])


# ---- scenarios -----------------------------------------------------------
@scenario("happy_path_one_dispatch_one_execution")
def s_happy(item):
    start_worker()
    done(item)
    return {"job_status": "processed", "parser_executions": 1, "leases_granted": 1, "retry_count": 0,
            "ledger_terminals": ["FINISHED:PARSE_SUCCEEDED"], "complete_calls": 1}


@scenario("crash_after_claim_before_any_execution_evidence")
def s_crash_before_intent(item):
    worker = start_worker()
    DOUBLE.arm("event:EXECUTION_INTENT", "before", "kill", pid=worker.pid, job=item["job"])
    worker.wait(timeout=20)
    assert job(item["job"])["status"] == "processing" and ledger(item["job"]) == []
    redeliver(item)
    start_worker()
    done(item)
    # Nothing ever ran under that identity, so the redelivery runs it. No retry is spent.
    return {"job_status": "processed", "parser_executions": 1, "leases_granted": 2, "retry_count": 0}


@scenario("crash_before_parse_with_intent_recorded")
def s_crash_intent_only(item):
    worker = start_worker()
    DOUBLE.arm("event:EXECUTION_STARTED", "before", "kill", pid=worker.pid, job=item["job"])
    worker.wait(timeout=20)
    assert [e["type"] for e in ledger(item["job"])] == ["EXECUTION_INTENT"]
    redeliver(item)
    start_worker()
    done(item)
    return {"job_status": "processed", "parser_executions": 1, "retry_count": 1, "ledger_identities": 2,
            "closures": [{"dispatch": 0, "reason": "abandoned_execution", "lifecycle": "INTENT_ONLY", "deliveries": 2, "retried": True}]}


@scenario("crash_during_parse_then_retry_reexecutes_with_a_new_identity")
def s_crash_during_parse(item):
    plan(n1={"outcome": "hang"}, default={"outcome": "ok"})
    worker = start_worker()
    checkpoint(item["job"], 1)
    os.killpg(worker.pid, signal.SIGKILL)
    worker.wait()
    redeliver(item)
    start_worker()
    done(item)
    return {"job_status": "processed", "parser_executions": 2, "retry_count": 1, "ledger_identities": 2,
            "ledger_terminals": ["FINISHED:PARSE_SUCCEEDED"], "raw_effects": 1, "observation_effects": 1,
            "closures": [{"dispatch": 0, "reason": "abandoned_execution", "lifecycle": "STARTED", "deliveries": 2, "retried": True}]}


@scenario("crash_on_every_dispatch_ends_in_an_explicit_terminal_then_manual_retry_recovers")
def s_crash_exhausts(item):
    plan(n1={"outcome": "hang"}, n2={"outcome": "hang"}, n3={"outcome": "hang"}, default={"outcome": "ok"})
    for ordinal in (1, 2, 3):
        worker = start_worker()
        checkpoint(item["job"], ordinal)
        os.killpg(worker.pid, signal.SIGKILL)
        worker.wait()
        redeliver(item)
    start_worker()
    state = done(item)
    assert state["status"] == "failed" and state["error_code"] == "JOB_STALE", state
    assert "abandoned_execution at STARTED" in (state["error_message"] or ""), state
    first = facts(item["job"])
    assert first["parser_executions"] == 3 and first["queued_messages"] == 0 and len(first["closures"]) == 3, first
    assert [c["retried"] for c in first["closures"]] == [True, True, False], first
    # Nothing is redelivered after the terminal: no loop.
    time.sleep(1.0)
    assert facts(item["job"])["leases_granted"] == first["leases_granted"]
    # Recoverable: the existing explicit retry opens a new dispatch, which really executes.
    retried = js(f"select public.retry_demo_job('{item['job']}','{item['user']}', true, 'admin_e2e')")
    assert retried["queued"] is True, retried
    done(item)
    return {"job_status": "processed", "parser_executions": 4, "ledger_identities": 4, "observation_effects": 1}


@scenario("retryable_parser_failure_is_retried_by_really_running_the_parser_again")
def s_retry_reexecutes(item):
    plan(n1={"outcome": "worker_error:PARSE_TIMEOUT"}, default={"outcome": "ok"})
    start_worker()
    done(item)
    return {"job_status": "processed", "parser_executions": 2, "retry_count": 1, "ledger_identities": 2,
            "ledger_terminals": ["FAILED:PARSE_TIMEOUT", "FINISHED:PARSE_SUCCEEDED"], "fail_calls": 1, "complete_calls": 1}


@scenario("retryable_failures_stop_at_max_retries_with_a_real_execution_each")
def s_retry_bounded(item):
    plan(default={"outcome": "worker_error:PARSE_TIMEOUT"})
    start_worker()
    state = done(item)
    assert state["error_code"] == "PARSER_TIMEOUT", state
    return {"job_status": "failed", "parser_executions": 3, "retry_count": 3, "ledger_identities": 3,
            "fail_calls": 3, "complete_calls": 0, "observation_effects": 0}


@scenario("permanent_parser_failure_is_never_retried")
def s_permanent(item):
    plan(default={"outcome": "worker_error:CORRUPTED_DEMO"})
    start_worker()
    done(item)
    return {"job_status": "failed", "error_code": "CORRUPTED_DEMO", "parser_executions": 1, "retry_count": 1,
            "fail_calls": 1, "complete_calls": 0}


@scenario("raw_failure_before_commit_fails_the_dispatch_and_the_retry_succeeds")
def s_raw_failure_before(item):
    plan(n1={"outcome": "raw_failure_before_commit"}, default={"outcome": "ok"})
    start_worker()
    done(item)
    return {"job_status": "processed", "parser_executions": 2, "fail_calls": 1, "complete_calls": 1,
            "ledger_terminals": ["FAILED:WORKER_INTERRUPTED", "FINISHED:PARSE_SUCCEEDED"],
            "raw_effects": 1, "raw_commit_attempts": 1}


@scenario("raw_failure_after_commit_fails_the_dispatch_and_the_retry_reuses_the_raw_result")
def s_raw_failure_after(item):
    plan(n1={"outcome": "raw_failure_after_commit"}, default={"outcome": "ok"})
    start_worker()
    done(item)
    # RAW was committed once; the second execution's commit is an idempotent no-op.
    return {"job_status": "processed", "parser_executions": 2, "fail_calls": 1, "complete_calls": 1,
            "raw_effects": 1, "raw_commit_attempts": 2, "observation_effects": 1}


@scenario("completion_request_lost_before_commit_is_reexecuted_not_fabricated")
def s_complete_lost_before(item):
    start_worker()
    DOUBLE.arm("complete", "before", "drop", job=item["job"])
    wait_for(lambda: any(e["type"] == "EXECUTION_FINISHED" for e in ledger(item["job"])), what="FINISHED terminal")
    time.sleep(0.5)
    state = job(item["job"])
    assert state["status"] == "processing", state  # FINISHED in the ledger, nothing committed
    redeliver(item)
    done(item)
    return {"job_status": "processed", "parser_executions": 2, "retry_count": 1, "observation_effects": 1,
            "raw_effects": 1, "raw_commit_attempts": 2,
            "closures": [{"dispatch": 0, "reason": "abandoned_execution", "lifecycle": "FINISHED", "deliveries": 2, "retried": True}]}


@scenario("completion_acknowledgement_lost_after_commit_changes_nothing")
def s_complete_lost_after(item):
    start_worker()
    DOUBLE.arm("complete", "after", "drop", job=item["job"])
    done(item)
    time.sleep(0.8)
    return {"job_status": "processed", "parser_executions": 1, "leases_granted": 1, "retry_count": 0,
            "observation_effects": 1, "archived_messages": 1}


@scenario("crash_between_result_commit_and_queue_acknowledgement")
def s_complete_mid(item):
    start_worker()
    DOUBLE.arm("complete", "mid", "drop", job=item["job"])
    done(item)
    before = facts(item["job"])
    assert before["queued_messages"] == 1, before  # committed, message not acknowledged
    redeliver(item)
    wait_for(lambda: facts(item["job"])["queued_messages"] == 0, what="the terminal message to be archived")
    return {"job_status": "processed", "parser_executions": 1, "leases_granted": 1, "observation_effects": 1}


@scenario("failure_report_lost_is_reconciled_with_the_same_retry_decision")
def s_fail_lost(item):
    plan(n1={"outcome": "worker_error:PARSE_TIMEOUT"}, default={"outcome": "ok"})
    start_worker()
    DOUBLE.arm("fail", "before", "drop", job=item["job"])
    wait_for(lambda: any(e["type"] == "EXECUTION_FAILED" for e in ledger(item["job"])), what="FAILED terminal")
    time.sleep(0.5)
    assert job(item["job"])["status"] == "processing"
    redeliver(item)
    done(item)
    return {"job_status": "processed", "parser_executions": 2, "retry_count": 1,
            "ledger_terminals": ["FAILED:PARSE_TIMEOUT", "FINISHED:PARSE_SUCCEEDED"]}


@scenario("permanent_failure_report_lost_stays_permanent")
def s_fail_lost_permanent(item):
    plan(default={"outcome": "worker_error:CORRUPTED_DEMO"})
    start_worker()
    DOUBLE.arm("fail", "before", "drop", job=item["job"])
    wait_for(lambda: any(e["type"] == "EXECUTION_FAILED" for e in ledger(item["job"])), what="FAILED terminal")
    time.sleep(0.5)
    redeliver(item)
    done(item)
    return {"job_status": "failed", "error_code": "CORRUPTED_DEMO", "parser_executions": 1, "retry_count": 1}


@scenario("stale_worker_that_lost_its_lease_cannot_complete_after_the_job_moved_on")
def s_zombie(item):
    plan(n1={"outcome": "ok", "parse_seconds": 3.0}, default={"outcome": "ok"})
    old = start_worker("worker-old", heartbeat=30.0)  # never heartbeats in time
    checkpoint(item["job"], 1)
    redeliver(item)
    start_worker("worker-new")
    done(item)
    old_calls_before = len(DOUBLE.calls)
    time.sleep(3.5)  # the old worker finishes its parse and tries to report
    assert old.poll() is None
    late = [call for call in DOUBLE.calls[old_calls_before:] if call["worker"] == "worker-old"]
    assert all(call["point"] != "complete" for call in late), late
    return {"job_status": "processed", "parser_executions": 2, "observation_effects": 1, "raw_effects": 1,
            "complete_calls": 1}


@scenario("two_workers_one_job_one_execution")
def s_concurrency(item):
    for index in range(4):
        start_worker(f"worker-{index}")
    done(item)
    time.sleep(0.5)
    return {"job_status": "processed", "parser_executions": 1, "leases_granted": 1, "complete_calls": 1}


@scenario("heartbeats_keep_a_long_parse_from_being_redelivered")
def s_heartbeat(item):
    plan(default={"outcome": "ok", "parse_seconds": 2.0})
    start_worker(heartbeat=0.2)
    checkpoint(item["job"], 1)
    time.sleep(0.8)
    beats = sum(1 for call in DOUBLE.calls if call["point"] == "heartbeat" and call["job"] == item["job"])
    assert beats >= 2, beats
    done(item)
    return {"job_status": "processed", "parser_executions": 1, "leases_granted": 1}


@scenario("no_worker_alive_stale_sweep_recovers_and_the_next_worker_executes")
def s_sweep(item):
    plan(n1={"outcome": "hang"}, default={"outcome": "ok"})
    worker = start_worker()
    checkpoint(item["job"], 1)
    os.killpg(worker.pid, signal.SIGKILL)
    worker.wait()
    sql(f"update public.demo_jobs set lease_expires_at = now() - interval '1 second', heartbeat_at = now() - interval '20 minutes' where id='{item['job']}'")
    assert int(sql("select public.recover_stale_demo_jobs(15)")) == 1
    start_worker()
    done(item)
    return {"job_status": "processed", "parser_executions": 2, "retry_count": 1,
            "closures": [{"dispatch": 0, "reason": "stale_sweep", "lifecycle": None, "deliveries": 1, "retried": True}]}


@scenario("redelivery_does_not_refresh_the_heartbeat_so_the_sweep_can_still_see_the_job")
def s_heartbeat_not_refreshed(item):
    first = js("select public.claim_demo_parse_message('worker-a', 60, 1)")
    assert first["status"] == "claimed"
    sql(f"update public.demo_jobs set heartbeat_at = now() - interval '20 minutes' where id='{item['job']}'")
    redeliver(item)
    second = js("select public.claim_demo_parse_message('worker-b', 60, 1)")
    assert second["status"] == "claimed" and second["redelivery"] is True and second["delivery"] == 2, second
    age = float(sql(f"select extract(epoch from now() - heartbeat_at) from public.demo_jobs where id='{item['job']}'"))
    assert age > 1000, age
    redeliver(item)
    assert int(sql("select public.recover_stale_demo_jobs(15)")) == 1
    sql(f"update public.demo_jobs set status='failed', stage='failed', error_code='PROBE_CLEANUP' where id='{item['job']}'")
    sql("select pgmq.purge_queue('demo_parse')")
    return {"parser_executions": 0}


@scenario("unresolvable_reconciliation_is_bounded_by_the_delivery_limit")
def s_delivery_limit(item):
    plan(n1={"outcome": "hang"}, default={"outcome": "ok"})
    worker = start_worker()
    checkpoint(item["job"], 1)
    os.killpg(worker.pid, signal.SIGKILL)
    worker.wait()
    # Every reconciliation attempt is lost: nobody can decide.
    DOUBLE.arm("reconcile", "before", "drop", job=item["job"], times=99)
    start_worker()
    for expected in (2, 3):
        redeliver(item)
        wait_for(lambda: job(item["job"]).get("delivery_count") == expected, what=f"delivery {expected}")
        time.sleep(0.3)
    redeliver(item)
    state = done(item)
    assert state["error_code"] == "JOB_STALE" and "delivery_limit" in (state["error_message"] or ""), state
    time.sleep(0.8)
    return {"job_status": "failed", "parser_executions": 1, "leases_granted": 3, "queued_messages": 0,
            "closures": [{"dispatch": 0, "reason": "delivery_limit", "lifecycle": None, "deliveries": 3, "retried": False}]}


@scenario("first_holder_cannot_abandon_its_own_dispatch_and_a_superseded_holder_cannot_abandon_at_all")
def s_abandon_guards(item):
    first = js("select public.claim_demo_parse_message('worker-a', 60, 1)")
    args = f"'{item['job']}', {first['message_id']}, {first['attempt']}"
    own = js(f"select public.abandon_demo_parse_dispatch({args}, 'worker-a', 'STARTED')")
    assert own == {"accepted": False, "reason": "not_a_redelivery"}, own
    redeliver(item)
    second = js("select public.claim_demo_parse_message('worker-b', 60, 1)")
    assert second["redelivery"] is True
    stale = js(f"select public.abandon_demo_parse_dispatch({args}, 'worker-a', 'STARTED')")
    assert stale == {"accepted": False, "reason": "claim_not_current"}, stale
    try:
        sql(f"select public.abandon_demo_parse_dispatch({args}, 'worker-b', 'NONE')")
        raise AssertionError("an undecidable lifecycle was accepted")
    except RuntimeError as error:
        assert "INVALID_LIFECYCLE" in str(error), error
    accepted = js(f"select public.abandon_demo_parse_dispatch({args}, 'worker-b', 'STARTED')")
    assert accepted == {"accepted": True, "status": "pending", "retry": True}, accepted
    again = js(f"select public.abandon_demo_parse_dispatch({args}, 'worker-b', 'STARTED')")
    assert again["accepted"] is False, again
    state = job(item["job"])
    assert state["status"] == "pending" and state["retry_count"] == 1 and state["delivery_count"] == 0, state
    for role in ("anon", "authenticated"):
        try:
            sql(f"set role {role}; select public.abandon_demo_parse_dispatch({args}, 'worker-b', 'STARTED')")
            raise AssertionError(f"{role} could call abandon_demo_parse_dispatch")
        except RuntimeError as error:
            assert "permission denied" in str(error), error
    for role in ("anon", "authenticated", "service_role"):
        try:
            sql(f"set role {role}; select public.close_demo_parse_dispatch('{item['job']}', 'stale_sweep', null, true)")
            raise AssertionError(f"{role} could call close_demo_parse_dispatch")
        except RuntimeError as error:
            assert "permission denied" in str(error), error
    sql(f"update public.demo_jobs set status='failed', stage='failed', error_code='PROBE_CLEANUP' where id='{item['job']}'")
    sql("select pgmq.purge_queue('demo_parse')")
    return {"parser_executions": 0}


RECOVERY = [s_happy, s_crash_before_intent, s_crash_intent_only, s_crash_during_parse, s_crash_exhausts,
            s_retry_reexecutes, s_retry_bounded, s_permanent, s_raw_failure_before, s_raw_failure_after,
            s_complete_lost_before, s_complete_lost_after, s_complete_mid, s_fail_lost, s_fail_lost_permanent,
            s_zombie, s_concurrency, s_heartbeat, s_sweep, s_heartbeat_not_refreshed, s_delivery_limit, s_abandon_guards]
# The defects on record: the same scenarios run against the previous protocol.
LEGACY = [s_happy, s_retry_reexecutes, s_crash_during_parse, s_complete_lost_before, s_fail_lost]


def main() -> int:
    global ARGS, DOUBLE, BRIDGE_URL, STATE
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol", choices=("recovery", "legacy"), default="recovery")
    parser.add_argument("--worker-tree", default=str(HERE.parents[1] / "services" / "cs2-demo-parser"))
    parser.add_argument("--only")
    ARGS = parser.parse_args()
    refuse_non_local()
    install_effects_schema()

    sys.path.insert(0, ARGS.worker_tree)
    import worker as worker_module  # the tree under test owns the identity
    if hasattr(worker_module, "durable_execution_id"):
        identity = worker_module.durable_execution_id
    else:
        def identity(job_id, attempt_number, upload_id, _dispatch):
            return str(uuid.uuid5(uuid.NAMESPACE_URL, f"h3e91:durable:{job_id}:{attempt_number}:{upload_id}"))
    DOUBLE = BridgeDouble(ARGS.protocol, identity)
    server, BRIDGE_URL = DOUBLE.serve()
    STATE = Path(tempfile.mkdtemp(prefix="queue-recovery-"))
    scenarios = RECOVERY if ARGS.protocol == "recovery" else LEGACY
    try:
        for run in scenarios:
            if ARGS.only and ARGS.only != run.__name__:
                continue
            run()
    finally:
        stop_workers()
        drain()
        server.shutdown()
        shutil.rmtree(STATE, ignore_errors=True)
    ok = all(item["status"] == "PASS" for item in RESULTS)
    print(json.dumps({
        "probe": "DEMO_PARSE_RECOVERY_PROTOCOL",
        "protocol": ARGS.protocol,
        "status": "PASS" if ok else "FAIL",
        "database": "LOCAL_DISPOSABLE_ONLY",
        "worker": "PRODUCTION_DURABLE_CONSUMER_LOOP_WITH_SCRIPTED_PARSE_STEP",
        "bridge": "LOOPBACK_STAND_IN_OVER_REAL_QUEUE_FUNCTIONS_AND_LEDGER",
        "not_covered": ["TypeScript bridge process", "RAW chunk storage", "Canonical/HOT persistence"],
        "delivery_semantics": "AT_LEAST_ONCE_EXECUTION_WITH_AT_MOST_ONE_COMMITTED_RESULT_PER_JOB",
        "exactly_once_execution": "NOT_CLAIMED",
        "scenarios": RESULTS,
    }, indent=1, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
