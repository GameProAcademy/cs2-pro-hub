#!/usr/bin/env python3
"""Create the snapshot function on a LOCAL DISPOSABLE database inside a
transaction, call it, evaluate it, roll back. Proves the SQL runs and the
evaluator's rules on a repository-built database; says nothing about the
managed database."""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/queue"))
sys.path.insert(0, str(ROOT / "scripts/predem"))
import queue_semantics_probe as q  # noqa: E402
import managed_snapshot  # noqa: E402

SQL = (ROOT / "scripts/predem/managed_snapshot.sql").read_text()


def main() -> int:
    q.refuse_non_local()
    script = ("BEGIN;\n" + SQL + "\nSELECT 'SNAPSHOT:' || public.h3e_predem_managed_snapshot()::text;\n"
              "SELECT 'GRANTS:' || jsonb_build_object("
              "'service_role', has_function_privilege('service_role','public.h3e_predem_managed_snapshot()','EXECUTE'),"
              "'anon', has_function_privilege('anon','public.h3e_predem_managed_snapshot()','EXECUTE'),"
              "'authenticated', has_function_privilege('authenticated','public.h3e_predem_managed_snapshot()','EXECUTE'),"
              "'volatility', (SELECT provolatile FROM pg_proc WHERE oid='public.h3e_predem_managed_snapshot()'::regprocedure))::text;\n"
              "ROLLBACK;\n")
    out = subprocess.run(["psql", "-X", "-h", q.HOST, "-p", q.PORT, "-U", q.USER, "-d", q.DB, "-At",
                          "-v", "ON_ERROR_STOP=1", "-f", "-"], input=script, capture_output=True, text=True, timeout=60)
    lines = {l.split(":", 1)[0]: l.split(":", 1)[1] for l in out.stdout.splitlines() if l.startswith(("SNAPSHOT:", "GRANTS:"))}
    if out.returncode or "SNAPSHOT" not in lines:
        print("RESULT:" + json.dumps({"status": "FAIL", "error": out.stderr.strip()[-300:]}))
        return 1
    snapshot, grants = json.loads(lines["SNAPSHOT"]), json.loads(lines["GRANTS"])
    result = managed_snapshot.evaluate(snapshot, now=time.time(),
                                       expected_recorder_md5=snapshot["database"]["recorder_md5"])
    ok = (grants == {"service_role": True, "anon": False, "authenticated": False, "volatility": "s"}
          and result["snapshot_problem"] is None)
    print("RESULT:" + json.dumps({"status": "PASS" if ok else "FAIL", "database": "LOCAL_DISPOSABLE_ONLY",
                                  "grants": grants, "evaluation": result, "snapshot": snapshot}, sort_keys=True, indent=1))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
