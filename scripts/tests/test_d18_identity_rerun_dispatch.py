"""D18 migration scope (20261021130000): one function, exact fragments, md5-guarded, inverse rollback.

Behaviour is proven by scripts/queue/identity_rerun_dispatch_probe.py on the disposable database.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (ROOT / "supabase/migrations/20261021130000_d18_identity_rerun_new_dispatch.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/d18/rollback.sql").read_text(encoding="utf-8")
BEFORE, AFTER = "cba3c797c3bd05b98941704bbd48c08d", "48cb62f6c5a76379537bfc121c3fbe4f"


def _array(text: str, name: str) -> list[str]:
    start = text.index(f"{name} constant text[] := ARRAY[")
    end = text.index("$frag$];", start)
    return re.findall(r"\$frag\$(.*?)\$frag\$", text[start:end + 7], flags=re.S)


def test_scope_is_one_function():
    code = "\n".join(l for l in MIGRATION.splitlines() if not l.lstrip().startswith("--"))
    assert "'public.requeue_demo_job_after_attachment(uuid,uuid,jsonb)'::regprocedure" in code
    outside = code[:code.index("DO $d18$")] + code[code.index("$d18$;"):]
    for forbidden in ("CREATE OR REPLACE", "ALTER ", "GRANT ", "REVOKE ", "DROP ", "INSERT INTO", "UPDATE public.",
                      "DELETE FROM", "POLICY"):
        assert forbidden not in outside, forbidden


def test_guarded_and_inverse():
    for text, before, after in ((MIGRATION, BEFORE, AFTER), (ROLLBACK, AFTER, BEFORE)):
        assert f"_expected_before constant text := '{before}'" in text
        assert f"_expected_after constant text := '{after}'" in text
        for marker in ("_UNEXPECTED_FUNCTION_STATE", "_POSTCONDITION_INVALID", "_FUNCTION_PROPERTIES_CHANGED",
                       "_ALREADY_AT_TARGET_STATE", "_FRAGMENT_NOT_UNIQUE"):
            assert marker in text
    assert _array(ROLLBACK, "_old") == _array(MIGRATION, "_new")
    assert _array(ROLLBACK, "_new") == _array(MIGRATION, "_old")


def test_never_resets_the_dispatch_number():
    new = "\n".join(_array(MIGRATION, "_new"))
    assert "THEN 0 ELSE retry_count" not in new
    assert "THEN retry_count + 1 ELSE retry_count END" in new
    assert "status <> 'pending'" in new
    assert "LEAST(10, max_retries + retry_count + 1)" in new
    assert "IDENTITY_RERUN_LIMIT_REACHED" in new
