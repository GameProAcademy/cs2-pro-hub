#!/usr/bin/env python3
"""STEAM — disposable PostgreSQL proof of the Steam nickname-alias migration.

Creates `player_nickname_history` and the identity tables as production has them (RLS on,
owner/staff SELECT only, no client writes), seeds existing manual/demo rows, applies
supabase/migrations/20261119010000_steam_nickname_aliases.sql VERBATIM twice and checks: an
alias is written only for the player whose Steam identity is VERIFIED for that SteamID64;
repeat syncs are idempotent; a stronger existing row is never downgraded nor re-attributed;
history is never deleted; clients cannot call the function or write the table; another
player's aliases stay invisible. Prints JSON. `STEAM_ALIAS_MIGRATION` overrides the migration.
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
MIGRATION = pathlib.Path(os.environ.get("STEAM_ALIAS_MIGRATION") or
                         ROOT / "supabase/migrations/20261119010000_steam_nickname_aliases.sql")

SCHEMA = r"""
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TYPE public.platform_kind AS ENUM ('FACEIT', 'GAMERS_CLUB', 'STEAM');
CREATE TYPE public.identity_link_status AS ENUM ('unlinked','correlated','strongly_correlated','verified','conflict');
CREATE TABLE public.player_profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.player_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  platform public.platform_kind NOT NULL,
  external_id text,
  identity_status public.identity_link_status NOT NULL DEFAULT 'unlinked',
  is_verified boolean NOT NULL DEFAULT false
);
CREATE FUNCTION public.owns_player(_p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS
  $$ SELECT EXISTS (SELECT 1 FROM public.player_profiles WHERE id = _p AND user_id = auth.uid()) $$;
CREATE FUNCTION public.is_staff(_u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.player_nickname_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  normalized_nickname text NOT NULL,
  source text NOT NULL CHECK (source = ANY (ARRAY['declared_profile','demo_observation','manual_selection'])),
  method text,
  confidence_label text,
  confidence_score numeric,
  steam_id text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  times_seen integer NOT NULL DEFAULT 1 CHECK (times_seen > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, normalized_nickname)
);
ALTER TABLE public.player_nickname_history
  ADD CONSTRAINT player_nickname_history_confidence_label_check
  CHECK (confidence_label IS NULL OR confidence_label = ANY (ARRAY['high','medium','low']));
GRANT SELECT ON public.player_nickname_history TO authenticated;
GRANT ALL ON public.player_nickname_history TO service_role;
GRANT ALL ON public.player_identities, public.player_profiles TO service_role;
ALTER TABLE public.player_nickname_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_nickname_history_select_own
  ON public.player_nickname_history FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));
