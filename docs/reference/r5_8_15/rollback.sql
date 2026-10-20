-- R5.8.15 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.14 recorder and provenance-assertion bodies (deployment 3acb47c5,
-- semantic = build = 7f70141b, parser.py blob 8f75eb61) and the R5.8.14 comments. Both
-- releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5815rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5814_md5 constant text[] := ARRAY['19a352c2be59dca326d5905c9dacb251', 'df0dc1b394d38a1f58f2a27afe0ea0cf'];
  _r5815_md5 constant text[] := ARRAY['d9328086d1541927c4bf3b508c8c307b', '39418665644987bcdd25c7456634d410'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5815_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '01998834-4c35-43c2-b3e4-976f76a21fd5', '3acb47c5-d9a4-43f2-acff-9ead7cb12b30');
      _definition := pg_catalog.replace(_definition, '024c1dd48abfdd5f7d34881860b8dbd2a87a3b8a', '8f75eb61f82f6746881b361234a6f5e3a59a4225');
      _definition := pg_catalog.replace(_definition, 'a5d8c425839e1e0e7e6f5506ae141bc85359726b', '7f70141b7c3ae231fbbca4c37058c4cdbdd7aacd');
      EXECUTE _definition;
    ELSIF _md5 <> _r5814_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_15_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5814_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_15_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.14 re-pinned recorder: Railway deployment 3acb47c5-d9a4-43f2-acff-9ead7cb12b30 (controlled release of 7f70141b), semantic git:7f70141b7c3ae231fbbca4c37058c4cdbdd7aacd, build git:7f70141b7c3ae231fbbca4c37058c4cdbdd7aacd, parser.py blob 8f75eb61f82f6746881b361234a6f5e3a59a4225, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.14 re-pinned provenance assertion: Railway deployment 3acb47c5-d9a4-43f2-acff-9ead7cb12b30, semantic git:7f70141b7c3ae231fbbca4c37058c4cdbdd7aacd, build git:7f70141b7c3ae231fbbca4c37058c4cdbdd7aacd, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5815rollback$;
