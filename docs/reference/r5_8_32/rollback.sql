-- R5.8.32 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.31 recorder and provenance-assertion bodies (deployment 584ea563,
-- semantic = build = 0c646583, parser.py blob 421dfd95, adapter.py blob 1eaf3840) and the
-- R5.8.31 comments. Both releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
-- Roll the Railway worker back to deployment 584ea563 (and the service source to 0c646583) with this file,
-- and the three app values back to 0c646583dc98426d4a2298a8797658253ad565c0.
DO $r5832rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5831_md5 constant text[] := ARRAY['515f433f919370312dbe9a8a60c9dd31', 'e35c5ff8903e331f7b47214665fcab31'];
  _r5832_md5 constant text[] := ARRAY['e477fc605fa2de200f15e956713cdaf3', 'dd1f25ccd089798dc27599106307825d'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5832_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, 'c372485e-b6b4-4209-8c6b-c4d16678b52d', '584ea563-f978-476a-9ba6-9984d16ca0ab');
      _definition := pg_catalog.replace(_definition, '4f7466ec448ed5736ca337224890cd56aae10b85', '0c646583dc98426d4a2298a8797658253ad565c0');
      _definition := pg_catalog.replace(_definition, '0a039253f2425af661c2830d1aa06f4cd67c3e76', '421dfd9563ae1a7950d4d5a4229556a1e20df17d');
      _definition := pg_catalog.replace(_definition, 'b95b430f3783e7f637c8321eff0f86618a1525a6', '1eaf38401a09baceebbf9d959adf2f30ded5e962');
      EXECUTE _definition;
    ELSIF _md5 <> _r5831_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_32_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5831_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_32_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.31 re-pinned recorder: Railway deployment 584ea563-f978-476a-9ba6-9984d16ca0ab (controlled release of 0c646583), demoparser2 0.42.2, semantic git:0c646583dc98426d4a2298a8797658253ad565c0, build git:0c646583dc98426d4a2298a8797658253ad565c0, parser.py blob 421dfd9563ae1a7950d4d5a4229556a1e20df17d, adapter.py blob 1eaf38401a09baceebbf9d959adf2f30ded5e962, raw_evidence.py blob 3890313eb4855fc58f9636d9688309e3356790b7, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.31 re-pinned provenance assertion: Railway deployment 584ea563-f978-476a-9ba6-9984d16ca0ab, demoparser2 0.42.2, semantic git:0c646583dc98426d4a2298a8797658253ad565c0, build git:0c646583dc98426d4a2298a8797658253ad565c0, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5832rollback$;
