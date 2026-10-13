#!/usr/bin/env python3
"""Idempotency probe of public.persist_canonical_observation(_attached).

Runs ONLY against a disposable local database built from supabase/migrations.
It refuses any non-local host. It writes synthetic matches there and nowhere
else; it is never evidence about a real match and admits nothing to Canonical.

Idempotency is not inferred from unique indexes: every case calls the routine
and compares what is actually stored (row counts AND a content digest of every
table the routine writes) before and after.
"""
from __future__ import annotations

import copy
import hashlib
import json
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from queue_semantics_probe import js, new_job, refuse_non_local, sql  # noqa: E402

TABLES = {
    "matches": "id = '{m}'",
    "match_sources": "match_id = '{m}'",
    "match_participants": "match_id = '{m}'",
    "match_rounds": "match_id = '{m}'",
    "round_players": "match_id = '{m}'",
    "round_events": "match_id = '{m}'",
}
# Bookkeeping columns that legitimately move on a repeated write.
# observation_count is a counter of writes by design; it is checked on its own.
VOLATILE = ("updated_at", "fetched_at", "source_fetched_at", "created_at", "last_seen_at", "id", "observation_count")
RESULTS: list[dict] = []


def quality(status: str = "complete") -> dict:
    return {"status": status, "reasons": [], "confidence": None}


def bundle(fingerprint: str, rounds: int = 1, fetched_at: str = "2026-01-15T21:00:00.000Z") -> dict:
    roster = [f"7656119800000{110 + index}" for index in range(10)]
    participants = [{
        "participantKey": steam, "internalPlayerId": None, "source": "demo", "externalPlayerId": None,
        "steamId64": steam, "nicknameSnapshot": None, "team": "team_a" if index < 5 else "team_b",
        "isTargetPlayer": index == 0, "identityStatus": "verified", "identityConfidence": None, "metadata": {},
    } for index, steam in enumerate(roster)]
    numbers = list(range(1, rounds + 1))
    return {
        "observation": {
            "source": "demo", "sourceContractVersion": "demo-v1", "externalMatchId": None, "externalParentId": None,
            "sourceVersion": None, "fetchedAt": fetched_at, "sourceUpdatedAt": None, "status": "complete",
            "quality": quality(), "fingerprint": fingerprint, "metadata": {"probe": "canonical_persistence"},
        },
        "series": None,
        "match": {
            "game": "cs2", "map": "de_mirage", "mapNumber": None, "playedAt": "2026-01-15T20:00:00.000Z",
            "startedAt": None, "finishedAt": None, "durationSeconds": None, "status": "completed",
            "finished": True, "terminal": True, "teamA": "probe-A", "teamB": "probe-B",
            "scoreTeamA": 13, "scoreTeamB": 9, "winnerTeam": None, "roundCount": rounds, "quality": quality(),
            "coverage": {"roundsExpected": None, "roundsObserved": rounds, "participantsExpected": 10,
                         "participantsObserved": 10, "participantsResolved": 10, "eventsObserved": 2 * rounds,
                         "hasRoundData": True, "hasEventData": True, "hasPlayerRoundState": True},
            "schemaVersion": 2,
        },
        "participants": participants,
        "rounds": [{
            "roundNumber": n, "startTick": None, "endTick": None, "startTimeSeconds": None, "endTimeSeconds": None,
            "durationSeconds": None, "winningTeam": "team_a", "winningSide": "CT", "winReason": "elimination",
            "bombPlanted": None, "bombDefused": None, "bombExploded": None, "quality": quality(), "metadata": {},
        } for n in numbers],
        "roundPlayers": [{
            "roundNumber": n, "participantKey": steam, "side": "CT" if index < 5 else "T", "survived": None,
            "moneyStart": None, "moneyEnd": None, "equipmentValue": None, "buyContext": None, "kills": None,
            "deaths": None, "assists": None, "damage": None, "flashAssists": None, "openingKill": None,
            "openingDeath": None, "traded": None, "tradeKill": None, "metadata": {},
        } for n in numbers for index, steam in enumerate(roster)],
        "events": [event for n in numbers for event in ({
            "roundNumber": n, "type": "kill", "tick": None, "gameTimeSeconds": None,
            "actorParticipantKey": roster[0], "victimParticipantKey": roster[5], "assisterParticipantKey": None,
            "sourceActorExternalId": None, "sourceVictimExternalId": None, "sourceAssisterExternalId": None,
            "weapon": "ak47", "headshot": None, "distance": None, "damage": None, "quality": quality(), "data": {},
        }, {
            "roundNumber": n, "type": "round_end", "tick": None, "gameTimeSeconds": None,
            "actorParticipantKey": None, "victimParticipantKey": None, "assisterParticipantKey": None,
            "sourceActorExternalId": None, "sourceVictimExternalId": None, "sourceAssisterExternalId": None,
            "weapon": None, "headshot": None, "distance": None, "damage": None, "quality": quality(), "data": {},
        })],
    }


