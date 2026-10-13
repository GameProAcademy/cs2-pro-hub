-- Rollback of R5.8.9 (generated). Restores md5 fe3250af2b461f03f459adf36b43ec21 from d7c325bac1a98c6a7cac67a0f18ba08b and the
-- previous comment; fails closed from any other state. Reads or writes no row: it
-- never needs or deletes any attestation, so it is allowed on the managed database.
DO $rollback$
DECLARE
  _fn constant regprocedure := 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
  _md5 text;
  _def text;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> 'd7c325bac1a98c6a7cac67a0f18ba08b' THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.pg_get_functiondef(_fn);
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_payload->>''railway_branch''<>''main''', '')))
     <> 1 * pg_catalog.length('_payload->>''railway_branch''<>''main''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_payload->>''railway_branch''<>''main''', '_payload->>''railway_branch''<>''infra/cs2-parser-worker-v8''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_payload->>''git_commit''<>''10815fb44e165963adfaf07f71c474ca628f4b7f''', '')))
     <> 1 * pg_catalog.length('_payload->>''git_commit''<>''10815fb44e165963adfaf07f71c474ca628f4b7f''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_payload->>''git_commit''<>''10815fb44e165963adfaf07f71c474ca628f4b7f''', '_payload->>''git_commit''<>''5703b1d88f21ee57fdd1d83722edf30e0f0c6f76''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_payload->>''deployment_id''<>''09b50029-2508-4267-bb1d-28c5e99b95db''', '')))
     <> 1 * pg_catalog.length('_payload->>''deployment_id''<>''09b50029-2508-4267-bb1d-28c5e99b95db''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_payload->>''deployment_id''<>''09b50029-2508-4267-bb1d-28c5e99b95db''', '_payload->>''deployment_id''<>''1b5778de-3eaf-46f1-9ea5-cba381d95313''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_payload->>''semantic_revision''<>''git:10815fb44e165963adfaf07f71c474ca628f4b7f''', '')))
     <> 1 * pg_catalog.length('_payload->>''semantic_revision''<>''git:10815fb44e165963adfaf07f71c474ca628f4b7f''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_payload->>''semantic_revision''<>''git:10815fb44e165963adfaf07f71c474ca628f4b7f''', '_payload->>''semantic_revision''<>''git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_payload->>''build_revision''<>''git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''', '')))
     <> 1 * pg_catalog.length('_payload->>''build_revision''<>''git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_payload->>''build_revision''<>''git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''', '_payload->>''build_revision''<>''git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '''deployment_evidence''->>''source_commit''<>''c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''', '')))
     <> 1 * pg_catalog.length('''deployment_evidence''->>''source_commit''<>''c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '''deployment_evidence''->>''source_commit''<>''c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''', '''deployment_evidence''->>''source_commit''<>''91aeee853200d0f461d0d36af1781d7fdfa40941''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_workflow->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '')))
     <> 1 * pg_catalog.length('_workflow->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_workflow->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '_workflow->>''workflow_source_sha''<>''3070d8bae6c3f02093bbb2595138c913646c2e31''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_attestor_source->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '')))
     <> 1 * pg_catalog.length('_attestor_source->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_attestor_source->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '_attestor_source->>''workflow_source_sha''<>''3070d8bae6c3f02093bbb2595138c913646c2e31''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/parser.py''->>''observed''<>''981f6261c7e38334dfab5c93088e9d5ad1f56f6e''', '')))
     <> 1 * pg_catalog.length('_critical_hashes->''services/cs2-demo-parser/parser.py''->>''observed''<>''981f6261c7e38334dfab5c93088e9d5ad1f56f6e''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/parser.py''->>''observed''<>''981f6261c7e38334dfab5c93088e9d5ad1f56f6e''', '_critical_hashes->''services/cs2-demo-parser/parser.py''->>''observed''<>''9d21670e47ddf330881e95a9d78c19074ccc0aea''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/adapter.py''->>''observed''<>''34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71''', '')))
     <> 1 * pg_catalog.length('_critical_hashes->''services/cs2-demo-parser/adapter.py''->>''observed''<>''34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/adapter.py''->>''observed''<>''34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71''', '_critical_hashes->''services/cs2-demo-parser/adapter.py''->>''observed''<>''34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/worker.py''->>''observed''<>''ecaac3968d68e1ed8fc03f8dfea42c223869f473''', '')))
     <> 1 * pg_catalog.length('_critical_hashes->''services/cs2-demo-parser/worker.py''->>''observed''<>''ecaac3968d68e1ed8fc03f8dfea42c223869f473''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/worker.py''->>''observed''<>''ecaac3968d68e1ed8fc03f8dfea42c223869f473''', '_critical_hashes->''services/cs2-demo-parser/worker.py''->>''observed''<>''50a53b607d26f00b4de05c5e8998611959e27bd1''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/raw_evidence.py''->>''observed''<>''46df350b5298531ffc01409172f690ba161328de''', '')))
     <> 1 * pg_catalog.length('_critical_hashes->''services/cs2-demo-parser/raw_evidence.py''->>''observed''<>''46df350b5298531ffc01409172f690ba161328de''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/raw_evidence.py''->>''observed''<>''46df350b5298531ffc01409172f690ba161328de''', '_critical_hashes->''services/cs2-demo-parser/raw_evidence.py''->>''observed''<>''750195c1218abd53cfc77b6e8d2fb4a88e31579e''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/settings.py''->>''observed''<>''dc76db86c9b0b8c0916d58501ae0c21af95dfe38''', '')))
     <> 1 * pg_catalog.length('_critical_hashes->''services/cs2-demo-parser/settings.py''->>''observed''<>''dc76db86c9b0b8c0916d58501ae0c21af95dfe38''') THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/settings.py''->>''observed''<>''dc76db86c9b0b8c0916d58501ae0c21af95dfe38''', '_critical_hashes->''services/cs2-demo-parser/settings.py''->>''observed''<>''35eecfb06223812137a4a2f17114aae57cb7fe54''');
  EXECUTE _def;
  EXECUTE pg_catalog.format('COMMENT ON FUNCTION %s IS %L', _fn, 'R5.8.5 reconciled recorder: current Railway deployment 1b5778de-3eaf-46f1-9ea5-cba381d95313, source commit 91aeee853200d0f461d0d36af1781d7fdfa40941, approved workflow blob 3070d8bae6c3f02093bbb2595138c913646c2e31.');
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> 'fe3250af2b461f03f459adf36b43ec21' THEN
    RAISE EXCEPTION 'R5_8_9_ROLLBACK_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
  END IF;
END;
$rollback$;
