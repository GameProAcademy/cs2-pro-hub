#!/usr/bin/env python3
"""Generate migration R5.8.9 — re-pin the attestation recorder to a runtime
that actually serves — from values verified after the deployment exists.

Nothing here may be run with guessed values. The input is a JSON file of
values observed read-only *after* the deployment that will be pinned exists
(Railway deployment id and commit, `/version` of both hosts, git). `verify`
re-derives every git-checkable value from the repository and refuses the
spec on any inconsistency; `generate` then writes the migration and its
rollback. The migration:

* starts only from md5(prosrc) `fe3250af…` (the managed definition, also the
  definition of every repository build after R5.8.7) or the target itself
  (re-run → no-op); anything else fails closed;
* substitutes each old pin inside its own context, checking the exact number
  of occurrences before substituting;
* asserts the target md5 computed here from the reference definition, and the
  signature, SECURITY DEFINER, search_path, owner, grants (service_role only)
  and the new comment, before and after;
* requires R5.8.8's state (replay controls present, deployment index absent);
* reads or writes no row, grant or index.

Usage:
  r5_8_9.py verify   SPEC.json
  r5_8_9.py generate SPEC.json OUT_MIGRATION.sql OUT_ROLLBACK.sql
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "docs/reference/record_parser_runtime_attestation.live-2026-10-12.sql"
START_MD5 = "fe3250af2b461f03f459adf36b43ec21"
FUNCTION = "public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)"
WORKER_DIR = "services/cs2-demo-parser"
CRITICAL = ("parser.py", "adapter.py", "worker.py", "raw_evidence.py", "settings.py")

OLD = {
    "branch": "infra/cs2-parser-worker-v8",
    "semantic_commit": "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76",
    "deployment_id": "1b5778de-3eaf-46f1-9ea5-cba381d95313",
    "deployment_commit": "91aeee853200d0f461d0d36af1781d7fdfa40941",
    "build_commit": "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76",
    "workflow_source_sha": "3070d8bae6c3f02093bbb2595138c913646c2e31",
    "critical": {
        "parser.py": "9d21670e47ddf330881e95a9d78c19074ccc0aea",
        "adapter.py": "34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71",
        "worker.py": "50a53b607d26f00b4de05c5e8998611959e27bd1",
        "raw_evidence.py": "750195c1218abd53cfc77b6e8d2fb4a88e31579e",
        "settings.py": "35eecfb06223812137a4a2f17114aae57cb7fe54",
    },
}
OLD_COMMENT = (
    "R5.8.5 reconciled recorder: current Railway deployment 1b5778de-3eaf-46f1-9ea5-cba381d95313, "
    "source commit 91aeee853200d0f461d0d36af1781d7fdfa40941, approved workflow blob "
    "3070d8bae6c3f02093bbb2595138c913646c2e31."
)
SHA = re.compile(r"^[0-9a-f]{40}$")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def substitutions(spec: dict[str, Any]) -> list[tuple[str, str, int]]:
    """(old fragment, new fragment, expected occurrences), each in its own context."""
    pairs = [
        ("_payload->>'railway_branch'<>'{}'", OLD["branch"], spec["branch"]),
        ("_payload->>'git_commit'<>'{}'", OLD["semantic_commit"], spec["semantic_commit"]),
        ("_payload->>'deployment_id'<>'{}'", OLD["deployment_id"], spec["deployment_id"]),
        ("_payload->>'semantic_revision'<>'git:{}'", OLD["semantic_commit"], spec["semantic_commit"]),
        ("_payload->>'build_revision'<>'git:{}'", OLD["build_commit"], spec["build_commit"]),
        ("'deployment_evidence'->>'source_commit'<>'{}'", OLD["deployment_commit"], spec["deployment_commit"]),
        ("_workflow->>'workflow_source_sha'<>'{}'", OLD["workflow_source_sha"], spec["workflow_source_sha"]),
        ("_attestor_source->>'workflow_source_sha'<>'{}'", OLD["workflow_source_sha"], spec["workflow_source_sha"]),
    ]
    pairs += [(f"_critical_hashes->'{WORKER_DIR}/{name}'->>'observed'<>'{{}}'", OLD["critical"][name],
               spec["critical_hashes"][name]) for name in CRITICAL]
    return [(template.format(old), template.format(new), 1) for template, old, new in pairs]


def comment(spec: dict[str, Any]) -> str:
    return (f"R5.8.9 re-pinned recorder: Railway deployment {spec['deployment_id']}, source and build commit "
            f"{spec['build_commit']}, semantic revision git:{spec['semantic_commit']}, branch {spec['branch']}, "
            f"approved workflow blob {spec['workflow_source_sha']}.")


def reference_body() -> str:
    text = REFERENCE.read_text(encoding="utf-8")
    match = re.search(r"AS \$function\$(.*)\$function\$", text, re.S)
    if not match:
        raise SystemExit("R5_8_9_REFERENCE_UNREADABLE")
    body = match.group(1)
    if hashlib.md5(body.encode()).hexdigest() != START_MD5:
        raise SystemExit("R5_8_9_REFERENCE_MD5_MISMATCH")
    return body


def target_md5(spec: dict[str, Any]) -> str:
    body = reference_body()
    for old, new, count in substitutions(spec):
        if body.count(old) != count:
            raise SystemExit(f"R5_8_9_REFERENCE_FRAGMENT_COUNT:{old[:60]}")
        body = body.replace(old, new)
    return hashlib.md5(body.encode()).hexdigest()


def _git(*args: str) -> str | None:
    out = subprocess.run(("git", *args), cwd=ROOT, capture_output=True, text=True, check=False)
    return out.stdout.strip() if out.returncode == 0 else None


def verify(spec: dict[str, Any]) -> list[str]:
    """Every reason the spec must not be used. Empty means consistent."""
    problems: list[str] = []
    for key in ("deployment_id", "branch", "semantic_commit", "build_commit", "deployment_commit",
                "workflow_source_sha", "critical_hashes", "observed"):
        if key not in spec:
            problems.append(f"MISSING:{key}")
    if problems:
        return problems
    if not UUID.match(str(spec["deployment_id"])):
        problems.append("DEPLOYMENT_ID_INVALID")
    if spec["deployment_id"] == OLD["deployment_id"]:
        problems.append("DEPLOYMENT_ID_IS_THE_REMOVED_ONE")
    for key in ("semantic_commit", "build_commit", "deployment_commit", "workflow_source_sha"):
        if not SHA.match(str(spec[key])):
            problems.append(f"{key.upper()}_INVALID")
    if spec["branch"] != "main":
        problems.append("BRANCH_NOT_MAIN")
    if spec["build_commit"] != spec["deployment_commit"]:
        problems.append("BUILD_COMMIT_IS_NOT_THE_DEPLOYMENT_COMMIT")
    hashes = spec["critical_hashes"] if isinstance(spec["critical_hashes"], dict) else {}
    if sorted(hashes) != sorted(CRITICAL) or not all(SHA.match(str(v)) for v in hashes.values()):
        problems.append("CRITICAL_HASHES_INVALID")
    observed = spec["observed"] if isinstance(spec["observed"], dict) else {}
    for key in ("railway_deployment", "version_hosts", "observed_at"):
        if not observed.get(key):
            problems.append(f"OBSERVATION_MISSING:{key}")
    if problems:
        return problems
    # Everything git can confirm is re-derived, never taken from the spec.
    for key in ("semantic_commit", "build_commit"):
        if _git("cat-file", "-e", f"{spec[key]}^{{commit}}") is None:
            problems.append(f"{key.upper()}_UNKNOWN_TO_GIT")
    if problems:
        return problems
    if _git("merge-base", "--is-ancestor", spec["build_commit"], "origin/main") is None:
        problems.append("BUILD_COMMIT_NOT_ON_MAIN")
    if _git("merge-base", "--is-ancestor", spec["semantic_commit"], spec["build_commit"]) is None:
        problems.append("SEMANTIC_COMMIT_NOT_AN_ANCESTOR_OF_THE_BUILD")
    if _git("rev-parse", f"{spec['semantic_commit']}:{WORKER_DIR}") != _git("rev-parse", f"{spec['build_commit']}:{WORKER_DIR}"):
        problems.append("SEMANTIC_TREE_DIFFERS_FROM_BUILD_TREE")
    for name in CRITICAL:
        if _git("rev-parse", f"{spec['build_commit']}:{WORKER_DIR}/{name}") != hashes[name]:
            problems.append(f"CRITICAL_HASH_NOT_THE_BUILD_BLOB:{name}")
    workflow = _git("rev-parse", "HEAD:.github/workflows/parser-runtime-attestation.yml")
    if workflow != spec["workflow_source_sha"]:
        problems.append("WORKFLOW_BLOB_NOT_THE_ONE_IN_THIS_TREE")
    hosts = observed["version_hosts"]
    if not isinstance(hosts, dict) or len(hosts) != 2:
        problems.append("VERSION_OBSERVATION_NEEDS_BOTH_HOSTS")
    else:
        for host, body in hosts.items():
            build = (body or {}).get("build") or {}
            parser = (body or {}).get("parser") or {}
            if (build.get("commit") != spec["build_commit"] or build.get("declared_revision_matches") is not True
                    or parser.get("build_revision") != f"git:{spec['build_commit']}"
                    or parser.get("semantic_revision") != f"git:{spec['semantic_commit']}"):
                problems.append(f"VERSION_OBSERVATION_DISAGREES:{host}")
    railway = observed["railway_deployment"]
    if (not isinstance(railway, dict) or railway.get("id") != spec["deployment_id"]
            or railway.get("status") != "SUCCESS" or railway.get("commitHash") != spec["deployment_commit"]
            or railway.get("branch") != spec["branch"]):
        problems.append("RAILWAY_OBSERVATION_DISAGREES")
    return problems


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _properties_check(label: str) -> str:
    return f"""
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE p.oid = _fn AND pg_catalog.pg_get_function_result(p.oid) = 'uuid' AND l.lanname = 'plpgsql'
        AND p.prokind = 'f' AND p.prosecdef AND p.provolatile = 'v' AND NOT p.proisstrict
        AND p.proconfig = ARRAY['search_path=""']::text[] AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    ) THEN RAISE EXCEPTION '{label}_RECORDER_PROPERTIES_INVALID (%)', _step USING ERRCODE = '55000'; END IF;
    IF NOT pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                  WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    THEN RAISE EXCEPTION '{label}_RECORDER_GRANTS_INVALID (%)', _step USING ERRCODE = '55000'; END IF;"""


def migration_sql(spec: dict[str, Any]) -> str:
    target = target_md5(spec)
    lines = []
    for old, new, count in substitutions(spec):
        lines.append(f"""      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, {_sql_literal(old)}, '')))
         <> {count} * pg_catalog.length({_sql_literal(old)}) THEN
        RAISE EXCEPTION 'R5_8_9_FRAGMENT_COUNT_INVALID: %', {_sql_literal(old[:80])} USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, {_sql_literal(old)}, {_sql_literal(new)});""")
    replacements = "\n".join(lines)
    return f"""-- R5.8.9 — re-pin the attestation recorder to the serving runtime.
