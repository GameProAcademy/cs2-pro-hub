-- R5.8.18 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.17 recorder and provenance-assertion bodies (deployment 02e64c36,
-- semantic = build = 2aa2a497, parser.py blob d55e7929) and the R5.8.17 comments. Both
-- releases have semantic = build, so every commit occurrence maps back one to one.
-- It touches no row, grant, owner, trigger or index; any other state fails closed.
DO $r5818rollback$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5817_md5 constant text[] := ARRAY['4b0973036c801e2bd4604bf4b6321943', 'eb5c01dd48ae19f1aeae8cc9adffdf9d'];
  _r5818_md5 constant text[] := ARRAY['d933b9e73bd850fff668a4d27a7a494e', '090e73dc4f937b514fcbc54cdd462457'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5818_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      _definition := pg_catalog.replace(_definition, '13873137-13fe-4d09-9038-0fc680f1e91c', '02e64c36-75de-4d88-aa15-e3c661879d64');
      _definition := pg_catalog.replace(_definition, 'ff3ee9f6236cf6c9b3da676ff4d6376ce21f993e', 'd55e7929a54a811d66b1f1f214abd8bea3fb2e40');
      _definition := pg_catalog.replace(_definition, 'bc421879aced9fe0eaf5e4b900ff2ce6da0752e8', '2aa2a497421367a1ba205633eb23f5e69f95cd74');
      EXECUTE _definition;
    ELSIF _md5 <> _r5817_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_18_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5817_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_18_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.17 re-pinned recorder: Railway deployment 02e64c36-75de-4d88-aa15-e3c661879d64 (controlled release of 2aa2a497), semantic git:2aa2a497421367a1ba205633eb23f5e69f95cd74, build git:2aa2a497421367a1ba205633eb23f5e69f95cd74, parser.py blob d55e7929a54a811d66b1f1f214abd8bea3fb2e40, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.17 re-pinned provenance assertion: Railway deployment 02e64c36-75de-4d88-aa15-e3c661879d64, semantic git:2aa2a497421367a1ba205633eb23f5e69f95cd74, build git:2aa2a497421367a1ba205633eb23f5e69f95cd74, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
END;
$r5818rollback$;
