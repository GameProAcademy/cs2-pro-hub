"""D19 migration scope (20261021090000): two functions patched by exact fragment, nothing else.

Behaviour is proven by scripts/queue/multi_user_identity_probe.py on the disposable database
(queue-semantics workflow); these checks pin the migration so it cannot widen.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (ROOT / "supabase/migrations/20261021090000_d19_multi_user_shared_match_identity.sql").read_text(encoding="utf-8")


def _code() -> str:
    return "\n".join(line for line in MIGRATION.splitlines() if not line.lstrip().startswith("--"))


def test_only_the_two_functions_are_targeted():
    assert "'public.record_demo_identity_event(uuid,uuid,text,jsonb)'::regprocedure" in MIGRATION
    assert "'public.owns_canonical_match(uuid)'::regprocedure" in MIGRATION
    code = _code()
    for forbidden in ("CREATE OR REPLACE", "GRANT ", "REVOKE ", "DROP ", "ALTER TABLE", "INSERT INTO",
                      "UPDATE public.", "DELETE FROM", "TRUNCATE", "POLICY"):
        assert forbidden not in code, forbidden


def test_fail_closed_and_property_preserving():
    for marker in ("D19_UNEXPECTED_FUNCTION_STATE", "D19_POSTCONDITION_INVALID", "D19_FUNCTION_PROPERTIES_CHANGED",
                   "D19_ALREADY_AT_TARGET_STATE", "'security_definer', p.prosecdef", "'acl', p.proacl::text",
                   "'config', p.proconfig::text"):
        assert marker in MIGRATION, marker
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"


def test_identity_resolution_never_uses_a_quarantined_match_and_keeps_the_job_first():
    new_resolution = MIGRATION[MIGRATION.index("_new constant text[]"):MIGRATION.index("_marker constant")]
    assert new_resolution.index("_canonical_match_id := _job.match_id;") < new_resolution.index("m.content_fingerprint")
    assert "NOT EXISTS (SELECT 1 FROM public.canonical_match_quarantine q WHERE q.match_id = m.id)" in new_resolution
    # The upload's source row is still a fallback, never the first choice.
    assert new_resolution.index("m.content_fingerprint") < new_resolution.index("ms.upload_id = _job.upload_id")


def test_read_access_is_granted_only_through_the_users_own_job():
    new_access = MIGRATION[MIGRATION.index("_new constant text[]"):MIGRATION.index("_marker constant")]
    assert "SELECT 1 FROM public.demo_jobs j\n     WHERE j.match_id = _match_id AND j.user_id = auth.uid()" in new_access


def test_production_start_and_target_md5_recorded():
    for value in ("847c818d", "0ac21d3d", "57bcb5f3", "4ccf85be"):
        assert value in MIGRATION, value
