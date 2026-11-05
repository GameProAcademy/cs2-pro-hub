#!/usr/bin/env python3
"""Fase 4.0.1 — disposable PostgreSQL proof of scheduled retention and flash-assist provenance.

Applies, VERBATIM and in order, supabase/migrations/20261105120000_notifications_goals.sql and
supabase/migrations/20261106100000_phase401_retention_flash.sql on a throw-away cluster with a
minimal auth.uid() (session setting, as PostgREST does) and runs the scenarios with independent
psql sessions. Prints JSON. `PHASE401_MIGRATION` overrides the 4.0.1 file (mutation tests).
"""

from __future__ import annotations

import json
import os
import pathlib
import random
import shutil
import subprocess
import tempfile
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE_MIGRATION = ROOT / "supabase/migrations/20261105120000_notifications_goals.sql"
MIGRATION = pathlib.Path(os.environ.get("PHASE401_MIGRATION") or ROOT / "supabase/migrations/20261106100000_phase401_retention_flash.sql")
PREFS_MIGRATION = ROOT / "supabase/migrations/20261104150000_coach_preferences.sql"
NAME_MIGRATION = pathlib.Path(os.environ.get("PHASE401_NAME_MIGRATION") or ROOT / "supabase/migrations/20261106110000_coach_preferred_name.sql")

SCHEMA = r"""
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.player_profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id));
CREATE TABLE public.matches (id uuid PRIMARY KEY);
CREATE FUNCTION public.owns_player(_player_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO '' AS $$ SELECT EXISTS (SELECT 1 FROM public.player_profiles WHERE id = _player_id AND user_id = auth.uid()); $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles, public.player_profiles, public.matches TO service_role;
"""


