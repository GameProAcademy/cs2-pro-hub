"""D28: only the Canonical persistence RPC gets a 60s statement timeout; nothing else changes."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQL = (ROOT / "supabase/migrations/20261023120000_d28_canonical_persist_statement_timeout.sql").read_text()
CODE = "\n".join(line for line in SQL.splitlines() if not line.lstrip().startswith("--"))


def test_scope_is_one_function_setting():
    alters = re.findall(r"ALTER\s+\w+[^;]*;", CODE)
    assert alters == ["ALTER FUNCTION public.persist_canonical_observation_attached(jsonb, uuid, uuid, uuid) SET statement_timeout = '60s';"]
    for forbidden in ("ALTER ROLE", "CREATE OR REPLACE", "UPDATE public.", "DELETE FROM", "INSERT INTO", "GRANT ", "REVOKE ", "DROP "):
        assert forbidden not in CODE, forbidden


def test_guarded_before_and_after():
    assert "de9bfc8c606ad8f6cb043da1a9d85d11" in CODE
    for marker in ("D28_UNEXPECTED_FUNCTION_BODY", "D28_UNEXPECTED_FUNCTION_CONFIG", "D28_POSTCONDITION_INVALID"):
        assert marker in CODE
    assert "ARRAY['search_path=\"\"', 'statement_timeout=60s']" in CODE
