#!/usr/bin/env python3
"""Generate R5.8.9b — re-pin the provenance persistence boundary to the runtime
of the committed R5.8.9 spec.

The recorder (R5.8.9) is not the only database object that pins the runtime:
the trigger function public.enforce_approved_attestation_workflow() refuses any
provenance row whose workflow blob is not the approved one, and
public.assert_verified_parser_provenance(uuid) — what consumers call before
trusting a provenance row — pins branch, deployment, semantic and build
revisions and the workflow blob. Both still name deployment 1b5778de, branch
infra/cs2-parser-worker-v8, git:5703b1d8 and workflow blob 3070d8ba.

The managed definitions (md5 of prosrc, read-only 2026-10-13) are committed in
docs/reference/r5_8_9/*.live-2026-10-13.prosrc. The migration accepts exactly
that definition (substitutes each pin inside its own context, count-checked,
then asserts the target md5 computed here) or the target itself (re-run is a
no-op); anything else fails closed. Signature, result, volatility, SECURITY
DEFINER, search_path, owner and EXECUTE grants are asserted before and after.
No row, grant, trigger or index is read or written.

Usage: r5_8_9_boundary.py SPEC.json OUT_MIGRATION.sql OUT_ROLLBACK.sql
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "docs/reference/r5_8_9"
OLD_BRANCH = "infra/cs2-parser-worker-v8"
OLD_DEPLOYMENT = "1b5778de-3eaf-46f1-9ea5-cba381d95313"
OLD_COMMIT = "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76"
OLD_WORKFLOW = "3070d8bae6c3f02093bbb2595138c913646c2e31"

FUNCTIONS = {
    "assert_verified_parser_provenance": {
        "signature": "public.assert_verified_parser_provenance(uuid)",
        "start_md5": "e00209501284eed35cb6fb710bca4390",
        "volatility": "s", "service_role": True,
        "comment": ("R5.8.9 re-pinned provenance assertion: Railway deployment {deployment_id}, branch {branch}, "
                    "semantic git:{semantic_commit}, build git:{build_commit}, approved workflow blob {workflow_source_sha}."),
    },
    "enforce_approved_attestation_workflow": {
        "signature": "public.enforce_approved_attestation_workflow()",
        "start_md5": "8a10c243e91f8f0a6db41279cf643830",
        "volatility": "v", "service_role": False,
        "comment": ("R5.8.9 re-pinned fail-closed persistence boundary using reviewed workflow Git blob "
                    "{workflow_source_sha}."),
    },
}


def substitutions(name: str, spec: dict[str, Any]) -> list[tuple[str, str]]:
    sem, build, wf = spec["semantic_commit"], spec["build_commit"], spec["workflow_source_sha"]
    if name == "assert_verified_parser_provenance":
        return [
            (f"_p.railway_branch<>'{OLD_BRANCH}'", f"_p.railway_branch<>'{spec['branch']}'"),
            (f"_p.deployment_id<>'{OLD_DEPLOYMENT}'", f"_p.deployment_id<>'{spec['deployment_id']}'"),
            # deployment_commit holds the payload's git_commit (the semantic commit), as the recorder writes it.
            (f"_p.deployment_commit<>'{OLD_COMMIT}'", f"_p.deployment_commit<>'{sem}'"),
            (f"_p.semantic_revision<>'git:{OLD_COMMIT}'", f"_p.semantic_revision<>'git:{sem}'"),
            (f"_p.build_revision<>'git:{OLD_COMMIT}'", f"_p.build_revision<>'git:{build}'"),
            (f"_p.workflow_identity->>'workflow_source_sha'<>'{OLD_WORKFLOW}'",
             f"_p.workflow_identity->>'workflow_source_sha'<>'{wf}'"),
            (f"'attestor_source_identity'->>'workflow_source_sha'<>'{OLD_WORKFLOW}'",
             f"'attestor_source_identity'->>'workflow_source_sha'<>'{wf}'"),
        ]
    return [
        (f"NEW.workflow_identity->>'workflow_source_sha' <> '{OLD_WORKFLOW}'",
         f"NEW.workflow_identity->>'workflow_source_sha' <> '{wf}'"),
        (f"'attestor_source_identity'->>'workflow_source_sha' <> '{OLD_WORKFLOW}'",
         f"'attestor_source_identity'->>'workflow_source_sha' <> '{wf}'"),
    ]


def reference(name: str) -> str:
    text = (REFERENCE / f"{name}.live-2026-10-13.prosrc").read_text(encoding="utf-8")
    if hashlib.md5(text.encode()).hexdigest() != FUNCTIONS[name]["start_md5"]:
        raise SystemExit(f"REFERENCE_MD5_MISMATCH:{name}")
    return text


def target_body(name: str, spec: dict[str, Any]) -> str:
    body = reference(name)
    for old, new in substitutions(name, spec):
        if body.count(old) != 1 or new != old and body.count(new) != 0:
            raise SystemExit(f"SUBSTITUTION_PRECONDITION:{name}:{old[:60]}")
        body = body.replace(old, new)
    for old_value in (OLD_BRANCH, OLD_DEPLOYMENT, OLD_COMMIT, OLD_WORKFLOW):
        if old_value in body:
            raise SystemExit(f"OLD_PIN_REMAINS:{name}:{old_value}")
    return body


def target_md5(name: str, spec: dict[str, Any]) -> str:
    return hashlib.md5(target_body(name, spec).encode()).hexdigest()


def _lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _properties(name: str, label: str) -> str:
    f = FUNCTIONS[name]
    grant = "NOT " if f["service_role"] else ""
    return f"""
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = _fn AND p.prosecdef
        AND p.provolatile = '{f['volatility']}' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres') THEN
    RAISE EXCEPTION 'R5_8_9B_PROPERTIES_INVALID ({name}, {label})' USING ERRCODE = '55000';
  END IF;
  IF {grant}pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_9B_GRANTS_INVALID ({name}, {label})' USING ERRCODE = '55000';
  END IF;"""


def _block(name: str, spec: dict[str, Any], *, forward: bool) -> str:
    f = FUNCTIONS[name]
    start, target = (f["start_md5"], target_md5(name, spec))
    begin, end = (start, target) if forward else (target, start)
    pairs = substitutions(name, spec) if forward else [(n, o) for o, n in substitutions(name, spec)]
    comment = f["comment"].format(**spec) if forward else None
    steps = "".join(f"""
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, {_lit(o)}, '')))
         <> pg_catalog.length({_lit(o)}) THEN
        RAISE EXCEPTION 'R5_8_9B_FRAGMENT_COUNT_INVALID ({name})' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, {_lit(o)}, {_lit(n)});""" for o, n in pairs)
    set_comment = (f"\n      COMMENT ON FUNCTION {f['signature']} IS {_lit(comment)};" if comment else
                   f"\n      COMMENT ON FUNCTION {f['signature']} IS {_lit(_previous_comment(name))};")
    return f"""
