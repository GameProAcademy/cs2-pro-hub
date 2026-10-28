"""D32 migration scope (20261028090000): two uniqueness indexes + one function patched by exact fragment.

Behaviour (verified observation of the released quarantined content gets its own match, a second
uploader converges on it, the quarantined row is byte-identical, uniqueness among eligible rows holds,
content of any other quarantined match stays reserved) is proven by
scripts/queue/canonical_persistence_probe.py on the disposable database; these checks pin the
migration so it cannot widen.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (ROOT / "supabase/migrations/20261028090000_d32_quarantined_content_reobservable.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/d32/rollback.sql").read_text(encoding="utf-8")
BEFORE, AFTER = "3420e6cc7454132d8fa452127727a093", "a72ac136f4b482b84ff6e712689cc2a1"
MATCH, SOURCE = "a7b27f16-4c85-428b-a855-0f683bda48a2", "b63082cb-4220-4d0d-9b45-d6db6c119256"


def _code(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("--"))


def _array(text: str, name: str) -> list[str]:
    start = text.index(f"{name} constant text[] := ARRAY[")
    end = text.index("$frag$];", start)
    return re.findall(r"\$frag\$(.*?)\$frag\$", text[start:end + 7], flags=re.S)


def test_scope_is_two_indexes_and_one_function():
    code = _code(MIGRATION)
    assert "'public.persist_canonical_observation(jsonb,uuid,uuid)'::regprocedure" in code
    outside = code[:code.index("DO $d32$")] + code[code.index("$d32$;"):]
    assert outside.count("DROP INDEX IF EXISTS") == 2 and outside.count("CREATE UNIQUE INDEX") == 2
    for forbidden in ("CREATE OR REPLACE", "GRANT ", "REVOKE ", "INSERT INTO", "UPDATE public.", "DELETE FROM",
                      "TRUNCATE", "POLICY", "ALTER TABLE", "DISABLE TRIGGER", "session_replication_role"):
        assert forbidden not in code, forbidden
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"


def test_only_the_named_quarantined_rows_leave_content_uniqueness():
    assert f"AND id <> '{MATCH}'::uuid" in MIGRATION and f"AND id <> '{SOURCE}'::uuid" in MIGRATION
    assert "ON public.matches USING btree (content_fingerprint)" in MIGRATION
    assert "ON public.match_sources USING btree (source, fingerprint)" in MIGRATION
    # The named rows must be the quarantined match and its own source, or the migration refuses.
    assert "D32_NAMED_MATCH_NOT_QUARANTINED" in MIGRATION and "D32_NAMED_SOURCE_NOT_OF_THE_QUARANTINED_MATCH" in MIGRATION
    named = set(re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", _code(MIGRATION)))
    assert named == {MATCH, SOURCE}, named


def test_resolution_skips_quarantined_matches_and_nothing_else_changes():
    new = _array(MIGRATION, "_new")
    old = _array(MIGRATION, "_old")
    assert len(new) == len(old) == 2
    assert "AND (match_id IS NULL OR NOT public.is_canonical_match_quarantined(match_id))" in new[0]
    assert "WHERE content_fingerprint = _fp AND NOT public.is_canonical_match_quarantined(id)" in new[1]
    # Apart from the added predicate/comment the fragments are identical.
    strip = lambda text: re.sub(r"\s+", " ", re.sub(r"--[^\n]*", "", text)).strip()  # noqa: E731
    assert strip(new[0]).replace(" AND (match_id IS NULL OR NOT public.is_canonical_match_quarantined(match_id))", "") == strip(old[0])
    assert strip(new[1]).replace(" AND NOT public.is_canonical_match_quarantined(id)", "") == strip(old[1])


def test_md5_guarded_both_ways_and_property_preserving():
    for text, before, after in ((MIGRATION, BEFORE, AFTER), (ROLLBACK, AFTER, BEFORE)):
        assert f"_expected_before constant text := '{before}'" in text
        assert f"_expected_after constant text := '{after}'" in text
        for marker in ("_UNEXPECTED_FUNCTION_STATE", "_POSTCONDITION_INVALID", "_FUNCTION_PROPERTIES_CHANGED",
                       "_ALREADY_AT_TARGET_STATE", "_FRAGMENT_NOT_UNIQUE", "'security_definer', p.prosecdef",
                       "'acl', p.proacl::text", "'config', p.proconfig::text"):
            assert marker in text, marker


def test_rollback_is_the_exact_inverse_and_restores_the_original_indexes():
    assert _array(ROLLBACK, "_old") == _array(MIGRATION, "_new")
    assert _array(ROLLBACK, "_new") == _array(MIGRATION, "_old")
    assert "ON public.matches USING btree (content_fingerprint) WHERE (content_fingerprint IS NOT NULL);" in ROLLBACK
    assert "ON public.match_sources USING btree (source, fingerprint) WHERE (fingerprint IS NOT NULL);" in ROLLBACK
