#!/usr/bin/env python3
"""Disposable two-session PostgreSQL proof for the demo upload lifecycle."""

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
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
ITERATIONS = int(os.environ.get("G5RF1_ITERATIONS", "50"))
DEBUG = os.environ.get("G5RF1_DEBUG") == "1"


def debug(message: str) -> None:
    if DEBUG:
        print(message, file=sys.stderr, flush=True)

SCHEMA = r"""
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA storage;
CREATE TABLE storage.objects (bucket_id text NOT NULL, name text NOT NULL, PRIMARY KEY(bucket_id,name));
CREATE TYPE public.upload_status AS ENUM
  ('pending','processing','processed','failed','cancel_requested','cancelled','blocked_raw_audit');
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.uploads (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id),
  type text NOT NULL, source text NOT NULL, file_name text NOT NULL,
  storage_path text, file_size bigint, mime_type text,
  status public.upload_status NOT NULL DEFAULT 'pending', error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
  demo_sha256 text, error_code text, attempt_number integer NOT NULL DEFAULT 1,
  supersedes_job_id uuid, replacement_reason text
);
CREATE TABLE public.demo_jobs (
  id uuid PRIMARY KEY, upload_id uuid NOT NULL UNIQUE REFERENCES public.uploads(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id), status public.upload_status NOT NULL DEFAULT 'pending',
  stage text NOT NULL DEFAULT 'queued', retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 2, queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz, heartbeat_at timestamptz, finished_at timestamptz,
  duration_ms integer, error_code text, error_message text, storage_path text,
  demo_sha256 text, file_size bigint, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), durable_dispatch_enabled boolean NOT NULL DEFAULT true,
  queue_message_id bigint, dispatch_attempt integer, lease_expires_at timestamptz, worker_id text,
  attempt_number integer NOT NULL DEFAULT 1, supersedes_job_id uuid REFERENCES public.demo_jobs(id),
  superseded_by_job_id uuid REFERENCES public.demo_jobs(id), replacement_reason text
);
ALTER TABLE public.uploads ADD CONSTRAINT uploads_supersedes_job_fk
  FOREIGN KEY (supersedes_job_id) REFERENCES public.demo_jobs(id);
CREATE UNIQUE INDEX demo_jobs_superseded_once_key ON public.demo_jobs(supersedes_job_id)
  WHERE supersedes_job_id IS NOT NULL;
CREATE UNIQUE INDEX uploads_user_demo_sha_active_key ON public.uploads(user_id,demo_sha256)
  WHERE demo_sha256 IS NOT NULL AND status IN ('pending','processing','cancel_requested');
CREATE TABLE public.raw_demo_evidence_reports (
  id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES public.demo_jobs(id),
  approved_for_canonical boolean NOT NULL DEFAULT false, raw_audit_status text NOT NULL
);
CREATE SCHEMA pgmq;
CREATE SEQUENCE pgmq.message_id;
CREATE TABLE pgmq.archived(message_id bigint PRIMARY KEY);
CREATE FUNCTION pgmq.archive(text,bigint) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN INSERT INTO pgmq.archived VALUES ($2) ON CONFLICT DO NOTHING; RETURN true; END $$;
CREATE FUNCTION public.dispatch_demo_parse_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $$ BEGIN
  IF NEW.status='pending' AND NEW.queue_message_id IS NULL THEN
    NEW.queue_message_id := nextval('pgmq.message_id'); NEW.dispatch_attempt := NEW.retry_count;
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER demo_jobs_dispatch_to_pgmq BEFORE INSERT OR UPDATE ON public.demo_jobs
FOR EACH ROW EXECUTE FUNCTION public.dispatch_demo_parse_message();
"""


def run(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, check=True, **kwargs)


