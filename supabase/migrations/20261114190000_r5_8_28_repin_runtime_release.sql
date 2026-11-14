-- R5.8.28: re-pin the runtime identity after PM2 4.2.4 (PR #294), without rewriting prior migrations.
--
-- PR #294 (merge b440a06fc06831be3cfe0b2080f6be901dad3019) adds cs2.round-trajectory.v1: the worker samples player positions per
-- round in its own bounded parse_ticks read, kept apart from the governed RAW evidence. Released as ONE
-- Railway deployment of that merge commit, with the persistent service source aligned to it in the same
-- controlled operation: bb92ed95-7dd6-4d1c-af27-057140f038dd, semantic = build = b440a06f...
-- Pins that change: deployment, commit and the parser.py critical blob. Parser version (demoparser2
-- 0.42.2), adapter.py, worker.py, raw_evidence.py, settings.py and the workflow blob are unchanged
-- (docs/reference/r5_8_28/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.27 targets (or is a no-op at the R5.8.28 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5828$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['640a6f7281fc3cf425d888b3ee124f21', '475c684986af01f67c1ce6e3461de189'];
  _target_md5 constant text[] := ARRAY['99776ca5ef4fdbbb125e76433c927547', '1918875c864bce269f03777464b2ae38'];
  -- Pins in replacement order: deployment, commit (semantic = build), parser.py blob.
  _old_pins constant text[] := ARRAY[
    '7690b171-087f-46ca-9899-a5b96d8c32cb',
    '3837a810c4569c0f1c2ef67064cb0f0869003c7a',
    '99ff0cccb999e950f1253a29d3f87ca9e22f067a'
  ];
  _new_pins constant text[] := ARRAY[
    'bb92ed95-7dd6-4d1c-af27-057140f038dd',
    'b440a06fc06831be3cfe0b2080f6be901dad3019',
    'bc30a72f6e8429387f0945d781a9ecc1c65dcb3a'
  ];
  -- Expected occurrences per pin (rows) and function (columns: recorder, assertion).
  _counts constant integer[][] := ARRAY[[1, 1], [4, 3], [1, 0]];
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
    RAISE EXCEPTION 'R5_8_28_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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
        RAISE EXCEPTION 'R5_8_28_UNEXPECTED_PIN_STATE: % md5=% (target md5 with a previous pin)', _target, _md5
          USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_28_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _md5 = _start_md5[_i] THEN
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_pins[_j], '')))
             / pg_catalog.length(_old_pins[_j]) <> _counts[_j][_i]
           OR pg_catalog.strpos(_definition, _new_pins[_j]) <> 0 THEN
          RAISE EXCEPTION 'R5_8_28_UNEXPECTED_PIN_STATE: % md5=% pin=%', _target, _md5, _j USING ERRCODE = '55000';
        END IF;
      END LOOP;
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        _definition := pg_catalog.replace(_definition, _old_pins[_j], _new_pins[_j]);
      END LOOP;
      EXECUTE _definition;
      _definition := pg_catalog.pg_get_functiondef(_target);
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
      IF _md5 IS DISTINCT FROM _target_md5[_i] THEN
        RAISE EXCEPTION 'R5_8_28_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      FOR _j IN 1 .. pg_catalog.array_length(_new_pins, 1) LOOP
        IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_pins[_j], '')))
             / pg_catalog.length(_new_pins[_j]) <> _counts[_j][_i]
           OR pg_catalog.strpos(_definition, _old_pins[_j]) <> 0 THEN
          RAISE EXCEPTION 'R5_8_28_POSTCONDITION_INVALID: % pin=%', _target, _j USING ERRCODE = '55000';
        END IF;
      END LOOP;
      RAISE NOTICE 'R5_8_28_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_28_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_28_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5828$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.28 re-pinned recorder: Railway deployment bb92ed95-7dd6-4d1c-af27-057140f038dd (controlled release of b440a06f), demoparser2 0.42.2, semantic git:b440a06fc06831be3cfe0b2080f6be901dad3019, build git:b440a06fc06831be3cfe0b2080f6be901dad3019, parser.py blob bc30a72f6e8429387f0945d781a9ecc1c65dcb3a, adapter.py blob 020f847ad57d770779dd4951beb597023fea060e, raw_evidence.py blob 6e6721b0245c99f7966b8083bbedef9b9cd0282b, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.28 re-pinned provenance assertion: Railway deployment bb92ed95-7dd6-4d1c-af27-057140f038dd, demoparser2 0.42.2, semantic git:b440a06fc06831be3cfe0b2080f6be901dad3019, build git:b440a06fc06831be3cfe0b2080f6be901dad3019, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
