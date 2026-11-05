#!/usr/bin/env python3
"""Fase 3.5 — disposable PostgreSQL proof of the AI Coach request reservations.

Builds a throw-away cluster (initdb, unix socket only), creates the minimal tables the
migration references, applies supabase/migrations/20261105100000_coach_request_reservations.sql
VERBATIM, then runs every idempotency scenario with independent psql sessions (separate
processes and connections, real row locks). "Provider calls" are counted as claims that
returned ACQUIRED — the only outcome allowed to call the provider.

Two mutations are applied to a copy of the migration and must BREAK the guarantees:
  naive_claim   SELECT-then-INSERT without atomic ownership → two concurrent owners;
  no_fencing    complete without the lease-token check → a stale executor writes.

Prints one JSON object. Never connects to any non-local database.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import pathlib
import random
import re
import shutil
import subprocess
import sys
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261105100000_coach_request_reservations.sql"
ITERATIONS = int(os.environ.get("COACH_RESERVATION_ITERATIONS", "20"))
SHA = "a" * 64
SHA_OTHER = "b" * 64

SCHEMA = r"""
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;  -- as in Supabase
CREATE TABLE public.player_profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE TABLE public.coach_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  title text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TYPE public.coach_role AS ENUM ('coach', 'player');
CREATE TABLE public.coach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  role public.coach_role NOT NULL, content text NOT NULL, context_type text, context_id uuid,
  created_at timestamptz NOT NULL DEFAULT now());
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
"""


def pg_bin(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in sorted(pathlib.Path("/usr/lib/postgresql").glob(f"*/bin/{name}"), reverse=True):
        return str(candidate)
    raise SystemExit(f"{name} not found")


def main() -> None:
    base = pathlib.Path(tempfile.mkdtemp(prefix="coach-reservations-", dir="/tmp"))
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
    details: dict[str, object] = {}

    def run(cmd: list[str], **kw: object) -> subprocess.CompletedProcess[str]:
        return subprocess.run(cmd, text=True, check=True, env=env, capture_output=True, **kw)

    def psql(sql: str, *, db: str = "postgres", check: bool = True) -> tuple[int, str, str]:
        cmd = as_user + [pg_bin("psql"), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                         "-h", str(base), "-p", str(port), "-d", db, "-c", sql]
        p = subprocess.run(cmd, text=True, env=env, capture_output=True, timeout=20)
        if check and p.returncode != 0:
            raise RuntimeError(p.stderr.strip())
        return p.returncode, p.stdout.strip(), p.stderr.strip()

    def q(sql: str, db: str = "postgres") -> str:
        return psql(sql, db=db)[1]

    def concurrently(*sqls: str, db: str = "postgres") -> list[tuple[int, str, str]]:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(sqls)) as pool:
            futures = [pool.submit(psql, s, db=db, check=False) for s in sqls]
            return [f.result(timeout=30) for f in futures]

    def claim(rid: str, user: str, player: str, conv: str | None = None, sha: str = SHA, lease: int = 120,
              pre: str = "") -> str:
        c = f"'{conv}'" if conv else "NULL"
        return (f"{pre}SELECT outcome || '|' || coalesce(lease_token::text,'') || '|' || coalesce(conversation_id::text,'')"
                f" || '|' || coalesce(pending_reply,'') FROM public.coach_claim_request("
                f"'{rid}','{user}','{player}',{c},'{sha}',{lease});")

    def outcome(text: str) -> str:
        return text.split("|")[0] if text else ""

    def complete(rid: str, token: str, reply: str = "reply") -> str:
        return (f"SELECT conversation_id FROM public.coach_complete_request('{rid}','{token}','title','question',"
                f"'{reply}','ai-coach-v3|test','openrouter','openai/gpt-oss-20b');")

    def build(db: str, migration_sql: str) -> None:
        psql(f"CREATE DATABASE {db};")
        psql(SCHEMA.replace("CREATE ROLE", "-- role") if db != "postgres" else SCHEMA, db=db)
        psql(migration_sql, db=db)

    try:
        run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"])
        run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                       "-o", f"-k {base} -p {port} -h ''", "-w", "start"])
        started = True
        psql(SCHEMA)
        migration = MIGRATION.read_text()
        psql(migration)

        users = {k: (str(uuid.uuid4()), str(uuid.uuid4())) for k in ("A", "B")}
        for user, player in users.values():
            q(f"INSERT INTO public.player_profiles VALUES ('{player}','{user}');")
        (ua, pa), (ub, pb) = users["A"], users["B"]
        conv_a = q(f"INSERT INTO public.coach_conversations (player_id) VALUES ('{pa}') RETURNING id;")
        conv_a2 = q(f"INSERT INTO public.coach_conversations (player_id) VALUES ('{pa}') RETURNING id;")

        # 1 + 18. Same user, same UUID, two independent sessions: exactly one owner.
        ok = True
        for _ in range(ITERATIONS):
            rid = str(uuid.uuid4())
            results = [outcome(r[1]) for r in concurrently(claim(rid, ua, pa), claim(rid, ua, pa))]
            ok &= sorted(results) == ["ACQUIRED", "IN_PROGRESS"]
        checks["same_user_concurrent_single_provider_call"] = ok

        # 2. Two accounts, same UUID, concurrently: one reservation; the other CONFLICT.
        ok = True
        for _ in range(ITERATIONS):
            rid = str(uuid.uuid4())
            results = sorted(outcome(r[1]) for r in concurrently(claim(rid, ua, pa), claim(rid, ub, pb)))
            ok &= results == ["ACQUIRED", "CONFLICT"]
            ok &= q(f"SELECT count(*) FROM public.coach_request_reservations WHERE request_id='{rid}';") == "1"
        checks["two_accounts_same_uuid_conflict_before_provider"] = ok

        # 3 + 17. Complete, then replay: same ids, no new messages, no new owner.
        rid = str(uuid.uuid4())
        token = q(claim(rid, ua, pa, conv_a)).split("|")[1]
        q(complete(rid, token))
        before = q(f"SELECT count(*) FROM public.coach_messages WHERE conversation_id='{conv_a}';")
        replays = [outcome(r[1]) for r in concurrently(*[claim(rid, ua, pa, conv_a)] * 4)]
        after = q(f"SELECT count(*) FROM public.coach_messages WHERE conversation_id='{conv_a}';")
        checks["replay_returns_persisted_no_duplicates"] = replays == ["REPLAY"] * 4 and before == after == "2"
        # The reply points back to the request; the question carries the request id.
        checks["reply_references_request"] = q(
            f"SELECT count(*) FROM public.coach_messages WHERE context_id='{rid}' AND role='coach';") == "1" and q(
            f"SELECT count(*) FROM public.coach_messages WHERE id='{rid}' AND role='player';") == "1"

        # 4. In progress: nobody else may call the provider.
        rid = str(uuid.uuid4())
        q(claim(rid, ua, pa))
        checks["in_progress_no_second_call"] = [outcome(q(claim(rid, ua, pa))) for _ in range(3)] == ["IN_PROGRESS"] * 3

        # 6. Expired PROCESSING lease: never a blind takeover → OUTCOME_UNKNOWN (atomic, once).
        rid = str(uuid.uuid4())
        token = q(claim(rid, ua, pa)).split("|")[1]
        q(f"UPDATE public.coach_request_reservations SET lease_expires_at = now() - interval '1 second' WHERE request_id='{rid}';")
        results = sorted(outcome(r[1]) for r in concurrently(claim(rid, ua, pa), claim(rid, ua, pa)))
        checks["expired_processing_becomes_outcome_unknown"] = results == ["OUTCOME_UNKNOWN", "OUTCOME_UNKNOWN"]
        # 12. Retry after OUTCOME_UNKNOWN: still no owner.
        checks["outcome_unknown_never_retried"] = outcome(q(claim(rid, ua, pa))) == "OUTCOME_UNKNOWN"
        # The ORIGINAL holder arriving late may still complete (nobody else generated).
        q(complete(rid, token, "late but real"))
        checks["late_original_holder_resolves_unknown"] = outcome(q(claim(rid, ua, pa))) == "REPLAY"

        # 8. Provider failed before answering: FAILED; retry takes over atomically (one owner).
        rid = str(uuid.uuid4())
        token = q(claim(rid, ua, pa)).split("|")[1]
        failed = q(f"SELECT public.coach_fail_request('{rid}','{token}','FAILED','COACH_PROVIDER_RATE_LIMITED');")
        results = sorted(outcome(r[1]) for r in concurrently(claim(rid, ua, pa), claim(rid, ua, pa)))
        checks["failed_then_single_takeover"] = failed == "t" and results == ["ACQUIRED", "IN_PROGRESS"]
        # 7. The old executor (stale token) cannot write after losing the lease.
        rc, _, err = psql(complete(rid, token), check=False)
        checks["stale_executor_cannot_write"] = rc != 0 and "COACH_LEASE_LOST" in err and q(
            f"SELECT count(*) FROM public.coach_messages WHERE id='{rid}';") == "0"
        stale_fail = q(f"SELECT public.coach_fail_request('{rid}','{token}','FAILED','X');")
        checks["stale_executor_cannot_fail"] = stale_fail == "f"

        # 9 + 5. Provider answered, write failed → PERSIST_PENDING; two repairers: one owner,
        # who persists the KEPT reply (no generation).
        rid = str(uuid.uuid4())
        token = q(claim(rid, ua, pa, conv_a2)).split("|")[1]
        q(f"SELECT public.coach_persist_pending('{rid}','{token}','kept reply','ai-coach-v3|p','openrouter','openai/gpt-oss-20b');")
        both = concurrently(claim(rid, ua, pa, conv_a2), claim(rid, ua, pa, conv_a2))
        outs = sorted(outcome(r[1]) for r in both)
        winner = next(r[1] for r in both if outcome(r[1]) == "PERSIST_TAKEOVER")
        new_token, kept = winner.split("|")[1], winner.split("|")[3]
        q(complete(rid, new_token, kept))
        checks["persist_pending_single_repairer_no_generation"] = outs == ["IN_PROGRESS", "PERSIST_TAKEOVER"] and kept == "kept reply"
        checks["persist_pending_completed"] = q(
            f"SELECT status || content FROM public.coach_request_reservations r JOIN public.coach_messages m ON m.id = r.coach_message_id WHERE r.request_id='{rid}';"
        ) == "COMPLETEDkept reply"
        checks["old_token_after_persist_takeover_rejected"] = psql(complete(rid, token), check=False)[0] != 0

        # 10/11. A failed write is all-or-nothing (no question without its reply), and the
        # lease survives so the holder can keep the reply as PERSIST_PENDING.
        q("""CREATE FUNCTION public.fail_on_marker() RETURNS trigger LANGUAGE plpgsql AS $f$
             BEGIN IF NEW.content = 'FAIL_' || NEW.role::text THEN RAISE EXCEPTION 'injected write failure'; END IF;
             RETURN NEW; END $f$;
             CREATE TRIGGER fail_on_marker BEFORE INSERT ON public.coach_messages
             FOR EACH ROW EXECUTE FUNCTION public.fail_on_marker();""")
        atomic = True
        for marker in ("player", "coach"):
            rid = str(uuid.uuid4())
            token = q(claim(rid, ua, pa, conv_a)).split("|")[1]
            question, reply = ("FAIL_player", "ok") if marker == "player" else ("ok", "FAIL_coach")
            rc, _, err = psql(
                f"SELECT 1 FROM public.coach_complete_request('{rid}','{token}','t','{question}','{reply}','x','openrouter','m');",
                check=False)
            atomic &= rc != 0 and "injected write failure" in err
            atomic &= q(f"SELECT count(*) FROM public.coach_messages WHERE id='{rid}' OR context_id='{rid}';") == "0"
            atomic &= q(f"SELECT status FROM public.coach_request_reservations WHERE request_id='{rid}';") == "PROCESSING"
            atomic &= q(f"SELECT public.coach_persist_pending('{rid}','{token}','kept','x','openrouter','m');") == "t"
        checks["player_or_reply_write_failure_is_atomic"] = atomic
        # A conversation deleted mid-flight takes the reservation along; the late completion
        # cannot recreate it.
        rid = str(uuid.uuid4())
        conv_tmp = q(f"INSERT INTO public.coach_conversations (player_id) VALUES ('{pa}') RETURNING id;")
        token = q(claim(rid, ua, pa, conv_tmp)).split("|")[1]
        q(f"DELETE FROM public.coach_conversations WHERE id='{conv_tmp}';")
        rc, _, err = psql(complete(rid, token), check=False)
        checks["deleted_conversation_never_resurrected"] = rc != 0 and "COACH_LEASE_LOST" in err and q(
            f"SELECT count(*) FROM public.coach_messages WHERE id='{rid}' OR context_id='{rid}';") == "0" and q(
            f"SELECT count(*) FROM public.coach_conversations WHERE id='{conv_tmp}';") == "0"
        rid = str(uuid.uuid4())
        token = q(claim(rid, ua, pa, conv_a)).split("|")[1]
        rc, _, _ = psql(complete(rid, token, "").replace("'',", "'',", 1), check=False)  # empty reply
        checks["empty_reply_rejected_atomically"] = rc != 0 and q(
            f"SELECT count(*) FROM public.coach_messages WHERE id='{rid}';") == "0"

        # 13 + 16. Foreign ids reveal nothing; the same UUID in another conversation conflicts.
        rid = str(uuid.uuid4())
        token = q(claim(rid, ua, pa, conv_a)).split("|")[1]
        q(complete(rid, token, "secret of A"))
        foreign = q(claim(rid, ub, pb))
        checks["foreign_id_reveals_nothing"] = foreign == "CONFLICT|||"
        checks["same_uuid_other_conversation_conflicts"] = outcome(q(claim(rid, ua, pa, conv_a2))) == "CONFLICT"
        checks["same_uuid_other_question_conflicts"] = outcome(q(claim(rid, ua, pa, conv_a, SHA_OTHER))) == "CONFLICT"
        checks["player_not_owned_refused"] = outcome(q(claim(str(uuid.uuid4()), ua, pb))) == "NOT_OWNER"
        checks["conversation_not_owned_refused"] = outcome(q(claim(str(uuid.uuid4()), ub, pb, conv_a))) == "NOT_OWNER"

        # 14 + 15. anon / authenticated can neither reserve nor read the table.
        denied = True
        for role in ("anon", "authenticated"):
            for sql in (claim(str(uuid.uuid4()), ua, pa, pre=f"SET ROLE {role}; "),
                        f"SET ROLE {role}; SELECT count(*) FROM public.coach_request_reservations;",
                        f"SET ROLE {role}; SELECT public.coach_fail_request('{rid}','{uuid.uuid4()}','FAILED','X');",
                        f"SET ROLE {role}; " + complete(rid, str(uuid.uuid4()))):
                rc, _, err = psql(sql, check=False)
                denied &= rc != 0 and "permission denied" in err
        checks["anon_and_authenticated_denied"] = denied
        rc, out, err = psql("SET ROLE service_role; " + claim(str(uuid.uuid4()), ua, pa), check=False)
        checks["service_role_allowed"] = rc == 0 and outcome(out) == "ACQUIRED"
        if not checks["service_role_allowed"]:
            details["service_role_error"] = (out + err)[:300]

        # Legacy (Fase 3.3) messages whose id is a request id: never claimable again.
        legacy = str(uuid.uuid4())
        q(f"INSERT INTO public.coach_messages (id, conversation_id, role, content) VALUES ('{legacy}','{conv_a}','player','old');")
        q(f"INSERT INTO public.coach_messages (conversation_id, role, content, context_id) VALUES ('{conv_a}','coach','old reply','{legacy}');")
        checks["legacy_own_message_replays"] = outcome(q(claim(legacy, ua, pa))) == "REPLAY"
        checks["legacy_foreign_message_conflicts"] = q(claim(legacy, ub, pb)) == "CONFLICT|||"

        # Mutations: the proofs above must FAIL without atomic ownership / fencing.
        naive = re.sub(
            r"(INSERT INTO public\.coach_request_reservations AS t)",
            "IF EXISTS (SELECT 1 FROM public.coach_request_reservations x WHERE x.request_id = p_request_id) THEN\n"
            "    RETURN QUERY SELECT 'IN_PROGRESS'::text, NULL::uuid, NULL::integer, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text; RETURN;\n"
            "  END IF;\n  PERFORM pg_sleep(0.3);\n  \\1",
            migration, count=1)
        naive = naive.replace("ON CONFLICT (request_id) DO NOTHING;\n  IF FOUND THEN",
                              "ON CONFLICT (request_id) DO UPDATE SET updated_at = now();\n  IF FOUND THEN", 1)
        build("mutation_naive", naive)
        for user, player in users.values():
            q(f"INSERT INTO public.player_profiles VALUES ('{player}','{user}');", db="mutation_naive")
        double = 0
        for _ in range(5):
            rid = str(uuid.uuid4())
            results = [outcome(r[1]) for r in concurrently(claim(rid, ua, pa), claim(rid, ua, pa), db="mutation_naive")]
            double += results.count("ACQUIRED") == 2
        details["mutation_naive_claim_double_owner_runs"] = double
        checks["mutation_naive_claim_is_caught"] = double > 0

        no_fence = migration.replace(
            "IF NOT FOUND OR r.lease_token IS DISTINCT FROM p_lease_token\n     OR r.status",
            "IF NOT FOUND\n     OR r.status", 1)
        build("mutation_no_fencing", no_fence)
        q(f"INSERT INTO public.player_profiles VALUES ('{pa}','{ua}');", db="mutation_no_fencing")
        rid = str(uuid.uuid4())
        stale = q(claim(rid, ua, pa), db="mutation_no_fencing").split("|")[1]
        q(f"SELECT public.coach_fail_request('{rid}','{stale}','FAILED','X');", db="mutation_no_fencing")
        q(claim(rid, ua, pa), db="mutation_no_fencing")  # takeover → new token
        rc, _, _ = psql(complete(rid, stale), db="mutation_no_fencing", check=False)
        details["mutation_no_fencing_stale_write_succeeded"] = rc == 0
        checks["mutation_no_fencing_is_caught"] = rc == 0

        result = {
            "database": "disposable-local-postgresql",
            "independentConnections": True,
            "iterations": ITERATIONS,
            "checks": checks,
            "details": details,
            "failures": sorted(k for k, v in checks.items() if not v),
        }
    except Exception as error:  # noqa: BLE001 — reported, never swallowed
        result = {"database": "disposable-local-postgresql", "error": str(error)[:500], "checks": checks,
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
