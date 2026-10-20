-- R5.8.14 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.13 recorder and provenance-assertion bodies (deployment ece1c582,
-- semantic c2e045b0, build eaaa2c8d, parser.py blob 981f6261) and the R5.8.13 comments.
-- Because R5.8.14 set semantic = build = 7f70141b, each occurrence is restored by its SQL
-- context (the git_commit / semantic_revision / deployment_commit sites take the semantic
-- commit; build_revision and deployment_evidence source_commit take the build commit).
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5814rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5813_md5 constant text[] := ARRAY['d4df57084c1b0b90aef266b5b52452c5', 'f070c124846814420c72c34471c84624'];
  _r5814_md5 constant text[] := ARRAY['19a352c2be59dca326d5905c9dacb251', 'df0dc1b394d38a1f58f2a27afe0ea0cf'];
  _new constant text := '7f70141b7c3ae231fbbca4c37058c4cdbdd7aacd';
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5814_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '3acb47c5-d9a4-43f2-acff-9ead7cb12b30', 'ece1c582-5cba-403d-b25c-a60faaf1aed5');
      _definition := pg_catalog.replace(_definition, '8f75eb61f82f6746881b361234a6f5e3a59a4225', '981f6261c7e38334dfab5c93088e9d5ad1f56f6e');
      -- Build-commit contexts first, then every remaining occurrence is a semantic-commit context.
      _definition := pg_catalog.replace(_definition, 'build_revision''<>''git:' || _new, 'build_revision''<>''git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1');
      _definition := pg_catalog.replace(_definition, 'build_revision<>''git:' || _new, 'build_revision<>''git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1');
      _definition := pg_catalog.replace(_definition, 'source_commit''<>''' || _new, 'source_commit''<>''eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1');
      _definition := pg_catalog.replace(_definition, _new, 'c2e045b0f71a7699c935b65ffe514fe526889de3');
      EXECUTE _definition;
    ELSIF _md5 <> _r5813_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_14_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5813_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_14_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.13 re-pinned recorder: Railway deployment ece1c582-5cba-403d-b25c-a60faaf1aed5 (redeploy of the eaaa2c8d image), semantic git:c2e045b0f71a7699c935b65ffe514fe526889de3, build git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.13 re-pinned provenance assertion: Railway deployment ece1c582-5cba-403d-b25c-a60faaf1aed5, semantic git:c2e045b0f71a7699c935b65ffe514fe526889de3, build git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5814rollback$;
