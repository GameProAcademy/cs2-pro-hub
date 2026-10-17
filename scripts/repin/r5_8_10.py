#!/usr/bin/env python3
"""Generate R5.8.10 — re-pin the attestation recorder and the provenance boundary
from the R5.8.9 runtime (deployment 09b50029, build c8c6d6ec) to the runtime that
serves now, from values observed read-only after that deployment existed.

R5.8.10 is a link in the same version chain as R5.8.9, never a replacement:

* its start state is exactly the R5.8.9 target (recorder md5 d7c325ba…, assertion
  b1576ce0…, workflow guard b9412b87…), recomputed here from the committed R5.8.9
  generator and spec, so a drift in either is detected before anything is written;
* every old pin is the committed R5.8.9 spec value, substituted inside its own
  context with an exact occurrence count;
* the rollback restores the R5.8.9 target definitions and comments, byte for byte;
* the R5.8.9 migrations, rollbacks and spec stay committed and unchanged.

`verify` reuses the R5.8.9 checks (git ancestry, critical blobs of the build commit,
workflow blob of this tree, both `/version` hosts, Railway observation) and adds the
R5.8.10 ones (a new deployment, a strictly newer build on main).

Usage:
  r5_8_10.py verify   SPEC.json
  r5_8_10.py generate SPEC.json OUT_RECORDER.sql OUT_RECORDER_ROLLBACK.sql OUT_BOUNDARY.sql OUT_BOUNDARY_ROLLBACK.sql
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import r5_8_9  # noqa: E402
import r5_8_9_boundary  # noqa: E402

ROOT = r5_8_9.ROOT
PREVIOUS_SPEC_PATH = ROOT / "docs/reference/r5_8_9/spec.json"
PREVIOUS_SPEC: dict[str, Any] = json.loads(PREVIOUS_SPEC_PATH.read_text(encoding="utf-8"))
LABEL = "R5_8_10"
FUNCTION = r5_8_9.FUNCTION
WORKER_DIR = r5_8_9.WORKER_DIR
CRITICAL = r5_8_9.CRITICAL
# The R5.8.9 targets, as read back from the managed database on 2026-10-14 (read-only).
START_MD5 = "d7c325bac1a98c6a7cac67a0f18ba08b"
BOUNDARY_START_MD5 = {
    "assert_verified_parser_provenance": "b1576ce0d085e7bc1961d37b34a432f2",
    "enforce_approved_attestation_workflow": "b9412b87a12d51a4fa0e68bafd23735a",
}
BOUNDARY = r5_8_9_boundary.FUNCTIONS
BOUNDARY_COMMENT = {
    "assert_verified_parser_provenance": (
        "R5.8.10 re-pinned provenance assertion: Railway deployment {deployment_id}, branch {branch}, "
        "semantic git:{semantic_commit}, build git:{build_commit}, approved workflow blob {workflow_source_sha}."),
    "enforce_approved_attestation_workflow": (
        "R5.8.10 re-pinned fail-closed persistence boundary using reviewed workflow Git blob "
        "{workflow_source_sha}."),
}


def _md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


# ----------------------------------------------------------------- recorder

def start_body() -> str:
    """The R5.8.9 target definition, rebuilt from the committed R5.8.9 generator and spec."""
    body = r5_8_9.reference_body()
    for old, new, count in r5_8_9.substitutions(PREVIOUS_SPEC):
        if body.count(old) != count:
            raise SystemExit(f"R5_8_10_PREVIOUS_FRAGMENT_COUNT:{old[:60]}")
        body = body.replace(old, new)
    if _md5(body) != START_MD5:
        raise SystemExit("R5_8_10_START_IS_NOT_THE_R5_8_9_TARGET")
    return body


def substitutions(spec: dict[str, Any]) -> list[tuple[str, str, int]]:
    """(old fragment, new fragment, expected occurrences); old values are the R5.8.9 spec's."""
    old = PREVIOUS_SPEC
    pairs = [
        ("_payload->>'railway_branch'<>'{}'", old["branch"], spec["branch"]),
        ("_payload->>'git_commit'<>'{}'", old["semantic_commit"], spec["semantic_commit"]),
        ("_payload->>'deployment_id'<>'{}'", old["deployment_id"], spec["deployment_id"]),
        ("_payload->>'semantic_revision'<>'git:{}'", old["semantic_commit"], spec["semantic_commit"]),
        ("_payload->>'build_revision'<>'git:{}'", old["build_commit"], spec["build_commit"]),
        ("'deployment_evidence'->>'source_commit'<>'{}'", old["deployment_commit"], spec["deployment_commit"]),
        ("_workflow->>'workflow_source_sha'<>'{}'", old["workflow_source_sha"], spec["workflow_source_sha"]),
        ("_attestor_source->>'workflow_source_sha'<>'{}'", old["workflow_source_sha"], spec["workflow_source_sha"]),
    ]
    pairs += [(f"_critical_hashes->'{WORKER_DIR}/{name}'->>'observed'<>'{{}}'", old["critical_hashes"][name],
               spec["critical_hashes"][name]) for name in CRITICAL]
    return [(template.format(o), template.format(n), 1) for template, o, n in pairs]


