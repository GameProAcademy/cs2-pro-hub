"""D20 migration scope (20261021120000): one column + one function patched by exact fragment.

Behaviour (identical re-observation kept, identity link carried, pre-D20 rows, changed
observation replaced, production-sized payload within the 8 s API statement timeout) is
proven by scripts/queue/canonical_persistence_probe.py on the disposable database; these
checks pin the migration so it cannot widen.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (ROOT / "supabase/migrations/20261021120000_d20_identical_reobservation_no_rewrite.sql").read_text(encoding="utf-8")
ROLLBACK = (ROOT / "docs/reference/d20/rollback.sql").read_text(encoding="utf-8")
BEFORE, AFTER = "d313725db0bb3e94ba72b483344b9d4b", "3420e6cc7454132d8fa452127727a093"


def _code(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("--"))


def _array(text: str, name: str) -> list[str]:
    start = text.index(f"{name} constant text[] := ARRAY[")
    end = text.index("$frag$];", start)
    return re.findall(r"\$frag\$(.*?)\$frag\$", text[start:end + 7], flags=re.S)


def test_only_one_column_and_one_function_change():
    code = _code(MIGRATION)
    assert "'public.persist_canonical_observation(jsonb,uuid,uuid)'::regprocedure" in code
    assert code.count("ALTER TABLE") == 1 and "ADD COLUMN IF NOT EXISTS rounds_digest text" in code
    outside = code[:code.index("DO $d20$")] + code[code.index("$d20$;"):]
    for forbidden in ("CREATE OR REPLACE", "GRANT ", "REVOKE ", "DROP ", "INSERT INTO", "UPDATE public.",
                      "DELETE FROM", "TRUNCATE", "POLICY"):
        assert forbidden not in outside, forbidden
    statements = [line.strip() for line in MIGRATION.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"


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


def test_a_changed_observation_is_still_replaced_and_identity_is_never_assumed():
    new = "\n".join(_array(MIGRATION, "_new"))
    # The rewrite path is still there, behind the unchanged check, with the original guard.
    assert "ELSIF jsonb_array_length(COALESCE(_bundle->'rounds','[]'::jsonb)) > 0" in new
    assert "_priority >= public.canonical_source_priority(_existing_round_source)) THEN" in new
    # Identical only for a content-addressed fingerprint of the same source; never NULL.
    assert "_fp NOT LIKE 'upload:%'" in new and "_existing_round_source IS NOT DISTINCT FROM _source" in new
    assert "COALESCE(_prior_digest = _digest, false)" in new
    assert "_prior_parser_revision IS NOT NULL" in new
    # Set-based writes replace the per-row loops.
    assert "FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_bundle->'events'" not in new
    assert "GET DIAGNOSTICS _events_written = ROW_COUNT;" in new
    assert "'unchanged_reobservation', _unchanged" in new
