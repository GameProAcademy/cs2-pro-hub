-- R5.8.23 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.22 recorder and provenance-assertion bodies (deployment 2edd7ed1,
-- semantic = build = c764f858, raw_evidence.py blob f906889c) and the R5.8.22 comments. Both
-- releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5823rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5822_md5 constant text[] := ARRAY['2a7b517911981b45ca57947a8b1627be', '8253e121dbcd90aa86a70296eb05d961'];
  _r5823_md5 constant text[] := ARRAY['ea3ba14c6cabd8013e6fc8a50c036158', 'fb659f89da5963b778aa18c668e7fd54'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5823_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '7324404e-f15d-45a0-8ec7-518a0770ca81', '2edd7ed1-2703-42ad-abe3-ebe13d235e81');
      _definition := pg_catalog.replace(_definition, 'b72c3174216f833522d66d8bc6c43f1af2d6fb17', 'f906889c795a7e6e8a41902e8e453f3f5b9d956e');
      _definition := pg_catalog.replace(_definition, '94c6460b6c577e66e573a3a1d53f11a8edd5feae', 'c764f858ffa9df0ffa2740bdba450c7a37be2f3e');
      EXECUTE _definition;
    ELSIF _md5 <> _r5822_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_23_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5822_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_23_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.22 re-pinned recorder: Railway deployment 2edd7ed1-2703-42ad-abe3-ebe13d235e81 (controlled release of c764f858), semantic git:c764f858ffa9df0ffa2740bdba450c7a37be2f3e, build git:c764f858ffa9df0ffa2740bdba450c7a37be2f3e, parser.py blob 0dcb5962a0c977ab7a82326ebf8a0ef70bafde02, adapter.py blob b95811681be20b9e849672e57a07b1de5d18e6e8, raw_evidence.py blob f906889c795a7e6e8a41902e8e453f3f5b9d956e, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.22 re-pinned provenance assertion: Railway deployment 2edd7ed1-2703-42ad-abe3-ebe13d235e81, semantic git:c764f858ffa9df0ffa2740bdba450c7a37be2f3e, build git:c764f858ffa9df0ffa2740bdba450c7a37be2f3e, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5823rollback$;
