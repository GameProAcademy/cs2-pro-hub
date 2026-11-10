#!/usr/bin/env python3
"""Fase 4 — disposable PostgreSQL proof of notifications, preferences, goals and achievements.

Applies supabase/migrations/20261105120000_notifications_goals.sql VERBATIM on a throw-away
cluster with a minimal auth.uid() (read from a session setting, as PostgREST does) and runs
the security / dedup / concurrency scenarios with independent psql sessions. Prints JSON.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import pathlib
import random
import shutil
import subprocess
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261105120000_notifications_goals.sql"
# NOTIFICATIONS_LATER_MIGRATIONS=1 also applies every later migration that replaces
# notification_ingest, proving the Fase 4 guarantees still hold after them.
LATER = [ROOT / "supabase/migrations/20261106100000_phase401_retention_flash.sql",
         ROOT / "supabase/migrations/20261106120000_admin_notification_center.sql"]
LATER_STUBS = r"""
ALTER TABLE public.profiles ADD COLUMN email text, ADD COLUMN locale text NOT NULL DEFAULT 'pt-BR', ADD COLUMN country text,
  ADD COLUMN status text NOT NULL DEFAULT 'active', ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_login_at timestamptz;
CREATE TABLE public.user_roles (user_id uuid, role text);
CREATE TABLE public.matches (id uuid PRIMARY KEY);
CREATE TABLE public.demo_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text);
CREATE TABLE public.player_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid, source text, status text);
CREATE TABLE public.admin_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id uuid NOT NULL,
  action text NOT NULL, target_user_id uuid, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO '' AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','admin_master')); $$;
"""

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
CREATE FUNCTION public.owns_player(_player_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO '' AS $$ SELECT EXISTS (SELECT 1 FROM public.player_profiles WHERE id = _player_id AND user_id = auth.uid()); $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles, public.player_profiles TO service_role;
"""


