#!/usr/bin/env python3
"""D24: reprocessing after a parser release is a NEW attempt; the old attempt is preserved.

Runs ONLY against a disposable local database built from supabase/migrations (refuses any
non-local host); synthetic rows only.

Production defect (Mirage job 921b55cf, 2026-10-23): a job processed by an older parser was
re-run in place; its immutable RAW evidence pins the old parser, so the new parse failed
permanently ("RAW manifest mismatch"). public.reserve_demo_parser_upgrade_attempt reserves
attempt N+1 instead, and enqueue_demo_job links the old job through superseded_by_job_id.
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from queue_semantics_probe import js, new_job, refuse_non_local, sql  # noqa: E402

RESULTS: list[dict] = []
OLD = "git:" + "a" * 40
CURRENT = "git:" + "b" * 40


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


def finished(status: str, revision: str | None) -> dict:
    job = new_job()
    rev = "null" if revision is None else f"'{revision}'"
    sql("select pgmq.purge_queue('demo_parse')")
    sql(f"update public.demo_jobs set status='{status}', stage='{'done' if status == 'processed' else 'failed'}', "
        f"parser_revision={rev}, queue_message_id=null, lease_expires_at=null where id='{job['job']}'")
    sql(f"update public.uploads set status='{status}' where id='{job['upload']}'")
    return job


def reserve(job: dict, expected: str = CURRENT, upload: str | None = None) -> dict | str:
    upload = upload or str(uuid.uuid4())
    try:
        return js(f"select public.reserve_demo_parser_upgrade_attempt('{job['user']}','{job['sha']}','{upload}',"
                  f"'probe.dem',520,'{expected}')")
    except RuntimeError as error:
        return "err:" + str(error)[:160]


def row(job_id: str) -> dict:
    return js("select jsonb_build_object('status', status, 'attempt', attempt_number, 'superseded_by', superseded_by_job_id, "
              f"'parser', parser_revision, 'reason', replacement_reason) from public.demo_jobs where id='{job_id}'")


def main() -> int:
    refuse_non_local()

    processed = finished("processed", OLD)
    before = row(processed["job"])
    created = reserve(processed)

    @scenario("an_older_parser_processed_job_gets_attempt_n_plus_1")
    def _created():
        assert isinstance(created, dict), created
        assert created["reservation_status"] == "CREATED" and created["new_attempt"] is True, created
        assert created["attempt_number"] == before["attempt"] + 1, (before, created)
        assert created["supersedes_job_id"] == processed["job"] and created["replacement_reason"] == "parser_upgrade"
        assert created["storage_path"] == f"{processed['user']}/{created['upload_id']}.dem", created
        return {"attempt": created["attempt_number"]}

    @scenario("the_prior_attempt_is_untouched_by_the_reservation")
    def _untouched():
        assert row(processed["job"]) == before, (before, row(processed["job"]))

    @scenario("a_repeat_before_upload_resumes_the_same_reservation")
    def _resume():
        again = reserve(processed)
        assert isinstance(again, dict) and again["reservation_status"] == "RESUMED", again
        assert again["upload_id"] == created["upload_id"], (created, again)
        assert int(sql(f"select count(*) from public.uploads where demo_sha256='{processed['sha']}'")) == 2

    queued = js(f"select public.enqueue_demo_job('{created['upload_id']}','{processed['user']}')")

    @scenario("enqueue_links_the_old_job_and_keeps_its_status")
    def _linked():
        old = row(processed["job"])
        new = row(queued["job_id"])
        assert old["status"] == "processed" and old["superseded_by"] == queued["job_id"], old
        assert new["status"] == "pending" and new["reason"] == "parser_upgrade", new
        assert new["attempt"] == before["attempt"] + 1, new

    @scenario("while_the_new_attempt_runs_a_repeat_reports_it_in_progress")
    def _in_progress():
        again = reserve(processed)
        assert isinstance(again, dict) and again["reservation_status"] == "IN_PROGRESS", again
        assert again["job_id"] == queued["job_id"], again

    current = finished("processed", CURRENT)

    @scenario("a_current_parser_processed_job_is_a_plain_duplicate")
    def _current():
        result = reserve(current)
        assert isinstance(result, dict) and result["reservation_status"] == "CURRENT", result
        assert result["duplicate_status"] == "processed" and result["new_attempt"] is False, result
        assert int(sql(f"select count(*) from public.uploads where demo_sha256='{current['sha']}'")) == 1

    failed_old = finished("failed", OLD)

    @scenario("an_older_parser_failed_job_gets_a_new_attempt")
    def _failed():
        result = reserve(failed_old)
        assert isinstance(result, dict) and result["reservation_status"] == "CREATED", result
        assert result["replacement_reason"] == "parser_upgrade", result

    # D24b (production, Mirage): a newer reservation that never got a job and was reconciled as
    # abandoned (failed) must not block the parser-upgrade attempt.
    abandoned = finished("failed", OLD)
    ghost = str(uuid.uuid4())
    sql("insert into public.uploads(id,user_id,type,file_name,storage_path,file_size,demo_sha256,status,attempt_number,"
        "supersedes_job_id,replacement_reason,error_code) "
        f"values ('{ghost}','{abandoned['user']}','demo','probe.dem','{abandoned['user']}/{ghost}.dem',520,"
        f"'{abandoned['sha']}','failed',2,'{abandoned['job']}','failed','UPLOAD_RESERVATION_ABANDONED')")

    @scenario("an_abandoned_newer_reservation_does_not_block_and_is_numbered_past")
    def _abandoned():
        result = reserve(abandoned)
        assert isinstance(result, dict) and result["reservation_status"] == "CREATED", result
        assert result["attempt_number"] == 3 and result["supersedes_job_id"] == abandoned["job"], result
        ghost_row = js(f"select jsonb_build_object('status', status, 'attempt', attempt_number) from public.uploads where id='{ghost}'")
        assert ghost_row == {"status": "failed", "attempt": 2}, ghost_row

    live = finished("failed", OLD)
    other = str(uuid.uuid4())
    sql("insert into public.uploads(id,user_id,type,file_name,storage_path,file_size,demo_sha256,status,attempt_number) "
        f"values ('{other}','{live['user']}','demo','probe.dem','{live['user']}/{other}.dem',520,'{live['sha']}','processed',2)")

    @scenario("a_newer_upload_in_any_other_state_still_conflicts")
    def _conflict():
        result = reserve(live)
        assert isinstance(result, str) and "PARSER_UPGRADE_ATTEMPT_CONFLICT" in result, result

    never_parsed = finished("failed", None)

    @scenario("a_job_without_parser_or_raw_evidence_is_not_applicable")
    def _not_applicable():
        result = reserve(never_parsed)
        assert result.startswith("err:") and "PARSER_UPGRADE_NOT_APPLICABLE" in result, result

    @scenario("invalid_revision_is_refused")
    def _invalid():
        result = reserve(finished("processed", OLD), expected="main")
        assert result.startswith("err:") and "PARSER_UPGRADE_INVALID_REVISION" in result, result

    @scenario("another_user_cannot_reserve_on_this_demo")
    def _isolation():
        stranger = {"user": str(uuid.uuid4()), "sha": processed["sha"]}
        result = reserve(stranger)
        assert result.startswith("err:") and "PARSER_UPGRADE_NO_PRIOR_ATTEMPT" in result, result

    @scenario("client_roles_cannot_execute_the_function")
    def _grants():
        for role in ("anon", "authenticated"):
            allowed = sql("select has_function_privilege('" + role + "', "
                          "'public.reserve_demo_parser_upgrade_attempt(uuid,text,uuid,text,bigint,text)', 'EXECUTE')")
            assert allowed == "f", (role, allowed)

    status = "PASS" if all(r["status"] == "PASS" for r in RESULTS) else "FAIL"
    print(json.dumps({"probe": "PARSER_UPGRADE_ATTEMPT_D24", "status": status, "database": "LOCAL_DISPOSABLE_ONLY",
                      "synthetic_fixture_only": True, "passed": sum(r["status"] == "PASS" for r in RESULTS),
                      "total": len(RESULTS), "scenarios": RESULTS}, indent=1, sort_keys=True))
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except BaseException as exc:  # noqa: BLE001 - the report must always be written
        print(json.dumps({"probe": "PARSER_UPGRADE_ATTEMPT_D24", "status": "FAIL", "scenarios": [
            {"scenario": "parser_upgrade_attempt", "status": "ERROR",
             "detail": f"probe crashed: {type(exc).__name__}: {str(exc)[:500]}"}]}, indent=1))
        raise SystemExit(1)
