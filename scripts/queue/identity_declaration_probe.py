#!/usr/bin/env python3
"""D11 manual identity declaration on a LOCAL DISPOSABLE database (Supabase local, built
from supabase/migrations). Everything runs in one transaction that is rolled back.

Production defect D11 (2026-10-21, job 921b55cf / match 95186f3f): every manual selection
failed because the app wrote the resolver's method `manual_user_selection` into
`demo_jobs.attachment_method`, whose check constraint accepts only the stored vocabulary
(`self_declared_player`, ...). The app now maps to the stored vocabulary; this probe pins
the database side of the contract with the exact payload shape `declareDemoPlayer` sends:

* the stored method is accepted: the decision row (participant, author, match, method) and
  the job attachment are written together;
* repeating the same request does not duplicate the decision;
* the legacy domain value is refused AND leaves no partial decision (one transaction);
* a participant of another match is refused (PARTICIPANT_NOT_IN_MATCH), nothing written;
* another user cannot declare on the job (false, nothing written);
* a stale expected decision key is refused;
* as `authenticated`, player B reads none of A's decisions and cannot execute the RPC.
Synthetic fixtures only; never evidence about the managed database's data.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from queue_semantics_probe import DB, HOST, PORT, USER, refuse_non_local  # noqa: E402


def ids(prefix: str) -> dict[str, str]:
    return {"user": str(uuid.uuid4()), "upload": str(uuid.uuid4()), "match": str(uuid.uuid4()),
            "sha": uuid.uuid4().hex + uuid.uuid4().hex, "prefix": prefix,
            "pk": f"7656119{uuid.uuid4().int % 10**10:010d}", "other_pk": f"7656119{uuid.uuid4().int % 10**10:010d}"}


def fixtures(p: dict[str, str]) -> str:
    u, up, m, sha, pre = p["user"], p["upload"], p["match"], p["sha"], p["prefix"]
    return f"""
INSERT INTO auth.users(id, email) VALUES ('{u}', '{u}@probe.invalid');
INSERT INTO public.player_profiles(user_id, nickname) VALUES ('{u}', 'probe-{pre}') ON CONFLICT (user_id) DO NOTHING;
SELECT id AS player_{pre} FROM public.player_profiles WHERE user_id = '{u}' \\gset
INSERT INTO public.uploads(id, user_id, type, file_name, storage_path, file_size, demo_sha256)
VALUES ('{up}', '{u}', 'demo', 'probe-{pre}.dem', '{u}/{up}.dem', 520, '{sha}');
SELECT (public.enqueue_demo_job('{up}', '{u}') ->> 'job_id') AS job_{pre} \\gset
SELECT set_config('probe.job_{pre}', :'job_{pre}', false);
INSERT INTO public.matches(id, upload_id, player_id, map) VALUES ('{m}', '{up}', :'player_{pre}', 'de_probe');
INSERT INTO public.match_sources(match_id, upload_id, source, source_contract_version, fetched_at, status)
VALUES ('{m}', '{up}', 'demo', 'probe', now(), 'complete');
INSERT INTO public.match_participants(match_id, participant_key, source, steam_id64, nickname_snapshot)
VALUES ('{m}', '{p['pk']}', 'demo', '{p['pk']}', 'Probe{pre}'),
       ('{m}', '{p['other_pk']}', 'demo', '{p['other_pk']}', 'Other{pre}');
-- The job stays as enqueued (pending, match_id NULL): the RPC accepts any status other
-- than processing/cancel and resolves the match from this upload's durable demo source.
"""


def payload(pk: str, method: str, expected: str | None) -> str:
    exp = "NULL" if expected is None else f"'{expected}'"
    return (f"jsonb_build_object('event_key', 'manual:{pk}', 'declared_participant_key', '{pk}', "
            f"'declared_nickname', NULL, 'state', 'attached', 'method', '{method}', 'source', 'user', "
            f"'confidence_score', 0.8, 'confidence', 'medium', 'participant_key', '{pk}', "
            f"'observed_nickname', 'Probe', 'reason', NULL, 'expected_latest_event_key', {exp})")


def call(label: str, job: str, user: str, body: str) -> str:
    """Run the RPC in a subtransaction; record 'ok:<result>' or 'err:<sqlstate>:<token>'."""
    return f"""DO $c$
