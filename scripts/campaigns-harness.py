#!/usr/bin/env python3
"""Fase 4.1 — disposable PostgreSQL proof of the Admin Notification Center.

Applies VERBATIM, in order, the Fase 4 notifications migration, the 4.0.1 migration and
supabase/migrations/20261106120000_admin_notification_center.sql on a throw-away cluster with a
production-shaped stub (enums, user_roles, is_staff, admin_audit_logs, demo_jobs,
player_connections) and runs permission, segmentation, state-machine, sending (claim / lease /
fencing / retry / recovery / concurrency), consent, frequency, test-send, RLS and audit
scenarios with independent psql sessions. Prints JSON. `CAMPAIGNS_MIGRATION` overrides the 4.1
file (mutation tests).
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
MIGRATIONS = [
    ROOT / "supabase/migrations/20261105120000_notifications_goals.sql",
    ROOT / "supabase/migrations/20261106100000_phase401_retention_flash.sql",
]
MIGRATION = pathlib.Path(os.environ.get("CAMPAIGNS_MIGRATION") or ROOT / "supabase/migrations/20261106120000_admin_notification_center.sql")

SCHEMA = r"""
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TYPE public.app_role AS ENUM ('admin_master', 'admin', 'player');
CREATE TYPE public.user_status AS ENUM ('active', 'inactive');
CREATE TYPE public.upload_status AS ENUM ('queued', 'processing', 'processed', 'failed');
CREATE TYPE public.data_source AS ENUM ('steam', 'faceit', 'manual');
CREATE TYPE public.connection_status AS ENUM ('pending', 'connected', 'disconnected', 'expired', 'error');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, locale text NOT NULL DEFAULT 'pt-BR', country text,
  status public.user_status NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz);
CREATE TABLE public.user_roles (user_id uuid REFERENCES public.profiles(id), role public.app_role, PRIMARY KEY (user_id, role));
CREATE TABLE public.player_profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id));
CREATE TABLE public.matches (id uuid PRIMARY KEY);
CREATE TABLE public.demo_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status public.upload_status);
CREATE TABLE public.player_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid, source public.data_source,
  status public.connection_status);
