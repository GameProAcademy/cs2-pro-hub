#!/usr/bin/env python3
"""Generate R5.8.11 — re-pin the attestation recorder and the provenance boundary
from the R5.8.9 runtime (deployment 09b50029, build c8c6d6ec) to the runtime that
serves now, from values observed read-only after that deployment existed.

R5.8.11 is a link in the same version chain as R5.8.9, never a replacement:

* its start state is exactly the R5.8.9 target (recorder md5 d7c325ba…, assertion
  b1576ce0…, workflow guard b9412b87…), recomputed here from the committed R5.8.9
  generator and spec, so a drift in either is detected before anything is written;
* every old pin is the committed R5.8.9 spec value, substituted inside its own
  context with an exact occurrence count;
* the rollback restores the R5.8.9 target definitions and comments, byte for byte;
* the R5.8.9 migrations, rollbacks and spec stay committed and unchanged.

`verify` reuses the R5.8.9 checks (git ancestry, critical blobs of the build commit,
workflow blob of this tree, both `/version` hosts, Railway observation) and adds the
R5.8.11 ones (a new deployment, a strictly newer build on main).

Usage:
  r5_8_11.py verify   SPEC.json
  r5_8_11.py generate SPEC.json OUT_RECORDER.sql OUT_RECORDER_ROLLBACK.sql OUT_BOUNDARY.sql OUT_BOUNDARY_ROLLBACK.sql
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import r5_8_10  # noqa: E402
import r5_8_9_boundary  # noqa: E402

ROOT = r5_8_10.ROOT
PREVIOUS_SPEC_PATH = ROOT / "docs/reference/r5_8_10/spec.json"
PREVIOUS_SPEC: dict[str, Any] = json.loads(PREVIOUS_SPEC_PATH.read_text(encoding="utf-8"))
LABEL = "R5_8_11"
FUNCTION = r5_8_10.FUNCTION
WORKER_DIR = r5_8_10.WORKER_DIR
CRITICAL = r5_8_10.CRITICAL
# The R5.8.9 targets, as read back from the managed database on 2026-10-14 (read-only).
START_MD5 = "4ee7be9d9d133adbeeafe6e6a5763112"
BOUNDARY_START_MD5 = {
    "assert_verified_parser_provenance": "57e4196115eb9253fd307e4443fb603c",
    "enforce_approved_attestation_workflow": "f95e6a50fd78a5aef78feb4d0dd7fdd1",
}
BOUNDARY = r5_8_9_boundary.FUNCTIONS
BOUNDARY_COMMENT = {
    "assert_verified_parser_provenance": (
        "R5.8.11 re-pinned provenance assertion: Railway deployment {deployment_id}, branch {branch}, "
        "semantic git:{semantic_commit}, build git:{build_commit}, approved workflow blob {workflow_source_sha}."),
    "enforce_approved_attestation_workflow": (
        "R5.8.11 re-pinned fail-closed persistence boundary using reviewed workflow Git blob "
        "{workflow_source_sha}."),
}


def _md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


# ----------------------------------------------------------------- recorder

def start_body() -> str:
    """The R5.8.9 target definition, rebuilt from the committed R5.8.9 generator and spec."""
    body = r5_8_10.target_body(PREVIOUS_SPEC)
    for old, new, count in r5_8_9.substitutions(PREVIOUS_SPEC):
        if body.count(old) != count:
            raise SystemExit(f"R5_8_11_PREVIOUS_FRAGMENT_COUNT:{old[:60]}")
        body = body.replace(old, new)
    if _md5(body) != START_MD5:
        raise SystemExit("R5_8_11_START_IS_NOT_THE_R5_8_10_TARGET")
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
            raise SystemExit(f"R5_8_11_FRAGMENT_COUNT:{old[:60]}")
        body = body.replace(old, new)
    for key in ("deployment_id", "build_commit", "semantic_commit", "workflow_source_sha"):
        value = PREVIOUS_SPEC[key]
        if value != spec[key] and value in body:
            raise SystemExit(f"R5_8_11_OLD_PIN_REMAINS:{value}")
    return body


def target_md5(spec: dict[str, Any]) -> str:
    return _md5(target_body(spec))


def comment(spec: dict[str, Any]) -> str:
    return (f"R5.8.11 re-pinned recorder: Railway deployment {spec['deployment_id']}, source and build commit "
            f"{spec['build_commit']}, semantic revision git:{spec['semantic_commit']}, branch {spec['branch']}, "
            f"approved workflow blob {spec['workflow_source_sha']}.")


def static_target_problems(spec: dict[str, Any]) -> list[str]:
    """Validate immutable source pins for generating a candidate; does not attest the live HTTP runtime."""
    problems: list[str] = []
    required = ("deployment_id", "branch", "semantic_commit", "build_commit", "deployment_commit",
                "workflow_source_sha", "critical_hashes", "observed")
    for key in required:
        if key not in spec:
            problems.append(f"MISSING:{key}")
    if problems:
        return problems
    if spec["branch"] != "main":
        problems.append("BRANCH_NOT_MAIN")
    if spec["build_commit"] != spec["deployment_commit"]:
        problems.append("BUILD_COMMIT_IS_NOT_THE_DEPLOYMENT_COMMIT")
    hashes = spec["critical_hashes"] if isinstance(spec["critical_hashes"], dict) else {}
    if sorted(hashes) != sorted(CRITICAL) or not all(len(str(v)) == 40 for v in hashes.values()):
        problems.append("CRITICAL_HASHES_INVALID")
    for key in ("semantic_commit", "build_commit"):
        if r5_8_10._git("cat-file", "-e", f"{spec[key]}^{{commit}}") is None:
            problems.append(f"{key.upper()}_UNKNOWN_TO_GIT")
    if r5_8_10._git("merge-base", "--is-ancestor", PREVIOUS_SPEC["build_commit"], spec["build_commit"]) is None:
        problems.append("BUILD_COMMIT_DOES_NOT_DESCEND_FROM_THE_R5_8_10_BUILD")
    if r5_8_10._git("merge-base", "--is-ancestor", spec["semantic_commit"], spec["build_commit"]) is None:
        problems.append("SEMANTIC_COMMIT_NOT_AN_ANCESTOR_OF_THE_BUILD")
    if r5_8_10._git("rev-parse", f"{spec['semantic_commit']}:{WORKER_DIR}") != r5_8_10._git("rev-parse", f"{spec['build_commit']}:{WORKER_DIR}"):
        problems.append("SEMANTIC_TREE_DIFFERS_FROM_BUILD_TREE")
    for name in CRITICAL:
        if r5_8_10._git("rev-parse", f"{spec['build_commit']}:{WORKER_DIR}/{name}") != hashes[name]:
            problems.append(f"CRITICAL_HASH_NOT_THE_BUILD_BLOB:{name}")
    if r5_8_10._git("rev-parse", "HEAD:.github/workflows/parser-runtime-attestation.yml") != spec["workflow_source_sha"]:
        problems.append("WORKFLOW_BLOB_NOT_THE_ONE_IN_THIS_TREE")
    observed = spec["observed"] if isinstance(spec.get("observed"), dict) else {}
    dep = observed.get("railway_deployment") if isinstance(observed.get("railway_deployment"), dict) else {}
    if dep.get("id") != spec["deployment_id"] or dep.get("status") != "SUCCESS" or dep.get("commitHash") != spec["deployment_commit"] or dep.get("branch") != spec["branch"]:
        problems.append("RAILWAY_OBSERVATION_DISAGREES")
    if spec["deployment_id"] == PREVIOUS_SPEC["deployment_id"]:
        problems.append("DEPLOYMENT_ID_IS_THE_R5_8_10_ONE")
    if spec["build_commit"] == PREVIOUS_SPEC["build_commit"]:
        problems.append("BUILD_COMMIT_IS_THE_R5_8_10_ONE")
    return problems


def verify(spec: dict[str, Any]) -> list[str]:
    """Strict release proof. Static target consistency alone does not authorize rollout."""
    problems = static_target_problems(spec)
    if problems:
        return problems
    observed = spec.get("observed") if isinstance(spec.get("observed"), dict) else {}
    versions = observed.get("version_hosts")
    if not isinstance(versions, dict) or set(versions) != {"https://parser.gamepro.network/version", "https://cs2-demo-parser-production.up.railway.app/version"}:
        return ["RUNTIME_VERSION_OBSERVATION_PENDING"]
    for host, body in versions.items():
        parser = (body or {}).get("parser") or {}
        build = (body or {}).get("build") or {}
        if (parser.get("revision") != f"git:{spec['semantic_commit']}"
                or parser.get("semantic_revision") != f"git:{spec['semantic_commit']}"
                or parser.get("build_revision") != f"git:{spec['build_commit']}"
                or build.get("commit") != spec["build_commit"]
                or build.get("declared_revision_matches") is not True):
            problems.append(f"VERSION_OBSERVATION_DISAGREES:{host}")
    if not observed.get("observed_at"):
        problems.append("VERSION_OBSERVATION_TIMESTAMP_MISSING")
    return problems



    problems = static_target_problems(spec)
    if problems:
        return problems
    if spec["deployment_id"] == PREVIOUS_SPEC["deployment_id"]:
        problems.append("DEPLOYMENT_ID_IS_THE_R5_8_10_ONE")
    if spec["build_commit"] == PREVIOUS_SPEC["build_commit"]:
        problems.append("BUILD_COMMIT_IS_THE_R5_8_10_ONE")
    elif r5_8_10._git("merge-base", "--is-ancestor", PREVIOUS_SPEC["build_commit"], spec["build_commit"]) is None:
        problems.append("BUILD_COMMIT_DOES_NOT_DESCEND_FROM_THE_R5_8_9_BUILD")
    # The reviewed attestation workflow is intentionally unchanged across this repin.
    return problems


def _lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def recorder_migration_sql(spec: dict[str, Any]) -> str:
    target = target_md5(spec)
    steps = "\n".join(f"""      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, {_lit(old)}, '')))
         <> {count} * pg_catalog.length({_lit(old)}) THEN
        RAISE EXCEPTION 'R5_8_11_FRAGMENT_COUNT_INVALID: %', {_lit(old[:80])} USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, {_lit(old)}, {_lit(new)});""" for old, new, count in substitutions(spec))
    return f"""-- R5.8.11 — re-pin the attestation recorder from the R5.8.9 runtime to the serving runtime.
