-- R5.8.27: re-pin the runtime identity after PM6 C (PR #287), without rewriting prior migrations.
--
-- PR #287 (merge 3837a810c4569c0f1c2ef67064cb0f0869003c7a) wires cs2.match-integrity.v1: the worker reads
-- game_phase at every round_end in its own call (RAW rows unchanged) and emits match_end_evidence. Released
-- under the standing watch-pattern freeze as ONE controlled Railway deployment of that merge commit:
-- 7690b171-087f-46ca-9899-a5b96d8c32cb, semantic = build = 3837a810...
-- Pins that change: deployment, commit and the parser.py and adapter.py critical blobs. Parser version
-- (demoparser2 0.42.2), worker.py, raw_evidence.py, settings.py and the workflow blob are unchanged
-- (docs/reference/r5_8_27/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.26 targets (or is a no-op at the R5.8.27 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5827$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['f727480e469669cdb495f7eb5de6b7e1', '04798c612e7e6a0fe6b5d7ad6f7541a0'];
  _target_md5 constant text[] := ARRAY['640a6f7281fc3cf425d888b3ee124f21', '475c684986af01f67c1ce6e3461de189'];
  -- Pins in replacement order: deployment, commit (semantic = build), parser.py and adapter.py blobs.
  _old_pins constant text[] := ARRAY[
    '2f0e6812-6aa0-4137-b9ca-aa541dafe103',
    '7e84f6da0a60c1b48897ec24bb721cde9aa65a62',
    '5d39478c611b57b2dd17f93c9cdce8faa84860f9',
    '4e6f43c7916bb7d855cfd1abcd26637bb0f3f942'
  ];
  _new_pins constant text[] := ARRAY[
    '7690b171-087f-46ca-9899-a5b96d8c32cb',
    '3837a810c4569c0f1c2ef67064cb0f0869003c7a',
    '99ff0cccb999e950f1253a29d3f87ca9e22f067a',
    '020f847ad57d770779dd4951beb597023fea060e'
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
    RAISE EXCEPTION 'R5_8_27_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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
        RAISE EXCEPTION 'R5_8_27_UNEXPECTED_PIN_STATE: % md5=% (target md5 with a previous pin)', _target, _md5
          USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_27_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _md5 = _start_md5[_i] THEN
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_pins[_j], '')))
             / pg_catalog.length(_old_pins[_j]) <> _counts[_j][_i]
           OR pg_catalog.strpos(_definition, _new_pins[_j]) <> 0 THEN
          RAISE EXCEPTION 'R5_8_27_UNEXPECTED_PIN_STATE: % md5=% pin=%', _target, _md5, _j USING ERRCODE = '55000';
        END IF;
      END LOOP;
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        _definition := pg_catalog.replace(_definition, _old_pins[_j], _new_pins[_j]);
      END LOOP;
      EXECUTE _definition;
      _definition := pg_catalog.pg_get_functiondef(_target);
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
      IF _md5 IS DISTINCT FROM _target_md5[_i] THEN
        RAISE EXCEPTION 'R5_8_27_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      FOR _j IN 1 .. pg_catalog.array_length(_new_pins, 1) LOOP
        IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_pins[_j], '')))
             / pg_catalog.length(_new_pins[_j]) <> _counts[_j][_i]
           OR pg_catalog.strpos(_definition, _old_pins[_j]) <> 0 THEN
          RAISE EXCEPTION 'R5_8_27_POSTCONDITION_INVALID: % pin=%', _target, _j USING ERRCODE = '55000';
        END IF;
      END LOOP;
      RAISE NOTICE 'R5_8_27_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_27_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_27_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5827$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.27 re-pinned recorder: Railway deployment 7690b171-087f-46ca-9899-a5b96d8c32cb (controlled release of 3837a810), demoparser2 0.42.2, semantic git:3837a810c4569c0f1c2ef67064cb0f0869003c7a, build git:3837a810c4569c0f1c2ef67064cb0f0869003c7a, parser.py blob 99ff0cccb999e950f1253a29d3f87ca9e22f067a, adapter.py blob 020f847ad57d770779dd4951beb597023fea060e, raw_evidence.py blob 6e6721b0245c99f7966b8083bbedef9b9cd0282b, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.27 re-pinned provenance assertion: Railway deployment 7690b171-087f-46ca-9899-a5b96d8c32cb, demoparser2 0.42.2, semantic git:3837a810c4569c0f1c2ef67064cb0f0869003c7a, build git:3837a810c4569c0f1c2ef67064cb0f0869003c7a, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
