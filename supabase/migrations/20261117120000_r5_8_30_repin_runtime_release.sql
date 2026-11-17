-- R5.8.30: re-pin the runtime identity after the PM3 telemetry release (PR #310), forward-only.
--
-- PR #310 (merge 768646ea76646219b1749f9fd2e757703292a24c) adds, in adapter.py, the shooter and weapon of each weapon_fire, the hitgroup
-- and remaining health of each damage, hitgroup/through-smoke/in-air of each kill, grenade detonation
-- positions and inferno_startburn; raw_evidence.py maps those fields. Released as ONE Railway deployment of
-- that merge commit with the persistent service source aligned to it in the same controlled operation:
-- 3335c88d-2a0f-461c-8919-5d6086b518fd, semantic = build = 768646ea...
-- Pins that change: deployment, commit and the adapter.py and raw_evidence.py critical blobs. Parser
-- version (demoparser2 0.42.2), parser.py, worker.py, settings.py and the workflow blob are unchanged
-- (docs/reference/r5_8_30/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.29 targets (or is a no-op at the R5.8.30 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5830$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['3e2125a20131fab9653df150448acce3', 'bfd8a96d016da0494f8cf3eeb65da847'];
  _target_md5 constant text[] := ARRAY['b46f6701d4d930c6771148a443ead4bc', '95dc9e5f05d76376b3e31488b3c1f058'];
  -- Pins in replacement order: deployment, commit (semantic = build), adapter.py blob, raw_evidence.py blob.
  _old_pins constant text[] := ARRAY[
    '3375b68b-c996-445f-b979-ed6318c89970',
    '47ba6ffef76feae95dc98075cf3fb8089e02ce8f',
    '3e4f4a049e952064f68f0a39614f5e6539d5a88a',
    '6e6721b0245c99f7966b8083bbedef9b9cd0282b'
  ];
  _new_pins constant text[] := ARRAY[
    '3335c88d-2a0f-461c-8919-5d6086b518fd',
    '768646ea76646219b1749f9fd2e757703292a24c',
    '1eaf38401a09baceebbf9d959adf2f30ded5e962',
    '81c0f7e5d690fcf9796838eaad6901446901a586'
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
    RAISE EXCEPTION 'R5_8_30_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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
        RAISE EXCEPTION 'R5_8_30_UNEXPECTED_PIN_STATE: % md5=% (target md5 with a previous pin)', _target, _md5
          USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_30_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _md5 = _start_md5[_i] THEN
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_pins[_j], '')))
             / pg_catalog.length(_old_pins[_j]) <> _counts[_j][_i]
           OR pg_catalog.strpos(_definition, _new_pins[_j]) <> 0 THEN
          RAISE EXCEPTION 'R5_8_30_UNEXPECTED_PIN_STATE: % md5=% pin=%', _target, _md5, _j USING ERRCODE = '55000';
        END IF;
      END LOOP;
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        _definition := pg_catalog.replace(_definition, _old_pins[_j], _new_pins[_j]);
      END LOOP;
      EXECUTE _definition;
      _definition := pg_catalog.pg_get_functiondef(_target);
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
      IF _md5 IS DISTINCT FROM _target_md5[_i] THEN
        RAISE EXCEPTION 'R5_8_30_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      FOR _j IN 1 .. pg_catalog.array_length(_new_pins, 1) LOOP
        IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_pins[_j], '')))
             / pg_catalog.length(_new_pins[_j]) <> _counts[_j][_i]
           OR pg_catalog.strpos(_definition, _old_pins[_j]) <> 0 THEN
          RAISE EXCEPTION 'R5_8_30_POSTCONDITION_INVALID: % pin=%', _target, _j USING ERRCODE = '55000';
        END IF;
      END LOOP;
      RAISE NOTICE 'R5_8_30_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_30_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_30_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5830$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.30 re-pinned recorder: Railway deployment 3335c88d-2a0f-461c-8919-5d6086b518fd (controlled release of 768646ea), demoparser2 0.42.2, semantic git:768646ea76646219b1749f9fd2e757703292a24c, build git:768646ea76646219b1749f9fd2e757703292a24c, parser.py blob bc30a72f6e8429387f0945d781a9ecc1c65dcb3a, adapter.py blob 1eaf38401a09baceebbf9d959adf2f30ded5e962, raw_evidence.py blob 81c0f7e5d690fcf9796838eaad6901446901a586, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.30 re-pinned provenance assertion: Railway deployment 3335c88d-2a0f-461c-8919-5d6086b518fd, demoparser2 0.42.2, semantic git:768646ea76646219b1749f9fd2e757703292a24c, build git:768646ea76646219b1749f9fd2e757703292a24c, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