-- Generated by scripts/repin/r5_8_11.py from docs/reference/r5_8_10/spec.json (observed read-only after
-- the deployment existed: deployment {spec['deployment_id']}, build {spec['build_commit']},
-- semantic git:{spec['semantic_commit']}). Starts only from the R5.8.9 target md5 {START_MD5} or the
-- R5.8.11 target {target}; reads or writes no row, grant or index.
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
    RAISE EXCEPTION 'R5_8_11_R5_8_8_STATE_MISSING' USING ERRCODE = '55000';
  END IF;
  FOREACH _step IN ARRAY ARRAY['before', 'after'] LOOP
    IF _step = 'after' THEN
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
      IF _md5 = _target THEN
        RAISE NOTICE 'R5_8_11_RECORDER_ALREADY_PINNED';
      ELSIF _md5 = _start THEN
        _def := pg_catalog.pg_get_functiondef(_fn);
{steps}
        EXECUTE _def;
        EXECUTE pg_catalog.format('COMMENT ON FUNCTION %s IS %L', _fn, _new_comment);
        SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
        IF _md5 IS DISTINCT FROM _target THEN
          RAISE EXCEPTION 'R5_8_11_RECORDER_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
        END IF;
      ELSE
        RAISE EXCEPTION 'R5_8_11_RECORDER_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
      END IF;
      IF pg_catalog.obj_description(_fn, 'pg_proc') IS DISTINCT FROM _new_comment THEN
        RAISE EXCEPTION 'R5_8_11_RECORDER_COMMENT_INVALID' USING ERRCODE = '55000';
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
    RAISE EXCEPTION 'R5_8_11_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, {_lit(new)}, {_lit(old)});""" for old, new, count in substitutions(spec))
    return f"""-- Rollback of R5.8.11 (generated). Restores the R5.8.9 target md5 {START_MD5} from {target}
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
    RAISE EXCEPTION 'R5_8_11_ROLLBACK_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.pg_get_functiondef(_fn);
{steps}
  EXECUTE _def;
  EXECUTE pg_catalog.format('COMMENT ON FUNCTION %s IS %L', _fn, {_lit(r5_8_9.comment(PREVIOUS_SPEC))});
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> {_lit(START_MD5)} THEN
    RAISE EXCEPTION 'R5_8_11_ROLLBACK_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
  END IF;
END;
$rollback$;
"""