DO $r589b$
DECLARE
  _fn constant regprocedure := {_lit(f['signature'])}::regprocedure;
  _md5 text;
  _def text;
BEGIN{_properties(name, 'before')}
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 = {_lit(end)} THEN
    RAISE NOTICE 'R5_8_9B_ALREADY_IN_TARGET_STATE ({name})';
  ELSIF _md5 = {_lit(begin)} THEN
    _def := pg_catalog.pg_get_functiondef(_fn);{steps}
    EXECUTE _def;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
    IF _md5 IS DISTINCT FROM {_lit(end)} THEN
      RAISE EXCEPTION 'R5_8_9B_POSTCONDITION_INVALID ({name}): %', _md5 USING ERRCODE = '55000';
    END IF;{set_comment}
  ELSE
    RAISE EXCEPTION 'R5_8_9B_UNEXPECTED_DEFINITION ({name}): %', _md5 USING ERRCODE = '55000';
  END IF;{_properties(name, 'after')}
END;
$r589b$;
"""


def _previous_comment(name: str) -> str:
    return {
        "assert_verified_parser_provenance": ("R5.8.5 reconciled provenance assertion: current Railway deployment "
                                              "1b5778de-3eaf-46f1-9ea5-cba381d95313 and approved workflow blob "
                                              "3070d8bae6c3f02093bbb2595138c913646c2e31."),
        "enforce_approved_attestation_workflow": ("R5.8.5 reconciled fail-closed persistence boundary using reviewed "
                                                  "workflow Git blob 3070d8bae6c3f02093bbb2595138c913646c2e31."),
    }[name]


def migration_sql(spec: dict[str, Any]) -> str:
    header = (f"-- R5.8.9b — re-pin the provenance persistence boundary (generated by scripts/repin/r5_8_9_boundary.py\n"
              f"-- from docs/reference/r5_8_9/spec.json: deployment {spec['deployment_id']}, branch {spec['branch']},\n"
              f"-- semantic git:{spec['semantic_commit']}, build git:{spec['build_commit']}, workflow blob\n"
              f"-- {spec['workflow_source_sha']}). Each function starts only from its managed md5 or its target;\n"
              f"-- reads or writes no row, grant, trigger or index.\n")
    return header + "".join(_block(n, spec, forward=True) for n in FUNCTIONS)


def rollback_sql(spec: dict[str, Any]) -> str:
    header = ("-- Rollback of R5.8.9b (generated). Restores the managed definitions and comments of 2026-10-13;\n"
              "-- fails closed from any other state. Reads or writes no row: allowed on the managed database.\n")
    return header + "".join(_block(n, spec, forward=False) for n in FUNCTIONS)


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(__doc__)
        return 2
    spec = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    Path(argv[2]).write_text(migration_sql(spec), encoding="utf-8")
    Path(argv[3]).write_text(rollback_sql(spec), encoding="utf-8")
    print(json.dumps({n: target_md5(n, spec) for n in FUNCTIONS}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
