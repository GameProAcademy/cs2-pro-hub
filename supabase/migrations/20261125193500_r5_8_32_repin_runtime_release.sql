-- R5.8.32: re-pin the runtime identity after the R-07 round-winner-evidence release (PR #379), forward-only.
--
-- PR #379 (merge 4f7466ec448ed5736ca337224890cd56aae10b85) makes parser.py audit the game-state winner of every
-- round and adapter.py emit round-winner-evidence-v1 (winner_method/status/sources; owner decisions O8 and
-- O8-A, canonical-demo-v3 gate PASS). Released as ONE Railway deployment of that merge commit with the
-- persistent service source aligned to it in the same controlled operation:
-- c372485e-b6b4-4209-8c6b-c4d16678b52d, semantic = build = 4f7466ec...
-- Pins that change: deployment, commit and the parser.py and adapter.py critical blobs. Parser version
-- (demoparser2 0.42.2), raw_evidence.py, worker.py, settings.py and the workflow blob are unchanged
-- (docs/reference/r5_8_32/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.31 targets (or is a no-op at the R5.8.32 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5832$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['515f433f919370312dbe9a8a60c9dd31', 'e35c5ff8903e331f7b47214665fcab31'];
  _target_md5 constant text[] := ARRAY['e477fc605fa2de200f15e956713cdaf3', 'dd1f25ccd089798dc27599106307825d'];
  -- Pins in replacement order: deployment, commit (semantic = build), parser.py blob, adapter.py blob.
  _old_pins constant text[] := ARRAY[
    '584ea563-f978-476a-9ba6-9984d16ca0ab',
    '0c646583dc98426d4a2298a8797658253ad565c0',
    '421dfd9563ae1a7950d4d5a4229556a1e20df17d',
    '1eaf38401a09baceebbf9d959adf2f30ded5e962'
  ];
  _new_pins constant text[] := ARRAY[
    'c372485e-b6b4-4209-8c6b-c4d16678b52d',
    '4f7466ec448ed5736ca337224890cd56aae10b85',
    '0a039253f2425af661c2830d1aa06f4cd67c3e76',
    'b95b430f3783e7f637c8321eff0f86618a1525a6'
  ];
  -- Expected occurrences per pin (rows) and function (columns: recorder, assertion).
  _counts constant integer[][] := ARRAY[[1, 1], [4, 3], [1, 0], [1, 0]];
  _i integer;
  _j integer;
  _ok boolean;
  _target regprocedure;
  _definition text;
  _md5 text;
  _before_properties jsonb;
  _after_properties jsonb;
BEGIN
  -- The workflow boundary carries none of these pins and must still be at its R5.8.12 target.
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p
   WHERE p.oid = 'public.enforce_approved_attestation_workflow()'::regprocedure;
  IF _md5 IS DISTINCT FROM 'f74d8af991b7ec6f33d9aabbef00c4fc' THEN
    RAISE EXCEPTION 'R5_8_32_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
  END IF;

  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.jsonb_build_object(
      'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
      'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
      'acl', p.proacl::text, 'kind', p.prokind, 'language', l.lanname,
      'return_type', pg_catalog.pg_get_function_result(p.oid), 'arg_types', p.proargtypes::text,
      'all_arg_types', p.proallargtypes::text, 'arg_modes', p.proargmodes::text,
      'arg_names', p.proargnames::text, 'variadic', p.provariadic,
      'parallel', p.proparallel, 'leakproof', p.proleakproof, 'cost', p.procost,
      'rows', p.prorows, 'support', p.prosupport), pg_catalog.md5(p.prosrc)
      INTO STRICT _before_properties, _md5
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE p.oid = _target;
    _definition := pg_catalog.pg_get_functiondef(_target);

    IF _md5 = _target_md5[_i] THEN
      _ok := true;
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        IF pg_catalog.strpos(_definition, _old_pins[_j]) <> 0 THEN
          _ok := false;
        END IF;
      END LOOP;
      IF NOT _ok THEN
        RAISE EXCEPTION 'R5_8_32_UNEXPECTED_PIN_STATE: % md5=% (target md5 with a previous pin)', _target, _md5
          USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_32_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _md5 = _start_md5[_i] THEN
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_pins[_j], '')))
             / pg_catalog.length(_old_pins[_j]) <> _counts[_j][_i]
           OR pg_catalog.strpos(_definition, _new_pins[_j]) <> 0 THEN
          RAISE EXCEPTION 'R5_8_32_UNEXPECTED_PIN_STATE: % md5=% pin=%', _target, _md5, _j USING ERRCODE = '55000';
        END IF;
      END LOOP;
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        _definition := pg_catalog.replace(_definition, _old_pins[_j], _new_pins[_j]);
      END LOOP;
      EXECUTE _definition;
      _definition := pg_catalog.pg_get_functiondef(_target);
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
      IF _md5 IS DISTINCT FROM _target_md5[_i] THEN
        RAISE EXCEPTION 'R5_8_32_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      FOR _j IN 1 .. pg_catalog.array_length(_new_pins, 1) LOOP
        IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_pins[_j], '')))
             / pg_catalog.length(_new_pins[_j]) <> _counts[_j][_i]
           OR pg_catalog.strpos(_definition, _old_pins[_j]) <> 0 THEN
          RAISE EXCEPTION 'R5_8_32_POSTCONDITION_INVALID: % pin=%', _target, _j USING ERRCODE = '55000';
        END IF;
      END LOOP;
      RAISE NOTICE 'R5_8_32_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_32_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;

    SELECT pg_catalog.jsonb_build_object(
      'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
      'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
      'acl', p.proacl::text, 'kind', p.prokind, 'language', l.lanname,
      'return_type', pg_catalog.pg_get_function_result(p.oid), 'arg_types', p.proargtypes::text,
      'all_arg_types', p.proallargtypes::text, 'arg_modes', p.proargmodes::text,
      'arg_names', p.proargnames::text, 'variadic', p.provariadic,
      'parallel', p.proparallel, 'leakproof', p.proleakproof, 'cost', p.procost,
      'rows', p.prorows, 'support', p.prosupport)
      INTO STRICT _after_properties
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE p.oid = _target;
    IF _before_properties IS DISTINCT FROM _after_properties THEN
      RAISE EXCEPTION 'R5_8_32_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5832$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.32 re-pinned recorder: Railway deployment c372485e-b6b4-4209-8c6b-c4d16678b52d (controlled release of 4f7466ec), demoparser2 0.42.2, semantic git:4f7466ec448ed5736ca337224890cd56aae10b85, build git:4f7466ec448ed5736ca337224890cd56aae10b85, parser.py blob 0a039253f2425af661c2830d1aa06f4cd67c3e76, adapter.py blob b95b430f3783e7f637c8321eff0f86618a1525a6, raw_evidence.py blob 3890313eb4855fc58f9636d9688309e3356790b7, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.32 re-pinned provenance assertion: Railway deployment c372485e-b6b4-4209-8c6b-c4d16678b52d, demoparser2 0.42.2, semantic git:4f7466ec448ed5736ca337224890cd56aae10b85, build git:4f7466ec448ed5736ca337224890cd56aae10b85, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