def pg_bin(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in sorted(pathlib.Path("/usr/lib/postgresql").glob(f"*/bin/{name}"), reverse=True):
        return str(candidate)
    raise SystemExit(f"{name} not found")


def event(key: str, category: str = "analysis_ready", **extra: object) -> dict[str, object]:
    base = {"type": "analysis_ready", "version": 1, "category": category, "occurred_at": "2026-11-05T00:00:00Z",
            "source": "demo_jobs", "source_ref": key[:30], "payload": {}, "idempotency_key": key,
            "link": "/analysis", "params": {"map": "de_nuke"}}
    base.update(extra)
    return base


def main() -> None:
    base = pathlib.Path(tempfile.mkdtemp(prefix="notifications-", dir="/tmp"))
    data = base / "data"
    port = random.randint(20000, 45000)
    runner = os.environ.get("COACH_RESERVATION_PG_USER", "lovable")
    as_user = ["setpriv", f"--reuid={runner}", f"--regid={runner}", "--clear-groups"] if os.geteuid() == 0 else []
    if os.geteuid() == 0:
        shutil.chown(base, user=runner, group=runner)
    env = {"PATH": os.environ.get("PATH", ""), "HOME": "/tmp", "LANG": "C",
           "PGOPTIONS": "-c statement_timeout=10000 -c lock_timeout=8000"}
    started = False
    checks: dict[str, bool] = {}

    def psql(sql: str, check: bool = True) -> tuple[int, str, str]:
        cmd = as_user + [pg_bin("psql"), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                         "-h", str(base), "-p", str(port), "-d", "postgres", "-c", sql]
        p = subprocess.run(cmd, text=True, env=env, capture_output=True, timeout=20)
        if check and p.returncode != 0:
            raise RuntimeError(p.stderr.strip())
        return p.returncode, p.stdout.strip(), p.stderr.strip()

    def q(sql: str) -> str:
        return psql(sql)[1]

    def as_auth(user: str, sql: str) -> tuple[int, str, str]:
        return psql(f"SET ROLE authenticated; SET request.jwt.claim.sub = '{user}'; {sql}", check=False)

    def ingest(user: str, events: list[dict[str, object]]) -> str:
        payload = json.dumps(events).replace("'", "''")
        return (f"SET ROLE service_role; SELECT accepted || ',' || suppressed || ',' || rejected || ',' || duplicates "
                f"FROM public.notification_ingest('{user}', '{payload}'::jsonb);")

    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(SCHEMA)
        psql(MIGRATION.read_text())
        if os.environ.get("NOTIFICATIONS_LATER_MIGRATIONS") == "1":
            psql(LATER_STUBS)
            for later in LATER:
                psql(later.read_text())
        ua, ub = str(uuid.uuid4()), str(uuid.uuid4())
        pa, pb = str(uuid.uuid4()), str(uuid.uuid4())
        q(f"INSERT INTO public.profiles VALUES ('{ua}'),('{ub}');")
        q(f"INSERT INTO public.player_profiles VALUES ('{pa}','{ua}'),('{pb}','{ub}');")

        # 1. A valid event creates one notification.
        checks["valid_event_creates_notification"] = q(ingest(ua, [event("job:1:processed")])) == "1,0,0,0"
        # 2. A duplicate does not.
        checks["duplicate_event_ignored"] = q(ingest(ua, [event("job:1:processed")])) == "0,0,0,1"
        # 3. Incompatible version is rejected (recorded, no notification).
        checks["bad_version_rejected"] = q(ingest(ua, [event("job:2:processed", version=2)])) == "0,0,1,0"
        checks["malformed_link_rejected"] = q(ingest(ua, [event("job:3:processed", link="https://evil.example")])) == "0,0,1,0"
        # 18. Concurrent ingestion of the same events (two sessions): one notification each.
        q(f"INSERT INTO public.notification_preferences (user_id, max_per_day) VALUES ('{ub}', 30);")
        ok = True
        for i in range(10):
            evs = [event(f"conc:{i}:a"), event(f"conc:{i}:b")]
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                r = [f.result() for f in [pool.submit(psql, ingest(ub, evs), False) for _ in range(2)]]
            ok &= all(x[0] == 0 for x in r)
            ok &= q(f"SELECT count(*) FROM public.notifications n JOIN public.notification_events e ON e.id = n.event_id "
                    f"WHERE e.user_id = '{ub}' AND e.idempotency_key LIKE 'conc:{i}:%';") == "2"
        checks["concurrent_duplicates_single_notification"] = ok

        # 5/6. User A cannot read, update or delete B's notifications.
        b_id = q(f"SELECT id FROM public.notifications WHERE user_id = '{ub}' LIMIT 1;")
        rc, out, _ = as_auth(ua, f"SELECT count(*) FROM public.notifications WHERE user_id = '{ub}';")
        checks["a_cannot_read_b"] = rc == 0 and out == "0"
        as_auth(ua, f"UPDATE public.notifications SET read_at = now() WHERE id = '{b_id}';")
        as_auth(ua, f"DELETE FROM public.notifications WHERE id = '{b_id}';")
        checks["a_cannot_mark_or_delete_b"] = q(f"SELECT read_at IS NULL FROM public.notifications WHERE id = '{b_id}';") == "t"
        # Read state only: a player cannot rewrite category / link of their own notification.
        rc, _, err = as_auth(ub, f"UPDATE public.notifications SET link = '/admin' WHERE id = '{b_id}';")
        checks["only_read_state_is_writable"] = rc != 0 and "permission denied" in err
        # 9. Mark read is idempotent; unread works.
        as_auth(ub, f"UPDATE public.notifications SET read_at = coalesce(read_at, now()) WHERE id = '{b_id}';")
        first = q(f"SELECT read_at FROM public.notifications WHERE id = '{b_id}';")
        as_auth(ub, f"UPDATE public.notifications SET read_at = coalesce(read_at, now()) WHERE id = '{b_id}';")
        checks["mark_read_idempotent"] = q(f"SELECT read_at FROM public.notifications WHERE id = '{b_id}';") == first
        # Users cannot create events or notifications, nor call ingestion.
        rc1, _, e1 = as_auth(ua, ingest(ua, [event("spoof:1")]).replace("SET ROLE service_role; ", ""))
        rc2, _, e2 = as_auth(ua, f"INSERT INTO public.notifications (user_id, event_id, category, type, link) "
                                 f"VALUES ('{ua}', gen_random_uuid(), 'coach', 'x', '/coach');")
        rc3, _, e3 = as_auth(ua, "SELECT count(*) FROM public.notification_events;")
        checks["players_cannot_ingest_or_insert"] = all(r != 0 for r in (rc1, rc2, rc3)) and all(
            "permission denied" in e for e in (e1, e2, e3))
        rc, _, err = psql("SET ROLE anon; SELECT count(*) FROM public.notifications;", check=False)
        checks["anon_denied"] = rc != 0 and "permission denied" in err

        # 4. A spoofed achievement for another user's player is not recorded.
        spoof = event("goal:spoof", category="training", type="goal_reached", link="/goals",
                      achievement={"player_id": pb, "goal_id": None, "dedupe_key": "x", "metric": "adr",
                                   "direction": "AT_LEAST", "target": 80, "achieved_value": 90,
                                   "window_matches": 5, "sample_matches": 5,
                                   "period_from": "2026-11-01T00:00:00Z", "period_to": "2026-11-05T00:00:00Z"})
        q(ingest(ua, [spoof]))
        checks["spoofed_achievement_ignored"] = q(f"SELECT count(*) FROM public.player_achievements WHERE player_id = '{pb}';") == "0"
        own = dict(spoof, idempotency_key="goal:own")
        own["achievement"] = dict(spoof["achievement"], player_id=pa, dedupe_key="adr:AT_LEAST:80:5")  # type: ignore[arg-type]
        q(ingest(ua, [own]))
        q(ingest(ua, [dict(own, idempotency_key="goal:own:again")]))
        checks["achievement_recorded_once"] = q(f"SELECT count(*) FROM public.player_achievements WHERE player_id = '{pa}';") == "1"

        # 10. Preference off suppresses the category; security cannot be switched off.
        as_auth(ua, f"INSERT INTO public.notification_preferences (user_id, evolution) VALUES ('{ua}', false);")
        checks["preference_off_suppresses"] = q(ingest(ua, [event("evolution:1", category="evolution", type="evolution")])) == "0,1,0,0"
        checks["security_not_switchable"] = q(ingest(ua, [event("security:1", category="account_security", type="steam_linked", link="/profile")])) == "1,0,0,0"
        # Pause.
        as_auth(ua, f"UPDATE public.notification_preferences SET paused_until = now() + interval '1 day' WHERE user_id = '{ua}';")
        checks["pause_suppresses"] = q(ingest(ua, [event("paused:01")])) == "0,1,0,0"
        as_auth(ua, f"UPDATE public.notification_preferences SET paused_until = NULL, max_per_day = 3 WHERE user_id = '{ua}';")
        # 13. Volume cap: a burst never exceeds the daily limit (fresh user, limit 3).
        uc = str(uuid.uuid4())
        q(f"INSERT INTO public.profiles VALUES ('{uc}');")
        q(f"INSERT INTO public.notification_preferences (user_id, max_per_day) VALUES ('{uc}', 3);")
        res = q(ingest(uc, [event(f"burst:{i:04d}") for i in range(20)]))
        checks["daily_limit_caps_burst"] = res == "3,17,0,0" and q(
            f"SELECT count(*) FROM public.notifications WHERE user_id = '{uc}';") == "3" and q(
            f"SELECT count(*) FROM public.notification_events WHERE user_id = '{uc}' AND reason = 'DAILY_LIMIT';") == "17"
        # 11. External channel needs consent (no email without consent).
        rc, _, err = as_auth(ua, f"UPDATE public.notification_preferences SET email_enabled = true WHERE user_id = '{ua}';")
        checks["email_requires_consent"] = rc != 0 and "notification_email_needs_consent" in err
        rc, _, err = as_auth(ua, f"UPDATE public.notification_preferences SET marketing_consent = true WHERE user_id = '{ua}';")
        checks["marketing_requires_consent"] = rc != 0
        # A cannot write B's preferences.
        rc, _, _ = as_auth(ua, f"INSERT INTO public.notification_preferences (user_id) VALUES ('{ub}');")
        checks["preferences_own_only"] = rc != 0
        # Fan-out guard.
        rc, _, _ = psql(ingest(ua, [event(f"bigfanout:{i}") for i in range(51)]), check=False)
        checks["fan_out_bounded"] = rc != 0
        checks["keyless_event_never_stored"] = q(ingest(ua, [event("short")])) == "0,0,1,0"

        # Goals: own only; cannot create a goal for B's player.
        rc, _, _ = as_auth(ua, f"INSERT INTO public.player_goals (player_id, metric, direction, target) VALUES ('{pb}','adr','AT_LEAST',80);")
        rc2, _, _ = as_auth(ua, f"INSERT INTO public.player_goals (player_id, metric, direction, target) VALUES ('{pa}','adr','AT_LEAST',80);")
        checks["goals_own_only"] = rc != 0 and rc2 == 0
        rc, _, _ = as_auth(ua, f"INSERT INTO public.player_goals (player_id, metric, direction, target, reminder) VALUES ('{pa}','adr','AT_LEAST',80,'WEEKLY');")
        checks["weekly_reminder_needs_day"] = rc != 0
        rc, out, _ = as_auth(ub, "SELECT count(*) FROM public.player_achievements;")
        checks["achievements_own_only"] = rc == 0 and out == "0"
        rc, _, _ = as_auth(ua, f"INSERT INTO public.player_achievements (player_id, kind, dedupe_key, metric, direction, target, achieved_value, window_matches, sample_matches, period_from, period_to) VALUES ('{pa}','GOAL_REACHED','fake','adr','AT_LEAST',1,2,3,3,now(),now());")
        checks["players_cannot_forge_achievements"] = rc != 0

        # Retention: purge removes only expired rows, bounded.
        q(f"UPDATE public.notifications SET read_at = now() - interval '91 days' WHERE id = '{b_id}';")
        before = q("SELECT count(*) FROM public.notifications;")
        purged = q("SET ROLE service_role; SELECT notifications_deleted FROM public.notification_purge_expired(100);")
        after = q("SELECT count(*) FROM public.notifications;")
        checks["purge_only_expired"] = purged == "1" and int(after) == int(before) - 1
        # Deleting a notification keeps its event: the same event is never re-notified.
        nid = q(f"SELECT n.id FROM public.notifications n JOIN public.notification_events e ON e.id = n.event_id WHERE e.idempotency_key = 'job:1:processed';")
        as_auth(ua, f"DELETE FROM public.notifications WHERE id = '{nid}';")
        checks["deleted_notification_not_recreated"] = q(ingest(ua, [event("job:1:processed")])) == "0,0,0,1"
        # Analytics view distinguishes created / suppressed / rejected / read, no content.
        cols = q("SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name = 'notification_analytics_daily';")
        checks["analytics_without_content"] = cols == "day,category,status,reason,events,delivered_in_app,read,median_seconds_event_to_delivery"
        rc, _, _ = as_auth(ua, "SELECT count(*) FROM public.notification_analytics_daily;")
        checks["analytics_not_for_players"] = rc != 0
        result = {"database": "disposable-local-postgresql", "independentConnections": True, "checks": checks,
                  "failures": sorted(k for k, v in checks.items() if not v)}
    except Exception as error:  # noqa: BLE001
        result = {"database": "disposable-local-postgresql", "error": str(error)[:600], "checks": checks,
                  "failures": ["HARNESS_ERROR"]}
    finally:
        if started:
            subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-m", "immediate", "-w", "stop"],
                           env=env, capture_output=True)
        shutil.rmtree(base, ignore_errors=True)
        result["teardown"] = not base.exists()
    print(json.dumps(result))


if __name__ == "__main__":
    main()
