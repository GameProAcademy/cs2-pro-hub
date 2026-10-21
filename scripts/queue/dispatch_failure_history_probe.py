#!/usr/bin/env python3
"""D21: every failed dispatch leaves a durable, owner-scoped record.

Runs ONLY against a disposable local database built from supabase/migrations (refuses any
non-local host); synthetic rows only. Production gap (job 921b55cf, dispatch 4): the job row
kept only the last error and the next success cleared it.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from queue_semantics_probe import claim, drain, js, job, new_job, refuse_non_local, sql  # noqa: E402

RESULTS: list[dict] = []


def scenario(name: str):
    def wrap(fn):
        drain()
        try:
            RESULTS.append({"scenario": name, "status": "PASS", **(fn() or {})})
        except AssertionError as error:
            RESULTS.append({"scenario": name, "status": "FAIL", "detail": str(error)[:600]})
        except Exception as error:  # noqa: BLE001 - reported, never hidden
            RESULTS.append({"scenario": name, "status": "ERROR", "detail": f"{type(error).__name__}: {str(error)[:600]}"})
        return fn
    return wrap


def fail(item: dict, code: str, message: str, permanent: bool) -> dict:
    lease = claim("worker-d21")
    assert lease.get("status") == "claimed", lease
    args = f"'{item['job']}', {lease['message_id']}, {lease['attempt']}, 'worker-d21'"
    answer = js(f"select public.fail_demo_parse_message({args}, '{code}', '{message}', {str(permanent).lower()})")
    assert answer.get("accepted") is True, answer
    return {"attempt": lease["attempt"], "message": lease["message_id"], **answer}


def failures(item: dict) -> list[dict]:
    return json.loads(sql(
        "select coalesce(jsonb_agg(jsonb_build_object('d', dispatch_attempt, 'm', queue_message_id, 'c', error_code, "
        "'msg', error_message, 'p', permanent, 'r', retried) order by dispatch_attempt), '[]') "
        f"from public.demo_job_dispatch_failures where job_id='{item['job']}'"))


def as_user(user: str, query: str) -> str:
    claims = json.dumps({"sub": user, "role": "authenticated"})
    return sql("begin; set local role authenticated; "
               f"select set_config('request.jwt.claim.sub','{user}',true); "
               f"select set_config('request.jwt.claims','{claims}',true); "
               f"{query}; commit;").strip().splitlines()[-1]


def main() -> int:
    refuse_non_local()

    @scenario("a_retried_failure_survives_a_later_success")
    def _retried():
        item = new_job()
        first = fail(item, "CANONICAL_PERSISTENCE_ERROR", "statement timeout", False)
        assert first["retry"] is True, first
        # The next dispatch succeeds: the job row's error is cleared ...
        lease = claim("worker-d21")
        sql(f"update public.demo_jobs set status='processed', stage='done', error_code=null, error_message=null "
            f"where id='{item['job']}'")
        assert job(item["job"])["error_code"] is None
        # ... and the failed dispatch is still on record.
        rows = failures(item)
        assert rows == [{"d": first["attempt"], "m": first["message"], "c": "CANONICAL_PERSISTENCE_ERROR",
                         "msg": "statement timeout", "p": False, "r": True}], rows
        return {"next_dispatch": lease.get("attempt")}

    @scenario("every_failed_dispatch_is_one_row_up_to_the_final_failure")
    def _bounded():
        item = new_job()
        attempts = []
        while True:
            lease_state = job(item["job"])
            if lease_state["status"] != "pending":
                break
            attempts.append(fail(item, "PARSER_ERROR", "probe", False))
        rows = failures(item)
        assert [r["d"] for r in rows] == [a["attempt"] for a in attempts], (rows, attempts)
        assert [r["r"] for r in rows] == [True] * (len(rows) - 1) + [False], rows
        return {"failed_dispatches": len(rows)}

    @scenario("a_permanent_failure_is_recorded_as_permanent")
    def _permanent():
        item = new_job()
        fail(item, "CORRUPTED_DEMO", "probe", True)
        rows = failures(item)
        assert len(rows) == 1 and rows[0]["p"] is True and rows[0]["r"] is False, rows

    @scenario("a_stale_worker_cannot_write_a_failure_row")
    def _stale():
        item = new_job()
        lease = claim("worker-old")
        sql(f"update public.demo_jobs set lease_expires_at = now() - interval '1 second' where id='{item['job']}'")
        sql(f"update pgmq.q_demo_parse set vt = now() - interval '1 second' where (message->>'job_id')='{item['job']}'")
        claim("worker-new")
        args = f"'{item['job']}', {lease['message_id']}, {lease['attempt']}, 'worker-old'"
        answer = js(f"select public.fail_demo_parse_message({args}, 'PARSER_ERROR', 'late', false)")
        assert answer.get("accepted") is not True and failures(item) == [], (answer, failures(item))

    @scenario("owners_read_only_their_own_failures_and_no_client_writes")
    def _rls():
        mine, other = new_job(), new_job()
        fail(mine, "PARSER_ERROR", "probe", False)
        q = f"select count(*) from public.demo_job_dispatch_failures where job_id='{mine['job']}'"
        assert as_user(mine["user"], q) == "1"
        assert as_user(other["user"], q) == "0"
        denied = []
        for statement in (f"delete from public.demo_job_dispatch_failures where job_id='{mine['job']}'",
                          f"update public.demo_job_dispatch_failures set error_code='x' where job_id='{mine['job']}'",
                          "insert into public.demo_job_dispatch_failures(job_id,upload_id,dispatch_attempt,error_code,"
                          f"permanent,retried) values ('{mine['job']}','{mine['upload']}',99,'x',false,false)"):
            try:
                as_user(mine["user"], statement)
            except RuntimeError as error:
                denied.append("permission denied" in str(error))
        assert denied == [True, True, True], denied
        anon = sql("select has_table_privilege('anon','public.demo_job_dispatch_failures','SELECT')")
        assert anon == "f", anon

    status = "PASS" if all(r["status"] == "PASS" for r in RESULTS) else "FAIL"
    print(json.dumps({"probe": "DISPATCH_FAILURE_HISTORY_D21", "status": status, "database": "LOCAL_DISPOSABLE_ONLY",
                      "synthetic_fixture_only": True, "scenarios": RESULTS}, indent=1, sort_keys=True))
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except BaseException as exc:  # noqa: BLE001 - the report must always be written
        print(json.dumps({"probe": "DISPATCH_FAILURE_HISTORY_D21", "status": "FAIL", "scenarios": [
            {"scenario": "dispatch_failure_history", "status": "ERROR",
             "detail": f"probe crashed: {type(exc).__name__}: {str(exc)[:500]}"}]}, indent=1))
        raise SystemExit(1)
