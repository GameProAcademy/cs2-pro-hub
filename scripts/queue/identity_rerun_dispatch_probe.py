#!/usr/bin/env python3
"""D18: an identity re-run is a NEW parse dispatch, never a replay of the finished one.

Runs ONLY against a disposable local database built from supabase/migrations (refuses any
non-local host); synthetic rows only.

Production defect (job 921b55cf, 2026-10-21): requeue_demo_job_after_attachment reset
retry_count to 0, so the re-dispatch reused dispatch_attempt 0 - the number of the job's
FINISHED execution - and the worker refused the replay until the lease expired (~15 min).
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from canonical_persistence_probe import bundle  # noqa: E402
from queue_semantics_probe import js, new_job, refuse_non_local, sql  # noqa: E402

RESULTS: list[dict] = []
ROSTER = [f"7656119800000{110 + index}" for index in range(10)]


def scenario(name: str):
    def wrap(fn):
        try:
            RESULTS.append({"scenario": name, "status": "PASS", **(fn() or {})})
        except AssertionError as error:
            RESULTS.append({"scenario": name, "status": "FAIL", "detail": str(error)[:600]})
        except Exception as error:  # noqa: BLE001 - reported, never hidden
            RESULTS.append({"scenario": name, "status": "ERROR", "detail": f"{type(error).__name__}: {str(error)[:600]}"})
        return fn
    return wrap


def processed_job(retry_count: int = 0, max_retries: int = 3, status: str = "processed") -> dict:
    """An enqueued job whose dispatch finished: Canonical match persisted, no identity."""
    job = new_job()
    payload = bundle(job["sha"])
    text = json.dumps(payload).replace("'", "''")
    match = js(f"select public.persist_canonical_observation_attached('{text}'::jsonb, null, '{job['upload']}')")["match_id"]
    sql(f"update public.demo_jobs set status='{status}', stage='{'done' if status == 'processed' else 'failed'}', "
        f"match_id='{match}', retry_count={retry_count}, max_retries={max_retries}, dispatch_attempt={retry_count}, "
        f"identity_status='unresolved', attachment_state='unattached' where id='{job['job']}'")
    return {**job, "match": match}


def state(job: dict) -> dict:
    return js("select jsonb_build_object('status', status, 'retry', retry_count, 'max', max_retries, "
              "'dispatch', dispatch_attempt, 'msg', queue_message_id) "
              f"from public.demo_jobs where id='{job['job']}'")


def queued_messages(job: dict) -> int:
    return int(sql(f"select count(*) from pgmq.q_demo_parse where message->>'job_id' = '{job['job']}'"))


def declare(job: dict, participant: str, expected: str | None = None) -> str:
    exp = "null" if expected is None else f"'{expected}'"
    body = (f"jsonb_build_object('event_key','manual:{participant}','declared_participant_key','{participant}',"
            f"'declared_nickname',null,'state','attached','method','self_declared_player','source','user',"
            f"'confidence_score',0.8,'confidence','medium','participant_key','{participant}',"
            f"'observed_nickname',null,'reason',null,'expected_latest_event_key',{exp})")
    try:
        return "ok:" + sql(f"select public.requeue_demo_job_after_attachment('{job['job']}'::uuid,'{job['user']}'::uuid,{body})")
    except RuntimeError as error:
        text = str(error)
        return "err:" + next((t for t in ("IDENTITY_RERUN_LIMIT_REACHED", "IDENTITY_DECISION_STALE",
                                          "PARTICIPANT_NOT_IN_MATCH", "check constraint") if t in text), text[:120])


def main() -> int:
    refuse_non_local()

    done = processed_job()
    before = state(done)
    first = declare(done, ROSTER[0])
    after = state(done)

    @scenario("a_rerun_of_a_processed_job_is_a_new_dispatch")
    def _new_dispatch():
        assert first == "ok:t", first
        assert after["status"] == "pending" and after["dispatch"] == before["dispatch"] + 1, (before, after)
        assert after["msg"] is not None and after["msg"] != before["msg"], (before, after)
        assert queued_messages(done) >= 1
        return {"dispatch_before": before["dispatch"], "dispatch_after": after["dispatch"]}

    @scenario("the_rerun_keeps_the_full_retry_budget")
    def _budget():
        assert after["max"] - after["retry"] == before["max"], (before, after)
        return {"remaining_retries": after["max"] - after["retry"]}

    @scenario("a_repeat_while_pending_sends_no_second_message")
    def _pending_repeat():
        messages = queued_messages(done)
        again = declare(done, ROSTER[0], expected=f"manual:{ROSTER[0]}")
        now = state(done)
        assert again == "ok:t", again
        assert now["dispatch"] == after["dispatch"] and now["msg"] == after["msg"], (after, now)
        assert queued_messages(done) == messages, (messages, queued_messages(done))

    exhausted = processed_job(retry_count=3, max_retries=3, status="failed")

    @scenario("a_failed_job_with_exhausted_retries_gets_a_new_dispatch_and_budget")
    def _exhausted():
        result = declare(exhausted, ROSTER[1])
        now = state(exhausted)
        assert result == "ok:t", result
        assert (now["status"], now["retry"], now["dispatch"], now["max"]) == ("pending", 4, 4, 7), now

    bound = processed_job(retry_count=10, max_retries=10)

    @scenario("at_the_dispatch_bound_the_rerun_is_refused_and_nothing_changes")
    def _bound():
        snapshot = state(bound)
        decisions = int(sql(f"select count(*) from public.demo_identity_decisions where job_id='{bound['job']}'"))
        result = declare(bound, ROSTER[2])
        assert result == "err:IDENTITY_RERUN_LIMIT_REACHED", result
        assert state(bound) == snapshot
        assert int(sql(f"select count(*) from public.demo_identity_decisions where job_id='{bound['job']}'")) == decisions

    status = "PASS" if all(r["status"] == "PASS" for r in RESULTS) else "FAIL"
    print(json.dumps({"probe": "IDENTITY_RERUN_DISPATCH_D18", "status": status, "database": "LOCAL_DISPOSABLE_ONLY",
                      "synthetic_fixture_only": True, "scenarios": RESULTS}, indent=1, sort_keys=True))
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except BaseException as exc:  # noqa: BLE001 - the report must always be written
        print(json.dumps({"probe": "IDENTITY_RERUN_DISPATCH_D18", "status": "FAIL", "scenarios": [
            {"scenario": "identity_rerun_dispatch", "status": "ERROR",
             "detail": f"probe crashed: {type(exc).__name__}: {str(exc)[:500]}"}]}, indent=1))
        raise SystemExit(1)
