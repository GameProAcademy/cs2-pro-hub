#!/usr/bin/env python3
"""Two-user RLS isolation on a LOCAL DISPOSABLE database (Supabase local, built
from supabase/migrations). Everything runs in one transaction that is rolled back.

Two players A and B each get a profile, an upload, a demo job, a match and a
metric row. Then, as the `authenticated` role with each player's JWT subject
(exactly what PostgREST does for a signed-in session), the probe counts what
each can read of the other's rows in every table the product reads
(`getPlayerOverview`, demo history), and tries to write the other's rows.
`anon` must read nothing. Synthetic fixtures only; never evidence about the
managed database's data, only about the policies the migrations create.
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

TABLES = {
    "player_profiles": "id",
    "uploads": "id",
    "demo_jobs": "id",
    "matches": "id",
    "match_metrics": "id",
}


def ids(prefix: str) -> dict[str, str]:
    return {"user": str(uuid.uuid4()), "player": "", "upload": str(uuid.uuid4()), "job": "",
            "match": str(uuid.uuid4()), "metric": str(uuid.uuid4()), "sha": uuid.uuid4().hex + uuid.uuid4().hex,
            "prefix": prefix}


def fixtures(p: dict[str, str]) -> str:
    u, up, m, mm, sha = p["user"], p["upload"], p["match"], p["metric"], p["sha"]
    return f"""
INSERT INTO auth.users(id, email) VALUES ('{u}', '{u}@probe.invalid');
INSERT INTO public.player_profiles(user_id, nickname) VALUES ('{u}', 'probe-{p['prefix']}') ON CONFLICT (user_id) DO NOTHING;
SELECT id AS player_{p['prefix']} FROM public.player_profiles WHERE user_id = '{u}' \\gset
INSERT INTO public.uploads(id, user_id, type, file_name, storage_path, file_size, demo_sha256)
VALUES ('{up}', '{u}', 'demo', 'probe-{p['prefix']}.dem', '{u}/{up}.dem', 520, '{sha}');
SELECT (public.enqueue_demo_job('{up}', '{u}') ->> 'job_id') AS job_{p['prefix']} \\gset
INSERT INTO public.matches(id, upload_id, player_id, map, result) VALUES ('{m}', '{up}', :'player_{p['prefix']}', 'de_probe', 'win');
INSERT INTO public.match_metrics(id, match_id, player_id, kills, deaths) VALUES ('{mm}', '{m}', :'player_{p['prefix']}', 20, 10);
"""


def visible(viewer: str, label: str, a: dict, b: dict) -> str:
    """Counts of A's and B's fixture rows visible to the current session."""
    def where(table: str, p: dict) -> str:
        key = {"player_profiles": f"user_id = '{p['user']}'", "uploads": f"id = '{p['upload']}'",
               "demo_jobs": f"upload_id = '{p['upload']}'", "matches": f"id = '{p['match']}'",
               "match_metrics": f"id = '{p['metric']}'"}[table]
        return f"(SELECT count(*) FROM public.{table} WHERE {key})"
    parts = ", ".join(f"'{t}', jsonb_build_object('a', {where(t, a)}, 'b', {where(t, b)})" for t in TABLES)
    return f"SELECT jsonb_build_object({parts})::text AS {label} \\gset\n"


def as_user(user: str | None) -> str:
    if user is None:
        return "SET LOCAL ROLE anon;\nSELECT set_config('request.jwt.claims', '{\"role\":\"anon\"}', true);\n"
    claims = json.dumps({"sub": user, "role": "authenticated"})
    return (f"SET LOCAL ROLE authenticated;\nSELECT set_config('request.jwt.claim.sub', '{user}', true);\n"
            f"SELECT set_config('request.jwt.claims', '{claims}', true);\n")


def attempt(label: str, statement: str) -> str:
    """Run a write as the current role; record 'ok:<rows>' or 'denied:<sqlstate>' without aborting."""
    body = statement.replace("'", "''")
    return f"""DO $w$
