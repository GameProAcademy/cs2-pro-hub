"""Disposable PostgreSQL proof; synthetic identities only, never a DEM or live DB."""
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
MIGRATIONS = (
    "20260926020606_0ba1725a-4f21-4c1e-8d4a-68d3b81b0037.sql",
    "20260926030030_f488bae4-e05f-48cb-a00d-bd396e374e49.sql",
    "20260926030143_2adf7bc6-223e-454f-a120-e81a157f3e0b.sql",
    "20260926030840_c41e0dea-f0d1-4596-9f5d-6b1d1ba34912.sql",
)
BASE = (ROOT / "supabase/migrations/20260926013427_db74f397-2274-4c39-ba28-c6a87d80e314.sql").read_text().split(
    "-- Correct the previously deployed mutable-job diagnostic:"
)[0]


def quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def main():
    root = pathlib.Path(tempfile.mkdtemp(prefix="h3e91-writer-", dir="/tmp"))
    data = root / "data"
    port = random.randint(21000, 47000)
    user = ["setpriv", "--reuid=lovable", "--regid=lovable", "--clear-groups"] if os.geteuid() == 0 else []
    if user:
        shutil.chown(root, user="lovable", group="lovable")
    env = {"PATH": os.environ["PATH"], "HOME": "/tmp", "LANG": "C", "PGOPTIONS": "-c statement_timeout=10000 -c lock_timeout=8000"}

    def run(command, **kw):
        return subprocess.run(user + command, env=env, text=True, check=True, capture_output=True, timeout=20, **kw).stdout.strip()

    def sql(command):
        return run(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", str(root), "-p", str(port), "-d", "postgres", "-c", command])

    started = False
    try:
        run(["initdb", "-D", str(data), "-A", "trust", "--no-locale"])
        run(["pg_ctl", "-D", str(data), "-l", str(root / "postgres.log"), "-o", f"-k {root} -p {port} -h ''", "-w", "start"])
        started = True
        sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE sandbox_exec; CREATE ROLE service_role; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;")
        sql(BASE)
        for migration in MIGRATIONS:
            sql((ROOT / "supabase/migrations" / migration).read_text())
        assert sql("SELECT has_table_privilege('service_role','public.h3e91_execution_evidence_ledger','INSERT')") == "f"
        assert sql("SELECT has_function_privilege('service_role',p.oid,'EXECUTE') FROM pg_proc p WHERE proname='h3e91_record_execution_event'") == "t"

        for case in range(30):
            execution, upload, correlation, job = (str(uuid.uuid4()) for _ in range(4))
            event = str(uuid.uuid4())
            args = [event, execution, "EXECUTION_INTENT", upload, correlation, job, 1, None, None, None, None, None, "APP_REMOTE_PARSER", "APP", None, None, 1]
            def call(values):
                return json.loads(sql("SELECT public.h3e91_record_execution_event(" + ",".join(map(quote, values)) + ")::text"))
            if case % 3 == 0:
                pair = [args, args.copy()]
                expected = {"INSERTED", "IDEMPOTENT_REPLAY"}
            elif case % 3 == 1:
                other = args.copy(); other[0] = str(uuid.uuid4()); other[5] = str(uuid.uuid4())
                pair = [args, other]
                expected = {"INSERTED", "REJECTED"}
            else:
                other = args.copy(); other[5] = str(uuid.uuid4())
                pair = [args, other]
                expected = {"INSERTED", "REJECTED"}
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(call, row) for row in pair]
                results = [f.result(timeout=15) for f in futures]
            assert {item["status"] for item in results} == expected, (case, results)
            assert sql(f"SELECT count(*) FROM public.h3e91_execution_evidence_ledger WHERE execution_id='{execution}'") == "1"
            print(f"case {case + 1}/30: {','.join(sorted(expected))}")
        print("PASS: 30 concurrent two-connection cases; 30 rows, no live data")
    finally:
        if started:
            run(["pg_ctl", "-D", str(data), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(root)


if __name__ == "__main__":
    main()