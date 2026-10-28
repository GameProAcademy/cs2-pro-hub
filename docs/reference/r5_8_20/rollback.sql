-- R5.8.20 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.19 recorder and provenance-assertion bodies (deployment 7179fcce,
-- semantic = build = 47ed6454, parser.py blob 20ff3dfb) and the R5.8.19 comments. Both
-- releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5820rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5819_md5 constant text[] := ARRAY['7f78aec6241efb8cf188156ddeeffbcd', 'bb393072eb936fb983697240c874e17b'];
  _r5820_md5 constant text[] := ARRAY['056e486322c9fd513eb2c0f56100084d', '145a05ae2a81c12bcc3b1f3795c230c9'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5820_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, 'b0895901-1330-4676-9f57-95ddb99060c2', '7179fcce-cb04-4c35-9d4b-eb025166b4fd');
      _definition := pg_catalog.replace(_definition, '4bf17c9fe5e10a105154b5d46a7ea1e05e971911', '20ff3dfb98505a8fcd25c38f2aff12eab076684e');
      _definition := pg_catalog.replace(_definition, 'c38f209d8d6e801930398c12cc8ac231e08efaf6', '47ed645407c97bb5cb9554bc5777dc21ff7b11ef');
      EXECUTE _definition;
    ELSIF _md5 <> _r5819_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_20_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5819_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_20_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.19 re-pinned recorder: Railway deployment 7179fcce-cb04-4c35-9d4b-eb025166b4fd (controlled release of 47ed6454), semantic git:47ed645407c97bb5cb9554bc5777dc21ff7b11ef, build git:47ed645407c97bb5cb9554bc5777dc21ff7b11ef, parser.py blob 20ff3dfb98505a8fcd25c38f2aff12eab076684e, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.19 re-pinned provenance assertion: Railway deployment 7179fcce-cb04-4c35-9d4b-eb025166b4fd, semantic git:47ed645407c97bb5cb9554bc5777dc21ff7b11ef, build git:47ed645407c97bb5cb9554bc5777dc21ff7b11ef, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5820rollback$;
