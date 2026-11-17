-- R5.8.31 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.30 recorder and provenance-assertion bodies (deployment 3335c88d,
-- semantic = build = 768646ea, parser.py blob bc30a72f, raw_evidence.py blob 81c0f7e5) and the
-- R5.8.30 comments. Both releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
-- Roll the Railway worker back to deployment 3335c88d (and the service source to 768646ea) with this file.
DO $r5831rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5830_md5 constant text[] := ARRAY['b46f6701d4d930c6771148a443ead4bc', '95dc9e5f05d76376b3e31488b3c1f058'];
  _r5831_md5 constant text[] := ARRAY['515f433f919370312dbe9a8a60c9dd31', 'e35c5ff8903e331f7b47214665fcab31'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5831_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '584ea563-f978-476a-9ba6-9984d16ca0ab', '3335c88d-2a0f-461c-8919-5d6086b518fd');
      _definition := pg_catalog.replace(_definition, '0c646583dc98426d4a2298a8797658253ad565c0', '768646ea76646219b1749f9fd2e757703292a24c');
      _definition := pg_catalog.replace(_definition, '421dfd9563ae1a7950d4d5a4229556a1e20df17d', 'bc30a72f6e8429387f0945d781a9ecc1c65dcb3a');
      _definition := pg_catalog.replace(_definition, '3890313eb4855fc58f9636d9688309e3356790b7', '81c0f7e5d690fcf9796838eaad6901446901a586');
      EXECUTE _definition;
    ELSIF _md5 <> _r5830_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_31_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5830_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_31_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.30 re-pinned recorder: Railway deployment 3335c88d-2a0f-461c-8919-5d6086b518fd (controlled release of 768646ea), demoparser2 0.42.2, semantic git:768646ea76646219b1749f9fd2e757703292a24c, build git:768646ea76646219b1749f9fd2e757703292a24c, parser.py blob bc30a72f6e8429387f0945d781a9ecc1c65dcb3a, adapter.py blob 1eaf38401a09baceebbf9d959adf2f30ded5e962, raw_evidence.py blob 81c0f7e5d690fcf9796838eaad6901446901a586, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.30 re-pinned provenance assertion: Railway deployment 3335c88d-2a0f-461c-8919-5d6086b518fd, demoparser2 0.42.2, semantic git:768646ea76646219b1749f9fd2e757703292a24c, build git:768646ea76646219b1749f9fd2e757703292a24c, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5831rollback$;
