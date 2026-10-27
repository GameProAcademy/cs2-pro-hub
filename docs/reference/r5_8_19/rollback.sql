-- R5.8.19 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.18 recorder and provenance-assertion bodies (deployment 13873137,
-- semantic = build = bc421879, parser.py blob ff3ee9f6) and the R5.8.18 comments. Both
-- releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5819rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5818_md5 constant text[] := ARRAY['d933b9e73bd850fff668a4d27a7a494e', '090e73dc4f937b514fcbc54cdd462457'];
  _r5819_md5 constant text[] := ARRAY['7f78aec6241efb8cf188156ddeeffbcd', 'bb393072eb936fb983697240c874e17b'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5819_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '7179fcce-cb04-4c35-9d4b-eb025166b4fd', '13873137-13fe-4d09-9038-0fc680f1e91c');
      _definition := pg_catalog.replace(_definition, '20ff3dfb98505a8fcd25c38f2aff12eab076684e', 'ff3ee9f6236cf6c9b3da676ff4d6376ce21f993e');
      _definition := pg_catalog.replace(_definition, '47ed645407c97bb5cb9554bc5777dc21ff7b11ef', 'bc421879aced9fe0eaf5e4b900ff2ce6da0752e8');
      EXECUTE _definition;
    ELSIF _md5 <> _r5818_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_19_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5818_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_19_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.18 re-pinned recorder: Railway deployment 13873137-13fe-4d09-9038-0fc680f1e91c (controlled release of bc421879), semantic git:bc421879aced9fe0eaf5e4b900ff2ce6da0752e8, build git:bc421879aced9fe0eaf5e4b900ff2ce6da0752e8, parser.py blob ff3ee9f6236cf6c9b3da676ff4d6376ce21f993e, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.18 re-pinned provenance assertion: Railway deployment 13873137-13fe-4d09-9038-0fc680f1e91c, semantic git:bc421879aced9fe0eaf5e4b900ff2ce6da0752e8, build git:bc421879aced9fe0eaf5e4b900ff2ce6da0752e8, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5819rollback$;
