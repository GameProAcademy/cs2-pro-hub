#!/usr/bin/env python3
"""PM5 4.2.10 — disposable PostgreSQL proof of the moments library tables and their RLS.

Production-shaped stub (roles, auth.uid(), auth.users, player_profiles, matches,
match_participants, owns_canonical_match exactly as in production). Users A and B each own a
private match and share one canonical match. Applies
supabase/migrations/20261118120000_pm5_moments_library.sql VERBATIM twice and checks: own rows
only, bookmark only on an owned match, no cross-user read/update/delete (IDOR), collection
items only between the caller's own collection and bookmark, deleting a collection keeps the
bookmarks, deleting a match keeps the bookmark text (match_id NULL), anon nothing. Prints JSON.
`MOMENTS_MIGRATION` overrides the migration (mutation tests); `SECURITY_HARNESS_PG_USER` sets
the OS user when run as root.
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
MIGRATION = pathlib.Path(os.environ.get("MOMENTS_MIGRATION") or
                         ROOT / "supabase/migrations/20261118120000_pm5_moments_library.sql")

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
    base = pathlib.Path(tempfile.mkdtemp(prefix="pm5-mom-", dir="/tmp"))
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

    i = {k: str(uuid.uuid4()) for k in ("ua", "ub", "pa", "pb", "shared", "priv_a", "priv_b", "bm_a", "bm_b", "col_a", "col_b")}

    def bookmark(bid: str, user: str, match: str) -> str:
        return (f"INSERT INTO public.moment_bookmarks (id, user_id, match_id, round_number, tick_start, tick_end, kind, title) "
                f"VALUES ('{bid}', '{user}', '{match}', 1, 100, 200, 'KILL', 't');")

    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(SCHEMA)
        psql(f"""
INSERT INTO auth.users VALUES ('{i['ua']}'),('{i['ub']}');
INSERT INTO public.player_profiles VALUES ('{i['pa']}','{i['ua']}'),('{i['pb']}','{i['ub']}');
INSERT INTO public.matches VALUES ('{i['shared']}','{i['pa']}'),('{i['priv_a']}','{i['pa']}'),('{i['priv_b']}','{i['pb']}');
INSERT INTO public.match_participants VALUES ('{i['shared']}','100','{i['pa']}'),('{i['shared']}','200','{i['pb']}'),
  ('{i['priv_a']}','100','{i['pa']}'),('{i['priv_b']}','200','{i['pb']}');
