"""D34 migration scope (20261028100000): one function patched by one exact fragment.

Behaviour (a later attachment raises identity_status; a repeated or weaker write never lowers it;
'conflict' is sticky; other participants are untouched) is proven by
scripts/queue/canonical_persistence_probe.py on the disposable database. These checks pin the
migration so it cannot widen.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (ROOT / "supabase/migrations/20261028100000_d34_identity_status_on_conflict.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/d34/rollback.sql").read_text(encoding="utf-8")
PROBE = (ROOT / "scripts/queue/canonical_persistence_probe.py").read_text(encoding="utf-8")
BEFORE, AFTER = "a72ac136f4b482b84ff6e712689cc2a1", "d751c4742f2efe23b293f5861d09df3b"


def _code(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("--"))


def _array(text: str, name: str) -> list[str]:
    start = text.index(f"{name} constant text[] := ARRAY[")
    end = text.index("$frag$];", start)
    return re.findall(r"\$frag\$(.*?)\$frag\$", text[start:end + 7], flags=re.S)


def test_scope_is_one_function_and_writes_no_row():
    code = _code(MIGRATION)
    assert "'public.persist_canonical_observation(jsonb,uuid,uuid)'::regprocedure" in code
    outside = code[:code.index("DO $d34$")] + code[code.index("$d34$;"):]
    for forbidden in ("CREATE OR REPLACE", "GRANT ", "REVOKE ", "INSERT INTO", "UPDATE public.", "DELETE FROM",
                      "TRUNCATE", "POLICY", "ALTER TABLE", "DISABLE TRIGGER", "session_replication_role", "INDEX"):
        assert forbidden not in outside, forbidden
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"


def test_only_identity_status_is_added_to_the_conflict_branch():
    old, new = _array(MIGRATION, "_old"), _array(MIGRATION, "_new")
    assert len(old) == len(new) == 1
    assert new[0].startswith(old[0])
    added = _code(new[0][len(old[0]):])
    assert added.strip().startswith("identity_status = CASE") and added.strip().endswith("END,")
    assert "ARRAY['unlinked','correlated','strongly_correlated','verified']" in added
    assert added.count("'conflict'::public.identity_link_status") == 3
    # The INSERT branch keeps writing the incoming status unchanged.
    assert "COALESCE((_row->>'identityStatus')::public.identity_link_status, 'unlinked')" not in new[0]


def test_md5_guarded_both_ways_and_property_preserving():
    for text, before, after in ((MIGRATION, BEFORE, AFTER), (ROLLBACK, AFTER, BEFORE)):
        assert f"_expected_before constant text := '{before}'" in text
        assert f"_expected_after constant text := '{after}'" in text
        for marker in ("_UNEXPECTED_FUNCTION_STATE", "_POSTCONDITION_INVALID", "_FUNCTION_PROPERTIES_CHANGED",
                       "_ALREADY_AT_TARGET_STATE", "_FRAGMENT_NOT_UNIQUE", "'security_definer', p.prosecdef",
                       "'acl', p.proacl::text", "'config', p.proconfig::text"):
            assert marker in text, marker


def test_rollback_is_the_exact_inverse():
    assert _array(ROLLBACK, "_old") == _array(MIGRATION, "_new")
    assert _array(ROLLBACK, "_new") == _array(MIGRATION, "_old")


def test_behaviour_is_proven_by_probe_scenarios():
    for name in ("s_d34_attach_later", "s_d34_precedence", "s_d34_conflict"):
        assert f"def {name}()" in PROBE and name in PROBE[PROBE.index("SCENARIOS = ["):]
