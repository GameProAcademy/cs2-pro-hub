#!/usr/bin/env python3
"""PM5 — disposable PostgreSQL proof of the FACEIT login-state migration.

Creates `oauth_connection_states` exactly as Fase 2.2.1 did (server-only, RLS on, no client
grant), inserts a legacy LINK row, applies
supabase/migrations/20261118160000_pm5_faceit_login_state.sql VERBATIM twice and checks: the
legacy row stays a LINK attempt; a LINK attempt still needs a user; a LOGIN attempt needs a
64-hex browser binding and no user; unknown purposes are refused; clients still cannot read or
write the table. Prints JSON. `FACEIT_LOGIN_MIGRATION` overrides the migration (mutation tests).
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
MIGRATION = pathlib.Path(os.environ.get("FACEIT_LOGIN_MIGRATION") or
                         ROOT / "supabase/migrations/20261118160000_pm5_faceit_login_state.sql")

SCHEMA = r"""
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TYPE public.data_source AS ENUM ('demo', 'faceit', 'steam');
CREATE TABLE public.oauth_connection_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.data_source NOT NULL,
  state_hash text NOT NULL,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
ALTER TABLE public.oauth_connection_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oauth_connection_states FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_connection_states TO service_role;
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

    i = {k: str(uuid.uuid4()) for k in ("ua", "legacy")}
    T = "public.oauth_connection_states"

    def row(user: str | None, purpose: str | None, binding: str | None) -> str:
        cols = "user_id, provider, state_hash, code_verifier, redirect_uri, expires_at"
        vals = f"{'NULL' if user is None else repr(user)}, 'faceit', md5(random()::text), 'v', 'r', now() + interval '10 minutes'"
        if purpose is not None:
            cols += ", purpose"
            vals += f", '{purpose}'"
        if binding is not None:
            cols += ", browser_binding_hash"
            vals += f", '{binding}'"
        return f"INSERT INTO {T} ({cols}) VALUES ({vals});"

    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(SCHEMA)
        psql(f"INSERT INTO auth.users VALUES ('{i['ua']}');" + row(i["ua"], None, None))
        sql = MIGRATION.read_text(encoding="utf-8")
        rc, _, err = psql(sql, check=False)
        checks["migration_applies"] = rc == 0
        if rc != 0:
            raise RuntimeError(err)
        rc, _, _ = psql(sql, check=False)
        checks["migration_reapplies"] = rc == 0
        checks["legacy_row_is_link"] = psql(f"SELECT count(*) FROM {T} WHERE purpose = 'link' AND user_id IS NOT NULL;")[1] == "1"
        hexh = "a" * 64
        checks["link_with_user_ok"] = ok("service_role", None, row(i["ua"], "link", None))
        checks["link_without_user_refused"] = fails("service_role", None, row(None, "link", None))
        checks["default_purpose_needs_user"] = fails("service_role", None, row(None, None, None))
        checks["login_with_binding_ok"] = ok("service_role", None, row(None, "login", hexh))
        checks["login_without_binding_refused"] = fails("service_role", None, row(None, "login", None))
        checks["login_bad_binding_refused"] = fails("service_role", None, row(None, "login", "not-a-hash"))
        checks["login_with_user_refused"] = fails("service_role", None, row(i["ua"], "login", hexh))
        checks["unknown_purpose_refused"] = fails("service_role", None, row(i["ua"], "admin", None))
        checks["authenticated_cannot_read"] = fails("authenticated", i["ua"], f"SELECT 1 FROM {T};")
        checks["anon_cannot_insert"] = fails("anon", None, row(None, "login", hexh))
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