def target_body(spec: dict[str, Any]) -> str:
    body = start_body()
    for old, new, count in substitutions(spec):
        if body.count(old) != count:
            raise SystemExit(f"R5_8_10_FRAGMENT_COUNT:{old[:60]}")
        body = body.replace(old, new)
    for value in (PREVIOUS_SPEC["deployment_id"], PREVIOUS_SPEC["build_commit"], PREVIOUS_SPEC["semantic_commit"],
                  PREVIOUS_SPEC["workflow_source_sha"]):
        if value in body:
            raise SystemExit(f"R5_8_10_OLD_PIN_REMAINS:{value}")
    return body


def target_md5(spec: dict[str, Any]) -> str:
    return _md5(target_body(spec))


def comment(spec: dict[str, Any]) -> str:
    return (f"R5.8.10 re-pinned recorder: Railway deployment {spec['deployment_id']}, source and build commit "
            f"{spec['build_commit']}, semantic revision git:{spec['semantic_commit']}, branch {spec['branch']}, "
            f"approved workflow blob {spec['workflow_source_sha']}.")


def verify(spec: dict[str, Any]) -> list[str]:
    problems = r5_8_9.verify(spec)
    if any(problem.startswith("MISSING:") for problem in problems):
        return problems
    if spec["deployment_id"] == PREVIOUS_SPEC["deployment_id"]:
        problems.append("DEPLOYMENT_ID_IS_THE_R5_8_9_ONE")
    if spec["build_commit"] == PREVIOUS_SPEC["build_commit"]:
        problems.append("BUILD_COMMIT_IS_THE_R5_8_9_ONE")
    elif r5_8_9._git("merge-base", "--is-ancestor", PREVIOUS_SPEC["build_commit"], spec["build_commit"]) is None:
        problems.append("BUILD_COMMIT_DOES_NOT_DESCEND_FROM_THE_R5_8_9_BUILD")
    if spec["workflow_source_sha"] == PREVIOUS_SPEC["workflow_source_sha"]:
        problems.append("WORKFLOW_BLOB_NOT_REPINNED")
    return problems


def _lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def recorder_migration_sql(spec: dict[str, Any]) -> str:
    target = target_md5(spec)
    steps = "\n".join(f"""      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, {_lit(old)}, '')))
         <> {count} * pg_catalog.length({_lit(old)}) THEN
        RAISE EXCEPTION 'R5_8_10_FRAGMENT_COUNT_INVALID: %', {_lit(old[:80])} USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, {_lit(old)}, {_lit(new)});""" for old, new, count in substitutions(spec))
    return f"""-- R5.8.10 — re-pin the attestation recorder from the R5.8.9 runtime to the serving runtime.
-- Generated by scripts/repin/r5_8_10.py from docs/reference/r5_8_10/spec.json (observed read-only after
-- the deployment existed: deployment {spec['deployment_id']}, build {spec['build_commit']},
-- semantic git:{spec['semantic_commit']}). Starts only from the R5.8.9 target md5 {START_MD5} or the
-- R5.8.10 target {target}; reads or writes no row, grant or index.
DO $migration$
DECLARE
  _fn constant regprocedure := {_lit(FUNCTION)}::regprocedure;
  _start constant text := {_lit(START_MD5)};
  _target constant text := {_lit(target)};
  _new_comment constant text := {_lit(comment(spec))};
  _md5 text;
  _def text;
  _step text;
BEGIN
  -- R5.8.8's state is a precondition: replay controls present, deployment index absent.
  IF pg_catalog.to_regclass('public.parser_runtime_provenance_deployment_identity_idx') IS NOT NULL
     OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conname IN (
           'parser_runtime_provenance_attestation_digest_key', 'parser_attestation_nonces_pkey',
           'parser_attestation_nonces_attestation_digest_key')) <> 3 THEN
    RAISE EXCEPTION 'R5_8_10_R5_8_8_STATE_MISSING' USING ERRCODE = '55000';
  END IF;
  FOREACH _step IN ARRAY ARRAY['before', 'after'] LOOP
    IF _step = 'after' THEN
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
      IF _md5 = _target THEN
        RAISE NOTICE 'R5_8_10_RECORDER_ALREADY_PINNED';
      ELSIF _md5 = _start THEN
        _def := pg_catalog.pg_get_functiondef(_fn);
{steps}
        EXECUTE _def;
        EXECUTE pg_catalog.format('COMMENT ON FUNCTION %s IS %L', _fn, _new_comment);
        SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
        IF _md5 IS DISTINCT FROM _target THEN
          RAISE EXCEPTION 'R5_8_10_RECORDER_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
        END IF;
      ELSE
        RAISE EXCEPTION 'R5_8_10_RECORDER_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
      END IF;
      IF pg_catalog.obj_description(_fn, 'pg_proc') IS DISTINCT FROM _new_comment THEN
        RAISE EXCEPTION 'R5_8_10_RECORDER_COMMENT_INVALID' USING ERRCODE = '55000';
      END IF;
    END IF;
{r5_8_9._properties_check(LABEL)}
  END LOOP;
END;
$migration$;
"""


