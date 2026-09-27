#!/usr/bin/env python3
"""Fail-closed source migration ordering preflight; never contacts a database.

An actual clean install with pgmq, Storage and PostgREST remains a separate gate.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase/migrations"
OUT = ROOT / "docs/release-gates/f553-clean-schema-lineage.json"
TABLES = ("raw_evidence_artifacts", "raw_evidence_chunks")


def main():
    files = sorted(MIGRATIONS.glob("*.sql"))
    references = {}
    definitions = {}
    for table in TABLES:
        mentions = [(p, [i for i, line in enumerate(p.read_text().splitlines(), 1)
                        if re.search(rf"\b{table}\b", line)]) for p in files]
        references[table] = [dict(file=p.name, first_line=lines[0])
                             for p, lines in mentions if lines]
        definitions[table] = [p.name for p in files if re.search(
            rf"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?{table}\b",
            p.read_text(), re.I)]
    violations = []
    for table in TABLES:
        if len(definitions[table]) != 1:
            violations.append(f"{table}: expected exactly one defining migration")
            continue
        first = references[table][0]
        if first["file"] != definitions[table][0]:
            violations.append(f"{table}: first reference {first['file']}:{first['first_line']} precedes definition {definitions[table][0]}")
    report = {
        "phase": "F.5.3-CLOSURE.7", "scope": "static RAW dependency order only",
        "definitions": definitions, "references": references, "violations": violations,
        "source_lineage": "PASS" if not violations else "FAIL",
        "full_schema_install": "NOT_PROVEN",
        "note": "Static ordering cannot prove a clean migration chain or integrated services."
    }
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: report[k] for k in ("source_lineage", "violations", "full_schema_install")}))
    raise SystemExit(0 if not violations else 1)


if __name__ == "__main__":
    main()