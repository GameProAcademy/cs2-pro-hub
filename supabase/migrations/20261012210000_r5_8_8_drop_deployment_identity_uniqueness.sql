-- R5.8.8 — Finish R5.8.6: remove deployment-scoped provenance uniqueness.
--
-- R5.8.6 (20261006120000, PR #56) moved provenance idempotency from the frozen
-- Railway deployment identity to attestation_digest, so that distinct signed
-- attestations may prove the same deployment. It looked for a UNIQUE
-- *constraint* over the deployment columns, but 20260921080334 had created a
-- UNIQUE *index* (parser_runtime_provenance_deployment_identity_idx), so on
-- every database built from the repository the deployment-scoped uniqueness
-- survived. The managed database no longer has it and holds two VERIFIED
-- attestations of one deployment. Owner decision D3 (option a, 2026-10-12):
-- remove it from repository builds too. docs/H3E_RELEASE_IDENTITY_TRACEABILITY.md
--
-- Behaviour:
--   index present with exactly the expected definition  -> dropped;
--   index absent and no other unique deployment key      -> no-op;
--   anything else (other definition, constraint-backed, another unique index
--   over the deployment columns, missing digest key, unexpected recorder)
--                                                        -> fails closed.
-- Replay and forgery controls are asserted, not changed: UNIQUE
-- (attestation_digest) on provenance and on nonces, the nonce primary key, and
-- the recorder (md5 fe3250af…, ON CONFLICT (attestation_digest), HMAC,
-- freshness, binding and hash checks). No row is read for content, inserted,
-- updated or deleted. Not for automatic application to the managed database.
DO $migration$
DECLARE
  _table constant regclass := 'public.parser_runtime_provenance'::regclass;
  _index_name constant text := 'parser_runtime_provenance_deployment_identity_idx';
  _expected_index constant text :=
    'CREATE UNIQUE INDEX parser_runtime_provenance_deployment_identity_idx ON public.parser_runtime_provenance '
    'USING btree (railway_project_id, railway_service_id, railway_environment_id, deployment_id, '
    'deployment_commit, semantic_revision, build_revision)';
  _deployment_columns constant text[] := ARRAY[
    'railway_project_id', 'railway_service_id', 'railway_environment_id', 'deployment_id',
    'deployment_commit', 'semantic_revision', 'build_revision'];
  _index regclass;
  _step text;
BEGIN
  FOREACH _step IN ARRAY ARRAY['before', 'after'] LOOP
    -- Independent replay and forgery controls must exist in both states.
    IF NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_constraint c
         WHERE c.conrelid = _table AND c.contype = 'u'
           AND c.conname = 'parser_runtime_provenance_attestation_digest_key'
           AND pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (attestation_digest)')
       OR NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_constraint c
         WHERE c.conrelid = 'public.parser_attestation_nonces'::regclass AND c.contype = 'p'
           AND pg_catalog.pg_get_constraintdef(c.oid) = 'PRIMARY KEY (nonce)')
       OR NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_constraint c
         WHERE c.conrelid = 'public.parser_attestation_nonces'::regclass AND c.contype = 'u'
           AND pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (attestation_digest)')
    THEN
      RAISE EXCEPTION 'R5_8_8_REPLAY_CONTROLS_MISSING (%)', _step USING ERRCODE = '55000';
    END IF;

    IF (SELECT md5(p.prosrc) FROM pg_catalog.pg_proc p
        WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure)
       IS DISTINCT FROM 'fe3250af2b461f03f459adf36b43ec21'
    THEN
      RAISE EXCEPTION 'R5_8_8_RECORDER_NOT_RECONCILED (%)', _step USING ERRCODE = '55000';
    END IF;

    -- No deployment-scoped uniqueness other than the one this migration owns.
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
      WHERE i.indrelid = _table AND i.indisunique AND ic.relname <> _index_name
        AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY a.attname)
             FROM pg_catalog.pg_attribute a
             WHERE a.attrelid = _table AND a.attnum = ANY (i.indkey))
            = (SELECT pg_catalog.array_agg(c ORDER BY c) FROM pg_catalog.unnest(_deployment_columns) c)
    ) THEN
      RAISE EXCEPTION 'R5_8_8_UNEXPECTED_DEPLOYMENT_UNIQUENESS (%)', _step USING ERRCODE = '55000';
    END IF;

    _index := pg_catalog.to_regclass('public.' || _index_name);

    IF _step = 'before' AND _index IS NOT NULL THEN
      IF pg_catalog.pg_get_indexdef(_index) IS DISTINCT FROM _expected_index
         OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
                        WHERE i.indexrelid = _index AND i.indrelid = _table AND i.indisunique
                          AND i.indpred IS NULL AND i.indexprs IS NULL)
         OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conindid = _index)
      THEN
        RAISE EXCEPTION 'R5_8_8_UNEXPECTED_INDEX_DEFINITION: %', pg_catalog.pg_get_indexdef(_index)
          USING ERRCODE = '55000';
      END IF;
      EXECUTE pg_catalog.format('DROP INDEX public.%I', _index_name);
    ELSIF _step = 'before' THEN
      RAISE NOTICE 'R5_8_8_DEPLOYMENT_INDEX_ALREADY_ABSENT';
    ELSIF _index IS NOT NULL THEN
      RAISE EXCEPTION 'R5_8_8_POSTCONDITION_INDEX_STILL_PRESENT' USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$migration$;