def recorder_rollback_sql(spec: dict[str, Any]) -> str:
    target = target_md5(spec)
    steps = "\n".join(f"""  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, {_lit(new)}, '')))
     <> {count} * pg_catalog.length({_lit(new)}) THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, {_lit(new)}, {_lit(old)});""" for old, new, count in substitutions(spec))
    return f"""-- Rollback of R5.8.10 (generated). Restores the R5.8.9 target md5 {START_MD5} from {target}
-- and the R5.8.9 comment; fails closed from any other state. Reads or writes no row: it never
-- needs or deletes any attestation, so it is allowed on the managed database.
DO $rollback$
DECLARE
  _fn constant regprocedure := {_lit(FUNCTION)}::regprocedure;
  _md5 text;
  _def text;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> {_lit(target)} THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.pg_get_functiondef(_fn);
{steps}
  EXECUTE _def;
  EXECUTE pg_catalog.format('COMMENT ON FUNCTION %s IS %L', _fn, {_lit(r5_8_9.comment(PREVIOUS_SPEC))});
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> {_lit(START_MD5)} THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
  END IF;
END;
$rollback$;
"""


# ----------------------------------------------------------------- boundary

def boundary_start_body(name: str) -> str:
    body = r5_8_9_boundary.target_body(name, PREVIOUS_SPEC)
    if _md5(body) != BOUNDARY_START_MD5[name]:
        raise SystemExit(f"R5_8_10B_START_IS_NOT_THE_R5_8_9B_TARGET:{name}")
    return body


def boundary_substitutions(name: str, spec: dict[str, Any]) -> list[tuple[str, str]]:
    old = PREVIOUS_SPEC
    if name == "assert_verified_parser_provenance":
        pairs = [
            ("_p.railway_branch<>'{}'", old["branch"], spec["branch"]),
            ("_p.deployment_id<>'{}'", old["deployment_id"], spec["deployment_id"]),
            # deployment_commit holds the payload's git_commit (the semantic commit), as the recorder writes it.
            ("_p.deployment_commit<>'{}'", old["semantic_commit"], spec["semantic_commit"]),
            ("_p.semantic_revision<>'git:{}'", old["semantic_commit"], spec["semantic_commit"]),
            ("_p.build_revision<>'git:{}'", old["build_commit"], spec["build_commit"]),
            ("_p.workflow_identity->>'workflow_source_sha'<>'{}'", old["workflow_source_sha"],
             spec["workflow_source_sha"]),
            ("'attestor_source_identity'->>'workflow_source_sha'<>'{}'", old["workflow_source_sha"],
             spec["workflow_source_sha"]),
        ]
    else:
        pairs = [
            ("NEW.workflow_identity->>'workflow_source_sha' <> '{}'", old["workflow_source_sha"],
             spec["workflow_source_sha"]),
            ("'attestor_source_identity'->>'workflow_source_sha' <> '{}'", old["workflow_source_sha"],
             spec["workflow_source_sha"]),
        ]
    return [(template.format(o), template.format(n)) for template, o, n in pairs]


def boundary_target_body(name: str, spec: dict[str, Any]) -> str:
    body = boundary_start_body(name)
    for old, new in boundary_substitutions(name, spec):
        if body.count(old) != 1 or new != old and body.count(new) != 0:
            raise SystemExit(f"R5_8_10B_SUBSTITUTION_PRECONDITION:{name}:{old[:60]}")
        body = body.replace(old, new)
    for value in (PREVIOUS_SPEC["deployment_id"], PREVIOUS_SPEC["build_commit"], PREVIOUS_SPEC["semantic_commit"],
                  PREVIOUS_SPEC["workflow_source_sha"]):
        if value in body:
            raise SystemExit(f"R5_8_10B_OLD_PIN_REMAINS:{name}:{value}")
    return body


