"""The retention diagnosis is a single read-only SELECT over aggregates."""
import re
from pathlib import Path

SQL = (Path(__file__).resolve().parents[2] / "scripts/predem/retention_diagnosis.sql").read_text()
CODE = re.sub(r"'(?:[^']|'')*'", "''", re.sub(r"--[^\n]*", "", SQL))


def test_single_select_statement_without_writes():
    assert CODE.strip().upper().startswith("WITH")
    assert CODE.count(";") == 1 and CODE.strip().endswith(";")
    assert not re.search(r"\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|DROP|ALTER|GRANT|REVOKE|COPY|CALL|DO)\b", CODE, re.I)
    assert not re.search(r"\b(claim_demo_cleanup_jobs|finish_demo_cleanup_verified|fail_demo_cleanup)\b", CODE)


def test_no_identifying_column_is_returned():
    selected = CODE.split("FROM public.demo_jobs j", 1)[0]
    for column in ("j.id ", "j.user_id", "j.upload_id", "j.storage_path AS", "o.name AS", "email"):
        assert column not in selected
    assert "storage_path" not in CODE.split("SELECT jsonb_build_object", 1)[1].split("'bucket'", 1)[0]
