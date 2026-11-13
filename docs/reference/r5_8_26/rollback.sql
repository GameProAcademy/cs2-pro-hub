-- R5.8.26 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.25 recorder and provenance-assertion bodies (deployment d57b9089,
-- semantic = build = c3593d48, demoparser2 0.42.2, raw_evidence.py blob a71a99e8; the other blobs are
-- unchanged) and the R5.8.25 comments. Both releases have semantic = build, so every commit occurrence
-- maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
-- Roll the Railway worker back to deployment d57b9089 together with this file.
DO $r5826rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5825_md5 constant text[] := ARRAY['cbb03f77e6e3dae28c567483c3ba252b', 'a3401a4b1da8553296b6d541afd44bf4'];
  _r5826_md5 constant text[] := ARRAY['f727480e469669cdb495f7eb5de6b7e1', '04798c612e7e6a0fe6b5d7ad6f7541a0'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5826_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '2f0e6812-6aa0-4137-b9ca-aa541dafe103', 'd57b9089-ea97-44b0-b236-6868f84459e2');
      _definition := pg_catalog.replace(_definition, '7e84f6da0a60c1b48897ec24bb721cde9aa65a62', 'c3593d48e3b8923048def625cf59144100f59892');
      _definition := pg_catalog.replace(_definition, '6e6721b0245c99f7966b8083bbedef9b9cd0282b', 'a71a99e8df282f761326e4e8211f80a64c4083e5');
      EXECUTE _definition;
    ELSIF _md5 <> _r5825_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_26_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5825_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_26_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.25 re-pinned recorder: Railway deployment d57b9089-ea97-44b0-b236-6868f84459e2 (controlled release of c3593d48), demoparser2 0.42.2, semantic git:c3593d48e3b8923048def625cf59144100f59892, build git:c3593d48e3b8923048def625cf59144100f59892, parser.py blob 5d39478c611b57b2dd17f93c9cdce8faa84860f9, adapter.py blob 4e6f43c7916bb7d855cfd1abcd26637bb0f3f942, raw_evidence.py blob a71a99e8df282f761326e4e8211f80a64c4083e5, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.25 re-pinned provenance assertion: Railway deployment d57b9089-ea97-44b0-b236-6868f84459e2, demoparser2 0.42.2, semantic git:c3593d48e3b8923048def625cf59144100f59892, build git:c3593d48e3b8923048def625cf59144100f59892, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5826rollback$;
