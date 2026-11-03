-- R5.8.22 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.21 recorder and provenance-assertion bodies (deployment 1c0f26d5,
-- semantic = build = e8f28750, raw_evidence.py blob 001281ee) and the R5.8.21 comments. Both
-- releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5822rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5821_md5 constant text[] := ARRAY['ed206712403e8ab989b350eb89abba15', '20d82451652846c95c4934c72c5d753d'];
  _r5822_md5 constant text[] := ARRAY['2a7b517911981b45ca57947a8b1627be', '8253e121dbcd90aa86a70296eb05d961'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5822_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '2edd7ed1-2703-42ad-abe3-ebe13d235e81', '1c0f26d5-4064-4e6d-a552-2ce05ae517fe');
      _definition := pg_catalog.replace(_definition, 'f906889c795a7e6e8a41902e8e453f3f5b9d956e', '001281eecb02ebc318ff997f734c4081c161d1d9');
      _definition := pg_catalog.replace(_definition, 'c764f858ffa9df0ffa2740bdba450c7a37be2f3e', 'e8f287500d53586f230a71eff17689969634ecd2');
      EXECUTE _definition;
    ELSIF _md5 <> _r5821_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_22_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5821_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_22_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.21 re-pinned recorder: Railway deployment 1c0f26d5-4064-4e6d-a552-2ce05ae517fe (controlled release of e8f28750), semantic git:e8f287500d53586f230a71eff17689969634ecd2, build git:e8f287500d53586f230a71eff17689969634ecd2, parser.py blob 0dcb5962a0c977ab7a82326ebf8a0ef70bafde02, adapter.py blob b95811681be20b9e849672e57a07b1de5d18e6e8, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.21 re-pinned provenance assertion: Railway deployment 1c0f26d5-4064-4e6d-a552-2ce05ae517fe, semantic git:e8f287500d53586f230a71eff17689969634ecd2, build git:e8f287500d53586f230a71eff17689969634ecd2, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5822rollback$;
