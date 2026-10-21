#!/usr/bin/env python3
"""Three users, one demo: shared Canonical match, independent personal identity.

Runs ONLY against a disposable local database built from supabase/migrations (it refuses
any non-local host) and writes synthetic rows there only.

Model under test (product requirement, 2026-10-21):
* the SAME demo content (same SHA-256) uploaded by users A, B and C maps to ONE Canonical
  match (content-addressed) - never duplicated;
* every uploader can read that Canonical match and its participants (the shared facts);
* each user records an independent identity decision on THEIR OWN job: A and B select
  different participants manually, C is resolved by a validated Steam ID;
* a user can never declare on another user's job, read another user's decisions or
  metrics, or select a participant of another match; a repeat never duplicates;
* personal metrics exist only after a valid decision and only for that user's player;
  the first uploader keeps the Canonical match's ownership.
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from canonical_persistence_probe import bundle  # noqa: E402
from queue_semantics_probe import js, refuse_non_local, sql  # noqa: E402

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


def user(label: str, sha: str, steam: str | None = None) -> dict:
    uid, upload = str(uuid.uuid4()), str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values ('{uid}','{uid}@probe.invalid')")
    steam_sql = f"'{steam}'" if steam else "null"
    sql(f"insert into public.player_profiles(user_id, nickname, steam_id) values ('{uid}', 'probe-{label}', {steam_sql}) "
        f"on conflict (user_id) do update set steam_id = excluded.steam_id")
    player = sql(f"select id from public.player_profiles where user_id='{uid}'")
    sql("insert into public.uploads(id,user_id,type,file_name,storage_path,file_size,demo_sha256) "
        f"values ('{upload}','{uid}','demo','shared.dem','{uid}/{upload}.dem',520,'{sha}')")
    job = js(f"select public.enqueue_demo_job('{upload}','{uid}')")["job_id"]
    return {"label": label, "user": uid, "upload": upload, "job": job, "player": player}


def persist(payload: dict, person: dict) -> str:
    """processJob's Canonical write: owner = the uploader's player, upload = this upload."""
    text = json.dumps(payload).replace("'", "''")
    return js(f"select public.persist_canonical_observation_attached('{text}'::jsonb,"
              f"'{person['player']}'::uuid,'{person['upload']}'::uuid)")["match_id"]


def finish_unattached(person: dict, match_id: str) -> None:
    """The job ends processed with the Canonical match and no identity (what processJob writes)."""
    sql(f"update public.demo_jobs set status='processed', stage='done', match_id='{match_id}', "
        f"identity_status='unresolved', attachment_state='unattached', attachment_reason='no_steam_id_on_profile' "
        f"where id='{person['job']}'")


def declare(person: dict, job_owner: dict, participant: str, expected: str | None = None) -> str:
    """declareDemoPlayer's RPC call (service role), stored vocabulary; 'ok:<bool>' or 'err:<token>'."""
    exp = "null" if expected is None else f"'{expected}'"
    body = (f"jsonb_build_object('event_key','manual:{participant}','declared_participant_key','{participant}',"
            f"'declared_nickname',null,'state','attached','method','self_declared_player','source','user',"
            f"'confidence_score',0.8,'confidence','medium','participant_key','{participant}',"
            f"'observed_nickname',null,'reason',null,'expected_latest_event_key',{exp})")
    try:
        result = sql(f"select public.requeue_demo_job_after_attachment('{job_owner['job']}'::uuid,"
                     f"'{person['user']}'::uuid,{body})")
        return f"ok:{result}"
    except Exception as error:  # noqa: BLE001
        text = str(error)
        for token in ("PARTICIPANT_NOT_IN_MATCH", "MATCH_NOT_ANALYSED", "CANONICAL_MATCH_MISMATCH",
                      "IDENTITY_DECISION_STALE", "JOB_NOT_FOUND"):
            if token in text:
                return f"err:{token}"
        return "err:other"


