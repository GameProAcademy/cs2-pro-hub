"""D21 migration scope (20261021170000): one new owner-scoped table + one function fragment.

Behaviour is proven by scripts/queue/dispatch_failure_history_probe.py on the disposable DB.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (ROOT / "supabase/migrations/20261021170000_d21_dispatch_failure_history.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/d21/rollback.sql").read_text(encoding="utf-8")
BEFORE, AFTER = "b6ae590f1cf5bf745eb96056cebda280", "0eb6687c23b84f72dae0bb4fe3b5d924"


def _frag(text: str, name: str) -> str:
    return re.search(rf"{name} constant text := \$frag\$(.*?)\$frag\$;", text, flags=re.S).group(1)


def test_least_privilege_and_rls():
    assert "ENABLE ROW LEVEL SECURITY" in MIGRATION
    assert "REVOKE ALL ON TABLE public.demo_job_dispatch_failures FROM PUBLIC, anon, authenticated;" in MIGRATION
    assert "GRANT SELECT ON TABLE public.demo_job_dispatch_failures TO authenticated, service_role;" in MIGRATION
    for forbidden in ("GRANT INSERT", "GRANT UPDATE", "GRANT DELETE", "GRANT ALL", "TO anon"):
        assert forbidden not in MIGRATION.replace("FROM PUBLIC, anon, authenticated", ""), forbidden
    assert "j.user_id = auth.uid()" in MIGRATION


def test_guarded_and_inverse():
    for text, before, after in ((MIGRATION, BEFORE, AFTER), (ROLLBACK, AFTER, BEFORE)):
        assert f"_expected_before constant text := '{before}'" in text
        assert f"_expected_after constant text := '{after}'" in text
        for marker in ("_UNEXPECTED_FUNCTION_STATE", "_POSTCONDITION_INVALID", "_FUNCTION_PROPERTIES_CHANGED",
                       "_ALREADY_AT_TARGET_STATE", "_FRAGMENT_NOT_UNIQUE"):
            assert marker in text
    assert _frag(ROLLBACK, "_old") == _frag(MIGRATION, "_new")
    assert _frag(ROLLBACK, "_new") == _frag(MIGRATION, "_old")
    assert "DROP TABLE" not in ROLLBACK  # evidence is never deleted to roll back code


def test_the_record_is_written_before_the_job_row_changes():
    new = _frag(MIGRATION, "_new")
    assert new.index("INSERT INTO public.demo_job_dispatch_failures") < new.index("UPDATE public.demo_jobs SET")
    assert "ON CONFLICT (job_id, dispatch_attempt) DO NOTHING" in new
    assert "left(NULLIF(_error_message, ''), 500)" in new
