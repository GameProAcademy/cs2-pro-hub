#!/usr/bin/env python3
"""Behavioural proof of G.6-R4 (identity retention hold) on a DISPOSABLE PostgreSQL.

Starts a throw-away cluster (initdb, superuser `postgres`), creates the minimal tables
the deletion gate reads, installs the gate exactly as the reviewed migration
20260921055555 defines it, records every scenario's verdict, applies the real migration
20261014200000_g6_r4_identity_retention_hold.sql, and records the verdicts again.

Asserts: the expected reasons; that no verdict became MORE permissive (each after-verdict
equals the before-verdict or is IDENTITY_UNCONFIRMED_HOLD); grants and properties; the
re-run is a no-op; a drifted definition is refused. Writes nothing anywhere else.
Prints one JSON line `RESULT:{…}`; exit 0 only when every check passes.
"""
from __future__ import annotations

import json
import os
import pathlib
import random
import shutil
import subprocess
import sys
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
GATE_SOURCE = ROOT / "supabase/migrations/20260921055555_202993af-f5e4-4908-bc94-54882472b68d.sql"
MIGRATION = ROOT / "supabase/migrations/20261014200000_g6_r4_identity_retention_hold.sql"
START_MD5 = "e90fa6c7f5987a3c16c02fdb75160bcc"
TARGET_MD5 = "6eeda5bf93f9f7268c884b0f8c931efe"

BASE = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.uploads (id uuid PRIMARY KEY, user_id uuid NOT NULL, storage_path text);
CREATE TABLE public.demo_jobs (
  id uuid PRIMARY KEY, upload_id uuid NOT NULL REFERENCES public.uploads(id), user_id uuid NOT NULL,
  status text NOT NULL, storage_path text, storage_deleted_at timestamptz, storage_delete_verified_at timestamptz,
  worker_id text, lease_expires_at timestamptz, cleanup_claim_token uuid, cleanup_claim_expires_at timestamptz,
  retain_until timestamptz, match_id uuid, attachment_state text NOT NULL DEFAULT 'unattached',
  attachment_confirmation_status text NOT NULL DEFAULT 'not_required');