def auto_steam(person: dict, participant: str) -> str:
    """processJob's automatic Steam decision (record_demo_identity_event, system source)."""
    decision = json.dumps({"status": "auto_resolved", "confirmation_status": "pending_confirmation",
                           "participant_key": participant, "method": "steam_id_confirmed", "source": "system",
                           "confidence_label": "high", "confidence_score": 1, "evidence": {"identity_provider": "steam"}})
    try:
        return "ok:" + sql(f"select public.record_demo_identity_event('{person['job']}'::uuid,'{person['user']}'::uuid,"
                           f"'auto:steam:{participant}','{decision}'::jsonb)")
    except Exception as error:  # noqa: BLE001
        text = str(error)
        return "err:" + next((t for t in ("MATCH_NOT_ANALYSED", "PARTICIPANT_NOT_IN_MATCH", "CANONICAL_MATCH_MISMATCH")
                              if t in text), "other")


def as_user(person: dict, query: str) -> str:
    claims = json.dumps({"sub": person["user"], "role": "authenticated"})
    return sql("begin; set local role authenticated; "
               f"select set_config('request.jwt.claim.sub','{person['user']}',true); "
               f"select set_config('request.jwt.claims','{claims}',true); "
               f"{query}; commit;").strip().splitlines()[-1]


def project(person: dict, match_id: str, participant: str) -> None:
    """persist_demo_projection for this user's job (the job is processing at that point)."""
    sql(f"update public.demo_jobs set status='processing' where id='{person['job']}'")
    metrics = json.dumps({"rounds_played": 1, "kills": 1, "deaths": 0, "assists": 0})
    features = json.dumps({"sample_rounds": 1, "schema_version": 1, "analysis_version": "v1", "features": {}})
    result = json.dumps({"attachment_state": "attached", "attachment_method": "self_declared_player",
                         "attachment_participant_key": participant, "attachment_source": "user"})
    sql(f"select public.persist_demo_projection('{match_id}'::uuid,'{person['upload']}'::uuid,'{person['player']}'::uuid,"
        f"null,'{{}}'::jsonb,'{{}}'::jsonb,'{metrics}'::jsonb,'{features}'::jsonb,'{person['job']}'::uuid,'{result}'::jsonb)")


