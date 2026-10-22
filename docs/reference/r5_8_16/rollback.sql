-- R5.8.16 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.15 recorder and provenance-assertion bodies (deployment 01998834,
-- semantic = build = a5d8c425, parser.py blob 024c1dd4) and the R5.8.15 comments. Both
-- releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5816rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5815_md5 constant text[] := ARRAY['d9328086d1541927c4bf3b508c8c307b', '39418665644987bcdd25c7456634d410'];
  _r5816_md5 constant text[] := ARRAY['35198be8e0e9faeac618b4435ebb8d4f', '0f1d4e412cd22705c64c033dc0b80df8'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5816_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '1886c473-5251-4110-8ba3-60821e0b256b', '01998834-4c35-43c2-b3e4-976f76a21fd5');
      _definition := pg_catalog.replace(_definition, 'aec5f33b51373bfc69e3b51ea055fefa6352b26a', '024c1dd48abfdd5f7d34881860b8dbd2a87a3b8a');
      _definition := pg_catalog.replace(_definition, '4716f89429fd85f828e1e786d6520895d7bece53', 'a5d8c425839e1e0e7e6f5506ae141bc85359726b');
      EXECUTE _definition;
    ELSIF _md5 <> _r5815_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_16_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5815_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_16_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.15 re-pinned recorder: Railway deployment 01998834-4c35-43c2-b3e4-976f76a21fd5 (controlled release of a5d8c425), semantic git:a5d8c425839e1e0e7e6f5506ae141bc85359726b, build git:a5d8c425839e1e0e7e6f5506ae141bc85359726b, parser.py blob 024c1dd48abfdd5f7d34881860b8dbd2a87a3b8a, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.15 re-pinned provenance assertion: Railway deployment 01998834-4c35-43c2-b3e4-976f76a21fd5, semantic git:a5d8c425839e1e0e7e6f5506ae141bc85359726b, build git:a5d8c425839e1e0e7e6f5506ae141bc85359726b, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5816rollback$;
