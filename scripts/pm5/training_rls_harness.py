#!/usr/bin/env python3
"""PM5 4.2.9 — disposable PostgreSQL proof of the adaptive training tables and their RLS.

Production-shaped stub (roles, auth.uid(), auth.users, Supabase default table grants). Applies
supabase/migrations/20261118140000_pm5_adaptive_training.sql VERBATIM twice and checks: the
service role writes; a player reads only their own plans, versions and sessions; an
authenticated player can NOT insert, update or delete any row (writes only through the server,
so plan content and session state cannot be forged from the browser); anon nothing; at most one
open plan per user; DONE needs a completion time; horizon limited to 7/30/90; versions unique
per plan. Prints JSON. `TRAINING_MIGRATION` overrides the migration (mutation tests);
`SECURITY_HARNESS_PG_USER` sets the OS user when run as root.
"""


from __future__ import annotations

import json
import os
import pathlib
import random
import shutil
import subprocess
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = pathlib.Path(os.environ.get("TRAINING_MIGRATION") or
                         ROOT / "supabase/migrations/20261118140000_pm5_adaptive_training.sql")

SCHEMA = r"""
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
CREATE TABLE public.player_profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.matches (id uuid PRIMARY KEY, player_id uuid);
CREATE TABLE public.match_participants (match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  participant_key text, internal_player_id uuid REFERENCES public.player_profiles(id));
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.player_profiles, public.matches, public.match_participants TO authenticated;
GRANT ALL ON public.player_profiles, public.matches, public.match_participants TO service_role;
CREATE FUNCTION public.owns_canonical_match(_match_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matches m
      JOIN public.player_profiles p ON p.id = m.player_id
     WHERE m.id = _match_id AND p.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.match_participants mp
      JOIN public.player_profiles p ON p.id = mp.internal_player_id
     WHERE mp.match_id = _match_id AND p.user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.owns_canonical_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_canonical_match(uuid) TO authenticated, service_role;
"""