def main() -> int:
    refuse_non_local()
    sha = uuid.uuid4().hex + uuid.uuid4().hex
    a, b = user("a", sha), user("b", sha)
    c = user("c", sha, steam=ROSTER[2])
    other_sha = uuid.uuid4().hex + uuid.uuid4().hex
    outsider = user("x", other_sha)
    payload = bundle(sha)
    ids = [persist(payload, person) for person in (a, b, c)]
    match_id = ids[0]
    # The other match must have its OWN roster: bundle() always emits the same ten Steam IDs,
    # so remap them, or "a participant of another match" would really be one of this match.
    other_payload = json.loads(json.dumps(bundle(other_sha)).replace("7656119800000", "7656119800099"))
    other_roster_key = other_payload["participants"][0]["participantKey"]
    assert other_roster_key not in ROSTER, other_roster_key
    other_match = persist(other_payload, outsider)
    for person in (a, b, c):
        finish_unattached(person, match_id)
    finish_unattached(outsider, other_match)

    @scenario("one_canonical_match_for_three_uploads_of_the_same_content")
    def _one():
        assert len(set(ids)) == 1, ids
        count = int(sql(f"select count(*) from public.matches where content_fingerprint='{sha}'"))
        assert count == 1, count
        return {"matches": count}

    @scenario("every_uploader_reads_the_shared_canonical_match_and_participants")
    def _read():
        seen = {p["label"]: as_user(p, f"select (select count(*) from public.matches where id='{match_id}')||'/'||"
                                        f"(select count(*) from public.match_participants where match_id='{match_id}')")
                for p in (a, b, c)}
        assert seen == {"a": "1/10", "b": "1/10", "c": "1/10"}, seen
        outsider_sees = as_user(outsider, f"select (select count(*) from public.matches where id='{match_id}')||'/'||"
                                          f"(select count(*) from public.match_participants where match_id='{match_id}')")
        assert outsider_sees == "0/0", outsider_sees
        return {"seen": seen, "outsider": outsider_sees}

    @scenario("no_personal_metrics_before_a_decision")
    def _none():
        n = int(sql(f"select count(*) from public.match_metrics where match_id='{match_id}'"))
        assert n == 0, n

    results = {
        "a": declare(a, a, ROSTER[0]),
        "b": declare(b, b, ROSTER[1]),
        "c": auto_steam(c, ROSTER[2]),
    }

    @scenario("independent_decisions_for_three_users_on_one_match")
    def _decide():
        assert results == {"a": "ok:t", "b": "ok:t", "c": "ok:t"}, results
        rows = json.loads(sql(
            "select coalesce(jsonb_agg(jsonb_build_object('u',d.user_id,'pk',d.participant_key,'m',d.match_id) "
            f"order by d.participant_key),'[]') from public.demo_identity_decisions d "
            f"where d.job_id in ('{a['job']}','{b['job']}','{c['job']}')"))
        assert [(r["u"], r["pk"], r["m"]) for r in rows] == [
            (a["user"], ROSTER[0], match_id), (b["user"], ROSTER[1], match_id), (c["user"], ROSTER[2], match_id)], rows
        return {"decisions": len(rows)}

    @scenario("a_repeat_never_duplicates_a_decision")
    def _repeat():
        sql(f"update public.demo_jobs set status='processed', stage='done' where id='{a['job']}'")
        again = declare(a, a, ROSTER[0], expected=f"manual:{ROSTER[0]}")
        assert again == "ok:t", again
        n = int(sql(f"select count(*) from public.demo_identity_decisions where job_id='{a['job']}'"))
        assert n == 1, n

    @scenario("a_user_cannot_declare_on_another_users_job")
    def _cross():
        before = int(sql(f"select count(*) from public.demo_identity_decisions where job_id='{b['job']}'"))
        attempt = declare(a, b, ROSTER[0])
        after = int(sql(f"select count(*) from public.demo_identity_decisions where job_id='{b['job']}'"))
        assert attempt == "ok:f" and before == after, (attempt, before, after)

    @scenario("a_participant_of_another_match_is_refused")
    def _foreign():
        sql(f"update public.demo_jobs set status='processed', stage='done' where id='{b['job']}'")
        attempt = declare(b, b, other_roster_key, expected=f"manual:{ROSTER[1]}")
        assert attempt == "err:PARTICIPANT_NOT_IN_MATCH", attempt

    @scenario("each_user_reads_only_their_own_decisions")
    def _rls_decisions():
        jobs = f"('{a['job']}','{b['job']}','{c['job']}')"
        seen = {p["label"]: as_user(p, f"select count(*) from public.demo_identity_decisions where job_id in {jobs}")
                for p in (a, b, c)}
        assert seen == {"a": "1", "b": "1", "c": "1"}, seen
        return {"seen": seen}

    for person, key in ((a, ROSTER[0]), (b, ROSTER[1])):
        try:
            project(person, match_id, key)
        except Exception as error:  # noqa: BLE001
            RESULTS.append({"scenario": f"projection_{person['label']}", "status": "ERROR",
                            "detail": f"{type(error).__name__}: {str(error)[:300]}"})

    @scenario("personal_metrics_per_user_and_ownership_kept")
    def _metrics():
        rows = json.loads(sql("select coalesce(jsonb_agg(player_id order by player_id),'[]') "
                              f"from public.match_metrics where match_id='{match_id}'"))
        assert sorted(rows) == sorted([a["player"], b["player"]]), rows
        owner = sql(f"select player_id from public.matches where id='{match_id}'")
        assert owner == a["player"], owner
        seen = {p["label"]: as_user(p, f"select count(*) from public.match_metrics where match_id='{match_id}'")
                for p in (a, b, c)}
        assert seen == {"a": "1", "b": "1", "c": "0"}, seen
        return {"metrics_seen": seen}

    status = "PASS" if all(r["status"] == "PASS" for r in RESULTS) else "FAIL"
    print(json.dumps({"probe": "MULTI_USER_IDENTITY", "status": status, "database": "LOCAL_DISPOSABLE_ONLY",
                      "synthetic_fixture_only": True, "scenarios": RESULTS}, indent=1, sort_keys=True))
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except BaseException as exc:  # noqa: BLE001 - the report must always be written
        print(json.dumps({"probe": "MULTI_USER_IDENTITY", "status": "FAIL", "scenarios": [
            {"scenario": "multi_user_identity", "status": "ERROR",
             "detail": f"probe crashed: {type(exc).__name__}: {str(exc)[:500]}"}]}, indent=1))
        raise SystemExit(1)
