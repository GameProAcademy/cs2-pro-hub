-- R5.8.21 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.20 recorder and provenance-assertion bodies (deployment b0895901,
-- semantic = build = c38f209d, parser.py blob 4bf17c9f, adapter.py blob 34ce0f19) and the R5.8.20
-- comments. Both releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5821rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5820_md5 constant text[] := ARRAY['056e486322c9fd513eb2c0f56100084d', '145a05ae2a81c12bcc3b1f3795c230c9'];
  _r5821_md5 constant text[] := ARRAY['ed206712403e8ab989b350eb89abba15', '20d82451652846c95c4934c72c5d753d'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5821_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '1c0f26d5-4064-4e6d-a552-2ce05ae517fe', 'b0895901-1330-4676-9f57-95ddb99060c2');
      _definition := pg_catalog.replace(_definition, '0dcb5962a0c977ab7a82326ebf8a0ef70bafde02', '4bf17c9fe5e10a105154b5d46a7ea1e05e971911');
      _definition := pg_catalog.replace(_definition, 'b95811681be20b9e849672e57a07b1de5d18e6e8', '34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71');
      _definition := pg_catalog.replace(_definition, 'e8f287500d53586f230a71eff17689969634ecd2', 'c38f209d8d6e801930398c12cc8ac231e08efaf6');
      EXECUTE _definition;
    ELSIF _md5 <> _r5820_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_21_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5820_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_21_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.20 re-pinned recorder: Railway deployment b0895901-1330-4676-9f57-95ddb99060c2 (controlled release of c38f209d), semantic git:c38f209d8d6e801930398c12cc8ac231e08efaf6, build git:c38f209d8d6e801930398c12cc8ac231e08efaf6, parser.py blob 4bf17c9fe5e10a105154b5d46a7ea1e05e971911, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.20 re-pinned provenance assertion: Railway deployment b0895901-1330-4676-9f57-95ddb99060c2, semantic git:c38f209d8d6e801930398c12cc8ac231e08efaf6, build git:c38f209d8d6e801930398c12cc8ac231e08efaf6, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5821rollback$;
