-- Rollback of 20261012200000_r5_8_7 for REPOSITORY-BUILT databases only.
--
-- On the managed database the migration changes nothing (it starts at, and
-- leaves, md5 fe3250af2b461f03f459adf36b43ec21). Its rollback there is "do
-- nothing"; running this file there would replace the managed definition with
-- the old repository one. Do not run it against the managed database.
--
-- Restores md5(prosrc) 5ea1ffff4fc874ca50f0081b9c9a5e71 from
-- fe3250af2b461f03f459adf36b43ec21, and fails closed from any other state.
-- Owner, SECURITY DEFINER, search_path, grants and comment are kept by
-- CREATE OR REPLACE and checked by the migration if it is applied again.
DO $rollback$
DECLARE
  _fn constant regprocedure :=
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
  _md5 text;
  _definition text;
BEGIN
  SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> 'fe3250af2b461f03f459adf36b43ec21' THEN
    RAISE EXCEPTION 'R5_8_7_ROLLBACK_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
  END IF;
  _definition := pg_catalog.pg_get_functiondef(_fn);
  EXECUTE pg_catalog.replace(_definition, '50a53b607d26f00b4de05c5e8998611959e27bd1',
                             'dfc2e67fcb3644be91108079f9096947c16119b3');
  SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> '5ea1ffff4fc874ca50f0081b9c9a5e71' THEN
    RAISE EXCEPTION 'R5_8_7_ROLLBACK_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
  END IF;
END;
$rollback$;
