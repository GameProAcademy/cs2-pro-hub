INSERT INTO supabase_migrations.schema_migrations (
  version,
  statements,
  name,
  created_by
)
SELECT
  '20260914030000',
  ARRAY['FASE 2.7.2D — deterministic duplicate-demo retry semantics. Functions applied through Lovable Cloud migration tooling.'],
  'demo_duplicate_retry_semantics',
  'apikey@lovable.dev'
WHERE NOT EXISTS (
  SELECT 1
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260914030000'
);