""")
        sql = MIGRATION.read_text(encoding="utf-8")
        rc, _, err = psql(sql, check=False)
        checks["migration_applies"] = rc == 0
        if rc != 0:
            raise RuntimeError(err)
        rc, _, _ = psql(sql, check=False)
        checks["migration_reapplies"] = rc == 0

        # Own bookmarks on owned matches (committed for the read checks).
        checks["a_bookmarks_own_private_match"] = ok("authenticated", i["ua"], bookmark(i["bm_a"], i["ua"], i["priv_a"]), True)
        checks["b_bookmarks_shared_match"] = ok("authenticated", i["ub"], bookmark(i["bm_b"], i["ub"], i["shared"]), True)
        checks["a_cannot_bookmark_b_private_match"] = fails("authenticated", i["ua"], bookmark(str(uuid.uuid4()), i["ua"], i["priv_b"]))
        checks["a_cannot_bookmark_as_b"] = fails("authenticated", i["ua"], bookmark(str(uuid.uuid4()), i["ub"], i["priv_a"]))
        checks["bookmark_needs_a_match"] = fails(
            "authenticated", i["ua"],
            f"INSERT INTO public.moment_bookmarks (user_id, match_id, tick_start, tick_end, kind, title) "
            f"VALUES ('{i['ua']}', NULL, 1, 2, 'KILL', 't');")
        checks["a_reads_only_own"] = count("authenticated", i["ua"], "SELECT 1 FROM public.moment_bookmarks") == 1
        checks["b_reads_only_own"] = count("authenticated", i["ub"], "SELECT 1 FROM public.moment_bookmarks") == 1
        checks["anon_reads_nothing"] = fails("anon", None, "SELECT 1 FROM public.moment_bookmarks;")
        checks["a_cannot_update_b"] = affected("authenticated", i["ua"],
            f"UPDATE public.moment_bookmarks SET title = 'x' WHERE id = '{i['bm_b']}'") == 0
        checks["a_cannot_delete_b"] = affected("authenticated", i["ua"],
            f"DELETE FROM public.moment_bookmarks WHERE id = '{i['bm_b']}'") == 0
        checks["a_cannot_transfer_to_b"] = fails("authenticated", i["ua"],
            f"UPDATE public.moment_bookmarks SET user_id = '{i['ub']}' WHERE id = '{i['bm_a']}';")
        checks["a_cannot_repoint_to_b_match"] = fails("authenticated", i["ua"],
            f"UPDATE public.moment_bookmarks SET match_id = '{i['priv_b']}' WHERE id = '{i['bm_a']}';")
        checks["range_too_long_rejected"] = fails("authenticated", i["ua"],
            f"INSERT INTO public.moment_bookmarks (user_id, match_id, tick_start, tick_end, kind, title) "
            f"VALUES ('{i['ua']}', '{i['priv_a']}', 0, {64 * 181}, 'KILL', 't');")
        checks["inverted_range_rejected"] = fails("authenticated", i["ua"],
            f"INSERT INTO public.moment_bookmarks (user_id, match_id, tick_start, tick_end, kind, title) "
            f"VALUES ('{i['ua']}', '{i['priv_a']}', 10, 5, 'KILL', 't');")

        # Collections.
        checks["a_creates_collection"] = ok("authenticated", i["ua"],
            f"INSERT INTO public.moment_collections (id, user_id, name) VALUES ('{i['col_a']}', '{i['ua']}', 'c');", True)
        checks["b_creates_collection"] = ok("authenticated", i["ub"],
            f"INSERT INTO public.moment_collections (id, user_id, name) VALUES ('{i['col_b']}', '{i['ub']}', 'c');", True)
        checks["a_adds_own_bookmark_to_own_collection"] = ok("authenticated", i["ua"],
            f"INSERT INTO public.moment_collection_items (collection_id, bookmark_id, user_id, position) "
            f"VALUES ('{i['col_a']}', '{i['bm_a']}', '{i['ua']}', 0);", True)
        checks["a_cannot_add_b_bookmark"] = fails("authenticated", i["ua"],
            f"INSERT INTO public.moment_collection_items (collection_id, bookmark_id, user_id, position) "
            f"VALUES ('{i['col_a']}', '{i['bm_b']}', '{i['ua']}', 1);")
        checks["a_cannot_add_to_b_collection"] = fails("authenticated", i["ua"],
            f"INSERT INTO public.moment_collection_items (collection_id, bookmark_id, user_id, position) "
            f"VALUES ('{i['col_b']}', '{i['bm_a']}', '{i['ua']}', 1);")
        checks["a_cannot_move_item_to_b_collection"] = fails("authenticated", i["ua"],
            f"UPDATE public.moment_collection_items SET collection_id = '{i['col_b']}' WHERE bookmark_id = '{i['bm_a']}';")
        checks["b_cannot_read_a_collections"] = count("authenticated", i["ub"],
            f"SELECT 1 FROM public.moment_collections WHERE id = '{i['col_a']}'") == 0
        checks["b_cannot_delete_a_collection"] = affected("authenticated", i["ub"],
            f"DELETE FROM public.moment_collections WHERE id = '{i['col_a']}'") == 0
        checks["deleting_collection_keeps_bookmark"] = ok("authenticated", i["ua"],
            f"DELETE FROM public.moment_collections WHERE id = '{i['col_a']}';", True) and count(
            "authenticated", i["ua"], f"SELECT 1 FROM public.moment_bookmarks WHERE id = '{i['bm_a']}'") == 1
        # Deleting the match keeps the bookmark text, unlinked (UNAVAILABLE).
        psql(f"DELETE FROM public.match_participants WHERE match_id = '{i['priv_a']}'; DELETE FROM public.matches WHERE id = '{i['priv_a']}';")
        checks["deleted_match_unlinks_bookmark"] = count("authenticated", i["ua"],
            f"SELECT 1 FROM public.moment_bookmarks WHERE id = '{i['bm_a']}' AND match_id IS NULL") == 1
        checks["deleting_bookmark_keeps_match"] = ok("authenticated", i["ub"],
            f"DELETE FROM public.moment_bookmarks WHERE id = '{i['bm_b']}';", True) and int(
            psql(f"SELECT count(*) FROM public.matches WHERE id = '{i['shared']}';")[1]) == 1
        checks["service_role_reads_all"] = count("service_role", None, "SELECT 1 FROM public.moment_bookmarks") >= 1
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