-- Generated by scripts/repin/r5_8_9.py from values observed read-only after the
-- deployment existed (spec: deployment {spec['deployment_id']}, build {spec['build_commit']},
-- semantic git:{spec['semantic_commit']}). Starts only from md5 {START_MD5} or the
-- target {target}; reads or writes no row, grant or index.
DO $migration$
DECLARE
  _fn constant regprocedure := {_sql_literal(FUNCTION)}::regprocedure;
  _start constant text := {_sql_literal(START_MD5)};
  _target constant text := {_sql_literal(target)};
  _new_comment constant text := {_sql_literal(comment(spec))};
  _md5 text;
  _def text;
  _step text;
BEGIN
  -- R5.8.8's state is a precondition: replay controls present, deployment index absent.
  IF pg_catalog.to_regclass('public.parser_runtime_provenance_deployment_identity_idx') IS NOT NULL
     OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conname IN (
           'parser_runtime_provenance_attestation_digest_key', 'parser_attestation_nonces_pkey',
           'parser_attestation_nonces_attestation_digest_key')) <> 3 THEN
    RAISE EXCEPTION 'R5_8_9_R5_8_8_STATE_MISSING' USING ERRCODE = '55000';
  END IF;
  FOREACH _step IN ARRAY ARRAY['before', 'after'] LOOP
    IF _step = 'after' THEN
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
      IF _md5 = _target THEN
        RAISE NOTICE 'R5_8_9_RECORDER_ALREADY_PINNED';
      ELSIF _md5 = _start THEN
        _def := pg_catalog.pg_get_functiondef(_fn);
{replacements}
        EXECUTE _def;
        EXECUTE pg_catalog.format('COMMENT ON FUNCTION %s IS %L', _fn, _new_comment);
        SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
        IF _md5 IS DISTINCT FROM _target THEN
          RAISE EXCEPTION 'R5_8_9_RECORDER_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
        END IF;
      ELSE
        RAISE EXCEPTION 'R5_8_9_RECORDER_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
      END IF;
      IF pg_catalog.obj_description(_fn, 'pg_proc') IS DISTINCT FROM _new_comment THEN
        RAISE EXCEPTION 'R5_8_9_RECORDER_COMMENT_INVALID' USING ERRCODE = '55000';
      END IF;
    END IF;
{_properties_check('R5_8_9')}
  END LOOP;