"""


def pg_bin(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in sorted(pathlib.Path("/usr/lib/postgresql").glob(f"*/bin/{name}"), reverse=True):
        return str(candidate)
    raise SystemExit(f"{name} not found")


def main() -> None:  # noqa: PLR0915
    base = pathlib.Path(tempfile.mkdtemp(prefix="pm5-fl-", dir="/tmp"))
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

    u = {k: str(uuid.uuid4()) for k in ("ua", "ub", "pa", "pb")}
    SA = "76561198000000001"
    SB = "76561198000000002"
    H = "public.player_nickname_history"

    def alias(player: str, nick: str, steam: str) -> str:
        return f"SELECT public.record_steam_alias('{player}', $n${nick}$n$, '{steam}');"

    def val(sql: str) -> str:
        return psql(sql)[1]

    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale", "-E", "UTF8"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(SCHEMA)
        psql(f"""
          INSERT INTO public.player_profiles VALUES ('{u['pa']}', '{u['ua']}'), ('{u['pb']}', '{u['ub']}');
          INSERT INTO public.player_identities (player_id, platform, external_id, identity_status, is_verified)
          VALUES ('{u['pa']}', 'STEAM', '{SA}', 'verified', true),
                 ('{u['pb']}', 'STEAM', '{SB}', 'correlated', false);
          INSERT INTO {H} (player_id, nickname, normalized_nickname, source, method, steam_id, times_seen)
          VALUES ('{u['pa']}', 'Manual', 'manual', 'manual_selection', 'manual_user_selection', NULL, 3);
        """)
        sql = MIGRATION.read_text(encoding="utf-8")
        rc, _, err = psql(sql, check=False)
        checks["migration_applies"] = rc == 0
        if rc != 0:
            raise RuntimeError(err)
        rc, _, _ = psql(sql, check=False)
        checks["migration_reapplies"] = rc == 0
        checks["old_sources_still_accepted"] = ok("service_role", None,
            f"INSERT INTO {H} (player_id, nickname, normalized_nickname, source) VALUES ('{u['pa']}', 'x', 'x-demo', 'demo_observation');")
        checks["unknown_source_refused"] = fails("service_role", None,
            f"INSERT INTO {H} (player_id, nickname, normalized_nickname, source) VALUES ('{u['pa']}', 'x', 'x-bad', 'guessed');")

        checks["verified_alias_inserted"] = val(alias(u["pa"], "  Persona   One ", SA)) == "t"
        row = val(f"SELECT nickname || '|' || source || '|' || method || '|' || confidence_label || '|' || steam_id || '|' || times_seen FROM {H} WHERE player_id = '{u['pa']}' AND normalized_nickname = 'persona one';")
        checks["alias_shape"] = row == f"Persona One|steam_profile|steam_web_api|low|{SA}|1"
        checks["repeat_is_idempotent"] = val(alias(u["pa"], "persona ONE", SA)) == "f" and \
            val(f"SELECT count(*) || ':' || max(times_seen) FROM {H} WHERE player_id = '{u['pa']}' AND normalized_nickname = 'persona one';") == "1:1"
        checks["nfkc_normalised"] = val(alias(u["pa"], "Ｐｅｒｓｏｎａ　One", SA)) == "f"
        before = val(f"SELECT source || '|' || coalesce(steam_id, 'null') || '|' || times_seen || '|' || nickname FROM {H} WHERE player_id = '{u['pa']}' AND normalized_nickname = 'manual';")
        checks["stronger_row_kept"] = val(alias(u["pa"], "MANUAL", SA)) == "f" and \
            val(f"SELECT source || '|' || coalesce(steam_id, 'null') || '|' || times_seen || '|' || nickname FROM {H} WHERE player_id = '{u['pa']}' AND normalized_nickname = 'manual';") == before == "manual_selection|null|3|Manual"
        checks["unverified_player_refused"] = fails("service_role", None, alias(u["pb"], "Bob", SB))
        checks["wrong_steam_id_refused"] = fails("service_role", None, alias(u["pa"], "Other", SB))
        checks["other_players_steam_refused"] = fails("service_role", None, alias(u["pb"], "Steal", SA))
        checks["invalid_steam_id_refused"] = fails("service_role", None, alias(u["pa"], "x", "123"))
        checks["empty_name_ignored"] = val(alias(u["pa"], "   ", SA)) == "f"
        checks["overlong_name_ignored"] = val(alias(u["pa"], "y" * 65, SA)) == "f"
        # Seeded manual row + the one alias (role-scoped probes above roll back).
        checks["history_never_deleted"] = int(val(f"SELECT count(*) FROM {H} WHERE player_id = '{u['pa']}';")) == 2
        checks["authenticated_cannot_call"] = fails("authenticated", u["ua"], alias(u["pa"], "Self", SA))
        checks["anon_cannot_call"] = fails("anon", None, alias(u["pa"], "Anon", SA))
        checks["authenticated_cannot_insert"] = fails("authenticated", u["ua"],
            f"INSERT INTO {H} (player_id, nickname, normalized_nickname, source) VALUES ('{u['pa']}', 'z', 'z', 'steam_profile');")
        checks["owner_reads_own_aliases"] = count("authenticated", u["ua"], f"SELECT 1 FROM {H} WHERE source = 'steam_profile'") == 1
        checks["other_player_sees_nothing"] = count("authenticated", u["ub"], f"SELECT 1 FROM {H}") == 0
        checks["definer_search_path_empty"] = val(
            "SELECT prosecdef AND proconfig::text LIKE '%search_path=%' AND proconfig::text NOT LIKE '%public%' FROM pg_proc WHERE proname = 'record_steam_alias';") == "t"
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
