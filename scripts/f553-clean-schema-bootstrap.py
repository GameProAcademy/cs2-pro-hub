#!/usr/bin/env python3
"""RAW lineage preflight; textual references do not prove SQL dependency errors.

A successful local full-stack clean reset is the authoritative install gate.
This report never connects to a production database.
"""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / 'supabase/migrations'
OUT = ROOT / 'docs/release-gates/f553-clean-schema-lineage.json'
INSTALL = ROOT / 'docs/release-gates/f553-full-schema-install.json'
TABLES = ('raw_evidence_artifacts', 'raw_evidence_chunks')


def main():
    files = sorted(MIGRATIONS.glob('*.sql'))
    install = json.loads(INSTALL.read_text()) if INSTALL.exists() else {}
    clean_passed = (install.get('full_supabase_install') == 'PASS'
                    and install.get('environment') == 'local_disposable_supabase'
                    and len(install.get('applied_versions', [])) >= len(files))
    tables = {}
    for table in TABLES:
        definitions = [file.name for file in files if re.search(
            rf'\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?{table}\b',
            file.read_text(), re.I)]
        mentions = [dict(file=file.name, first_line=next(
            i for i, line in enumerate(file.read_text().splitlines(), 1)
            if re.search(rf'\b{table}\b', line)))
            for file in files if re.search(rf'\b{table}\b', file.read_text())]
        tables[table] = dict(definition_migration=definitions[0] if len(definitions) == 1 else None,
                             textual_references=mentions,
                             first_real_dependency='NOT_PROVEN',
                             dependency_order_valid='NOT_PROVEN',
                             clean_install_result='PASS' if clean_passed else 'NOT_PROVEN')
    report = dict(phase='F.5.3-CLOSURE.8-R1',
                  scope='Textual references only; stored function bodies may resolve tables at runtime',
                  tables=tables, source_lineage='PASS' if clean_passed else 'NOT_PROVEN',
                  full_schema_install='PASS' if clean_passed else 'NOT_PROVEN')
    OUT.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ('source_lineage', 'full_schema_install')}))
    return 0 if clean_passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
