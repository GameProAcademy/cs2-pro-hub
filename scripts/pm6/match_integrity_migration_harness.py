#!/usr/bin/env python3
"""PM6 C — disposable PostgreSQL proof of 20261114030000_pm6_match_integrity_decision.sql.

Applies the migration VERBATIM twice on a stub demo_jobs table and checks: nullable for jobs before
the contract, accepted shape, refused shapes (other contract, unknown status, missing fields),
write-once after the first decision. Prints JSON. `MI_MIGRATION` overrides the file (mutation).
"""
from __future__ import annotations

import json
import os
import pathlib
import random
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = pathlib.Path(os.environ.get("MI_MIGRATION") or
                         ROOT / "supabase/migrations/20261114030000_pm6_match_integrity_decision.sql")
STUB = "CREATE TABLE public.demo_jobs (id int PRIMARY KEY, status text NOT NULL DEFAULT 'processing');"
OK = ('{"contract":"cs2.match-integrity.v1","status":"MATCH_COMPLETED","eligible":true,'
      '"validRounds":24,"endedBy":"NORMAL","signals":[],"reasons":[]}')


def pg_bin(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in sorted(pathlib.Path("/usr/lib/postgresql").glob(f"*/bin/{name}"), reverse=True):
        return str(candidate)
    raise SystemExit(f"{name} not found")


def main() -> None:
    base = pathlib.Path(tempfile.mkdtemp(prefix="mi-", dir="/tmp"))
    data, port = base / "data", random.randint(20000, 45000)
    runner = os.environ.get("SECURITY_HARNESS_PG_USER", "lovable")
    as_user = ["setpriv", f"--reuid={runner}", f"--regid={runner}", "--clear-groups"] if os.geteuid() == 0 else []
    if os.geteuid() == 0:
        shutil.chown(base, user=runner, group=runner)
    env = {"PATH": os.environ.get("PATH", ""), "HOME": "/tmp", "LANG": "C"}
    checks: dict[str, bool] = {}
    started = False

    def psql(sql: str) -> tuple[int, str]:
        p = subprocess.run(as_user + [pg_bin("psql"), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", str(base),
                                      "-p", str(port), "-d", "postgres", "-c", sql],
                           text=True, env=env, capture_output=True, timeout=40, check=False)
        return p.returncode, (p.stdout + p.stderr).strip()

    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(STUB + " INSERT INTO public.demo_jobs (id) VALUES (1), (2), (3);")
        checks["migration_applies"] = psql(MIGRATION.read_text())[0] == 0
        checks["migration_reapplies"] = psql(MIGRATION.read_text())[0] == 0
        checks["existing_jobs_stay_null"] = psql("SELECT count(*) FROM public.demo_jobs WHERE match_integrity IS NULL;")[1] == "3"
        checks["accepts_contract_shape"] = psql(f"UPDATE public.demo_jobs SET match_integrity = '{OK}' WHERE id = 1;")[0] == 0
        bad = {
            "other_contract": OK.replace("cs2.match-integrity.v1", "cs2.match-integrity.v9"),
            "unknown_status": OK.replace("MATCH_COMPLETED", "MATCH_PROBABLY_OK"),
            "missing_valid_rounds": OK.replace('"validRounds":24,', ""),
            "eligible_not_boolean": OK.replace('"eligible":true', '"eligible":"yes"'),
        }
        for name, value in bad.items():
            checks[f"refuses_{name}"] = psql(f"UPDATE public.demo_jobs SET match_integrity = '{value}' WHERE id = 2;")[0] != 0
        rc, out = psql(f"UPDATE public.demo_jobs SET match_integrity = '{OK.replace('24', '25')}' WHERE id = 1;")
        checks["decision_is_write_once"] = rc != 0 and "MATCH_INTEGRITY_DECISION_IMMUTABLE" in out
        checks["other_columns_still_updatable"] = psql("UPDATE public.demo_jobs SET status = 'processed' WHERE id = 1;")[0] == 0
    finally:
        if started:
            subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-m", "immediate", "-w", "stop"],
                           env=env, capture_output=True, check=False)
        shutil.rmtree(base, ignore_errors=True)
    print(json.dumps({"database": "disposable-local-postgresql", "checks": checks,
                      "failures": sorted(k for k, v in checks.items() if not v)}, sort_keys=True))


if __name__ == "__main__":
    main()
