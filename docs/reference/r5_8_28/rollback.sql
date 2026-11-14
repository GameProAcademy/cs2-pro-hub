-- R5.8.28 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.27 recorder and provenance-assertion bodies (deployment 7690b171,
-- semantic = build = 3837a810, parser.py blob 99ff0ccc) and the R5.8.27 comments. Both releases have
-- semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
-- Roll the Railway worker back to deployment 7690b171 (and the service source to 3837a810) with this file.
DO $r5828rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5827_md5 constant text[] := ARRAY['640a6f7281fc3cf425d888b3ee124f21', '475c684986af01f67c1ce6e3461de189'];
  _r5828_md5 constant text[] := ARRAY['99776ca5ef4fdbbb125e76433c927547', '1918875c864bce269f03777464b2ae38'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5828_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, 'bb92ed95-7dd6-4d1c-af27-057140f038dd', '7690b171-087f-46ca-9899-a5b96d8c32cb');
      _definition := pg_catalog.replace(_definition, 'b440a06fc06831be3cfe0b2080f6be901dad3019', '3837a810c4569c0f1c2ef67064cb0f0869003c7a');
      _definition := pg_catalog.replace(_definition, 'bc30a72f6e8429387f0945d781a9ecc1c65dcb3a', '99ff0cccb999e950f1253a29d3f87ca9e22f067a');
      EXECUTE _definition;
    ELSIF _md5 <> _r5827_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_28_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5827_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_28_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.27 re-pinned recorder: Railway deployment 7690b171-087f-46ca-9899-a5b96d8c32cb (controlled release of 3837a810), demoparser2 0.42.2, semantic git:3837a810c4569c0f1c2ef67064cb0f0869003c7a, build git:3837a810c4569c0f1c2ef67064cb0f0869003c7a, parser.py blob 99ff0cccb999e950f1253a29d3f87ca9e22f067a, adapter.py blob 020f847ad57d770779dd4951beb597023fea060e, raw_evidence.py blob 6e6721b0245c99f7966b8083bbedef9b9cd0282b, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.27 re-pinned provenance assertion: Railway deployment 7690b171-087f-46ca-9899-a5b96d8c32cb, demoparser2 0.42.2, semantic git:3837a810c4569c0f1c2ef67064cb0f0869003c7a, build git:3837a810c4569c0f1c2ef67064cb0f0869003c7a, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5828rollback$;
