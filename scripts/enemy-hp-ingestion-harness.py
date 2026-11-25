#!/usr/bin/env python3
"""UX-1.0 enemy-hp-v1: the real persistence step of the ingestion against a disposable PostgreSQL.

Applies the PRODUCTION migration file unchanged (three columns, CHECK constraint and
persist_demo_projection) over the minimal tables that function touches, then calls the function as
service_role with the `_metrics` payload produced by the real pipeline (computeMetrics +
projectionMetricsPayload, written by the vitest caller to ENEMY_HP_PAYLOAD). Checks persistence,
idempotence, that `adr` keeps its own value, that no other row moves, that anon/authenticated
cannot call the function, and that the CHECK constraint rejects impossible values.
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

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261124060000_ux10_enemy_hp_damage.sql"

SCHEMA = r"""
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TYPE public.upload_status AS ENUM ('pending','processing','processed','failed');
CREATE TYPE public.match_result AS ENUM ('win','loss','draw');
CREATE TABLE public.uploads (
  id uuid PRIMARY KEY, status public.upload_status NOT NULL DEFAULT 'processing',
  processed_at timestamptz, processing_duration_ms integer, parser_name text, parser_version text,
  schema_version integer, analysis_version text, error_code text, error_message text
);
CREATE TABLE public.demo_jobs (
  id uuid PRIMARY KEY, upload_id uuid NOT NULL REFERENCES public.uploads(id),
  status public.upload_status NOT NULL DEFAULT 'processing', stage text, finished_at timestamptz,
  heartbeat_at timestamptz, duration_ms integer, match_id uuid, player_id uuid, resolved_steam_id text,
  identity_status text, attachment_state text, attachment_method text, attachment_confidence numeric,
  attachment_confidence_label text, attachment_source text, attachment_participant_key text,
  observed_nickname text, attachment_reason text, parser_name text, parser_version text,
  parser_revision text, schema_version integer, analysis_version text, rounds_detected integer,
  rounds_valid integer, players_detected integer, events_detected integer,
  extraction_confidence numeric, partial_parse boolean, quality_flags jsonb, error_code text,
  error_message text, retain_until timestamptz, updated_at timestamptz
);
CREATE TABLE public.matches (
  id uuid PRIMARY KEY, player_id uuid, upload_id uuid, platform text, rounds integer,
  duration_seconds integer, game_version text, demo_metadata jsonb, team_player text,
  team_opponent text, score_player integer, score_opponent integer, result public.match_result
);
CREATE TABLE public.match_metrics (
  id uuid PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text)::uuid,
  match_id uuid NOT NULL REFERENCES public.matches(id), player_id uuid NOT NULL,
  rounds_played integer, kills integer, deaths integer, assists integer, hs_percent numeric,
  adr numeric, kast numeric, damage_taken numeric, damage_efficiency numeric, first_kills integer,
  first_deaths integer, opening_attempts integer, opening_success integer,
  opening_success_rate numeric, trade_kills integer, trade_deaths integer, clutch_attempts integer,
  clutch_wins integer, clutches integer, multi_kills integer, utility_damage numeric,
  grenade_damage numeric, flash_assists integer, ct_rating numeric, t_rating numeric, rating numeric,
  UNIQUE (match_id, player_id)
);
CREATE TABLE public.match_features (
  match_id uuid NOT NULL, player_id uuid NOT NULL, steam_id text, sample_rounds integer,
  sample_opening_duels integer, sample_clutches integer, extraction_confidence numeric,
  partial_parse boolean, features jsonb, schema_version integer, analysis_version text
);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
"""


def pg_bin(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in sorted(pathlib.Path("/usr/lib/postgresql").glob(f"*/bin/{name}"), reverse=True):
        return str(candidate)
    raise SystemExit(f"{name} not found")


def main() -> None:
    payload = json.loads(pathlib.Path(os.environ["ENEMY_HP_PAYLOAD"]).read_text())
    base = pathlib.Path(tempfile.mkdtemp(prefix="enemyhp-", dir="/tmp"))
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
    observed: dict[str, object] = {}

    def psql(sql: str, check: bool = True) -> tuple[int, str, str]:
        cmd = as_user + [pg_bin("psql"), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                         "-h", str(base), "-p", str(port), "-d", "postgres", "-c", sql]
        p = subprocess.run(cmd, text=True, env=env, capture_output=True, timeout=30, check=False)
        if check and p.returncode != 0:
            raise RuntimeError(p.stderr.strip())
        return p.returncode, p.stdout.strip(), p.stderr.strip()

    def q(sql: str) -> str:
        return psql(sql)[1]

    def lit(value: object) -> str:
        return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"

    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(SCHEMA)
        checks["production_migration_applies"] = psql(MIGRATION.read_text(), check=False)[0] == 0
        checks["migration_reapply_idempotent"] = psql(MIGRATION.read_text(), check=False)[0] == 0

        match, other, upload, job, player = (str(uuid.uuid4()) for _ in range(5))
        q(f"INSERT INTO public.uploads (id) VALUES ('{upload}');")
        q(f"INSERT INTO public.demo_jobs (id, upload_id) VALUES ('{job}','{upload}');")
        q(f"INSERT INTO public.matches (id) VALUES ('{match}'),('{other}');")
        # A pre-existing row of another match: must not move.
        q(f"INSERT INTO public.match_metrics (match_id, player_id, rounds_played, adr, damage_enemy_hp,"
          f" damage_enemy_hp_method, damage_enemy_hp_excluded_hits) VALUES ('{other}','{player}',24,90.6,1691,"
          f"'HEALTH_AFTER',0);")
        before_other = q(f"SELECT md5(row(m.*)::text) FROM public.match_metrics m WHERE match_id='{other}';")

        call = (f"SET ROLE service_role; SELECT public.persist_demo_projection('{match}','{upload}','{player}',"
                f"'participant-key',{lit({'platform': 'DEMO', 'rounds': payload['rounds_played']})},"
                f"{lit({})},{lit(payload)},{lit({'sample_rounds': payload['rounds_played']})},"
                f"'{job}',{lit({'parser_version': '0.42.2'})});")
        psql(call)
        cols = "damage_enemy_hp, coalesce(damage_enemy_hp_method,''), damage_enemy_hp_excluded_hits, adr, rounds_played"
        row1 = q(f"SELECT concat_ws('|', {cols}) FROM public.match_metrics WHERE match_id='{match}';")
        observed["row"] = row1
        checks["job_finalized"] = q(f"SELECT status||','||stage FROM public.demo_jobs WHERE id='{job}';") == "processed,done"

        # Idempotent re-run (reprocessing of the same projection): same single row, same values.
        q(f"UPDATE public.demo_jobs SET status='processing' WHERE id='{job}';")
        psql(call)
        checks["rerun_single_row"] = q(f"SELECT count(*) FROM public.match_metrics WHERE match_id='{match}';") == "1"
        checks["rerun_same_values"] = q(f"SELECT concat_ws('|', {cols}) FROM public.match_metrics WHERE match_id='{match}';") == row1
        checks["other_match_untouched"] = q(f"SELECT md5(row(m.*)::text) FROM public.match_metrics m WHERE match_id='{other}';") == before_other

        for role in ("anon", "authenticated"):
            rc, _, err = psql(call.replace("SET ROLE service_role;", f"SET ROLE {role};"), check=False)
            checks[f"{role}_cannot_execute"] = rc != 0 and "permission denied" in err

        rc, _, _ = psql(f"UPDATE public.match_metrics SET damage_enemy_hp=-1 WHERE match_id='{match}';", check=False)
        checks["check_rejects_negative"] = rc != 0
        rc, _, _ = psql(f"UPDATE public.match_metrics SET damage_enemy_hp_method='GUESS' WHERE match_id='{match}';", check=False)
        checks["check_rejects_unknown_method"] = rc != 0

        # A NULL value (partial extraction) is stored as NULL, never 0.
        nulls = dict(payload, damage_enemy_hp=None, damage_enemy_hp_method=None, damage_enemy_hp_excluded_hits=None)
        q(f"UPDATE public.demo_jobs SET status='processing' WHERE id='{job}';")
        psql(call.replace(lit(payload), lit(nulls)))
        checks["null_stays_null"] = q(
            f"SELECT (damage_enemy_hp IS NULL AND damage_enemy_hp_method IS NULL AND damage_enemy_hp_excluded_hits IS NULL)::text"
            f" FROM public.match_metrics WHERE match_id='{match}';") == "true"

        result = {"database": "disposable-local-postgresql", "checks": checks, "observed": observed,
                  "failures": sorted(k for k, v in checks.items() if not v)}
    except Exception as error:  # noqa: BLE001
        result = {"database": "disposable-local-postgresql", "error": str(error)[:600], "checks": checks,
                  "observed": observed, "failures": ["HARNESS_ERROR"]}
    finally:
        if started:
            subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-m", "immediate", "-w", "stop"],
                           env=env, capture_output=True, check=False)
        shutil.rmtree(base, ignore_errors=True)
        result["teardown"] = not base.exists()
    print(json.dumps(result))


if __name__ == "__main__":
    main()