def boundary_target_md5(name: str, spec: dict[str, Any]) -> str:
    return _md5(boundary_target_body(name, spec))


def _boundary_properties(name: str, label: str) -> str:
    return r5_8_9_boundary._properties(name, label).replace("R5_8_9B_", "R5_8_10B_")


def _boundary_block(name: str, spec: dict[str, Any], *, forward: bool) -> str:
    f = BOUNDARY[name]
    start, target = BOUNDARY_START_MD5[name], boundary_target_md5(name, spec)
    begin, end = (start, target) if forward else (target, start)
    pairs = boundary_substitutions(name, spec)
    pairs = pairs if forward else [(n, o) for o, n in pairs]
    new_comment = (BOUNDARY_COMMENT[name] if forward else r5_8_9_boundary.FUNCTIONS[name]["comment"])
    new_comment = new_comment.format(**(spec if forward else PREVIOUS_SPEC))
    steps = "".join(f"""
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, {_lit(o)}, '')))
         <> pg_catalog.length({_lit(o)}) THEN
        RAISE EXCEPTION 'R5_8_10B_FRAGMENT_COUNT_INVALID ({name})' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, {_lit(o)}, {_lit(n)});""" for o, n in pairs)
    return f"""
DO $r5810b$
DECLARE
  _fn constant regprocedure := {_lit(f['signature'])}::regprocedure;
  _md5 text;
  _def text;
BEGIN{_boundary_properties(name, 'before')}
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 = {_lit(end)} THEN
    RAISE NOTICE 'R5_8_10B_ALREADY_IN_TARGET_STATE ({name})';
  ELSIF _md5 = {_lit(begin)} THEN
    _def := pg_catalog.pg_get_functiondef(_fn);{steps}
    EXECUTE _def;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
    IF _md5 IS DISTINCT FROM {_lit(end)} THEN
      RAISE EXCEPTION 'R5_8_10B_POSTCONDITION_INVALID ({name}): %', _md5 USING ERRCODE = '55000';
    END IF;
    COMMENT ON FUNCTION {f['signature']} IS {_lit(new_comment)};
  ELSE
    RAISE EXCEPTION 'R5_8_10B_UNEXPECTED_DEFINITION ({name}): %', _md5 USING ERRCODE = '55000';
  END IF;{_boundary_properties(name, 'after')}
END;
$r5810b$;
"""


def boundary_migration_sql(spec: dict[str, Any]) -> str:
    header = (f"-- R5.8.10b — re-pin the provenance persistence boundary from the R5.8.9b targets (generated by\n"
              f"-- scripts/repin/r5_8_10.py from docs/reference/r5_8_10/spec.json: deployment {spec['deployment_id']},\n"
              f"-- branch {spec['branch']}, semantic git:{spec['semantic_commit']}, build git:{spec['build_commit']},\n"
              f"-- workflow blob {spec['workflow_source_sha']}). Each function starts only from its R5.8.9b target\n"
              f"-- md5 or its R5.8.10b target; reads or writes no row, grant, trigger or index.\n")
    return header + "".join(_boundary_block(n, spec, forward=True) for n in BOUNDARY)


def boundary_rollback_sql(spec: dict[str, Any]) -> str:
    header = ("-- Rollback of R5.8.10b (generated). Restores the R5.8.9b target definitions and comments;\n"
              "-- fails closed from any other state. Reads or writes no row: allowed on the managed database.\n")
    return header + "".join(_boundary_block(n, spec, forward=False) for n in BOUNDARY)


def targets(spec: dict[str, Any]) -> dict[str, str]:
    return {"record_parser_runtime_attestation": target_md5(spec),
            **{n: boundary_target_md5(n, spec) for n in BOUNDARY}}


def main(argv: list[str]) -> int:
    if len(argv) >= 3 and argv[1] in ("verify", "generate"):
        spec = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
        problems = verify(spec)
        print(json.dumps({"spec_consistent": not problems, "problems": problems}, sort_keys=True))
        if problems:
            return 1
        if argv[1] == "generate" and len(argv) == 7:
            Path(argv[3]).write_text(recorder_migration_sql(spec), encoding="utf-8")
            Path(argv[4]).write_text(recorder_rollback_sql(spec), encoding="utf-8")
            Path(argv[5]).write_text(boundary_migration_sql(spec), encoding="utf-8")
            Path(argv[6]).write_text(boundary_rollback_sql(spec), encoding="utf-8")
            print(json.dumps(targets(spec), sort_keys=True))
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
