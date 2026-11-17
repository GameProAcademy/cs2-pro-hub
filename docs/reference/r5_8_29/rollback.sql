-- R5.8.29 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.28 recorder and provenance-assertion bodies (deployment bb92ed95,
-- semantic = build = b440a06f, adapter.py blob 020f847a) and the R5.8.28 comments. Both releases have
-- semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
-- Roll the Railway worker back to deployment bb92ed95 (and the service source to b440a06f) with this file.
DO $r5829rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5828_md5 constant text[] := ARRAY['99776ca5ef4fdbbb125e76433c927547', '1918875c864bce269f03777464b2ae38'];
  _r5829_md5 constant text[] := ARRAY['3e2125a20131fab9653df150448acce3', 'bfd8a96d016da0494f8cf3eeb65da847'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5829_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '3375b68b-c996-445f-b979-ed6318c89970', 'bb92ed95-7dd6-4d1c-af27-057140f038dd');
      _definition := pg_catalog.replace(_definition, '47ba6ffef76feae95dc98075cf3fb8089e02ce8f', 'b440a06fc06831be3cfe0b2080f6be901dad3019');
      _definition := pg_catalog.replace(_definition, '3e4f4a049e952064f68f0a39614f5e6539d5a88a', '020f847ad57d770779dd4951beb597023fea060e');
      EXECUTE _definition;
    ELSIF _md5 <> _r5828_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_29_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5828_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_29_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.28 re-pinned recorder: Railway deployment bb92ed95-7dd6-4d1c-af27-057140f038dd (controlled release of b440a06f), demoparser2 0.42.2, semantic git:b440a06fc06831be3cfe0b2080f6be901dad3019, build git:b440a06fc06831be3cfe0b2080f6be901dad3019, parser.py blob bc30a72f6e8429387f0945d781a9ecc1c65dcb3a, adapter.py blob 020f847ad57d770779dd4951beb597023fea060e, raw_evidence.py blob 6e6721b0245c99f7966b8083bbedef9b9cd0282b, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.28 re-pinned provenance assertion: Railway deployment bb92ed95-7dd6-4d1c-af27-057140f038dd, demoparser2 0.42.2, semantic git:b440a06fc06831be3cfe0b2080f6be901dad3019, build git:b440a06fc06831be3cfe0b2080f6be901dad3019, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5829rollback$;