def pg_bin(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in sorted(pathlib.Path("/usr/lib/postgresql").glob(f"*/bin/{name}"), reverse=True):
        return str(candidate)
    raise SystemExit(f"{name} not found")


def main() -> None:  # noqa: PLR0915
    base = pathlib.Path(tempfile.mkdtemp(prefix="pm5-trn-", dir="/tmp"))
    data = base / "data"
    port = random.randint(20000, 45000)
    runner = os.environ.get("SECURITY_HARNESS_PG_USER", "lovable")
    as_user = ["setpriv", f"--reuid={runner}", f"--regid={runner}", "--clear-groups"] if os.geteuid() == 0 else []
    if os.geteuid() == 0:
        shutil.chown(base, user=runner, group=runner)
    env = {"PATH": os.environ.get("PATH", ""), "HOME": "/tmp", "LANG": "C"}
    checks: dict[str, bool] = {}
    started = False

    def psql(sql: str, check: bool = True) -> tuple[int, str, str]:
        cmd = as_user + [pg_bin("psql"), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                         "-h", str(base), "-p", str(port), "-d", "postgres", "-c", sql]
        p = subprocess.run(cmd, text=True, env=env, capture_output=True, timeout=40, check=False)
        if check and p.returncode != 0:
            raise RuntimeError(p.stderr.strip())
        return p.returncode, p.stdout.strip(), p.stderr.strip()

    def as_role(role: str, user: str | None, sql: str, commit: bool = False) -> tuple[int, str, str]:
        claim = f"SET LOCAL request.jwt.claim.sub = '{user or ''}';"
        return psql(f"BEGIN; SET LOCAL ROLE {role}; {claim} {sql} {'COMMIT' if commit else 'ROLLBACK'};", check=False)

    def count(role: str, user: str | None, sql: str) -> int:
        rc, out, err = as_role(role, user, f"SELECT count(*) FROM ({sql}) q;")
        if rc != 0:
            raise RuntimeError(err)
        return int(out.splitlines()[-1])

    def ok(role: str, user: str | None, sql: str, commit: bool = False) -> bool:
        rc, _, _ = as_role(role, user, sql, commit)
        return rc == 0

    def fails(role: str, user: str | None, sql: str) -> bool:
        rc, _, _ = as_role(role, user, sql)
        return rc != 0

    def affected(role: str, user: str | None, sql: str) -> int:
        rc, out, err = as_role(role, user, f"WITH x AS ({sql} RETURNING 1) SELECT count(*) FROM x;")
        if rc != 0:
            return -1
        return int(out.splitlines()[-1])

    i = {k: str(uuid.uuid4()) for k in ("ua", "ub", "plan_a", "plan_b", "s_a", "s_b")}
    T = "public.adaptive_training_plans"
    V = "public.adaptive_training_plan_versions"
    S = "public.adaptive_training_sessions"

    def session(sid: str, plan: str, user: str, idx: int, status: str = "PLANNED", done: str = "NULL") -> str:
        return (f"INSERT INTO {S} (id, plan_id, user_id, version, session_index, scheduled_on, area, exercise_id, minutes, status, completed_at) "
                f"VALUES ('{sid}', '{plan}', '{user}', 1, {idx}, current_date, 'aim', 'spray_wall', 20, '{status}', {done});")

    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(SCHEMA)
        psql(f"INSERT INTO auth.users VALUES ('{i['ua']}'),('{i['ub']}');")
        sql = MIGRATION.read_text(encoding="utf-8")
        rc, _, err = psql(sql, check=False)
        checks["migration_applies"] = rc == 0
        if rc != 0:
            raise RuntimeError(err)
        rc, _, _ = psql(sql, check=False)
        checks["migration_reapplies"] = rc == 0

        # The server (service role) writes plans, versions and sessions.
        checks["service_writes_plans"] = ok("service_role", None,
            f"INSERT INTO {T} (id, user_id, horizon) VALUES ('{i['plan_a']}', '{i['ua']}', 30), ('{i['plan_b']}', '{i['ub']}', 7);"
            f"INSERT INTO {V} (plan_id, user_id, version, reason, content, method_version) VALUES "
            f"('{i['plan_a']}', '{i['ua']}', 1, 'CREATED', '{{}}', 'cs2.training-plan.v1'),"
            f"('{i['plan_b']}', '{i['ub']}', 1, 'CREATED', '{{}}', 'cs2.training-plan.v1');"
            + session(i["s_a"], i["plan_a"], i["ua"], 0) + session(i["s_b"], i["plan_b"], i["ub"], 0), True)
        for tbl, name in ((T, "plans"), (V, "versions"), (S, "sessions")):
            checks[f"a_reads_only_own_{name}"] = (
                count("authenticated", i["ua"], f"SELECT 1 FROM {tbl} WHERE user_id = '{i['ua']}'") == 1
                and count("authenticated", i["ua"], f"SELECT 1 FROM {tbl}") == 1)
            checks[f"b_cannot_read_a_{name}"] = count("authenticated", i["ub"], f"SELECT 1 FROM {tbl} WHERE user_id = '{i['ua']}'") == 0
            checks[f"anon_reads_no_{name}"] = fails("anon", None, f"SELECT 1 FROM {tbl};")
        # No browser writes at all, even on own rows.
        checks["a_cannot_insert_plan"] = fails("authenticated", i["ua"],
            f"INSERT INTO {T} (user_id, horizon, status) VALUES ('{i['ua']}', 7, 'COMPLETED');")
        checks["a_cannot_insert_version"] = fails("authenticated", i["ua"],
            f"INSERT INTO {V} (plan_id, user_id, version, reason, content, method_version) "
            f"VALUES ('{i['plan_a']}', '{i['ua']}', 2, 'USER_EDIT', '{{}}', 'x');")
        checks["a_cannot_mark_own_session_done_directly"] = fails("authenticated", i["ua"],
            f"UPDATE {S} SET status = 'DONE', completed_at = now() WHERE id = '{i['s_a']}';")
        checks["a_cannot_edit_own_version"] = fails("authenticated", i["ua"],
            f"UPDATE {V} SET content = '{{\"x\":1}}' WHERE plan_id = '{i['plan_a']}';")
        checks["a_cannot_delete_own_plan"] = fails("authenticated", i["ua"], f"DELETE FROM {T} WHERE id = '{i['plan_a']}';")
        checks["a_cannot_touch_b_session"] = fails("authenticated", i["ua"],
            f"UPDATE {S} SET status = 'SKIPPED' WHERE id = '{i['s_b']}';")
        # Integrity.
        checks["one_open_plan_per_user"] = fails("service_role", None,
            f"INSERT INTO {T} (user_id, horizon) VALUES ('{i['ua']}', 7);")
        checks["closed_plan_allows_new_one"] = ok("service_role", None,
            f"UPDATE {T} SET status = 'COMPLETED', closed_at = now() WHERE id = '{i['plan_a']}';"
            f"INSERT INTO {T} (user_id, horizon) VALUES ('{i['ua']}', 7);")
        checks["horizon_limited"] = fails("service_role", None, f"INSERT INTO {T} (user_id, horizon) VALUES ('{i['ub']}', 60);")
        checks["done_needs_completion_time"] = fails("service_role", None,
            session(str(uuid.uuid4()), i["plan_a"], i["ua"], 1, "DONE"))
        checks["done_with_time_accepted"] = ok("service_role", None,
            session(str(uuid.uuid4()), i["plan_a"], i["ua"], 1, "DONE", "now()"))
        checks["version_unique_per_plan"] = fails("service_role", None,
            f"INSERT INTO {V} (plan_id, user_id, version, reason, content, method_version) "
            f"VALUES ('{i['plan_a']}', '{i['ua']}', 1, 'REVISION', '{{}}', 'x');")
        checks["session_index_unique_per_version"] = fails("service_role", None,
            session(str(uuid.uuid4()), i["plan_a"], i["ua"], 0))
        checks["unknown_status_rejected"] = fails("service_role", None,
            session(str(uuid.uuid4()), i["plan_a"], i["ua"], 5, "FAKE"))
    except Exception as exc:  # noqa: BLE001
        checks.setdefault("harness_error", False)
        print(json.dumps({"database": "disposable-local-postgresql", "checks": checks,
                          "failures": [k for k, v in checks.items() if not v], "error": str(exc)[-500:]}))
        return
    finally:
        if started:
            subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-m", "immediate", "stop"],
                           env=env, capture_output=True, check=False)
        shutil.rmtree(base, ignore_errors=True)
    print(json.dumps({"database": "disposable-local-postgresql", "checks": checks,
                      "failures": [k for k, v in checks.items() if not v]}))


if __name__ == "__main__":
    main()
