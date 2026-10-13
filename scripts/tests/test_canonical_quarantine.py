"""Static contract of the H.3-E canonical match quarantine (behaviour is proven on the disposable
database by scripts/queue/canonical_persistence_probe.py)."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261014120000_h3e_canonical_match_quarantine.sql"
SNAPSHOT_V3 = ROOT / "supabase/migrations/20261014120100_h3e_predem_managed_snapshot_v3.sql"
OPERATOR = ROOT / "docs/ops/h3e_quarantine_partial_match_2026-09-11.sql"
REFERENCE = ROOT / "docs/reference/h3e_quarantine"


def code(path: Path) -> str:
    return re.sub(r"--[^\n]*", "", path.read_text())


def test_the_migration_quarantines_nothing_and_has_no_release_path():
    sql = code(MIGRATION)
    assert not re.search(r"INSERT\s+INTO\s+public\.canonical_match_quarantine", sql, re.I)
    assert not re.search(r"\b(UPDATE|DELETE\s+FROM)\s+public\.(matches|canonical_match_quarantine)\b", sql, re.I)
    assert not re.search(r"FUNCTION\s+public\.\w*release", sql, re.I)


def test_the_registry_is_service_only_and_append_only():
    sql = code(MIGRATION)
    assert "ENABLE ROW LEVEL SECURITY" in sql and "FORCE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON TABLE public.canonical_match_quarantine FROM PUBLIC, anon, authenticated;" in sql
    assert "GRANT SELECT, INSERT ON TABLE public.canonical_match_quarantine TO service_role;" in sql
    assert not re.search(r"CREATE\s+POLICY", sql, re.I)
    assert "BEFORE UPDATE OR DELETE ON public.canonical_match_quarantine" in sql
    assert "BEFORE TRUNCATE ON public.canonical_match_quarantine" in sql
    assert "ON DELETE RESTRICT" in sql


def test_every_guard_function_is_definer_with_an_empty_search_path_and_no_client_grant():
    sql = code(MIGRATION)
    functions = re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", sql)
    assert set(functions) == {"refuse_canonical_quarantine_change", "is_canonical_match_quarantined",
                              "guard_canonical_match_quarantine", "guard_canonical_quarantine_truncate"}
    assert sql.count("SECURITY DEFINER") == 4 and sql.count("SET search_path = ''") == 4
    for name in functions:
        assert re.search(rf"REVOKE ALL ON FUNCTION public\.{name}\([^)]*\) FROM PUBLIC, anon, authenticated;", sql), name


def test_the_operator_step_is_not_a_migration_and_asserts_the_observed_identity():
    assert not any(p.name.endswith("quarantine_partial_match_2026-09-11.sql")
                   for p in (ROOT / "supabase/migrations").iterdir())
    sql = OPERATOR.read_text()
    for fact in ("a7b27f16-4c85-428b-a855-0f683bda48a2", "'partial'", "'demo'",
                 "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
                 "9b375fd1-6bf0-400b-be61-dbf70099e2c5", "2026-09-11 10:40:06.477964+00", "IS DISTINCT FROM 24"):
        assert fact in sql, fact
    body = code(OPERATOR)
    # One write only, to the registry; the match and its children are read, never written.
    assert len(re.findall(r"\bINSERT\s+INTO\b", body, re.I)) == 1
    assert "INSERT INTO public.canonical_match_quarantine" in body
    assert not re.search(r"\b(UPDATE|DELETE|TRUNCATE)\b", body, re.I)


def test_rollbacks_restore_v2_and_refuse_to_unguard_a_quarantined_row():
    v2 = (ROOT / "supabase/migrations/20261013120000_h3e_predem_managed_snapshot.sql").read_text()
    assert (REFERENCE / "rollback_20261014120100.sql").read_text().endswith(v2)
    assert "'schema_version', 3" in SNAPSHOT_V3.read_text()
    rollback = (REFERENCE / "rollback_20261014120000.sql").read_text()
    assert rollback.index("H3E_QUARANTINE_ROLLBACK_REFUSED_ROWS_PRESENT") < rollback.index("DROP TRIGGER")
