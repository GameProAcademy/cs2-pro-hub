"""Least-privilege grants on evidence/identity tables (migration 20261020100000).

The migration itself is fail-closed (pre/postconditions per table) and is applied to
the disposable Supabase database by the queue-semantics workflow; these checks pin its
scope so it can never widen into rows, policies, functions or other roles.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (ROOT / "supabase/migrations/20261020100000_least_privilege_evidence_grants.sql").read_text(encoding="utf-8")
TABLES = ("demo_identity_decisions", "player_nickname_history", "raw_demo_evidence_reports",
          "raw_evidence_artifacts", "raw_evidence_chunks")


def _code() -> str:
    return "\n".join(line for line in MIGRATION.splitlines() if not line.lstrip().startswith("--"))


def test_scope_is_exactly_the_five_tables():
    listed = re.search(r"_tables constant text\[\] := ARRAY\[(.*?)\];", _code(), re.S)
    assert listed is not None
    assert tuple(re.findall(r"'([a-z_]+)'", listed.group(1))) == TABLES


def test_only_revokes_from_anon_and_authenticated_and_keeps_select():
    code = _code()
    assert "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated" in code
    assert "REVOKE ALL ON public.%I FROM anon" in code
    assert "SELECT ON public.%I FROM authenticated" not in code
    for forbidden in ("GRANT ", "service_role", "DROP ", "DELETE FROM", "UPDATE public.", "TRUNCATE public",
                      "CREATE OR REPLACE", "ALTER TABLE", "POLICY", "DISABLE"):
        assert forbidden not in code, forbidden


def test_fail_closed_pre_and_postconditions():
    code = _code()
    assert code.strip().startswith("BEGIN;") and code.strip().endswith("COMMIT;")
    for marker in ("LEAST_PRIVILEGE_PRECONDITION", "LEAST_PRIVILEGE_POSTCONDITION", "c.relrowsecurity",
                   "IS DISTINCT FROM (CASE WHEN _had_select THEN 'SELECT' END)",
                   "g.grantee = 'anon'"):
        assert marker in code, marker


def test_application_reads_these_tables_through_select_only():
    """The user-context client never writes them; writes are service role / SECURITY DEFINER."""
    pattern = re.compile(r"\bsupabase\s*\.\s*from\(\"(" + "|".join(TABLES) + r")\"\)\s*\.\s*(insert|update|upsert|delete)\(")
    for path in (ROOT / "src").rglob("*.ts*"):
        if "__tests__" in path.parts:
            continue
        text = re.sub(r"\s+", " ", path.read_text(encoding="utf-8"))
        assert not pattern.search(text), path
