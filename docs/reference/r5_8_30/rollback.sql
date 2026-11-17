-- R5.8.30 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.29 recorder and provenance-assertion bodies (deployment 3375b68b,
-- semantic = build = 47ba6ffe, adapter.py blob 3e4f4a04, raw_evidence.py blob 6e6721b0) and the
-- R5.8.29 comments. Both releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
-- Roll the Railway worker back to deployment 3375b68b (and the service source to 47ba6ffe) with this file.
DO $r5830rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5829_md5 constant text[] := ARRAY['3e2125a20131fab9653df150448acce3', 'bfd8a96d016da0494f8cf3eeb65da847'];
  _r5830_md5 constant text[] := ARRAY['b46f6701d4d930c6771148a443ead4bc', '95dc9e5f05d76376b3e31488b3c1f058'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5830_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '3335c88d-2a0f-461c-8919-5d6086b518fd', '3375b68b-c996-445f-b979-ed6318c89970');
      _definition := pg_catalog.replace(_definition, '768646ea76646219b1749f9fd2e757703292a24c', '47ba6ffef76feae95dc98075cf3fb8089e02ce8f');
      _definition := pg_catalog.replace(_definition, '1eaf38401a09baceebbf9d959adf2f30ded5e962', '3e4f4a049e952064f68f0a39614f5e6539d5a88a');
      _definition := pg_catalog.replace(_definition, '81c0f7e5d690fcf9796838eaad6901446901a586', '6e6721b0245c99f7966b8083bbedef9b9cd0282b');
      EXECUTE _definition;
    ELSIF _md5 <> _r5829_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_30_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5829_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_30_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.29 re-pinned recorder: Railway deployment 3375b68b-c996-445f-b979-ed6318c89970 (controlled release of 47ba6ffe), demoparser2 0.42.2, semantic git:47ba6ffef76feae95dc98075cf3fb8089e02ce8f, build git:47ba6ffef76feae95dc98075cf3fb8089e02ce8f, parser.py blob bc30a72f6e8429387f0945d781a9ecc1c65dcb3a, adapter.py blob 3e4f4a049e952064f68f0a39614f5e6539d5a88a, raw_evidence.py blob 6e6721b0245c99f7966b8083bbedef9b9cd0282b, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.29 re-pinned provenance assertion: Railway deployment 3375b68b-c996-445f-b979-ed6318c89970, demoparser2 0.42.2, semantic git:47ba6ffef76feae95dc98075cf3fb8089e02ce8f, build git:47ba6ffef76feae95dc98075cf3fb8089e02ce8f, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5830rollback$;