def persist(payload: dict, upload: str) -> dict:
    text = json.dumps(payload).replace("'", "''")
    return js(f"select public.persist_canonical_observation_attached('{text}'::jsonb, null, '{upload}')")


def snapshot(match_id: str) -> dict:
    """Row count and content digest per table, without bookkeeping columns."""
    out = {}
    for table, where in TABLES.items():
        rows = json.loads(sql(f"select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.{table} t "
                              f"where {where.format(m=match_id)}"))
        cleaned = sorted(json.dumps({k: v for k, v in row.items() if k not in VOLATILE}, sort_keys=True) for row in rows)
        out[table] = {"rows": len(rows), "digest": hashlib.sha256("\n".join(cleaned).encode()).hexdigest()[:16]}
    return out


def matches_for(fingerprint: str) -> int:
    return int(sql("select count(distinct match_id) from public.match_sources "
                   f"where source='demo' and fingerprint='{fingerprint}'"))


def scenario(name: str):
    def wrap(fn):
        def run():
            try:
                RESULTS.append({"scenario": name, "status": "PASS", **(fn() or {})})
            except AssertionError as error:
                RESULTS.append({"scenario": name, "status": "FAIL", "detail": str(error)[:400]})
            except Exception as error:  # noqa: BLE001 - reported, never hidden
                RESULTS.append({"scenario": name, "status": "ERROR", "detail": f"{type(error).__name__}: {str(error)[:400]}"})
        return run
    return wrap


def fresh() -> tuple[str, str]:
    return new_job()["upload"], "probe-" + uuid.uuid4().hex


@scenario("repeating_the_same_attempt_changes_nothing")
def s_repeat():
    upload, fingerprint = fresh()
    payload = bundle(fingerprint)
    first = persist(payload, upload)
    before = snapshot(first["match_id"])
    assert first["created"] is True and before["round_events"]["rows"] == 2 and before["round_players"]["rows"] == 10, (first, before)
    for _ in range(3):
        again = persist(payload, upload)
        assert again["match_id"] == first["match_id"] and again["created"] is False, again
    after = snapshot(first["match_id"])
    assert after == before, {"before": before, "after": after}
    assert matches_for(fingerprint) == 1
    return {"tables": before}


def confidences(match_id: str) -> list:
    return json.loads(sql("select jsonb_agg(identity_confidence order by participant_key) "
                          f"from public.match_participants where match_id='{match_id}'"))


@scenario("an_unknown_identity_confidence_stays_unknown_after_a_repeated_write")
def s_null_not_zero():
    upload, fingerprint = fresh()
    payload = bundle(fingerprint)
    first = persist(payload, upload)
    assert confidences(first["match_id"]) == [None] * 10
    persist(payload, upload)
    after = confidences(first["match_id"])
    assert after == [None] * 10, after  # NULL != ZERO
    return {"confidence_after_repeat": "NULL"}


@scenario("a_known_identity_confidence_never_decreases_and_is_not_erased_by_an_unknown_one")
def s_confidence_monotonic():
    upload, fingerprint = fresh()

    def with_confidence(value):
        payload = bundle(fingerprint)
        for participant in payload["participants"]:
            participant["identityConfidence"] = value
        return payload
    first = persist(with_confidence(0.4), upload)
    persist(with_confidence(0.9), upload)
    assert confidences(first["match_id"]) == [0.9] * 10
    persist(with_confidence(None), upload)
    assert confidences(first["match_id"]) == [0.9] * 10
    persist(with_confidence(0.2), upload)
    assert confidences(first["match_id"]) == [0.9] * 10
    return {"sequence": "0.4 -> 0.9 -> null -> 0.2", "stored": 0.9}


