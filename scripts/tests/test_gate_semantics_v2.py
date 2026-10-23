"""Static contract of gate semantics v2 (behaviour: scripts/queue/gate_semantics_v2_probe.py on CI)."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "supabase/migrations/20261014220000_h3e_attempt_authorization_registry.sql"
SNAPSHOT_V4 = ROOT / "supabase/migrations/20261014220100_h3e_predem_managed_snapshot_v4.sql"
SNAPSHOT_V5 = ROOT / "supabase/migrations/20261023100000_h3e_predem_managed_snapshot_v5_lineage_by_content.sql"
SNAPSHOT_V3 = ROOT / "supabase/migrations/20261014120100_h3e_predem_managed_snapshot_v3.sql"
REF = ROOT / "docs/reference/h3e_gate_semantics_v2"
OPERATOR = ROOT / "docs/ops/h3e_attempt_authorizations_2026-10-14.sql"


def code(path: Path) -> str:
    return re.sub(r"--[^\n]*", "", path.read_text())


def test_the_registry_migration_records_nothing_and_has_no_revocation_path():
    sql = code(REGISTRY)
    assert not re.search(r"INSERT\s+INTO\s+public\.h3e_attempt_authorizations", sql, re.I)
    assert not re.search(r"\b(UPDATE|DELETE\s+FROM)\s+public\.", sql, re.I)
    assert not re.search(r"FUNCTION\s+public\.\w*(revoke|release)", sql, re.I)


def test_the_registry_is_service_only_append_only_and_identity_bound():
    sql = code(REGISTRY)
    assert "ENABLE ROW LEVEL SECURITY" in sql and "FORCE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON TABLE public.h3e_attempt_authorizations FROM PUBLIC, anon, authenticated;" in sql
    assert "GRANT SELECT, INSERT ON TABLE public.h3e_attempt_authorizations TO service_role;" in sql
    assert not re.search(r"CREATE\s+POLICY", sql, re.I)
    assert "REFERENCES public.demo_jobs(id) ON DELETE RESTRICT" in sql
    assert "CHECK (attempt_number >= 9)" in sql
    assert "BEFORE INSERT ON public.h3e_attempt_authorizations" in sql
    assert "BEFORE UPDATE OR DELETE ON public.h3e_attempt_authorizations" in sql
    assert "BEFORE TRUNCATE ON public.h3e_attempt_authorizations" in sql
    for column in ("upload_id", "attempt_number", "demo_sha256"):
        assert f"_job.{column} IS DISTINCT FROM NEW.{column}" in sql
    functions = re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", sql)
    assert sql.count("SECURITY DEFINER") == len(functions) == 2
    assert sql.count("SET search_path = ''") == 2
    for name in functions:
        assert re.search(rf"REVOKE ALL ON FUNCTION public\.{name}\(\) FROM PUBLIC, anon, authenticated;", sql)


def test_snapshot_v4_is_the_reviewed_sql_and_rollbacks_restore_v3():
    # D26: v5 is the reviewed SQL; v4 stays committed and differs ONLY in the lineage job join.
    assert SNAPSHOT_V5.read_text() == (ROOT / "scripts/predem/managed_snapshot.sql").read_text()
    assert (ROOT / "docs/reference/d26/rollback_restore_v4.sql").read_text() == SNAPSHOT_V4.read_text()
    v4, v5 = SNAPSHOT_V4.read_text(), SNAPSHOT_V5.read_text()
    v4_body = v4[v4.index("AS $snapshot$"):]
    v5_body = v5[v5.index("AS $snapshot$"):]
    join_v4 = v4_body[v4_body.index("    JOIN public.demo_jobs j"):v4_body.index("    JOIN public.raw_evidence_artifacts a")]
    join_v5 = v5_body[v5_body.index("    -- D26"):v5_body.index("    JOIN public.raw_evidence_artifacts a")]
    assert v4_body.replace(join_v4, "@JOIN@") == v5_body.replace(join_v5, "@JOIN@")
    assert (REF / "rollback_20261014220100.sql").read_text().endswith(SNAPSHOT_V3.read_text())
    rollback = (REF / "rollback_20261014220000.sql").read_text()
    assert rollback.index("H3E_ATTEMPT_AUTHORIZATION_ROLLBACK_REFUSED_ROWS_PRESENT") < rollback.index("DROP TABLE")
    sql = code(SNAPSHOT_V4)
    assert not re.search(r"\b(INSERT|UPDATE|DELETE|TRUNCATE|GRANT\s+(?!EXECUTE))\b", sql.split("$snapshot$")[1], re.I)


def test_the_operator_step_is_not_a_migration_refuses_without_an_owner_decision_and_asserts_identity():
    assert not any("attempt_authorizations_2026-10-14" in p.name for p in (ROOT / "supabase/migrations").iterdir())
    sql = OPERATOR.read_text()
    assert "H3E_ATTEMPT_AUTHORIZATION_DECISION_NOT_RECORDED" in sql
    assert "_decision constant text := 'OWNER_DECISION_REF';" in sql  # placeholder until the owner decides
    for fact in ("e3f93688-01ea-4844-ae96-b6219d2bad17", "4b5e3530-0f7b-49f6-af8a-68ab2470f3f0",
                 "02079600-8ac0-4141-aea8-d30daeb807fd", "4a3a2f84-84b9-4bdf-af62-935064766a72",
                 "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
                 "2026-10-14 05:21:07.701534+00", "2026-10-14 05:39:11.416473+00"):
        assert fact in sql, fact
    body = code(OPERATOR)
    assert len(re.findall(r"\bINSERT\s+INTO\b", body, re.I)) == 1
    assert "INSERT INTO public.h3e_attempt_authorizations" in body
    assert not re.search(r"\b(UPDATE|DELETE|TRUNCATE)\b", body, re.I)
