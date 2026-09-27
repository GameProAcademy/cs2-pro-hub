-- Historical Lovable Cloud migration-history bookkeeping.
-- Supabase's standard local schema_migrations table does not expose a
-- created_by column. Keep this migration harmless on a clean local stack;
-- only perform the legacy bookkeeping when that optional column actually
-- exists in the target database.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
      AND column_name = 'created_by'
  ) THEN
    EXECUTE $sql$
      INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by)
      SELECT
        '20260914030000',
        ARRAY['FASE 2.7.2D — deterministic duplicate-demo retry semantics. Functions applied through Lovable Cloud migration tooling.'],
        'demo_duplicate_retry_semantics',
        'apikey@lovable.dev'
      WHERE NOT EXISTS (
        SELECT 1
        FROM supabase_migrations.schema_migrations
        WHERE version = '20260914030000'
      )
    $sql$;
  END IF;
END
$$;