END;
$migration$;
"""


def rollback_sql(spec: dict[str, Any]) -> str:
    target = target_md5(spec)
    lines = []
    for old, new, count in substitutions(spec):
        lines.append(f"""  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, {_sql_literal(new)}, '')))
     <> {count} * pg_catalog.length({_sql_literal(new)}) THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, {_sql_literal(new)}, {_sql_literal(old)});""")
    replacements = "\n".join(lines)
    return f"""-- Rollback of R5.8.9 (generated). Restores md5 {START_MD5} from {target} and the
-- previous comment; fails closed from any other state. Reads or writes no row: it
-- never needs or deletes any attestation, so it is allowed on the managed database.
DO $rollback$
DECLARE
  _fn constant regprocedure := {_sql_literal(FUNCTION)}::regprocedure;
  _md5 text;
  _def text;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> {_sql_literal(target)} THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.pg_get_functiondef(_fn);
{replacements}
  EXECUTE _def;
  EXECUTE pg_catalog.format('COMMENT ON FUNCTION %s IS %L', _fn, {_sql_literal(OLD_COMMENT)});
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> {_sql_literal(START_MD5)} THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
  END IF;
END;
$rollback$;
"""


def main(argv: list[str]) -> int:
    if len(argv) >= 3 and argv[1] in ("verify", "generate"):
        spec = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
        problems = verify(spec)
        print(json.dumps({"spec_consistent": not problems, "problems": problems}, sort_keys=True))
        if problems:
            return 1
        if argv[1] == "generate" and len(argv) == 5:
            Path(argv[3]).write_text(migration_sql(spec), encoding="utf-8")
            Path(argv[4]).write_text(rollback_sql(spec), encoding="utf-8")
            print(json.dumps({"target_md5": target_md5(spec)}))
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
