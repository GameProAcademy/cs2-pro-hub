-- R5.8.24 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.23 recorder and provenance-assertion bodies (deployment 7324404e,
-- semantic = build = 94c6460b, parser.py blob 0dcb5962, raw_evidence.py blob b72c3174) and the R5.8.23
-- comments. Both releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5824rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5823_md5 constant text[] := ARRAY['ea3ba14c6cabd8013e6fc8a50c036158', 'fb659f89da5963b778aa18c668e7fd54'];
  _r5824_md5 constant text[] := ARRAY['c28ed93d37612ffdbe02653d8ea980eb', 'c661f1f3adf774a3376c2ed510bfe607'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5824_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '0ff96670-e373-4beb-90c9-f1967eee3195', '7324404e-f15d-45a0-8ec7-518a0770ca81');
      _definition := pg_catalog.replace(_definition, '5b7b674c88a77f85ab8791f84a47a188889b5802', 'b72c3174216f833522d66d8bc6c43f1af2d6fb17');
      _definition := pg_catalog.replace(_definition, '4102f6174e4dc01d97637174f4f70fe53629c285', '0dcb5962a0c977ab7a82326ebf8a0ef70bafde02');
      _definition := pg_catalog.replace(_definition, '4badf6060e4e69a589179567f488f5d58a4a58dc', '94c6460b6c577e66e573a3a1d53f11a8edd5feae');
      EXECUTE _definition;
    ELSIF _md5 <> _r5823_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_24_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5823_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_24_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.23 re-pinned recorder: Railway deployment 7324404e-f15d-45a0-8ec7-518a0770ca81 (controlled release of 94c6460b), semantic git:94c6460b6c577e66e573a3a1d53f11a8edd5feae, build git:94c6460b6c577e66e573a3a1d53f11a8edd5feae, parser.py blob 0dcb5962a0c977ab7a82326ebf8a0ef70bafde02, adapter.py blob b95811681be20b9e849672e57a07b1de5d18e6e8, raw_evidence.py blob b72c3174216f833522d66d8bc6c43f1af2d6fb17, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.23 re-pinned provenance assertion: Railway deployment 7324404e-f15d-45a0-8ec7-518a0770ca81, semantic git:94c6460b6c577e66e573a3a1d53f11a8edd5feae, build git:94c6460b6c577e66e573a3a1d53f11a8edd5feae, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5824rollback$;