DECLARE _n bigint;
BEGIN
  EXECUTE '{body}';
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('probe.{label}', 'ok:' || _n, true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('probe.{label}', 'denied:' || SQLSTATE, true);
END $w$;
SELECT current_setting('probe.{label}') AS {label} \\gset
"""


def script(a: dict, b: dict) -> str:
    out = ["\\set ON_ERROR_STOP 1\nBEGIN;\n", fixtures(a), fixtures(b)]
    out += [as_user(a["user"]), visible("a", "seen_by_a", a, b)]
    out += [attempt("a_updates_b_profile", f"UPDATE public.player_profiles SET nickname = 'x' WHERE user_id = '{b['user']}'"),
            attempt("a_inserts_upload_for_b", "INSERT INTO public.uploads(id, user_id, type, file_name, storage_path, "
                    f"file_size, demo_sha256) VALUES ('{uuid.uuid4()}', '{b['user']}', 'demo', 'x.dem', 'x/x.dem', 520, "
                    f"'{'b' * 64}')"),
            attempt("a_deletes_b_metric", f"DELETE FROM public.match_metrics WHERE id = '{b['metric']}'"),
            attempt("a_updates_b_match", f"UPDATE public.matches SET map = 'x' WHERE id = '{b['match']}'"),
            attempt("a_updates_b_job", f"UPDATE public.demo_jobs SET status = 'failed' WHERE upload_id = '{b['upload']}'"),
            "RESET ROLE;\n"]
    out += [as_user(b["user"]), visible("b", "seen_by_b", a, b), "RESET ROLE;\n"]
    out += [as_user(None), visible("anon", "seen_by_anon", a, b), "RESET ROLE;\n"]
    labels = ["seen_by_a", "seen_by_b", "seen_by_anon"]
    writes = ["a_updates_b_profile", "a_inserts_upload_for_b", "a_deletes_b_metric", "a_updates_b_match",
              "a_updates_b_job"]
    obj = ", ".join([f"'{l}', :'{l}'::jsonb" for l in labels] + [f"'{w}', :'{w}'" for w in writes])
    out += [f"SELECT 'RESULT:' || jsonb_build_object({obj})::text;\nROLLBACK;\n"]
    return "".join(out)


def check(r: dict) -> list[str]:
    problems = []
    for table in TABLES:
        if r["seen_by_a"][table] != {"a": 1, "b": 0}:
            problems.append(f"A sees {table}: {r['seen_by_a'][table]}")
        if r["seen_by_b"][table] != {"a": 0, "b": 1}:
            problems.append(f"B sees {table}: {r['seen_by_b'][table]}")
        if r["seen_by_anon"][table] != {"a": 0, "b": 0}:
            problems.append(f"anon sees {table}: {r['seen_by_anon'][table]}")
    for write in ("a_updates_b_profile", "a_deletes_b_metric", "a_updates_b_match", "a_updates_b_job"):
        if r[write] not in ("ok:0",) and not str(r[write]).startswith("denied:"):
            problems.append(f"{write}: {r[write]}")
    if not str(r["a_inserts_upload_for_b"]).startswith("denied:"):
        problems.append(f"a_inserts_upload_for_b: {r['a_inserts_upload_for_b']}")
    return problems


def main() -> int:
    refuse_non_local()
    a, b = ids("a"), ids("b")
    result = subprocess.run(["psql", "-X", "-h", HOST, "-p", PORT, "-U", USER, "-d", DB, "-At", "-f", "-"],
                            input=script(a, b), capture_output=True, text=True, env={**os.environ}, timeout=120)
    lines = [line for line in result.stdout.splitlines() if line.startswith("RESULT:")]
    if result.returncode != 0 or len(lines) != 1:
        report = {"probe": "RLS_TWO_USERS", "status": "FAIL", "database": "LOCAL_DISPOSABLE_ONLY",
                  "scenarios": [{"scenario": "two_user_isolation", "status": "FAIL",
                                 "detail": (result.stderr.strip().splitlines() or ["psql failed"])[-1][:400]}]}
        print(json.dumps(report, indent=1))
        return 1
    observed = json.loads(lines[0][len("RESULT:"):])
    problems = check(observed)
    report = {"probe": "RLS_TWO_USERS", "status": "FAIL" if problems else "PASS",
              "database": "LOCAL_DISPOSABLE_ONLY", "synthetic_fixture_only": True,
              "scenarios": [{"scenario": "two_user_isolation", "status": "FAIL" if problems else "PASS",
                             "detail": problems or "ok", "observed": observed}]}
    print(json.dumps(report, indent=1, sort_keys=True))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
