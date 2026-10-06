-- R5.8.6 — Attestation idempotency scope reconciliation
--
-- The original recorder used the frozen Railway deployment identity as the
-- uniqueness key for parser_runtime_provenance. That makes a second legitimate
-- attestation for the same deployment impossible, even when the first
-- attestation was produced by an older main revision or a previous workflow
-- occurrence. GitHub workflow_dispatch runs are distinct attestations and the
-- authoritative nonce/digest fields already provide replay protection.
--
-- This migration preserves every existing provenance row and changes only the
-- uniqueness scope:
--   * one provenance row per attestation_digest;
--   * exact replay of the same digest returns the existing provenance id;
--   * different attestations may prove the same frozen deployment;
--   * nonce uniqueness remains an independent replay barrier.
--
-- No provenance row, nonce, Attempt 9, Canonical state, secret, parser data,
-- or Railway resource is deleted, rewritten, or promoted by this migration.

DO $migration$
DECLARE
  _constraint_name text;
BEGIN
  SELECT c.conname
    INTO _constraint_name
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class t
    ON t.oid = c.conrelid
  WHERE t.oid = 'public.parser_runtime_provenance'::regclass
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname ORDER BY a.attnum)
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = t.oid
        AND a.attnum = ANY (c.conkey)
        AND a.attnum > 0
    )::text[] = ARRAY[
      'railway_project_id',
      'railway_service_id',
      'railway_environment_id',
      'deployment_id',
      'deployment_commit',
      'semantic_revision',
      'build_revision'
    ]::text[]
  LIMIT 1;

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.parser_runtime_provenance DROP CONSTRAINT %I',
      _constraint_name
    );
  END IF;
END;
$migration$;

ALTER TABLE public.parser_runtime_provenance
  ADD CONSTRAINT parser_runtime_provenance_attestation_digest_key
  UNIQUE (attestation_digest);

DO $migration$
DECLARE
  _definition text;
  _function_oid regprocedure :=
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
  _old_conflict constant text :=
    'ON CONFLICT(railway_project_id,railway_service_id,railway_environment_id,deployment_id,deployment_commit,semantic_revision,build_revision) DO NOTHING RETURNING id INTO _id;';
  _new_conflict constant text :=
    'ON CONFLICT(attestation_digest) DO NOTHING RETURNING id INTO _id;';
  _old_conflict_block constant text :=
    'IF _id IS NULL THEN RAISE EXCEPTION ''PARSER_ATTESTATION_IDEMPOTENCY_CONFLICT'' USING ERRCODE=''23505''; END IF;';
  _new_conflict_block constant text :=
    'IF _id IS NULL THEN SELECT id INTO _id FROM public.parser_runtime_provenance WHERE attestation_digest=_attestation_digest; IF _id IS NULL THEN RAISE EXCEPTION ''PARSER_ATTESTATION_IDEMPOTENCY_CONFLICT'' USING ERRCODE=''23505''; END IF; END IF;';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(_function_oid)
    INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, _old_conflict) = 0
     OR pg_catalog.strpos(_definition, _old_conflict_block) = 0
  THEN
    RAISE EXCEPTION 'R5_8_6_RECORDER_IDEMPOTENCY_CONTRACT_NOT_FOUND'
      USING ERRCODE = '55000';
  END IF;

  _definition := pg_catalog.replace(_definition, _old_conflict, _new_conflict);
  _definition := pg_catalog.replace(_definition, _old_conflict_block, _new_conflict_block);

  EXECUTE _definition;
END;
$migration$;

DO $migration$
DECLARE
  _definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure
  )
  INTO STRICT _definition;

  IF pg_catalog.strpos(
       _definition,
       'ON CONFLICT(attestation_digest) DO NOTHING RETURNING id INTO _id;'
     ) = 0
     OR pg_catalog.strpos(
       _definition,
       'WHERE attestation_digest=_attestation_digest'
     ) = 0
     OR pg_catalog.strpos(
       _definition,
       'ON CONFLICT(railway_project_id,railway_service_id,railway_environment_id,deployment_id,deployment_commit,semantic_revision,build_revision)'
     ) <> 0
  THEN
    RAISE EXCEPTION 'R5_8_6_RECORDER_IDEMPOTENCY_POSTCONDITION_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$migration$;

COMMENT ON CONSTRAINT parser_runtime_provenance_attestation_digest_key
  ON public.parser_runtime_provenance IS
  'R5.8.6 fail-closed idempotency boundary: one immutable provenance row per attestation digest; retries of the same digest resolve the existing row, while distinct workflow attestations may prove the same frozen deployment.';
