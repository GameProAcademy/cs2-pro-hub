-- R5.8.25 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.24 recorder and provenance-assertion bodies (deployment 0ff96670,
-- semantic = build = 4badf606, demoparser2 0.42.0, parser.py blob 4102f617, adapter.py blob b9581168,
-- raw_evidence.py blob 5b7b674c, settings.py blob dc76db86) and the R5.8.24 comments. Both releases have
-- semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
-- Roll the Railway worker back to deployment 0ff96670 (demoparser2 0.42.0) together with this file.
DO $r5825rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5824_md5 constant text[] := ARRAY['c28ed93d37612ffdbe02653d8ea980eb', 'c661f1f3adf774a3376c2ed510bfe607'];
  _r5825_md5 constant text[] := ARRAY['cbb03f77e6e3dae28c567483c3ba252b', 'a3401a4b1da8553296b6d541afd44bf4'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5825_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, 'd57b9089-ea97-44b0-b236-6868f84459e2', '0ff96670-e373-4beb-90c9-f1967eee3195');
      _definition := pg_catalog.replace(_definition, 'c3593d48e3b8923048def625cf59144100f59892', '4badf6060e4e69a589179567f488f5d58a4a58dc');
      _definition := pg_catalog.replace(_definition, '5d39478c611b57b2dd17f93c9cdce8faa84860f9', '4102f6174e4dc01d97637174f4f70fe53629c285');
      _definition := pg_catalog.replace(_definition, '4e6f43c7916bb7d855cfd1abcd26637bb0f3f942', 'b95811681be20b9e849672e57a07b1de5d18e6e8');
      _definition := pg_catalog.replace(_definition, 'a71a99e8df282f761326e4e8211f80a64c4083e5', '5b7b674c88a77f85ab8791f84a47a188889b5802');
      _definition := pg_catalog.replace(_definition, '8bcadce307bb39895965fa7583fc272e2763b39d', 'dc76db86c9b0b8c0916d58501ae0c21af95dfe38');
      _definition := pg_catalog.replace(_definition, '_payload->>''parser_version''<>''0.42.2''', '_payload->>''parser_version''<>''0.42.0''');
      _definition := pg_catalog.replace(_definition, '_p.parser_version<>''0.42.2''', '_p.parser_version<>''0.42.0''');
      EXECUTE _definition;
    ELSIF _md5 <> _r5824_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_25_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5824_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_25_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.24 re-pinned recorder: Railway deployment 0ff96670-e373-4beb-90c9-f1967eee3195 (controlled release of 4badf606), semantic git:4badf6060e4e69a589179567f488f5d58a4a58dc, build git:4badf6060e4e69a589179567f488f5d58a4a58dc, parser.py blob 4102f6174e4dc01d97637174f4f70fe53629c285, adapter.py blob b95811681be20b9e849672e57a07b1de5d18e6e8, raw_evidence.py blob 5b7b674c88a77f85ab8791f84a47a188889b5802, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.24 re-pinned provenance assertion: Railway deployment 0ff96670-e373-4beb-90c9-f1967eee3195, semantic git:4badf6060e4e69a589179567f488f5d58a4a58dc, build git:4badf6060e4e69a589179567f488f5d58a4a58dc, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5825rollback$;