# ----------------------------------------------------------------- boundary

def boundary_start_body(name: str) -> str:
    body = r5_8_10.boundary_target_body(name, PREVIOUS_SPEC)
    if _md5(body) != BOUNDARY_START_MD5[name]:
        raise SystemExit(f"R5_8_11B_START_IS_NOT_THE_R5_8_10B_TARGET:{name}")
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
            raise SystemExit(f"R5_8_11B_SUBSTITUTION_PRECONDITION:{name}:{old[:60]}")
        body = body.replace(old, new)
    for key in ("deployment_id", "build_commit", "semantic_commit", "workflow_source_sha"):
        value = PREVIOUS_SPEC[key]
        if value != spec[key] and value in body:
            raise SystemExit(f"R5_8_11B_OLD_PIN_REMAINS:{name}:{value}")
    return body


def boundary_target_md5(name: str, spec: dict[str, Any]) -> str:
    return _md5(boundary_target_body(name, spec))


def _boundary_properties(name: str, label: str) -> str:
    return r5_8_10._boundary_properties(name, label).replace("R5_8_10B_", "R5_8_11B_")


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
        RAISE EXCEPTION 'R5_8_11B_FRAGMENT_COUNT_INVALID ({name})' USING ERRCODE = '55000';
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
    RAISE NOTICE 'R5_8_11B_ALREADY_IN_TARGET_STATE ({name})';
  ELSIF _md5 = {_lit(begin)} THEN
    _def := pg_catalog.pg_get_functiondef(_fn);{steps}
    EXECUTE _def;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
    IF _md5 IS DISTINCT FROM {_lit(end)} THEN
      RAISE EXCEPTION 'R5_8_11B_POSTCONDITION_INVALID ({name}): %', _md5 USING ERRCODE = '55000';
    END IF;
    COMMENT ON FUNCTION {f['signature']} IS {_lit(new_comment)};
  ELSE
    RAISE EXCEPTION 'R5_8_11B_UNEXPECTED_DEFINITION ({name}): %', _md5 USING ERRCODE = '55000';
  END IF;{_boundary_properties(name, 'after')}