CREATE TABLE public.admin_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL, target_user_id uuid REFERENCES public.profiles(id), metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public.owns_player(_player_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO '' AS $$ SELECT EXISTS (SELECT 1 FROM public.player_profiles WHERE id = _player_id AND user_id = auth.uid()); $$;
CREATE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO '' AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','admin_master')); $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT SELECT ON public.profiles, public.player_profiles, public.matches TO service_role;
"""


def pg_bin(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in sorted(pathlib.Path("/usr/lib/postgresql").glob(f"*/bin/{name}"), reverse=True):
        return str(candidate)
    raise SystemExit(f"{name} not found")


def main() -> None:  # noqa: PLR0915
    base = pathlib.Path(tempfile.mkdtemp(prefix="campaigns-", dir="/tmp"))
    data = base / "data"
    port = random.randint(20000, 45000)
    runner = os.environ.get("COACH_RESERVATION_PG_USER", "lovable")
    as_user = ["setpriv", f"--reuid={runner}", f"--regid={runner}", "--clear-groups"] if os.geteuid() == 0 else []
    if os.geteuid() == 0:
        shutil.chown(base, user=runner, group=runner)
    env = {"PATH": os.environ.get("PATH", ""), "HOME": "/tmp", "LANG": "C",
           "PGOPTIONS": "-c statement_timeout=20000 -c lock_timeout=15000"}
    started = False
    checks: dict[str, bool] = {}

    def psql(sql: str, check: bool = True) -> tuple[int, str, str]:
        cmd = as_user + [pg_bin("psql"), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                         "-h", str(base), "-p", str(port), "-d", "postgres", "-c", sql]
        p = subprocess.run(cmd, text=True, env=env, capture_output=True, timeout=40, check=False)
        if check and p.returncode != 0:
            raise RuntimeError(p.stderr.strip())
        return p.returncode, p.stdout.strip(), p.stderr.strip()

    def q(sql: str) -> str:
        return psql(sql)[1]

    def as_auth(user: str, sql: str) -> tuple[int, str, str]:
        return psql(f"SET ROLE authenticated; SET request.jwt.claim.sub = '{user}'; {sql}", check=False)

    def ok(user: str, sql: str) -> str:
        rc, out, err = as_auth(user, sql)
        if rc != 0:
            raise RuntimeError(err)
        return out

    def run(batch: int = 200, max_batches: int = 10) -> None:
        q(f"CALL public.notification_campaign_run({batch}, {max_batches});")

    def lit(value: object) -> str:
        return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"

    def create(admin: str, name: str, kind: str = "product", segment: object | None = None,
               link: str = "/notifications", texts: dict[str, tuple[str, str]] | None = None) -> str:
        patch = {"name": name, "kind": kind, "link": link, "segment": segment or {"op": "AND", "rules": []}}
        cid = json.loads(ok(admin, f"SELECT public.notification_campaign_save(NULL, 0, {lit(patch)});"))["id"]
        for loc, (title, body) in (texts or {"pt-BR": ("Novidade", "Um texto de teste.")}).items():
            ok(admin, f"SELECT public.notification_campaign_translation_save('{cid}', '{loc}', '{title}', '{body}');")
        return cid

    def version(cid: str) -> int:
        return int(q(f"SELECT version FROM public.notification_campaigns WHERE id = '{cid}';"))

    def action(user: str, cid: str, act: str, args: object | None = None) -> tuple[int, str, str]:
        return as_auth(user, f"SELECT public.notification_campaign_action('{cid}', '{act}', {version(cid)}, {lit(args or {})});")

    def schedule(master: str, cid: str) -> None:
        ok(master, f"SELECT public.notification_campaign_translation_approve('{cid}', 'pt-BR');")
        aud = q(f"SELECT count(*) FROM public.profiles p WHERE p.status = 'active' AND public.notification_campaign_eligible(p.id, "
                f"(SELECT segment FROM public.notification_campaigns WHERE id = '{cid}'), (SELECT kind FROM public.notification_campaigns WHERE id = '{cid}'));")
        rc, _, err = action(master, cid, "schedule", {"confirm_audience": int(aud)})
        if rc != 0:
            raise RuntimeError(err)

    def notified(cid: str) -> int:
        return int(q(f"SELECT count(*) FROM public.notifications WHERE type = 'campaign' AND params->>'campaign_id' = '{cid}' "
                     f"AND NOT (params ? 'test');"))

    def status(cid: str) -> str:
        return q(f"SELECT status FROM public.notification_campaigns WHERE id = '{cid}';")

    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(SCHEMA)
        for m in MIGRATIONS:
            psql(m.read_text())
        rc, _, err = psql(MIGRATION.read_text(), check=False)
        checks["migration_applies"] = rc == 0
        if rc != 0:
            raise RuntimeError(err)
        checks["migration_reapplies"] = psql(MIGRATION.read_text(), check=False)[0] == 0

        master, admin, player = (str(uuid.uuid4()) for _ in range(3))
        users = [str(uuid.uuid4()) for _ in range(6)]
        inactive = str(uuid.uuid4())
        q(f"INSERT INTO public.profiles (id, email, locale) VALUES ('{master}','m@x.io','pt-BR'),('{admin}','a@x.io','pt-BR'),('{player}','p@x.io','en');")
        q("INSERT INTO public.profiles (id, email, locale, country, last_login_at) VALUES " + ",".join(
            f"('{u}','u{i}@x.io','{'en' if i % 2 else 'pt-BR'}','{'BR' if i < 3 else 'PT'}', now() - interval '{i} days')"
            for i, u in enumerate(users)) + ";")
        q(f"INSERT INTO public.profiles (id, email, status) VALUES ('{inactive}','i@x.io','inactive');")
        q(f"INSERT INTO public.user_roles VALUES ('{master}','admin_master'),('{admin}','admin'),('{player}','player');")
        pp = {u: str(uuid.uuid4()) for u in users}
        q("INSERT INTO public.player_profiles VALUES " + ",".join(f"('{p}','{u}')" for u, p in pp.items()) + ";")
        q(f"INSERT INTO public.player_connections (player_id, source, status) VALUES ('{pp[users[0]]}','steam','connected'),('{pp[users[1]]}','steam','pending');")
        q(f"INSERT INTO public.demo_jobs (user_id, status) VALUES ('{users[0]}','processed'),('{users[0]}','processed'),('{users[1]}','failed');")
        # Generous daily cap for everyone; marketing consent only for users[0].
        q("INSERT INTO public.notification_preferences (user_id, max_per_day) SELECT id, 30 FROM public.profiles;")
        q(f"UPDATE public.notification_preferences SET marketing_consent = true, marketing_consent_at = now() WHERE user_id = '{users[0]}';")
        everyone = 9  # active: master, admin, player + 6 users

        # ------------------------------------------------------------- permissions & RLS
        rc, _, err = as_auth(player, f"SELECT public.notification_campaign_save(NULL, 0, {lit({'name': 'hack', 'kind': 'product'})});")
        checks["player_cannot_create"] = rc != 0 and "NOTIFICATION_ADMIN_FORBIDDEN" in err
        rc, _, _ = psql(f"SET ROLE anon; SELECT public.notification_campaign_estimate({lit({'op': 'AND', 'rules': []})}, 'product');", check=False)
        checks["anon_cannot_call"] = rc != 0
        c1 = create(admin, "Admin draft")
        checks["admin_can_create_and_translate"] = status(c1) == "DRAFT" and q(
            f"SELECT count(*) FROM public.notification_campaign_translations WHERE campaign_id = '{c1}';") == "1"
        rc1, _, e1 = as_auth(admin, f"SELECT public.notification_campaign_translation_approve('{c1}', 'pt-BR');")
        rc2, _, e2 = action(admin, c1, "schedule", {"confirm_audience": everyone})
        checks["admin_cannot_approve_or_send"] = rc1 != 0 and rc2 != 0 and "FORBIDDEN" in e1 and "FORBIDDEN" in e2
        rc, out, _ = as_auth(player, "SELECT count(*) FROM public.notification_campaigns;")
        rc_t, out_t, _ = as_auth(player, "SELECT count(*) FROM public.notification_campaign_translations;")
        checks["player_cannot_read_campaigns"] = rc == 0 and out == "0" and rc_t == 0 and out_t == "0"
        checks["staff_can_read_campaigns"] = ok(admin, "SELECT count(*) FROM public.notification_campaigns;") == "1"
        rc, _, _ = as_auth(master, f"UPDATE public.notification_campaigns SET status = 'SENT' WHERE id = '{c1}';")
        rc2, _, _ = as_auth(master, f"INSERT INTO public.notification_campaign_translations (campaign_id, locale, title, body) VALUES ('{c1}','en','x','y');")
        checks["no_direct_writes_even_for_master"] = rc != 0 and rc2 != 0
        rc, _, _ = as_auth(player, "CALL public.notification_campaign_run(10, 1);")
        checks["players_cannot_run_sender"] = rc != 0
        rc, _, _ = as_auth(admin, f"SELECT public.notification_campaign_save(NULL, 0, {lit({'name': 'external', 'kind': 'product', 'link': 'https://evil.example'})});")
        checks["external_link_rejected"] = rc != 0

        # ------------------------------------------------------------- segmentation
        def est(spec: object, kind: str = "product") -> tuple[int, str]:
            rc, out, err = as_auth(admin, f"SELECT public.notification_campaign_estimate({lit(spec)}, '{kind}');")
            return rc, out if rc == 0 else err

        checks["empty_and_is_all_active"] = est({"op": "AND", "rules": []}) == (0, str(everyone))
        checks["locale_filter"] = est({"op": "AND", "rules": [{"field": "locale", "op": "in", "value": ["en"]}]}) == (0, "4")
        checks["and_combination"] = est({"op": "AND", "rules": [{"field": "locale", "op": "in", "value": ["en"]},
                                                                {"field": "country", "op": "in", "value": ["BR"]}]}) == (0, "1")
        checks["or_combination"] = est({"op": "OR", "rules": [{"field": "steam_linked", "op": "eq", "value": True},
                                                              {"field": "processed_demos", "op": "gte", "value": 1}]}) == (0, "1")
        checks["nested_group"] = est({"op": "AND", "rules": [{"field": "country", "op": "in", "value": ["PT"]},
                                                             {"op": "OR", "rules": [{"field": "last_login_days", "op": "lte", "value": 4},
                                                                                    {"field": "locale", "op": "in", "value": ["pt-BR"]}]}]}) == (0, "2")
        checks["inactive_never_in_audience"] = q(f"SELECT public.notification_segment_match('{inactive}', '{{\"op\":\"AND\",\"rules\":[]}}');") == "f"
        checks["commercial_needs_consent"] = est({"op": "AND", "rules": []}, "commercial") == (0, "1")
        bad_specs = [
            {"op": "AND", "rules": [{"field": "email", "op": "eq", "value": "x"}]},
            {"op": "AND", "rules": [{"field": "locale", "op": "in", "value": ["en'); DROP TABLE profiles; --"]}]},
            {"op": "AND", "rules": [{"field": "processed_demos", "op": "gte", "value": "1 OR 1=1"}]},
            {"op": "XOR", "rules": []},
            {"op": "AND", "rules": [{"op": "OR", "rules": [{"op": "AND", "rules": []}]}]},
            {"op": "AND", "rules": [{"field": "country", "op": "in", "value": ["bra"]}]},
            {"op": "AND", "rules": [{"field": "account_age_days", "op": "gte", "value": 1.5}]},
        ]
        checks["unsafe_or_unknown_specs_rejected"] = all(est(s)[0] != 0 for s in bad_specs) and q(
            "SELECT count(*) FROM public.profiles;") == "10"
        sid = ok(admin, f"SELECT public.notification_segment_save(NULL, 'English speakers', {lit({'op': 'AND', 'rules': [{'field': 'locale', 'op': 'in', 'value': ['en']}]})});")
        q(f"UPDATE public.profiles SET locale = 'en' WHERE id = '{users[0]}';")
        ok(admin, f"SELECT public.notification_segment_save('{sid}', 'English speakers', (SELECT spec FROM public.notification_segments WHERE id = '{sid}'));")
        checks["saved_audience_recalculated"] = q(f"SELECT estimated_count FROM public.notification_segments WHERE id = '{sid}';") == "5"
        q(f"UPDATE public.profiles SET locale = 'pt-BR' WHERE id = '{users[0]}';")

        # ------------------------------------------------------------- state machine & confirmation
        c2 = create(admin, "Product launch")
        rc, _, err = action(master, c2, "schedule", {"confirm_audience": everyone})
        checks["schedule_needs_approved_source_text"] = rc != 0 and "NOT_APPROVED" in err
        ok(master, f"SELECT public.notification_campaign_translation_approve('{c2}', 'pt-BR');")
        ok(admin, f"SELECT public.notification_campaign_translation_save('{c2}', 'en', 'News', 'A test text.');")
        checks["translations_not_auto_approved"] = q(
            f"SELECT count(*) FROM public.notification_campaign_translations WHERE campaign_id = '{c2}' AND approved_at IS NULL;") == "1"
        rc, _, err = action(master, c2, "schedule", {"confirm_audience": everyone - 1})
        checks["mass_send_needs_exact_confirmation"] = rc != 0 and "CONFIRMATION_MISMATCH" in err
        undo = (f"UPDATE public.notification_campaigns SET status = 'DRAFT', scheduled_at = NULL, confirmed_audience = NULL "
                f"WHERE id = '{c2}';")  # only reached when a guarantee is broken (mutants)
        if rc == 0:
            q(undo)
        rc, _, err = as_auth(master, f"SELECT public.notification_campaign_action('{c2}', 'schedule', 1, {lit({'confirm_audience': everyone})});")
        checks["stale_version_rejected"] = rc != 0 and "VERSION_CONFLICT" in err
        ok(admin, f"SELECT public.notification_campaign_translation_save('{c2}', 'pt-BR', 'Novidade!', 'Texto editado.');")
        rc, _, err = action(master, c2, "schedule", {"confirm_audience": everyone})
        checks["edit_withdraws_approval"] = rc != 0 and "NOT_APPROVED" in err
        if rc == 0:
            q(undo)
        schedule(master, c2)
        rc, _, err = as_auth(admin, f"SELECT public.notification_campaign_translation_save('{c2}', 'pt-BR', 'x', 'y');")
        checks["scheduled_content_locked"] = rc != 0 and "NOT_EDITABLE" in err
        future = create(admin, "Future one")
        ok(master, f"SELECT public.notification_campaign_translation_approve('{future}', 'pt-BR');")
        rc, _, err = as_auth(master, f"SELECT public.notification_campaign_action('{future}', 'schedule', {version(future)}, "
                                     f"{lit({'confirm_audience': everyone, 'scheduled_at': '2099-01-01T00:00:00Z'})});")
        checks["schedule_window_bounded"] = rc != 0 and "SCHEDULE_INVALID" in err

        _phase_two(locals(), checks)
        result = {"database": "disposable-local-postgresql", "independentConnections": True, "checks": checks,
                  "failures": sorted(k for k, v in checks.items() if not v)}
    except Exception as error:  # noqa: BLE001
        result = {"database": "disposable-local-postgresql", "error": str(error)[:600], "checks": checks,
                  "failures": ["HARNESS_ERROR"]}
    _finish(started, as_user, data, env, base, result)


def _phase_two(ctx: dict, checks: dict[str, bool]) -> None:  # noqa: PLR0915
    q, ok, as_auth, action, run, status, notified, create, schedule, version, lit, psql = (
        ctx[k] for k in ("q", "ok", "as_auth", "action", "run", "status", "notified", "create", "schedule", "version", "lit", "psql"))
    master, admin, player, users, everyone, c2 = (ctx[k] for k in ("master", "admin", "player", "users", "everyone", "c2"))

    # ------------------------------------------------------------- sending
    run(batch=4, max_batches=10)
    checks["sent_once_to_whole_audience"] = status(c2) == "SENT" and notified(c2) == everyone and q(
        f"SELECT targeted || ',' || accepted || ',' || duplicates FROM public.notification_campaigns WHERE id = '{c2}';") == f"{everyone},{everyone},0"
    checks["idempotency_key_shape"] = q(
        f"SELECT count(*) FROM public.notification_events WHERE source = 'campaign' AND source_ref = '{c2}' "
        f"AND idempotency_key = 'campaign:' || source_ref || ':' || user_id || ':in_app';") == str(everyone)
    # Forced re-send of the same campaign (as after a crash before the cursor moved): no duplicates.
    q(f"UPDATE public.notification_campaigns SET status = 'SCHEDULED', cursor_user = NULL, finished_at = NULL WHERE id = '{c2}';")
    run(batch=100, max_batches=1)
    checks["resend_never_duplicates"] = notified(c2) == everyone and q(
        f"SELECT duplicates FROM public.notification_campaigns WHERE id = '{c2}';") == str(everyone)
    audit = q(f"SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM public.admin_audit_logs WHERE metadata->>'campaign_id' = '{c2}';")
    checks["actions_audited"] = all(a in audit for a in ("notification_campaign_created", "notification_campaign_schedule",
                                                           "notification_campaign_translation_approved",
                                                           "notification_campaign_translation_saved"))
    checks["audit_without_content"] = q(
        "SELECT count(*) FROM public.admin_audit_logs WHERE metadata::text ~* 'Novidade|Texto|test text|@x.io';") == "0"

    # Recipient reads the approved text of a campaign they received, not of others.
    rc, out, _ = as_auth(users[2], f"SELECT count(*) FROM public.notification_campaign_translations WHERE campaign_id = '{c2}';")
    c_other = create(admin, "Never sent")
    ok(master, f"SELECT public.notification_campaign_translation_approve('{c_other}', 'pt-BR');")
    rc2, out2, _ = as_auth(users[2], f"SELECT count(*) FROM public.notification_campaign_translations WHERE campaign_id = '{c_other}';")
    checks["recipient_reads_only_received_approved_text"] = rc == 0 and out == "1" and rc2 == 0 and out2 == "0"

    # Frequency: a second announcement is fine, a third within 7 days is suppressed.
    c3 = create(admin, "Second announcement")
    schedule(master, c3)
    run()
    c4 = create(admin, "Third announcement")
    schedule(master, c4)
    run()
    checks["weekly_frequency_cap"] = notified(c3) == everyone and notified(c4) == 0 and q(
        f"SELECT count(*) FROM public.notification_events WHERE source_ref = '{c4}' AND reason = 'FREQUENCY_LIMIT';") == str(everyone)

    # Operational is not capped weekly; preference switch is honoured.
    q(f"UPDATE public.notification_preferences SET operational = false WHERE user_id = '{users[1]}';")
    c5 = create(admin, "Maintenance", kind="operational")
    schedule(master, c5)
    run()
    checks["operational_respects_preference_not_weekly_cap"] = notified(c5) == everyone - 1 and q(
        f"SELECT reason FROM public.notification_events WHERE source_ref = '{c5}' AND user_id = '{users[1]}';") == "PREFERENCE_DISABLED"

    # Commercial: only consenting users are targeted, and ingest refuses marketing without consent.
    c6 = create(admin, "Promo", kind="commercial")
    schedule(master, c6)
    run()
    checks["commercial_only_consented"] = q(f"SELECT targeted FROM public.notification_campaigns WHERE id = '{c6}';") == "1" and q(
        f"SELECT count(*) FROM public.notification_events WHERE source_ref = '{c6}' AND user_id <> '{users[0]}';") == "0"
    ev = {"type": "campaign", "version": 1, "category": "marketing", "occurred_at": "2026-11-05T00:00:00Z", "source": "campaign",
          "source_ref": "x", "payload": {}, "idempotency_key": "marketing:direct:1", "link": "/notifications", "params": {}}
    checks["ingest_refuses_marketing_without_consent"] = q(
        f"SET ROLE service_role; SELECT suppressed FROM public.notification_ingest('{users[3]}', {lit([ev])});") == "1" and q(
        "SELECT reason FROM public.notification_events WHERE idempotency_key = 'marketing:direct:1';") == "NO_MARKETING_CONSENT"

    # ------------------------------------------------------------- fencing, pause, cancel
    c7 = create(admin, "Fenced", kind="operational")
    schedule(master, c7)
    tok = str(uuid.uuid4())
    q(f"UPDATE public.notification_campaigns SET status = 'SENDING', lease_token = '{tok}', lease_until = now() + interval '5 minutes' WHERE id = '{c7}';")
    stale = q(f"SELECT public.notification_campaign_batch('{c7}', '{uuid.uuid4()}', 3);")
    checks["stale_token_cannot_send"] = stale == "LEASE_LOST" and notified(c7) == 0
    ok(master, f"SELECT public.notification_campaign_action('{c7}', 'pause', {version(c7)}, '{{}}');")
    after_pause = q(f"SELECT public.notification_campaign_batch('{c7}', '{tok}', 3);")
    run()
    checks["pause_fences_in_flight_batch"] = after_pause == "LEASE_LOST" and notified(c7) == 0 and status(c7) == "PAUSED"
    ok(master, f"SELECT public.notification_campaign_action('{c7}', 'resume', {version(c7)}, '{{}}');")
    run(batch=3, max_batches=1)
    partial = notified(c7)
    targeted = q(f"SELECT targeted FROM public.notification_campaigns WHERE id = '{c7}';")
    ok(master, f"SELECT public.notification_campaign_action('{c7}', 'cancel', {version(c7)}, '{{}}');")
    run()
    # One batch of 3 went out (some may be suppressed by preference); nothing after the cancel.
    checks["cancel_stops_sending"] = targeted == "3" and 0 < partial <= 3 and notified(c7) == partial and q(
        f"SELECT targeted FROM public.notification_campaigns WHERE id = '{c7}';") == "3" and status(c7) == "CANCELLED"

    # Crash recovery: a SENDING campaign whose lease expired is reclaimed and finished from its cursor.
    c8 = create(admin, "Recovered", kind="operational")
    schedule(master, c8)
    run(batch=4, max_batches=1)
    q(f"UPDATE public.notification_campaigns SET lease_until = now() - interval '1 second' WHERE id = '{c8}';")
    run(batch=4, max_batches=10)
    checks["expired_lease_recovered"] = status(c8) == "SENT" and notified(c8) == everyone - 1 and q(
        f"SELECT attempts FROM public.notification_campaigns WHERE id = '{c8}';") == "2"

    # Failure: the batch rolls back, is retried with backoff, FAILED after 3; retry recovers.
    c9 = create(admin, "Failing", kind="operational")
    schedule(master, c9)
    q("""CREATE FUNCTION public.harness_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$;
         CREATE TRIGGER harness_boom BEFORE INSERT ON public.notifications FOR EACH ROW
           WHEN (NEW.type = 'campaign') EXECUTE FUNCTION public.harness_boom();""")
    for _ in range(3):
        run()
        q(f"UPDATE public.notification_campaigns SET lease_until = now() - interval '1 second' WHERE id = '{c9}' AND status = 'SENDING';")
    failed = q(f"SELECT status || ',' || failures || ',' || coalesce(last_error, '') FROM public.notification_campaigns WHERE id = '{c9}';")
    checks["failure_rolls_back_and_stops_at_3"] = failed == "FAILED,3,P0001" and notified(c9) == 0 and q(
        f"SELECT count(*) FROM public.notification_events WHERE source_ref = '{c9}';") == "0"
    q("DROP TRIGGER harness_boom ON public.notifications;")
    ok(master, f"SELECT public.notification_campaign_action('{c9}', 'retry', {version(c9)}, '{{}}');")
    run()
    checks["retry_after_failure_completes"] = status(c9) == "SENT" and notified(c9) == everyone - 1

    # Concurrency: several runners at once never double-send (claim is exclusive, keys are unique).
    c10 = create(admin, "Concurrent", kind="operational")
    schedule(master, c10)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = [f.result() for f in [pool.submit(psql, "CALL public.notification_campaign_run(1, 50);", False) for _ in range(3)]]
    run(batch=1, max_batches=50)
    checks["concurrent_runners_single_delivery"] = all(r[0] == 0 for r in results) and notified(c10) == everyone - 1 and q(
        f"SELECT count(*) FROM (SELECT user_id FROM public.notification_events WHERE source_ref = '{c10}' GROUP BY user_id HAVING count(*) > 1) d;") == "0"

    # ------------------------------------------------------------- test send
    c11 = create(admin, "Test me", kind="product")
    r = json.loads(ok(admin, f"SELECT public.notification_campaign_test_send('{c11}', NULL);"))
    rc, _, err = as_auth(admin, f"SELECT public.notification_campaign_test_send('{c11}', '{users[0]}');")
    checks["test_send_only_to_staff"] = r["accepted"] == 1 and rc != 0 and "TEST_RECIPIENT_FORBIDDEN" in err
    rc_r, out_r, _ = as_auth(admin, f"SELECT count(*) FROM public.notification_campaign_translations WHERE campaign_id = '{c11}';")
    checks["staff_sees_unapproved_test_text"] = rc_r == 0 and out_r == "1"
    for _ in range(9):
        as_auth(admin, f"SELECT public.notification_campaign_test_send('{c11}', '{master}');")
    rc, _, err = as_auth(admin, f"SELECT public.notification_campaign_test_send('{c11}', NULL);")
    checks["test_send_rate_limited"] = rc != 0 and "TEST_RATE_LIMITED" in err
    stats = json.loads(ok(admin, f"SELECT public.notification_campaign_stats('{c11}');"))
    checks["test_sends_not_counted"] = stats["created"] == 0

    # ------------------------------------------------------------- analytics, dashboard, duplicate, archive
    q(f"UPDATE public.notifications SET read_at = now() WHERE params->>'campaign_id' = '{c3}' AND user_id IN ('{users[0]}','{users[1]}');")
    q(f"DELETE FROM public.notifications WHERE params->>'campaign_id' = '{c3}' AND user_id = '{users[2]}';")
    s3 = json.loads(ok(admin, f"SELECT public.notification_campaign_stats('{c3}');"))
    checks["stats_created_accepted_delivered_read"] = (s3["created"], s3["accepted"], s3["delivered_in_app"], s3["read"], s3["deleted_by_player"]) == (
        everyone, everyone, everyone - 1, 2, 1)
    rc, out, _ = as_auth(admin, "SELECT public.notification_admin_dashboard(now() - interval '1 day', now() + interval '1 minute');")
    rc2, _, _ = as_auth(admin, "SELECT public.notification_admin_dashboard(now(), now() - interval '1 day');")
    rc3, _, _ = as_auth(player, "SELECT public.notification_admin_dashboard(now() - interval '1 day', now());")
    checks["dashboard_ranges_and_permissions"] = rc == 0 and json.loads(out)["active_accounts"] == everyone and rc2 != 0 and rc3 != 0
    dup = json.loads(ok(admin, f"SELECT public.notification_campaign_action('{c2}', 'duplicate', {version(c2)}, '{{}}');"))
    checks["duplicate_is_unapproved_draft"] = q(f"SELECT status FROM public.notification_campaigns WHERE id = '{dup['id']}';") == "DRAFT" and q(
        f"SELECT count(*) FROM public.notification_campaign_translations WHERE campaign_id = '{dup['id']}' AND approved_at IS NOT NULL;") == "0"
    rc, _, _ = action(admin, c2, "archive")
    rc2, _, _ = action(admin, c2, "schedule", {"confirm_audience": everyone})
    checks["archive_and_illegal_transition"] = rc == 0 and status(c2) == "ARCHIVED" and rc2 != 0
    _ = (version, psql)


def _finish(started: bool, as_user: list[str], data: pathlib.Path, env: dict[str, str], base: pathlib.Path,
            result: dict[str, object]) -> None:
    if started:
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-m", "immediate", "-w", "stop"],
                       env=env, capture_output=True, check=False)
    shutil.rmtree(base, ignore_errors=True)
    result["teardown"] = not base.exists()
    print(json.dumps(result))


if __name__ == "__main__":
    main()