@scenario("the_observation_counter_counts_writes")
def s_counter():
    upload, fingerprint = fresh()
    payload = bundle(fingerprint)
    first = persist(payload, upload)
    persist(payload, upload)
    persist(payload, upload)
    count = int(sql(f"select observation_count from public.match_sources where match_id='{first['match_id']}'"))
    assert count == 3, count
    return {"observation_count_after_3_writes": count}


@scenario("re_execution_of_the_same_job_with_a_new_fetch_time_changes_no_fact")
def s_reexecution():
    upload, fingerprint = fresh()
    first = persist(bundle(fingerprint), upload)
    before = snapshot(first["match_id"])
    again = persist(bundle(fingerprint, fetched_at="2026-01-16T09:30:00.000Z"), upload)
    after = snapshot(first["match_id"])
    assert again["match_id"] == first["match_id"] and again["created"] is False, again
    assert after == before, {"before": before, "after": after}
    return {"match_reused": True}


@scenario("concurrent_identical_writes_create_one_match")
def s_concurrent():
    upload, fingerprint = fresh()
    payload = bundle(fingerprint)

    def call(_):
        try:
            return persist(payload, upload)
        except RuntimeError as error:
            return {"error": str(error)[:120]}
    with ThreadPoolExecutor(8) as pool:
        answers = list(pool.map(call, range(8)))
    ok = [a for a in answers if "match_id" in a]
    assert ok, answers
    assert len({a["match_id"] for a in ok}) == 1, answers
    assert matches_for(fingerprint) == 1
    state = snapshot(ok[0]["match_id"])
    assert state["round_events"]["rows"] == 2 and state["round_players"]["rows"] == 10 and state["match_participants"]["rows"] == 10, state
    assert sum(1 for a in ok if a["created"] is True) == 1, answers
    return {"succeeded": len(ok), "errors": sorted({a["error"] for a in answers if "error" in a})}


@scenario("a_failed_write_persists_nothing")
def s_atomic_first():
    upload, fingerprint = fresh()
    broken = bundle(fingerprint)
    broken["events"][0]["actorParticipantKey"] = "76561190000000000"  # not in the roster
    try:
        persist(broken, upload)
        raise AssertionError("an event for an unknown participant was accepted")
    except RuntimeError as error:
        assert "CANONICAL_PARTICIPANT_UNKNOWN" in str(error), error
    assert matches_for(fingerprint) == 0
    leftovers = int(sql(f"select count(*) from public.matches where upload_id='{upload}'"))
    assert leftovers == 0, leftovers
    return {"rows_after_failure": 0}


@scenario("a_failed_rewrite_leaves_the_previous_state_intact")
def s_atomic_rewrite():
    upload, fingerprint = fresh()
    first = persist(bundle(fingerprint), upload)
    before = snapshot(first["match_id"])
    broken = bundle(fingerprint)
    broken["roundPlayers"][3]["participantKey"] = "76561190000000000"
    try:
        persist(broken, upload)
        raise AssertionError("a round player for an unknown participant was accepted")
    except RuntimeError as error:
        assert "CANONICAL_PARTICIPANT_UNKNOWN" in str(error), error
    assert snapshot(first["match_id"]) == before
    return {"state_preserved": True}


@scenario("a_re_execution_with_a_different_result_replaces_rounds_and_events_without_leftovers")
def s_replace():
    upload, fingerprint = fresh()
    first = persist(bundle(fingerprint, rounds=3), upload)
    three = snapshot(first["match_id"])
    assert three["round_events"]["rows"] == 6 and three["round_players"]["rows"] == 30, three
    again = persist(bundle(fingerprint, rounds=1), upload)
    one = snapshot(first["match_id"])
    assert again["match_id"] == first["match_id"]
    # Events and per-round player rows are replaced, never appended to.
    assert one["round_events"]["rows"] == 2 and one["round_players"]["rows"] == 10, one
    # Rounds the authoritative observation no longer contains are removed too.
    assert one["match_rounds"]["rows"] == 1, one
    assert int(sql(f"select round_count from public.matches where id='{first['match_id']}'")) == 1
    return {"events_after_3_rounds": 6, "events_after_1_round": 2, "match_rounds_rows_after_shrink": 1}