DECLARE _r boolean; _msg text;
BEGIN
  -- psql does not interpolate :variables inside a dollar-quoted body: read the job id
  -- from the session setting written right after enqueue_demo_job.
  _r := public.requeue_demo_job_after_attachment(current_setting('{job}')::uuid, '{user}'::uuid, {body});
  PERFORM set_config('probe.{label}', 'ok:' || coalesce(_r::text, 'null'), true);
EXCEPTION WHEN OTHERS THEN
  _msg := SQLERRM;
  PERFORM set_config('probe.{label}', 'err:' || SQLSTATE || ':' ||
    coalesce(substring(_msg from '([A-Z_]{{6,}})'), substring(_msg from 'constraint "([a-z0-9_]+)"'), '?'), true);
END $c$;
SELECT current_setting('probe.{label}') AS {label} \\gset
"""


def count(label: str, sql: str) -> str:
    return f"SELECT ({sql})::text AS {label} \\gset\n"


def script(a: dict, b: dict) -> str:
    job_a = "probe.job_a"
    decisions_a = "SELECT count(*) FROM public.demo_identity_decisions WHERE job_id = :'job_a'"
    out = ["\\set ON_ERROR_STOP 1\nBEGIN;\n", fixtures(a), fixtures(b)]
    # 1. Legacy domain value: refused, and atomic (no decision, job untouched).
    out += [call("legacy_method", job_a, a["user"], payload(a["pk"], "manual_user_selection", None)),
            count("decisions_after_legacy", decisions_a),
            count("state_after_legacy", "SELECT attachment_state FROM public.demo_jobs WHERE id = :'job_a'")]
    # 2. Another user's declaration on A's job.
    out += [call("other_user", job_a, b["user"], payload(a["pk"], "self_declared_player", None)),
            count("decisions_after_other_user", decisions_a)]
    # 3. Participant of another match (B's match).
    out += [call("foreign_participant", job_a, a["user"], payload(b["pk"], "self_declared_player", None)),
            count("decisions_after_foreign", decisions_a)]
    # 4. Valid selection with the stored vocabulary.
    out += [call("valid", job_a, a["user"], payload(a["pk"], "self_declared_player", None)),
            count("decision_row", "SELECT jsonb_build_object('n', count(*), 'status', min(status), 'method', min(method), "
                  f"'pk', min(participant_key), 'user_ok', bool_and(user_id = '{a['user']}'), "
                  f"'match_ok', bool_and(match_id = '{a['match']}'))::text FROM public.demo_identity_decisions "
                  "WHERE job_id = :'job_a'"),
            count("job_row", "SELECT jsonb_build_object('state', attachment_state, 'method', attachment_method, "
                  "'pk', attachment_participant_key, 'by_ok', attachment_declared_by = user_id, "
                  "'status', status::text)::text FROM public.demo_jobs WHERE id = :'job_a'")]
    # 5. Same request again (the client sends the latest key it read): no duplicate decision.
    out += [call("repeat", job_a, a["user"], payload(a["pk"], "self_declared_player", f"manual:{a['pk']}")),
            count("decisions_after_repeat", decisions_a)]
    # 6. Stale expected key.
    out += [call("stale", job_a, a["user"], payload(a["pk"], "self_declared_player", "manual:somebody-else"))]
    # 7. As B (authenticated): reads none of A's decisions; cannot execute the RPC.
    claims = json.dumps({"sub": b["user"], "role": "authenticated"})
    out += ["SET LOCAL ROLE authenticated;\n",
            f"SELECT set_config('request.jwt.claim.sub', '{b['user']}', true);\n",
            f"SELECT set_config('request.jwt.claims', '{claims}', true);\n",
            count("b_reads_a_decisions", decisions_a),
            call("b_executes_rpc", job_a, b["user"], payload(a["pk"], "self_declared_player", None)),
            "RESET ROLE;\n"]
    labels = ["legacy_method", "decisions_after_legacy", "state_after_legacy", "other_user",
              "decisions_after_other_user", "foreign_participant", "decisions_after_foreign", "valid",
              "decision_row", "job_row", "repeat", "decisions_after_repeat", "stale", "b_reads_a_decisions",
              "b_executes_rpc"]
    obj = ", ".join(f"'{l}', :'{l}'" for l in labels)
    out += [f"SELECT 'RESULT:' || jsonb_build_object({obj})::text;\nROLLBACK;\n"]
    return "".join(out)


def check(r: dict, a: dict) -> list[str]:
    problems = []
    def expect(key: str, ok: bool) -> None:
        if not ok:
            problems.append(f"{key}={r.get(key)!r}")
    expect("legacy_method", str(r["legacy_method"]).startswith("err:23514:"))
    expect("decisions_after_legacy", r["decisions_after_legacy"] == "0")
    expect("state_after_legacy", r["state_after_legacy"] in (None, "", "unattached"))
    expect("other_user", r["other_user"] == "ok:false")
    expect("decisions_after_other_user", r["decisions_after_other_user"] == "0")
    expect("foreign_participant", "PARTICIPANT_NOT_IN_MATCH" in str(r["foreign_participant"]))
    expect("decisions_after_foreign", r["decisions_after_foreign"] == "0")
    expect("valid", r["valid"] == "ok:true")
    row = json.loads(r["decision_row"])
    expect("decision_row", row == {"n": 1, "status": "manually_resolved", "method": "self_declared_player",
                                   "pk": a["pk"], "user_ok": True, "match_ok": True})
    job = json.loads(r["job_row"])
    expect("job_row", job == {"state": "attached", "method": "self_declared_player", "pk": a["pk"],
                              "by_ok": True, "status": "pending"})
    expect("repeat", r["repeat"] == "ok:true")
    expect("decisions_after_repeat", r["decisions_after_repeat"] == "1")
    expect("stale", "IDENTITY_DECISION_STALE" in str(r["stale"]))
    expect("b_reads_a_decisions", r["b_reads_a_decisions"] == "0")
    expect("b_executes_rpc", str(r["b_executes_rpc"]).startswith("err:42501"))
    return problems


def main() -> int:
    try:
        return _main()
    except BaseException as exc:  # noqa: BLE001 - the report must always be written
        print(json.dumps({"probe": "IDENTITY_DECLARATION_D11", "status": "FAIL", "database": "LOCAL_DISPOSABLE_ONLY",
                          "scenarios": [{"scenario": "d11_manual_identity_declaration", "status": "FAIL",
                                         "detail": f"probe crashed: {type(exc).__name__}: {str(exc)[:400]}"}]},
                         indent=1))
        return 1


def _main() -> int:
    refuse_non_local()
    a, b = ids("a"), ids("b")
    result = subprocess.run(["psql", "-X", "-h", HOST, "-p", PORT, "-U", USER, "-d", DB, "-At", "-f", "-"],
                            input=script(a, b), capture_output=True, text=True, env={**os.environ}, timeout=120)
    lines = [line for line in result.stdout.splitlines() if line.startswith("RESULT:")]
    if result.returncode != 0 or len(lines) != 1:
        report = {"probe": "IDENTITY_DECLARATION_D11", "status": "FAIL", "database": "LOCAL_DISPOSABLE_ONLY",
                  "scenarios": [{"scenario": "d11_manual_identity_declaration", "status": "FAIL",
                                 "detail": " | ".join(result.stderr.strip().splitlines()[-6:])[:900] or "psql failed"}]}
        print(json.dumps(report, indent=1))
        return 1
    observed = json.loads(lines[0][len("RESULT:"):])
    problems = check(observed, a)
    report = {"probe": "IDENTITY_DECLARATION_D11", "status": "FAIL" if problems else "PASS",
              "database": "LOCAL_DISPOSABLE_ONLY", "synthetic_fixture_only": True,
              "scenarios": [{"scenario": "d11_manual_identity_declaration", "status": "FAIL" if problems else "PASS",
                             "detail": problems or "ok", "observed": observed}]}
    print(json.dumps(report, indent=1, sort_keys=True))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
