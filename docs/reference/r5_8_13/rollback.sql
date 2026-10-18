-- R5.8.13 rollback. Use only with explicit release-owner authorization.
-- Restores the exact R5.8.12 recorder and provenance-assertion bodies (deployment
-- ce9b760d-c92f-4da1-a3e6-dd105d49585c) and the R5.8.12 comments. It touches no row,
-- grant, owner, trigger or index; any state other than R5.8.13 (or already R5.8.12)
-- fails closed.
DO $r5813rollback$
DECLARE
  _old constant text := 'ce9b760d-c92f-4da1-a3e6-dd105d49585c';
  _new constant text := 'ece1c582-5cba-403d-b25c-a60faaf1aed5';
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _r5812_md5 constant text[] := ARRAY['321d649a3defcf3daf61de8b5f6d6ad2', 'e62a11f966063440eaacb636c608c33a'];
  _r5813_md5 constant text[] := ARRAY['d4df57084c1b0b90aef266b5b52452c5', 'f070c124846814420c72c34471c84624'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 = _r5813_md5[_i] THEN
      _definition := pg_catalog.pg_get_functiondef(_target);
      IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new, ''))) / pg_catalog.length(_new) <> 1
         OR pg_catalog.strpos(_definition, _old) > 0 THEN
        RAISE EXCEPTION 'R5_8_13_ROLLBACK_UNEXPECTED_PIN_STATE: %', _target USING ERRCODE = '55000';
      END IF;
      EXECUTE pg_catalog.replace(_definition, _new, _old);
    ELSIF _md5 <> _r5812_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_13_ROLLBACK_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF _md5 IS DISTINCT FROM _r5812_md5[_i] THEN
      RAISE EXCEPTION 'R5_8_13_ROLLBACK_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;
  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.12 approved attestation workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485; semantic git:c2e045b0f71a7699c935b65ffe514fe526889de3; build git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.12 approved attestation workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485; semantic git:c2e045b0f71a7699c935b65ffe514fe526889de3; build git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1.';
END;
$r5813rollback$;
