-- R5.8.17 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.16 recorder and provenance-assertion bodies (deployment 1886c473,
-- semantic = build = 4716f894, parser.py blob aec5f33b) and the R5.8.16 comments. Both
-- releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5817rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5816_md5 constant text[] := ARRAY['35198be8e0e9faeac618b4435ebb8d4f', '0f1d4e412cd22705c64c033dc0b80df8'];
  _r5817_md5 constant text[] := ARRAY['4b0973036c801e2bd4604bf4b6321943', 'eb5c01dd48ae19f1aeae8cc9adffdf9d'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5817_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '02e64c36-75de-4d88-aa15-e3c661879d64', '1886c473-5251-4110-8ba3-60821e0b256b');
      _definition := pg_catalog.replace(_definition, 'd55e7929a54a811d66b1f1f214abd8bea3fb2e40', 'aec5f33b51373bfc69e3b51ea055fefa6352b26a');
      _definition := pg_catalog.replace(_definition, '2aa2a497421367a1ba205633eb23f5e69f95cd74', '4716f89429fd85f828e1e786d6520895d7bece53');
      EXECUTE _definition;
    ELSIF _md5 <> _r5816_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_17_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5816_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_17_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.16 re-pinned recorder: Railway deployment 1886c473-5251-4110-8ba3-60821e0b256b (controlled release of 4716f894), semantic git:4716f89429fd85f828e1e786d6520895d7bece53, build git:4716f89429fd85f828e1e786d6520895d7bece53, parser.py blob aec5f33b51373bfc69e3b51ea055fefa6352b26a, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.16 re-pinned provenance assertion: Railway deployment 1886c473-5251-4110-8ba3-60821e0b256b, semantic git:4716f89429fd85f828e1e786d6520895d7bece53, build git:4716f89429fd85f828e1e786d6520895d7bece53, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5817rollback$;
