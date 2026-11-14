#!/usr/bin/env python3
"""PM2 4.2.3 — disposable PostgreSQL proof of the death_feedback table and its RLS.

Builds a production-shaped stub (roles, auth.uid(), player_profiles, matches,
match_participants, round_events) with two users A and B, each owning one participant of a
shared canonical match plus one private match. Applies
supabase/migrations/20261114130000_pm2_death_feedback.sql VERBATIM twice and checks the access
matrix: own death only, no cross-user read/write/delete (IDOR), anon nothing, immutable keys,
shape constraints, service role full access. Prints JSON. `DEATH_FEEDBACK_MIGRATION` overrides
the migration (mutation tests); `SECURITY_HARNESS_PG_USER` sets the OS user when run as root.
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
MIGRATION = pathlib.Path(os.environ.get("DEATH_FEEDBACK_MIGRATION") or
                         ROOT / "supabase/migrations/20261114130000_pm2_death_feedback.sql")
TRAJECTORY_MIGRATION = pathlib.Path(os.environ.get("TRAJECTORY_MIGRATION") or
                                    ROOT / "supabase/migrations/20261114140000_pm2_round_trajectories.sql")

SCHEMA = r"""
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase default privileges (new tables and functions are granted to anon and authenticated).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
CREATE TABLE public.player_profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.matches (id uuid PRIMARY KEY, player_id uuid);
CREATE TABLE public.match_participants (match_id uuid REFERENCES public.matches(id), participant_key text,
  internal_player_id uuid REFERENCES public.player_profiles(id));