@scenario("rounds_still_present_are_updated_in_place_and_keep_player_scoped_columns")
def s_rounds_in_place():
    upload, fingerprint = fresh()
    first = persist(bundle(fingerprint, rounds=3), upload)
    match = first["match_id"]
    ids = json.loads(sql(f"select jsonb_object_agg(round_number, id) from public.match_rounds where match_id='{match}'"))
    sql(f"update public.match_rounds set player_money_start = 4100, buy_context = 'full_buy' where match_id='{match}' and round_number = 1")
    persist(bundle(fingerprint, rounds=2), upload)
    kept = json.loads(sql("select jsonb_agg(jsonb_build_object('n', round_number, 'id', id, 'money', player_money_start, "
                          f"'buy', buy_context) order by round_number) from public.match_rounds where match_id='{match}'"))
    assert [row["n"] for row in kept] == [1, 2], kept
    assert kept[0]["id"] == ids["1"] and kept[1]["id"] == ids["2"], kept  # same rows, not re-created
    assert kept[0]["money"] == 4100 and kept[0]["buy"] == "full_buy", kept
    return {"rounds_kept": 2, "round_3_removed": True}


@scenario("a_lower_priority_source_cannot_remove_rounds")
def s_lower_priority():
    upload, fingerprint = fresh()
    first = persist(bundle(fingerprint, rounds=3), upload)
    match = first["match_id"]
    weaker = bundle(fingerprint, rounds=1)
    weaker["observation"].update({"source": "faceit", "sourceContractVersion": "faceit-v1",
                                  "externalMatchId": "probe-" + uuid.uuid4().hex, "fingerprint": None})
    for participant in weaker["participants"]:
        participant["source"] = "faceit"
    text = json.dumps(weaker).replace("'", "''")
    js(f"select public.persist_canonical_observation_attached('{text}'::jsonb, null, null, '{match}')")
    state = snapshot(match)
    assert state["match_rounds"]["rows"] == 3 and state["round_events"]["rows"] == 6, state
    return {"rounds_after_weaker_source": 3}


@scenario("the_same_demo_from_a_second_upload_does_not_create_a_second_match")
def s_second_upload():
    upload, fingerprint = fresh()
    other, _ = fresh()
    first = persist(bundle(fingerprint), upload)
    second = persist(bundle(fingerprint), other)
    assert second["match_id"] == first["match_id"], (first, second)
    assert matches_for(fingerprint) == 1
    return {"match_reused": True}


@scenario("client_roles_cannot_call_the_persistence_routine")
def s_roles():
    upload, fingerprint = fresh()
    text = json.dumps(bundle(fingerprint)).replace("'", "''")
    denied = []
    for role in ("anon", "authenticated"):
        for fn in ("persist_canonical_observation", "persist_canonical_observation_attached"):
            try:
                sql(f"set role {role}; select public.{fn}('{text}'::jsonb, null, '{upload}')")
                raise AssertionError(f"{role} could call {fn}")
            except RuntimeError as error:
                assert "permission denied" in str(error), error
                denied.append(f"{role}:{fn}")
    assert matches_for(fingerprint) == 0
    return {"denied": denied}


def refused(query: str, code: str) -> None:
    try:
        sql(query)
    except RuntimeError as error:
        assert code in str(error), (query[:80], str(error))
        return
    raise AssertionError(f"not refused: {query[:120]}")


def quarantine(match_id: str) -> None:
    sql("insert into public.canonical_match_quarantine(match_id, reason, decision_ref, quarantined_by, evidence) "
        f"values ('{match_id}', 'PRE_PROVENANCE_CANONICAL_ROW', 'probe', 'canonical_persistence_probe', "
        "'{\"probe\": true}'::jsonb)")