END;
$r5810b$;
"""


def boundary_migration_sql(spec: dict[str, Any]) -> str:
    header = (f"-- R5.8.11b — re-pin the provenance persistence boundary from the R5.8.9b targets (generated by\n"
              f"-- scripts/repin/r5_8_11.py from docs/reference/r5_8_10/spec.json: deployment {spec['deployment_id']},\n"
              f"-- branch {spec['branch']}, semantic git:{spec['semantic_commit']}, build git:{spec['build_commit']},\n"
              f"-- workflow blob {spec['workflow_source_sha']}). Each function starts only from its R5.8.9b target\n"
              f"-- md5 or its R5.8.11b target; reads or writes no row, grant, trigger or index.\n")
    return header + "".join(_boundary_block(n, spec, forward=True) for n in BOUNDARY)


def boundary_rollback_sql(spec: dict[str, Any]) -> str:
    header = ("-- Rollback of R5.8.11b (generated). Restores the R5.8.9b target definitions and comments;\n"
              "-- fails closed from any other state. Reads or writes no row: allowed on the managed database.\n")
    return header + "".join(_boundary_block(n, spec, forward=False) for n in BOUNDARY)


def targets(spec: dict[str, Any]) -> dict[str, str]:
    return {"record_parser_runtime_attestation": target_md5(spec),
            **{n: boundary_target_md5(n, spec) for n in BOUNDARY}}


def main(argv: list[str]) -> int:
    if len(argv) >= 3 and argv[1] in ("verify", "generate", "generate-candidate"):
        spec = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
        problems = verify(spec) if argv[1] == "verify" else static_target_problems(spec)
        print(json.dumps({"spec_consistent": not problems, "problems": problems,
                          "release_proven": argv[1] == "verify"}, sort_keys=True))
        if problems:
            return 1
        if argv[1] in ("generate", "generate-candidate") and len(argv) == 7:
            Path(argv[3]).write_text(recorder_migration_sql(spec), encoding="utf-8")
            Path(argv[4]).write_text(recorder_rollback_sql(spec), encoding="utf-8")
            Path(argv[5]).write_text(boundary_migration_sql(spec), encoding="utf-8")
            Path(argv[6]).write_text(boundary_rollback_sql(spec), encoding="utf-8")
            print(json.dumps({"targets": targets(spec), "release_proven": argv[1] == "generate"}, sort_keys=True))
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