def main() -> None:
    if ITERATIONS < 1 or ITERATIONS > 200:
        raise SystemExit("G5RF1_ITERATIONS must be between 1 and 200")
    base = pathlib.Path(tempfile.mkdtemp(prefix="g5rf1-postgres-", dir="/tmp"))
    data = base / "data"
    port = random.randint(20000, 45000)
    as_user = ["setpriv", "--reuid=lovable", "--regid=lovable", "--clear-groups"] if os.geteuid() == 0 else []
    if os.geteuid() == 0:
        shutil.chown(base, user="lovable", group="lovable")
    clean_env = {
        "PATH": os.environ.get("PATH", ""), "HOME": "/tmp", "LANG": "C",
        "PGOPTIONS": "-c statement_timeout=10000 -c lock_timeout=8000",
    }
    started = False
    failures = deadlocks = timeouts = successes = 0

    def psql(sql: str, *, tuples: bool = True) -> str:
        cmd = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", str(base), "-p", str(port), "-U", "lovable", "-d", "postgres"]
        if tuples:
            cmd += ["-A", "-t"]
        cmd += ["-c", sql]
        return run(cmd, env=clean_env, capture_output=True, timeout=15).stdout.strip()

    def run_concurrently(sql_a: str, sql_b: str) -> tuple[str, str]:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            a = pool.submit(psql, sql_a)
            b = pool.submit(psql, sql_b)
            return a.result(timeout=15), b.result(timeout=15)

    def seed(status: str, *, approved: bool = False, stale: bool = False) -> tuple[str, str, str, str]:
        user, upload, job = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
        sha = uuid.uuid4().hex + uuid.uuid4().hex
        heartbeat = "now()-interval '20 minutes'" if stale else "now()"
        lease = "now()-interval '1 minute'" if stale else "NULL"
        psql(f"""
          INSERT INTO public.profiles VALUES ('{user}');
          INSERT INTO public.uploads(id,user_id,type,source,file_name,file_size,status,demo_sha256,storage_path,attempt_number)
          VALUES ('{upload}','{user}','demo','manual','fixture.dem',65536,'{status}','{sha}','{user}/{upload}.dem',7);
          INSERT INTO public.demo_jobs(id,upload_id,user_id,status,stage,storage_path,demo_sha256,file_size,
            attempt_number,heartbeat_at,started_at,lease_expires_at,queue_message_id)
          VALUES ('{job}','{upload}','{user}','{status}','fixture','{user}/{upload}.dem','{sha}',65536,7,
            {heartbeat},{heartbeat},{lease},{'77' if stale else 'NULL'});
          {f"INSERT INTO public.raw_demo_evidence_reports(job_id,approved_for_canonical,raw_audit_status) VALUES ('{job}',true,'APPROVED');" if approved else ''}
        """)
        return user, upload, job, sha

    def reserve(user: str, new_upload: str, sha: str, delay: float = 0) -> str:
        prefix = f"SELECT pg_sleep({delay});" if delay else ""
        return prefix + f"SELECT public.reserve_demo_upload('{user}','{new_upload}','fixture.dem',65536,'{sha}')::text;"

    try:
        debug("initdb")
        run(as_user + ["initdb", "-D", str(data), "-A", "trust", "--no-locale"], env=clean_env, capture_output=True)
        debug("start")
        run(
            as_user
            + ["pg_ctl", "-D", str(data), "-l", str(base / "postgres.log"), "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
            env=clean_env,
            capture_output=True,
        )
        started = True
        debug("schema")
        psql(SCHEMA, tuples=False)
        debug("phase-j migration")
        psql((ROOT / "supabase/migrations/20260915100000_phase_j_lock_order_and_duplicate_contract.sql").read_text(), tuples=False)
        debug("g5-r migration")
        psql((ROOT / "supabase/migrations/20260918235817_30712b60-cf57-4adc-89e5-3fbd7bdee5a4.sql").read_text(), tuples=False)
        debug("sha and orphan hardening migrations")
        psql((ROOT / "supabase/migrations/20260919011719_62c1c4a0-6f2a-4675-a744-380268b3c69e.sql").read_text(), tuples=False)
        psql((ROOT / "supabase/migrations/20260919011805_5beed5e8-e404-4d72-82d4-253fa8610171.sql").read_text(), tuples=False)

        # A/C/D/E: simultaneous replacement, explicit no-job window, and concurrent enqueue.
        for _ in range(ITERATIONS):
            try:
                debug("seed blocked")
                user, _, old_job, sha = seed("blocked_raw_audit")
                upload_a, upload_b = str(uuid.uuid4()), str(uuid.uuid4())
                debug("concurrent reserve")
                result_a, result_b = run_concurrently(reserve(user, upload_a, sha), reserve(user, upload_b, sha))
                payloads = [json.loads(result_a.splitlines()[-1]), json.loads(result_b.splitlines()[-1])]
                new_ids = {p["upload_id"] for p in payloads}
                if len(new_ids) != 1 or sum(p["new_attempt"] for p in payloads) != 1:
                    raise AssertionError("concurrent reserve created an incoherent replacement")
                new_upload = new_ids.pop()
                debug("window")
                window = json.loads(psql(reserve(user, str(uuid.uuid4()), sha)).splitlines()[-1])
                if window != {**window, "job_id": None} or not window["duplicate"] or window["attempt_number"] != 8:
                    raise AssertionError("reserve-to-enqueue window contract mismatch")
                enqueue_sql = f"SELECT public.enqueue_demo_job('{new_upload}','{user}')::text;"
                debug("concurrent enqueue")
                enq_a, enq_b = run_concurrently(enqueue_sql, enqueue_sql)
                enqueued = [json.loads(enq_a.splitlines()[-1]), json.loads(enq_b.splitlines()[-1])]
                debug("state")
                state = json.loads(psql(f"""SELECT json_build_object(
                  'attempt8Uploads',(SELECT count(*) FROM public.uploads WHERE user_id='{user}' AND demo_sha256='{sha}' AND attempt_number=8),
                  'attempt9',(SELECT count(*) FROM public.uploads WHERE user_id='{user}' AND demo_sha256='{sha}' AND attempt_number=9),
                  'jobs',(SELECT count(*) FROM public.demo_jobs WHERE user_id='{user}' AND demo_sha256='{sha}' AND attempt_number=8),
                  'oldSuperseded',(SELECT superseded_by_job_id IS NOT NULL FROM public.demo_jobs WHERE id='{old_job}'),
                  'reason',(SELECT replacement_reason FROM public.demo_jobs WHERE user_id='{user}' AND attempt_number=8),
                  'sameJob',(SELECT count(DISTINCT id)=1 FROM public.demo_jobs WHERE user_id='{user}' AND attempt_number=8)
                )::text;"""))
                if state != {"attempt8Uploads": 1, "attempt9": 0, "jobs": 1, "oldSuperseded": True, "reason": "raw_audit_blocked", "sameJob": True}:
                    raise AssertionError(f"persisted invariant mismatch: {state}")
                if len({entry["job_id"] for entry in enqueued}) != 1 or sum(entry["queued"] for entry in enqueued) != 1:
                    raise AssertionError("concurrent enqueue was not idempotent")
                successes += 1
            except subprocess.TimeoutExpired:
                timeouts += 1
                failures += 1
            except subprocess.CalledProcessError as error:
                if "deadlock detected" in (error.stderr or ""):
                    deadlocks += 1
                failures += 1
            except Exception:
                failures += 1
                raise

        # F/G/H: terminal/stale replacement reasons under two real sessions.
        for status, reason, stale in [("failed", "failed", False), ("cancelled", "cancelled", False), ("processing", "stale", True)]:
            debug(f"terminal {status}")
            user, _, old_job, sha = seed(status, stale=stale)
            a, b = run_concurrently(reserve(user, str(uuid.uuid4()), sha), reserve(user, str(uuid.uuid4()), sha))
            results = [json.loads(a.splitlines()[-1]), json.loads(b.splitlines()[-1])]
            if sum(row["new_attempt"] for row in results) != 1 or {row["replacement_reason"] for row in results} != {reason}:
                raise AssertionError(f"{status} replacement mismatch")
            if stale and psql(f"SELECT status FROM public.demo_jobs WHERE id='{old_job}';") != "failed":
                raise AssertionError("stale job was not fenced")

        # I/J: approved processed is immutable; unapproved processed is replaced once.
        debug("processed approved")
        user, upload, job, sha = seed("processed", approved=True)
        a, b = run_concurrently(reserve(user, str(uuid.uuid4()), sha), reserve(user, str(uuid.uuid4()), sha))
        if any(json.loads(value.splitlines()[-1])["job_id"] != job for value in (a, b)):
            raise AssertionError("approved processed idempotency mismatch")
        if psql(f"SELECT count(*) FROM public.uploads WHERE user_id='{user}';") != "1":
            raise AssertionError("approved processed created replacement")
        debug("legacy")
        user, _, _, sha = seed("processed")
        a, b = run_concurrently(reserve(user, str(uuid.uuid4()), sha), reserve(user, str(uuid.uuid4()), sha))
        results = [json.loads(a.splitlines()[-1]), json.loads(b.splitlines()[-1])]
        if sum(row["new_attempt"] for row in results) != 1 or {row["replacement_reason"] for row in results} != {"legacy_unvalidated"}:
            raise AssertionError("legacy unvalidated mismatch")

        # Active SHA fence and exact function ACL/security attributes.
        debug("active fence")
        user = str(uuid.uuid4()); sha = uuid.uuid4().hex + uuid.uuid4().hex
        psql(f"INSERT INTO public.profiles VALUES ('{user}'); INSERT INTO public.uploads(id,user_id,type,source,file_name,status,demo_sha256) VALUES ('{uuid.uuid4()}','{user}','demo','manual','a.dem','pending','{sha}');")
        try:
            psql(f"INSERT INTO public.uploads(id,user_id,type,source,file_name,status,demo_sha256) VALUES ('{uuid.uuid4()}','{user}','demo','manual','b.dem','processing','{sha}');")
            raise AssertionError("active SHA index accepted two active attempts")
        except subprocess.CalledProcessError as error:
            if "uploads_user_demo_sha_active_key" not in (error.stderr or ""):
                raise
        debug("acl")
        acl = psql("""SELECT string_agg(p||':'||has_function_privilege(p,'public.reserve_demo_upload(uuid,uuid,text,bigint,text)','EXECUTE')||':'||has_function_privilege(p,'public.enqueue_demo_job(uuid,uuid)','EXECUTE'),', ' ORDER BY p) FROM unnest(ARRAY['anon','authenticated','service_role']) p;""")
        if acl != "anon:false:false, authenticated:false:false, service_role:true:true":
            raise AssertionError(f"ACL mismatch: {acl}")
        attrs = psql("""SELECT bool_and(p.prosecdef AND EXISTS (
          SELECT 1 FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%'
        )) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN ('reserve_demo_upload','enqueue_demo_job');""")
        if attrs != "t":
            raise AssertionError("SECURITY DEFINER/search_path mismatch")

        # N: old orphan without bytes is reconciled; a recent reservation and
        # an old reservation with a physical object remain untouched.
        debug("orphan reconciliation")
        user = str(uuid.uuid4()); sha = uuid.uuid4().hex + uuid.uuid4().hex
        recent, old_empty, old_stored = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
        psql(f"""
          INSERT INTO public.profiles VALUES ('{user}');
          INSERT INTO public.uploads(id,user_id,type,source,file_name,status,demo_sha256,storage_path,created_at)
          VALUES
            ('{recent}','{user}','demo','manual','recent.dem','pending','{sha}','{user}/{recent}.dem',now()),
            ('{old_empty}','{user}','demo','manual','old-empty.dem','pending','{'b' * 64}','{user}/{old_empty}.dem',now()-interval '20 minutes'),
            ('{old_stored}','{user}','demo','manual','old-stored.dem','pending','{'c' * 64}','{user}/{old_stored}.dem',now()-interval '20 minutes');
          INSERT INTO storage.objects(bucket_id,name) VALUES ('demos','{user}/{old_stored}.dem');
        """)
        if psql("SELECT public.reconcile_orphan_demo_uploads(15,25);") != "1":
            raise AssertionError("orphan reconciliation count mismatch")
        orphan_states = psql(f"SELECT string_agg(id::text||':'||status::text,',' ORDER BY id) FROM public.uploads WHERE id IN ('{recent}','{old_empty}','{old_stored}');")
        if f"{old_empty}:failed" not in orphan_states or f"{recent}:pending" not in orphan_states or f"{old_stored}:pending" not in orphan_states:
            raise AssertionError(f"orphan reconciliation state mismatch: {orphan_states}")

        # O: malformed hashes fail before insert through the RPC and at the
        # table constraint; no upload or job survives either transaction.
        debug("invalid sha rejection")
        invalid_user = str(uuid.uuid4()); invalid_upload = str(uuid.uuid4())
        psql(f"INSERT INTO public.profiles VALUES ('{invalid_user}');")
        try:
            psql(reserve(invalid_user, invalid_upload, "d" * 67))
            raise AssertionError("reserve accepted invalid SHA")
        except subprocess.CalledProcessError as error:
            if "INVALID_DEMO_SHA256" not in (error.stderr or ""):
                raise
        if psql(f"SELECT count(*) FROM public.uploads WHERE id='{invalid_upload}';") != "0":
            raise AssertionError("invalid reserve persisted an upload")
    finally:
        if started:
            subprocess.run(as_user + ["pg_ctl", "-D", str(data), "-m", "immediate", "-w", "stop"], env=clean_env, capture_output=True)
        shutil.rmtree(base, ignore_errors=True)

    print(json.dumps({
        "database": "disposable-local-postgresql", "postgresVersion": "17.9",
        "independentConnections": True, "iterations": ITERATIONS, "successes": successes,
        "failures": failures, "deadlocks": deadlocks, "timeouts": timeouts,
        "scenarios": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "N", "O"],
        "teardown": not base.exists(), "productionConnectionsUsed": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()