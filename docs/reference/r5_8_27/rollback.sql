-- R5.8.27 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.26 recorder and provenance-assertion bodies (deployment 2f0e6812,
-- semantic = build = 7e84f6da, parser.py blob 5d39478c, adapter.py blob 4e6f43c7) and the R5.8.26
-- comments. Both releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
-- Roll the Railway worker back to deployment 2f0e6812 together with this file.
DO $r5827rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5826_md5 constant text[] := ARRAY['f727480e469669cdb495f7eb5de6b7e1', '04798c612e7e6a0fe6b5d7ad6f7541a0'];
  _r5827_md5 constant text[] := ARRAY['640a6f7281fc3cf425d888b3ee124f21', '475c684986af01f67c1ce6e3461de189'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5827_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '7690b171-087f-46ca-9899-a5b96d8c32cb', '2f0e6812-6aa0-4137-b9ca-aa541dafe103');
      _definition := pg_catalog.replace(_definition, '3837a810c4569c0f1c2ef67064cb0f0869003c7a', '7e84f6da0a60c1b48897ec24bb721cde9aa65a62');
      _definition := pg_catalog.replace(_definition, '99ff0cccb999e950f1253a29d3f87ca9e22f067a', '5d39478c611b57b2dd17f93c9cdce8faa84860f9');
      _definition := pg_catalog.replace(_definition, '020f847ad57d770779dd4951beb597023fea060e', '4e6f43c7916bb7d855cfd1abcd26637bb0f3f942');
      EXECUTE _definition;
    ELSIF _md5 <> _r5826_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_27_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5826_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_27_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.26 re-pinned recorder: Railway deployment 2f0e6812-6aa0-4137-b9ca-aa541dafe103 (controlled release of 7e84f6da), demoparser2 0.42.2, semantic git:7e84f6da0a60c1b48897ec24bb721cde9aa65a62, build git:7e84f6da0a60c1b48897ec24bb721cde9aa65a62, parser.py blob 5d39478c611b57b2dd17f93c9cdce8faa84860f9, adapter.py blob 4e6f43c7916bb7d855cfd1abcd26637bb0f3f942, raw_evidence.py blob 6e6721b0245c99f7966b8083bbedef9b9cd0282b, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.26 re-pinned provenance assertion: Railway deployment 2f0e6812-6aa0-4137-b9ca-aa541dafe103, demoparser2 0.42.2, semantic git:7e84f6da0a60c1b48897ec24bb721cde9aa65a62, build git:7e84f6da0a60c1b48897ec24bb721cde9aa65a62, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5827rollback$;