@scenario("a_quarantined_match_is_preserved_and_every_canonical_or_derived_write_is_refused")
def s_quarantine():
    upload, fingerprint = fresh()
    payload = bundle(fingerprint, rounds=2)
    match_id = persist(payload, upload)["match_id"]
    sql(f"update public.matches set canonical_status = 'partial' where id = '{match_id}'")
    quarantine(match_id)
    before = snapshot(match_id)
    m = f"'{match_id}'"
    for query in (
        # The routine itself, re-run with the same and with a different result.
        "select public.persist_canonical_observation_attached('" + json.dumps(payload).replace("'", "''")
        + f"'::jsonb, null, '{upload}')",
        "select public.persist_canonical_observation_attached('"
        + json.dumps(bundle(fingerprint, rounds=3, fetched_at="2026-01-16T21:00:00.000Z")).replace("'", "''")
        + f"'::jsonb, null, '{upload}')",
        # Promotion, mutation and removal of the match row.
        f"update public.matches set canonical_status = 'completed' where id = {m}",
        f"update public.matches set round_count = 99 where id = {m}",
        f"delete from public.matches where id = {m}",
        # Canonical children.
        f"delete from public.round_events where match_id = {m}",
        f"update public.match_rounds set match_id = match_id where match_id = {m}",
        f"delete from public.match_participants where match_id = {m}",
        f"delete from public.match_sources where match_id = {m}",
        f"delete from public.round_players where match_id = {m}",
        # Derived layers that feed analysis, Player DNA, Pro Score and the AI Coach.
        f"insert into public.match_metrics(match_id) values ({m})",
        f"insert into public.match_features(match_id) values ({m})",
        # TRUNCATE skips row triggers; the statement guard refuses it.
        "truncate public.round_events",
        "truncate public.matches cascade",
    ):
        refused(query, "CANONICAL_MATCH_QUARANTINED")
    for query in (f"update public.canonical_match_quarantine set reason = reason where match_id = {m}",
                  f"delete from public.canonical_match_quarantine where match_id = {m}",
                  "truncate public.canonical_match_quarantine cascade"):
        refused(query, "CANONICAL_QUARANTINE_IMMUTABLE")
    after = snapshot(match_id)
    assert after == before, {"before": before, "after": after}
    status = sql(f"select canonical_status from public.matches where id = {m}")
    assert status == "partial", status
    assert sql(f"select public.is_canonical_match_quarantined({m})") == "t"
    return {"tables": after}


@scenario("a_match_that_is_not_quarantined_is_unaffected_by_the_guards")
def s_quarantine_scope():
    upload, fingerprint = fresh()
    first = persist(bundle(fingerprint), upload)
    second = persist(bundle(fingerprint, rounds=2, fetched_at="2026-01-16T21:00:00.000Z"), upload)
    assert second["match_id"] == first["match_id"]
    assert snapshot(first["match_id"])["match_rounds"]["rows"] == 2
    assert sql(f"select public.is_canonical_match_quarantined('{first['match_id']}')") == "f"


@scenario("client_roles_cannot_read_or_write_the_quarantine_registry")
def s_quarantine_roles():
    denied = []
    for role in ("anon", "authenticated"):
        for query in ("select count(*) from public.canonical_match_quarantine",
                      "insert into public.canonical_match_quarantine(match_id, reason, decision_ref, quarantined_by, "
                      "evidence) values (gen_random_uuid(), 'PRE_PROVENANCE_CANONICAL_ROW', 'x', 'x', '{}')",
                      "select public.is_canonical_match_quarantined(gen_random_uuid())"):
            refused(f"set role {role}; {query}", "permission denied")
            denied.append(f"{role}:{query.split()[0]}")
    return {"denied": denied}


SCENARIOS = [s_repeat, s_null_not_zero, s_confidence_monotonic, s_counter, s_reexecution, s_concurrent, s_atomic_first, s_atomic_rewrite, s_replace, s_rounds_in_place, s_lower_priority, s_second_upload, s_roles,
             s_quarantine_scope, s_quarantine_roles, s_quarantine]


def main() -> int:
    refuse_non_local()
    for run in SCENARIOS:
        run()
    ok = all(item["status"] == "PASS" for item in RESULTS)
    print(json.dumps({
        "probe": "CANONICAL_PERSISTENCE_IDEMPOTENCY",
        "status": "PASS" if ok else "FAIL",
        "database": "LOCAL_DISPOSABLE_ONLY",
        "synthetic_fixture_only": True,
        "admits_real_data": False,
        "scenarios": RESULTS,
    }, indent=1, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