def pg_bin(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in sorted(pathlib.Path("/usr/lib/postgresql").glob(f"*/bin/{name}"), reverse=True):
        return str(candidate)
    raise SystemExit(f"{name} not found")


def main() -> None:
    base = pathlib.Path(tempfile.mkdtemp(prefix="phase401-", dir="/tmp"))
    data = base / "data"
    port = random.randint(20000, 45000)
    runner = os.environ.get("COACH_RESERVATION_PG_USER", "lovable")
    as_user = ["setpriv", f"--reuid={runner}", f"--regid={runner}", "--clear-groups"] if os.geteuid() == 0 else []
    if os.geteuid() == 0:
        shutil.chown(base, user=runner, group=runner)
    env = {"PATH": os.environ.get("PATH", ""), "HOME": "/tmp", "LANG": "C",
           "PGOPTIONS": "-c statement_timeout=15000 -c lock_timeout=10000"}
    started = False
    checks: dict[str, bool] = {}

    def psql_cmd(sql: str) -> list[str]:
        return as_user + [pg_bin("psql"), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                          "-h", str(base), "-p", str(port), "-d", "postgres", "-c", sql]

    def psql(sql: str, check: bool = True) -> tuple[int, str, str]:
        p = subprocess.run(psql_cmd(sql), text=True, env=env, capture_output=True, timeout=30, check=False)
        if check and p.returncode != 0:
            raise RuntimeError(p.stderr.strip())
        return p.returncode, p.stdout.strip(), p.stderr.strip()

    def q(sql: str) -> str:
        return psql(sql)[1]

    def as_auth(user: str, sql: str) -> tuple[int, str, str]:
        return psql(f"SET ROLE authenticated; SET request.jwt.claim.sub = '{user}'; {sql}", check=False)

    def run(batch: int = 5000, max_batches: int = 20) -> str:
        return q(f"SET ROLE service_role; SELECT status || ',' || batches || ',' || notifications_deleted || ',' || events_deleted "
                 f"FROM public.notification_retention_run({batch}, {max_batches});")

    def seed_notifications(user: str, n: int, read_days_ago: int | None, prefix: str) -> None:
        read = "NULL" if read_days_ago is None else f"now() - interval '{read_days_ago} days'"
        q(f"""INSERT INTO public.notification_events (id, user_id, type, version, category, occurred_at, source, idempotency_key, status)
              SELECT gen_random_uuid(), '{user}', 'analysis_ready', 1, 'analysis_ready', now(), 'demo_jobs', '{prefix}:' || g, 'ACCEPTED'
                FROM generate_series(1, {n}) g;
              INSERT INTO public.notifications (user_id, event_id, category, type, link, read_at, created_at)
              SELECT '{user}', e.id, 'analysis_ready', 'analysis_ready', '/analysis', {read}, now() - interval '200 days'
                FROM public.notification_events e WHERE e.user_id = '{user}' AND e.idempotency_key LIKE '{prefix}:%';""")

    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(SCHEMA)
        psql(BASE_MIGRATION.read_text())
        # Without pg_cron the schedule block is skipped and the migration still applies.
        rc, _, err = psql(MIGRATION.read_text(), check=False)
        checks["applies_without_pg_cron"] = rc == 0
        if rc != 0:
            raise RuntimeError(err)
        checks["reapply_idempotent"] = psql(MIGRATION.read_text(), check=False)[0] == 0

        ua, ub = str(uuid.uuid4()), str(uuid.uuid4())
        pa, pb = str(uuid.uuid4()), str(uuid.uuid4())
        q(f"INSERT INTO public.profiles VALUES ('{ua}'),('{ub}');")
        q(f"INSERT INTO public.player_profiles VALUES ('{pa}','{ua}'),('{pb}','{ub}');")

        # ------------------------------------------------------------- retention
        seed_notifications(ua, 3, 100, "old-read")      # expired (read > 90 d)
        seed_notifications(ua, 2, 10, "recent-read")    # kept
        seed_notifications(ua, 2, None, "old-unread")   # created 200 d ago, unread > 180 d → expired
        q(f"INSERT INTO public.player_goals (player_id, metric, direction, target) VALUES ('{pa}','adr','AT_LEAST',80);")
        q(f"""INSERT INTO public.player_achievements (player_id, kind, dedupe_key, metric, direction, target, achieved_value,
               window_matches, sample_matches, period_from, period_to)
              VALUES ('{pa}','GOAL_REACHED','k1','adr','AT_LEAST',80,90,5,5,now() - interval '400 days', now() - interval '400 days');""")
        res = run().split(",")
        checks["run_ok_counts"] = res[0] == "OK" and res[2] == "5"
        checks["recent_kept"] = q(f"SELECT count(*) FROM public.notifications WHERE user_id = '{ua}';") == "2"
        checks["goals_and_achievements_untouched"] = q("SELECT (SELECT count(*) FROM public.player_goals) || ',' || (SELECT count(*) FROM public.player_achievements);") == "1,1"
        row = q("SELECT status || ',' || (finished_at IS NOT NULL) || ',' || (duration_ms IS NOT NULL) || ',' || notifications_deleted "
                "FROM public.notification_maintenance_runs ORDER BY id DESC LIMIT 1;")
        checks["run_recorded"] = row == "OK,true,true,5"
        checks["second_run_noop"] = run().split(",")[2] == "0"

        # Bounded: batch 10 × max 2 batches never deletes more than 20 in one run.
        seed_notifications(ub, 25, 120, "bulk-expired")
        res = run(10, 2).split(",")
        checks["bounded_batches"] = res[0] == "OK" and res[1] == "2" and res[2] == "20" and q(
            f"SELECT count(*) FROM public.notifications WHERE user_id = '{ub}';") == "5"
        checks["next_run_finishes"] = run(10, 2).split(",")[2] == "5"

        # Concurrency: a second run while the first holds the lock is SKIPPED and deletes nothing.
        seed_notifications(ub, 4, 120, "concurrent-run")
        holder = subprocess.Popen(psql_cmd("BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('notification_retention_run', 0)); "
                                           "SELECT pg_sleep(3); COMMIT;"), env=env, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True)
        time.sleep(1.0)
        skipped = run().split(",")
        holder.wait(timeout=30)
        checks["concurrent_run_skipped"] = skipped[0] == "SKIPPED" and q(
            f"SELECT count(*) FROM public.notifications WHERE user_id = '{ub}' AND read_at < now() - interval '90 days';") == "4" and q(
            "SELECT count(*) FROM public.notification_maintenance_runs WHERE status = 'SKIPPED';") == "1"

        # Failure: recorded as FAILED with SQLSTATE, work rolled back, next run recovers.
        q("""CREATE FUNCTION public.harness_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$;
             CREATE TRIGGER harness_fail BEFORE DELETE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.harness_fail();""")
        failed = run().split(",")
        failed_row = q("SELECT status || ',' || coalesce(error_code, '') || ',' || (finished_at IS NOT NULL) "
                       "FROM public.notification_maintenance_runs ORDER BY id DESC LIMIT 1;")
        still = q(f"SELECT count(*) FROM public.notifications WHERE user_id = '{ub}';")
        q("DROP TRIGGER harness_fail ON public.notifications;")
        recovered = run().split(",")
        checks["failure_recorded_and_rolled_back"] = failed[0] == "FAILED" and failed_row == "FAILED,P0001,true" and still == "4"
        checks["failure_recovers_next_run"] = recovered[0] == "OK" and recovered[2] == "4"
        checks["no_content_in_runs"] = q("SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns "
                                         "WHERE table_name = 'notification_maintenance_runs';") == (
            "id,job,status,started_at,finished_at,duration_ms,batches,notifications_deleted,events_deleted,error_code")

        # Players cannot run retention nor read the run log.
        rc1, _, e1 = as_auth(ua, "SELECT * FROM public.notification_retention_run(1, 1);")
        rc2, _, e2 = as_auth(ua, "SELECT count(*) FROM public.notification_maintenance_runs;")
        checks["retention_service_role_only"] = (rc1 != 0 and "permission denied for function" in e1
                                                 and rc2 != 0 and "permission denied" in e2)

        # ------------------------------------------------------------- flash provenance
        m1, m2 = str(uuid.uuid4()), str(uuid.uuid4())
        q(f"INSERT INTO public.matches VALUES ('{m1}'),('{m2}');")

        def prov(match: str, player: str, method: str, c: str, f: str, t: str, u: str = "0") -> tuple[int, str, str]:
            return psql(f"SET ROLE service_role; INSERT INTO public.match_flash_assist_provenance "
                        f"(match_id, player_id, method, method_version, credited, credited_by_flag, credited_by_timing, unattributed_candidates) "
                        f"VALUES ('{match}','{player}','{method}','flash-assist-provenance-v1',{c},{f},{t},{u});", check=False)

        checks["provenance_valid_rows"] = all(r[0] == 0 for r in (
            prov(m1, pa, "GAME_FLAG", "3", "3", "0"), prov(m2, pa, "MIXED", "4", "1", "3", "2"),
            prov(m1, pb, "NOT_MEASURED", "NULL", "NULL", "NULL", "NULL")))
        checks["provenance_sum_enforced"] = prov(m2, pb, "MIXED", "5", "1", "3")[0] != 0
        checks["not_measured_cannot_carry_zero"] = prov(m2, pb, "NOT_MEASURED", "0", "0", "0")[0] != 0
        checks["measured_needs_counts"] = prov(m2, pb, "TIMED_ATTRIBUTION", "NULL", "NULL", "NULL")[0] != 0
        checks["unknown_method_rejected"] = prov(m2, pb, "GUESS", "1", "0", "1")[0] != 0
        checks["one_row_per_match_player"] = prov(m1, pa, "GAME_FLAG", "3", "3", "0")[0] != 0
        rc, out, _ = as_auth(ua, "SELECT count(*) FROM public.match_flash_assist_provenance;")
        rc2, out2, _ = as_auth(ub, f"SELECT count(*) FROM public.match_flash_assist_provenance WHERE player_id = '{pa}';")
        checks["provenance_own_only"] = rc == 0 and out == "2" and rc2 == 0 and out2 == "0"
        rc, _, err = as_auth(ua, f"INSERT INTO public.match_flash_assist_provenance (match_id, player_id, method, method_version, credited, credited_by_flag, credited_by_timing) "
                                 f"VALUES ('{m2}','{pa}','GAME_FLAG','x-x-x',9,9,0);")
        rc2, _, _ = as_auth(ua, f"UPDATE public.match_flash_assist_provenance SET credited = 9, credited_by_flag = 9 WHERE player_id = '{pa}';")
        checks["players_cannot_write_provenance"] = rc != 0 and "permission denied" in err and rc2 != 0
        rc, _, _ = psql("SET ROLE anon; SELECT count(*) FROM public.match_flash_assist_provenance;", check=False)
        checks["anon_denied_provenance"] = rc != 0
        q(f"DELETE FROM public.matches WHERE id = '{m1}';")
        checks["provenance_cascades_with_match"] = q(f"SELECT count(*) FROM public.match_flash_assist_provenance WHERE match_id = '{m1}';") == "0"

        # ------------------------------------------------------------- Coach preferred name
        psql(PREFS_MIGRATION.read_text())
        q(f"INSERT INTO public.coach_preferences (player_id) VALUES ('{pa}'),('{pb}');")
        checks["name_migration_applies_on_existing_rows"] = psql(NAME_MIGRATION.read_text(), check=False)[0] == 0
        checks["name_migration_reapplies"] = psql(NAME_MIGRATION.read_text(), check=False)[0] == 0
        checks["existing_rows_untouched"] = q("SELECT count(*) FROM public.coach_preferences WHERE preferred_name IS NULL;") == "2"

        def set_name(user: str, player: str, value: str) -> int:
            lit = "NULL" if value is None else "'" + value.replace("'", "''") + "'"
            return as_auth(user, f"UPDATE public.coach_preferences SET preferred_name = {lit} WHERE player_id = '{player}';")[0]

        checks["accepts_plain_names"] = all(set_name(ua, pa, n) == 0 for n in ("Thiago", "João Pedro", "s1mple", "Zoë"))
        bad = ["thiago@msn.com", "<b>x</b>", "**Thiago**", " Thiago", "x" * 33, "76561198000000001",
               "https://evil.example", "a\nb", "", "na_me"]
        checks["rejects_email_markup_ids_links"] = all(set_name(ua, pa, n) != 0 for n in bad)
        checks["clear_name"] = set_name(ua, pa, None) == 0
        set_name(ua, pa, "Thiago")
        set_name(ua, pb, "Hacker")
        checks["name_own_only"] = q(f"SELECT coalesce(preferred_name, 'null') FROM public.coach_preferences WHERE player_id = '{pb}';") == "null"
        rc, out, _ = as_auth(ub, f"SELECT count(*) FROM public.coach_preferences WHERE player_id = '{pa}';")
        checks["name_not_readable_by_others"] = rc == 0 and out == "0"

        result = {"database": "disposable-local-postgresql", "independentConnections": True, "checks": checks,
                  "failures": sorted(k for k, v in checks.items() if not v)}
    except Exception as error:  # noqa: BLE001
        result = {"database": "disposable-local-postgresql", "error": str(error)[:600], "checks": checks,
                  "failures": ["HARNESS_ERROR"]}
    finally:
        if started:
            subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-m", "immediate", "-w", "stop"],
                           env=env, capture_output=True, check=False)
        shutil.rmtree(base, ignore_errors=True)
        result["teardown"] = not base.exists()
    print(json.dumps(result))


if __name__ == "__main__":
    main()