CREATE TABLE public.raw_demo_evidence_reports (job_id uuid, approved_for_canonical boolean, raw_audit_status text);
CREATE TABLE public.raw_evidence_artifacts (job_id uuid, upload_id uuid, status text, raw_status text, audit_status text, root_digest text);
CREATE TABLE public.match_sources (upload_id uuid, source text, match_id uuid);
"""

# (name, status, attachment_state, confirmation, retained_until_in_future, raw_and_canonical_ready, expected_after)
SCENARIOS = [
    ("processed_unattached_expired", "processed", "unattached", "not_required", False, False, "IDENTITY_UNCONFIRMED_HOLD"),
    ("processed_confirmed_ready", "processed", "attached", "user_confirmed", False, True, "ELIGIBLE"),
    ("processed_manual_selected_ready", "processed", "attached", "manual_selected", False, True, "ELIGIBLE"),
    ("processed_confirmed_not_admitted", "processed", "attached", "user_confirmed", False, False, "RAW_ADMISSION_INCOMPLETE"),
    ("processed_pending_confirmation", "processed", "attached", "pending_confirmation", False, True, "IDENTITY_UNCONFIRMED_HOLD"),
    ("processed_user_rejected", "processed", "attached", "user_rejected", False, True, "IDENTITY_UNCONFIRMED_HOLD"),
    ("failed_unattached", "failed", "unattached", "not_required", False, False, "IDENTITY_UNCONFIRMED_HOLD"),
    ("failed_confirmed", "failed", "attached", "user_confirmed", False, False, "ELIGIBLE"),
    ("blocked_raw_audit_unattached", "blocked_raw_audit", "unattached", "not_required", False, False, "IDENTITY_UNCONFIRMED_HOLD"),
    ("cancelled_unattached", "cancelled", "unattached", "not_required", False, False, "ELIGIBLE"),
    ("failed_unattached_retention_active", "failed", "unattached", "not_required", True, False, "RETENTION_ACTIVE"),
    ("pending_job", "pending", "unattached", "not_required", False, False, "JOB_NOT_TERMINAL"),
]


def main() -> int:
    root = pathlib.Path(tempfile.mkdtemp(prefix="g6r4-", dir="/tmp"))
    data = root / "data"
    port = random.randint(21000, 47000)
    user = ["setpriv", "--reuid=postgres", "--regid=postgres", "--clear-groups"] if os.geteuid() == 0 else []
    if user:
        shutil.chown(root, user="postgres", group="postgres")
    bindir = next((str(p) for p in sorted(pathlib.Path("/usr/lib/postgresql").glob("*/bin"))), "")
    env = {"PATH": f"{bindir}:{os.environ['PATH']}", "HOME": "/tmp", "LANG": "C"}

    def run(command: list[str]) -> str:
        result = subprocess.run(user + command, env=env, text=True, capture_output=True, timeout=60)
        if result.returncode:
            raise RuntimeError(result.stderr.strip()[-600:])
        return result.stdout.strip()

    def sql(command: str) -> str:
        return run(["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-h", str(root), "-p", str(port),
                    "-U", "postgres", "-d", "postgres", "-c", command])

    checks: dict[str, object] = {}
    started = False
    try:
        run(["initdb", "-D", str(data), "-A", "trust", "--no-locale", "-U", "postgres"])
        run(["pg_ctl", "-D", str(data), "-l", str(root / "pg.log"), "-o", f"-k {root} -p {port} -h ''", "-w", "start"])
        started = True
        sql(BASE)
        source = GATE_SOURCE.read_text()
        start = source.index("CREATE OR REPLACE FUNCTION public.evaluate_demo_deletion_gate(")
        end = source.index("GRANT EXECUTE ON FUNCTION public.evaluate_demo_deletion_gate(uuid) TO service_role;", start)
        sql(source[start:end] + "GRANT EXECUTE ON FUNCTION public.evaluate_demo_deletion_gate(uuid) TO service_role;")
        md5 = "SELECT md5(prosrc) FROM pg_proc WHERE oid='public.evaluate_demo_deletion_gate(uuid)'::regprocedure"
        assert sql(md5) == START_MD5, "reviewed start definition not reproduced"

        jobs = {}
        for name, status, attached, confirmation, active, ready, _ in SCENARIOS:
            user_id, upload_id, job_id, match_id = (str(uuid.uuid4()) for _ in range(4))
            path = f"{user_id}/{upload_id}.dem"
            retain = "now() + interval '1 day'" if active else "now() - interval '1 day'"
            sql(f"INSERT INTO public.uploads VALUES ('{upload_id}','{user_id}','{path}');"
                f"INSERT INTO public.demo_jobs (id, upload_id, user_id, status, storage_path, retain_until, match_id,"
                f" attachment_state, attachment_confirmation_status) "
                f"VALUES ('{job_id}','{upload_id}','{user_id}','{status}','{path}',{retain},'{match_id}',"
                f"'{attached}','{confirmation}')")
            if ready:
                sql(f"INSERT INTO public.raw_evidence_artifacts VALUES ('{job_id}','{upload_id}','ready','ready','approved','d');"
                    f"INSERT INTO public.match_sources VALUES ('{upload_id}','demo','{match_id}')")
            jobs[name] = job_id

        def verdicts() -> dict[str, str]:
            return {name: sql(f"SELECT public.evaluate_demo_deletion_gate('{job}')->>'reason'") for name, job in jobs.items()}

        before = verdicts()
        out = subprocess.run(user + ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", str(root), "-p", str(port), "-U", "postgres",
                                     "-d", "postgres", "-f", str(MIGRATION)], env=env, text=True, capture_output=True, timeout=60)
        assert out.returncode == 0, out.stderr[-600:]
        assert sql(md5) == TARGET_MD5, "target md5 not reached"
        after = verdicts()
        expected = {name: want for name, *_, want in SCENARIOS}
        assert after == expected, {"after": after, "expected": expected}
        loosened = {n: (before[n], after[n]) for n in jobs if after[n] not in (before[n], "IDENTITY_UNCONFIRMED_HOLD")}
        assert not loosened, {"verdict_loosened": loosened}
        checks["scenarios"] = {n: {"before": before[n], "after": after[n]} for n in jobs}

        for role, allowed in (("service_role", "t"), ("anon", "f"), ("authenticated", "f")):
            assert sql(f"SELECT has_function_privilege('{role}','public.evaluate_demo_deletion_gate(uuid)','EXECUTE')") == allowed, role
        assert sql("SELECT prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=\"\"']::text[] "
                   "FROM pg_proc WHERE oid='public.evaluate_demo_deletion_gate(uuid)'::regprocedure") == "t"
        checks["grants_and_properties"] = "PASS"

        rerun = subprocess.run(user + ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", str(root), "-p", str(port), "-U", "postgres",
                                       "-d", "postgres", "-f", str(MIGRATION)], env=env, text=True, capture_output=True, timeout=60)
        assert rerun.returncode == 0 and "G6_R4_ALREADY_IN_TARGET_STATE" in rerun.stderr, rerun.stderr[-400:]
        assert sql(md5) == TARGET_MD5
        checks["rerun"] = "NO_OP"

        sql("CREATE OR REPLACE FUNCTION public.evaluate_demo_deletion_gate(_job_id uuid) RETURNS jsonb LANGUAGE sql STABLE "
            "SECURITY DEFINER SET search_path = '' AS $$ SELECT '{}'::jsonb $$")
        drift = subprocess.run(user + ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", str(root), "-p", str(port), "-U", "postgres",
                                       "-d", "postgres", "-f", str(MIGRATION)], env=env, text=True, capture_output=True, timeout=60)
        assert drift.returncode != 0 and "G6_R4_UNEXPECTED_DEFINITION" in drift.stderr, drift.stderr[-400:]
        checks["drifted_definition"] = "REFUSED"
        print("RESULT:" + json.dumps({"status": "PASS", "database": "LOCAL_DISPOSABLE_ONLY", **checks}, sort_keys=True))
        return 0
    except Exception as error:  # noqa: BLE001 - reported, never hidden
        print("RESULT:" + json.dumps({"status": "FAIL", "error": str(error)[:1500], **checks}, sort_keys=True))
        return 1
    finally:
        if started:
            subprocess.run(user + ["pg_ctl", "-D", str(data), "-m", "immediate", "-w", "stop"], env=env, capture_output=True)
        shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
