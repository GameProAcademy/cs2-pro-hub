-- Rollback of 20261012210000_r5_8_8 for REPOSITORY-BUILT databases only.
--
-- Re-creates parser_runtime_provenance_deployment_identity_idx. It never deletes
-- or rewrites provenance: if two rows already share a deployment identity, it
-- fails closed and leaves everything as it is. On the managed database the
-- index was already absent before R5.8.8, two VERIFIED attestations share
-- deployment 1b5778de…, and this file must not be run there: it refuses
-- (R5_8_8_ROLLBACK_REFUSED_ON_MANAGED_DATABASE), and would refuse again for the
-- two attestations of one deployment.
DO $rollback$
DECLARE
  _label constant text := 'R5_8_8_ROLLBACK';
  _managed boolean;
BEGIN
  -- Refuse on the managed database. Its migration history carries rows written
  -- by the platform (created_by = 'apikey@lovable.dev'); repository builds made
  -- by the Supabase CLI or by tests do not.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
             WHERE a.attrelid = pg_catalog.to_regclass('supabase_migrations.schema_migrations')
               AND a.attname = 'created_by' AND NOT a.attisdropped) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations '
            'WHERE created_by = ''apikey@lovable.dev'')' INTO _managed;
    IF _managed THEN
      RAISE EXCEPTION '%_REFUSED_ON_MANAGED_DATABASE', _label USING ERRCODE = '55000';
    END IF;
  END IF;
  IF pg_catalog.to_regclass('public.parser_runtime_provenance_deployment_identity_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'R5_8_8_ROLLBACK_INDEX_ALREADY_PRESENT' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.parser_runtime_provenance
    GROUP BY railway_project_id, railway_service_id, railway_environment_id, deployment_id,
             deployment_commit, semantic_revision, build_revision
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'R5_8_8_ROLLBACK_WOULD_REQUIRE_DELETING_ATTESTATIONS' USING ERRCODE = '55000';
  END IF;
  CREATE UNIQUE INDEX parser_runtime_provenance_deployment_identity_idx
    ON public.parser_runtime_provenance (
      railway_project_id, railway_service_id, railway_environment_id,
      deployment_id, deployment_commit, semantic_revision, build_revision
    );
END;
$rollback$;
