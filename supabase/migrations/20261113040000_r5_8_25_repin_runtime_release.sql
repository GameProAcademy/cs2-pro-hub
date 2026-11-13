-- R5.8.25: re-pin the runtime identity after the demoparser2 0.42.0 -> 0.42.2 release, without rewriting prior migrations.
--
-- PR #275 (merge c3593d48e3b8923048def625cf59144100f59892) moved the worker to demoparser2 0.42.2: 0.42.0 raises
-- EntityNotFound on every parse_event of current CS2 demos (root cause reproduced with the owner-authorized test demo;
-- docs/reference/R5_8_25_DEMOPARSER2_0422.md). It also reviewed the new vote_cast event as RAW only and the new
-- parse_weapons API as RAW only. The worker was released under the standing watch-pattern freeze
-- (/services/cs2-demo-parser/.release-freeze-r5-8-17) as ONE controlled Railway deployment of that merge commit:
-- d57b9089-ea97-44b0-b236-6868f84459e2, semantic = build = c3593d48...
-- Pins that change: deployment, commit, the parser runtime version ('0.42.0' -> '0.42.2', one literal in the recorder
-- and one in the provenance assertion) and the parser.py, adapter.py, raw_evidence.py and settings.py critical blobs.
-- worker.py and the approved workflow blob are unchanged (docs/reference/r5_8_25/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.24 targets (or is a no-op at the R5.8.25 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5825$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['c28ed93d37612ffdbe02653d8ea980eb', 'c661f1f3adf774a3376c2ed510bfe607'];
  _target_md5 constant text[] := ARRAY['cbb03f77e6e3dae28c567483c3ba252b', 'a3401a4b1da8553296b6d541afd44bf4'];
  -- Pins in replacement order: deployment, commit (semantic = build), parser.py, adapter.py, raw_evidence.py and
  -- settings.py blobs, and the parser runtime version literal in each function's own SQL context.
  _old_pins constant text[] := ARRAY[
    '0ff96670-e373-4beb-90c9-f1967eee3195',
    '4badf6060e4e69a589179567f488f5d58a4a58dc',
    '4102f6174e4dc01d97637174f4f70fe53629c285',
    'b95811681be20b9e849672e57a07b1de5d18e6e8',
    '5b7b674c88a77f85ab8791f84a47a188889b5802',
    'dc76db86c9b0b8c0916d58501ae0c21af95dfe38',
    '_payload->>''parser_version''<>''0.42.0''',
    '_p.parser_version<>''0.42.0'''
  ];
  _new_pins constant text[] := ARRAY[
    'd57b9089-ea97-44b0-b236-6868f84459e2',
    'c3593d48e3b8923048def625cf59144100f59892',
    '5d39478c611b57b2dd17f93c9cdce8faa84860f9',
    '4e6f43c7916bb7d855cfd1abcd26637bb0f3f942',
    'a71a99e8df282f761326e4e8211f80a64c4083e5',
    '8bcadce307bb39895965fa7583fc272e2763b39d',
    '_payload->>''parser_version''<>''0.42.2''',
    '_p.parser_version<>''0.42.2'''
  ];
  -- Expected occurrences per pin (rows) and function (columns: recorder, assertion).
  _counts constant integer[][] := ARRAY[[1, 1], [4, 3], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [0, 1]];
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
    RAISE EXCEPTION 'R5_8_25_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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
        RAISE EXCEPTION 'R5_8_25_UNEXPECTED_PIN_STATE: % md5=% (target md5 with a previous pin)', _target, _md5
          USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_25_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _md5 = _start_md5[_i] THEN
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_pins[_j], '')))
             / pg_catalog.length(_old_pins[_j]) <> _counts[_j][_i]
           OR pg_catalog.strpos(_definition, _new_pins[_j]) <> 0 THEN
          RAISE EXCEPTION 'R5_8_25_UNEXPECTED_PIN_STATE: % md5=% pin=%', _target, _md5, _j USING ERRCODE = '55000';
        END IF;
      END LOOP;
      FOR _j IN 1 .. pg_catalog.array_length(_old_pins, 1) LOOP
        _definition := pg_catalog.replace(_definition, _old_pins[_j], _new_pins[_j]);
      END LOOP;
      EXECUTE _definition;
      _definition := pg_catalog.pg_get_functiondef(_target);
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
      IF _md5 IS DISTINCT FROM _target_md5[_i] THEN
        RAISE EXCEPTION 'R5_8_25_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      FOR _j IN 1 .. pg_catalog.array_length(_new_pins, 1) LOOP
        IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_pins[_j], '')))
             / pg_catalog.length(_new_pins[_j]) <> _counts[_j][_i]
           OR pg_catalog.strpos(_definition, _old_pins[_j]) <> 0 THEN
          RAISE EXCEPTION 'R5_8_25_POSTCONDITION_INVALID: % pin=%', _target, _j USING ERRCODE = '55000';
        END IF;
      END LOOP;
      RAISE NOTICE 'R5_8_25_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_25_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_25_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5825$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.25 re-pinned recorder: Railway deployment d57b9089-ea97-44b0-b236-6868f84459e2 (controlled release of c3593d48), demoparser2 0.42.2, semantic git:c3593d48e3b8923048def625cf59144100f59892, build git:c3593d48e3b8923048def625cf59144100f59892, parser.py blob 5d39478c611b57b2dd17f93c9cdce8faa84860f9, adapter.py blob 4e6f43c7916bb7d855cfd1abcd26637bb0f3f942, raw_evidence.py blob a71a99e8df282f761326e4e8211f80a64c4083e5, settings.py blob 8bcadce307bb39895965fa7583fc272e2763b39d, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.25 re-pinned provenance assertion: Railway deployment d57b9089-ea97-44b0-b236-6868f84459e2, demoparser2 0.42.2, semantic git:c3593d48e3b8923048def625cf59144100f59892, build git:c3593d48e3b8923048def625cf59144100f59892, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