CREATE TABLE public.round_events (id uuid PRIMARY KEY, match_id uuid REFERENCES public.matches(id),
  event_type text, actor_steam_id text, victim_steam_id text);
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.player_profiles, public.matches, public.match_participants, public.round_events TO authenticated;
GRANT ALL ON public.player_profiles, public.matches, public.match_participants, public.round_events TO service_role;
-- owns_canonical_match exactly as in production (20260906024007).
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
    base = pathlib.Path(tempfile.mkdtemp(prefix="pm2-fb-", dir="/tmp"))
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

    def fails(role: str, user: str | None, sql: str, needle: str = "") -> bool:
        rc, _, err = as_role(role, user, sql)
        return rc != 0 and needle in err

    i = {k: str(uuid.uuid4()) for k in (
        "ua", "ub", "pa", "pb", "shared", "priv_a", "priv_b",
        "a_death", "b_death", "a_kill", "a_priv_death", "b_priv_death")}

    def ins(user: str, event: str, match: str, rule: str = "'TRADE_NOT_OBSERVED'",
            verdict: str = "USEFUL", extra: str = "") -> str:
        return (f"INSERT INTO public.death_feedback (match_id, round_event_id, rule_id, rules_version, verdict{', note' if extra else ''}) "
                f"VALUES ('{match}', '{event}', {rule}, 'cs2.death-rules.v1', '{verdict}'{', ' + extra if extra else ''});")

    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(SCHEMA)
        psql(f"""
INSERT INTO public.player_profiles VALUES ('{i['pa']}','{i['ua']}'),('{i['pb']}','{i['ub']}');
INSERT INTO public.matches VALUES ('{i['shared']}','{i['pa']}'),('{i['priv_a']}','{i['pa']}'),('{i['priv_b']}','{i['pb']}');
INSERT INTO public.match_participants VALUES ('{i['shared']}','100','{i['pa']}'),('{i['shared']}','200','{i['pb']}'),
  ('{i['priv_a']}','100','{i['pa']}'),('{i['priv_b']}','200','{i['pb']}');
INSERT INTO public.round_events VALUES
  ('{i['a_death']}','{i['shared']}','kill','200','100'),
  ('{i['b_death']}','{i['shared']}','kill','100','200'),
  ('{i['a_kill']}','{i['shared']}','kill','100','300'),
  ('{i['a_priv_death']}','{i['priv_a']}','kill','900','100'),
  ('{i['b_priv_death']}','{i['priv_b']}','kill','900','200');
""")
        rc, _, err = psql(MIGRATION.read_text(), check=False)
        checks["migration_applies"] = rc == 0
        if rc != 0:
            raise RuntimeError(err)
        checks["migration_reapplies"] = psql(MIGRATION.read_text(), check=False)[0] == 0
        rls = "row-level security"
        a, b = i["ua"], i["ub"]
        checks["a_inserts_feedback_on_own_death"] = as_role("authenticated", a, ins(a, i["a_death"], i["shared"]), commit=True)[0] == 0
        checks["b_inserts_feedback_on_own_death"] = as_role("authenticated", b, ins(b, i["b_death"], i["shared"]), commit=True)[0] == 0
        checks["a_whole_review_feedback"] = as_role("authenticated", a, ins(a, i["a_priv_death"], i["priv_a"], rule="NULL", verdict="NOT_USEFUL", extra="'nota'"), commit=True)[0] == 0
        checks["a_reads_only_own_rows"] = count("authenticated", a, "SELECT 1 FROM public.death_feedback") == 2
        checks["b_reads_only_own_rows"] = count("authenticated", b, "SELECT 1 FROM public.death_feedback") == 1
        checks["anon_reads_nothing"] = fails("anon", None, "SELECT 1 FROM public.death_feedback;", "permission denied")
        checks["a_cannot_feedback_b_death_shared_match"] = fails("authenticated", a, ins(a, i["b_death"], i["shared"]), rls)
        checks["a_cannot_feedback_b_private_death"] = fails("authenticated", a, ins(a, i["b_priv_death"], i["priv_b"]), rls)
        checks["a_cannot_feedback_own_kill"] = fails("authenticated", a, ins(a, i["a_kill"], i["shared"]), rls)
        checks["a_cannot_mismatch_event_and_match"] = fails("authenticated", a, ins(a, i["a_death"], i["priv_a"]), rls)
        checks["a_cannot_write_as_b"] = fails("authenticated", a,
            f"INSERT INTO public.death_feedback (user_id, match_id, round_event_id, rules_version, verdict) "
            f"VALUES ('{b}', '{i['shared']}', '{i['b_death']}', 'cs2.death-rules.v1', 'USEFUL');", rls)
        upd_b = as_role("authenticated", a, "UPDATE public.death_feedback SET verdict='INCORRECT' WHERE verdict='USEFUL' AND round_event_id = "
                        f"'{i['b_death']}' RETURNING 1;")
        checks["a_cannot_update_b_row"] = upd_b[0] == 0 and upd_b[1].strip() == ""
        del_b = as_role("authenticated", a, f"DELETE FROM public.death_feedback WHERE round_event_id = '{i['b_death']}' RETURNING 1;")
        checks["a_cannot_delete_b_row"] = del_b[0] == 0 and del_b[1].strip() == ""
        checks["a_updates_own_verdict"] = as_role("authenticated", a,
            f"UPDATE public.death_feedback SET verdict='INCORRECT' WHERE round_event_id = '{i['a_death']}' RETURNING 1;")[1].strip() == "1"
        checks["key_is_immutable"] = fails("authenticated", a,
            f"UPDATE public.death_feedback SET rule_id='OPENING_DEATH' WHERE round_event_id = '{i['a_death']}';", "DEATH_FEEDBACK_KEY_IMMUTABLE")
        checks["cannot_transfer_row_to_b"] = fails("authenticated", a,
            f"UPDATE public.death_feedback SET user_id='{b}' WHERE round_event_id = '{i['a_death']}';")
        checks["one_opinion_per_rule"] = fails("authenticated", a, ins(a, i["a_death"], i["shared"]), "death_feedback_one_per_rule")
        checks["verdict_constrained"] = fails("authenticated", a, ins(a, i["a_death"], i["shared"], rule="'OPENING_DEATH'", verdict="GREAT"), "death_feedback_verdict")
        checks["rule_id_constrained"] = fails("authenticated", a, ins(a, i["a_death"], i["shared"], rule="'drop table'"), "death_feedback_rule_id_shape")
        checks["note_length_constrained"] = fails("authenticated", a, ins(a, i["a_death"], i["shared"], rule="'OPENING_DEATH'", extra="repeat('x', 501)"), "death_feedback_note_length")
        checks["a_deletes_own_row"] = as_role("authenticated", a,
            f"DELETE FROM public.death_feedback WHERE round_event_id = '{i['a_death']}' RETURNING 1;")[1].strip() == "1"
        checks["service_role_reads_all"] = count("service_role", None, "SELECT 1 FROM public.death_feedback") == 3
        # PM2 4.2.4: trajectories (owner read, service-role write only).
        rc, _, err = psql(TRAJECTORY_MIGRATION.read_text(), check=False)
        checks["trajectory_migration_applies"] = rc == 0
        if rc != 0:
            raise RuntimeError(err)
        checks["trajectory_migration_reapplies"] = psql(TRAJECTORY_MIGRATION.read_text(), check=False)[0] == 0
        psql(f"""
INSERT INTO public.match_trajectories (match_id, schema, status, step_ticks) VALUES
  ('{i['shared']}','cs2.round-trajectory.v1','COMPLETE',16),('{i['priv_b']}','cs2.round-trajectory.v1','PARTIAL',16);
INSERT INTO public.round_trajectories (match_id, round_number, first_tick, end_tick, step_ticks, sample_count, players) VALUES
  ('{i['shared']}',1,0,32,16,3,'[]'),('{i['priv_b']}',1,0,32,16,3,'[]');
""")
        checks["traj_a_reads_shared_match"] = count("authenticated", a, "SELECT 1 FROM public.round_trajectories") == 1
        checks["traj_b_reads_shared_and_own"] = count("authenticated", b, "SELECT 1 FROM public.round_trajectories") == 2
        checks["traj_a_cannot_read_b_private"] = count("authenticated", a,
            f"SELECT 1 FROM public.match_trajectories WHERE match_id = '{i['priv_b']}'") == 0
        checks["traj_anon_reads_nothing"] = fails("anon", None, "SELECT 1 FROM public.round_trajectories;", "permission denied")
        checks["traj_player_cannot_write"] = fails("authenticated", a,
            f"INSERT INTO public.match_trajectories (match_id, schema, status) VALUES ('{i['priv_a']}','cs2.round-trajectory.v1','COMPLETE');",
            "permission denied")
        checks["traj_player_cannot_delete"] = fails("authenticated", b,
            f"DELETE FROM public.round_trajectories WHERE match_id = '{i['priv_b']}';", "permission denied")
        checks["traj_status_constrained"] = fails("service_role", None,
            f"INSERT INTO public.match_trajectories (match_id, schema, status) VALUES ('{i['priv_a']}','cs2.round-trajectory.v1','MAYBE');",
            "match_trajectories_status")
        checks["traj_samples_bounded"] = fails("service_role", None,
            f"INSERT INTO public.round_trajectories (match_id, round_number, first_tick, end_tick, step_ticks, sample_count, players) "
            f"VALUES ('{i['shared']}',2,0,32,16,5000,'[]');", "round_trajectories_samples")
        checks["anon_cannot_execute_helper"] = fails("anon", None, f"SELECT public.owns_death_event('{i['a_death']}', '{i['shared']}');", "permission denied")
    finally:
        if started:
            subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-m", "immediate", "-w", "stop"],
                           env=env, capture_output=True, check=False)
        shutil.rmtree(base, ignore_errors=True)
    failures = sorted(k for k, v in checks.items() if not v)
    print(json.dumps({"database": "disposable-local-postgresql", "checks": checks, "failures": failures}, sort_keys=True))


if __name__ == "__main__":
    main()
