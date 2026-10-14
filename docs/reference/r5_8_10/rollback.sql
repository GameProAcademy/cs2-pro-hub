-- Rollback of R5.8.10 (generated). Restores the R5.8.9 target md5 d7c325bac1a98c6a7cac67a0f18ba08b from 4ee7be9d9d133adbeeafe6e6a5763112
-- and the R5.8.9 comment; fails closed from any other state. Reads or writes no row: it never
-- needs or deletes any attestation, so it is allowed on the managed database.
DO $rollback$
DECLARE
  _fn constant regprocedure := 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
  _md5 text;
  _def text;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> '4ee7be9d9d133adbeeafe6e6a5763112' THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.pg_get_functiondef(_fn);
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_payload->>''railway_branch''<>''main''', '')))
     <> 1 * pg_catalog.length('_payload->>''railway_branch''<>''main''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_payload->>''railway_branch''<>''main''', '_payload->>''railway_branch''<>''main''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_payload->>''git_commit''<>''60099ed3eaf959d888762bf55043255a63a6a766''', '')))
     <> 1 * pg_catalog.length('_payload->>''git_commit''<>''60099ed3eaf959d888762bf55043255a63a6a766''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_payload->>''git_commit''<>''60099ed3eaf959d888762bf55043255a63a6a766''', '_payload->>''git_commit''<>''10815fb44e165963adfaf07f71c474ca628f4b7f''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_payload->>''deployment_id''<>''25df86c3-22e1-4986-9b91-cdabe54535c5''', '')))
     <> 1 * pg_catalog.length('_payload->>''deployment_id''<>''25df86c3-22e1-4986-9b91-cdabe54535c5''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_payload->>''deployment_id''<>''25df86c3-22e1-4986-9b91-cdabe54535c5''', '_payload->>''deployment_id''<>''09b50029-2508-4267-bb1d-28c5e99b95db''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_payload->>''semantic_revision''<>''git:60099ed3eaf959d888762bf55043255a63a6a766''', '')))
     <> 1 * pg_catalog.length('_payload->>''semantic_revision''<>''git:60099ed3eaf959d888762bf55043255a63a6a766''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_payload->>''semantic_revision''<>''git:60099ed3eaf959d888762bf55043255a63a6a766''', '_payload->>''semantic_revision''<>''git:10815fb44e165963adfaf07f71c474ca628f4b7f''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_payload->>''build_revision''<>''git:60099ed3eaf959d888762bf55043255a63a6a766''', '')))
     <> 1 * pg_catalog.length('_payload->>''build_revision''<>''git:60099ed3eaf959d888762bf55043255a63a6a766''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_payload->>''build_revision''<>''git:60099ed3eaf959d888762bf55043255a63a6a766''', '_payload->>''build_revision''<>''git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '''deployment_evidence''->>''source_commit''<>''60099ed3eaf959d888762bf55043255a63a6a766''', '')))
     <> 1 * pg_catalog.length('''deployment_evidence''->>''source_commit''<>''60099ed3eaf959d888762bf55043255a63a6a766''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '''deployment_evidence''->>''source_commit''<>''60099ed3eaf959d888762bf55043255a63a6a766''', '''deployment_evidence''->>''source_commit''<>''c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_workflow->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '')))
     <> 1 * pg_catalog.length('_workflow->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_workflow->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '_workflow->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_attestor_source->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '')))
     <> 1 * pg_catalog.length('_attestor_source->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_attestor_source->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '_attestor_source->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/parser.py''->>''observed''<>''981f6261c7e38334dfab5c93088e9d5ad1f56f6e''', '')))
     <> 1 * pg_catalog.length('_critical_hashes->''services/cs2-demo-parser/parser.py''->>''observed''<>''981f6261c7e38334dfab5c93088e9d5ad1f56f6e''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/parser.py''->>''observed''<>''981f6261c7e38334dfab5c93088e9d5ad1f56f6e''', '_critical_hashes->''services/cs2-demo-parser/parser.py''->>''observed''<>''981f6261c7e38334dfab5c93088e9d5ad1f56f6e''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/adapter.py''->>''observed''<>''34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71''', '')))
     <> 1 * pg_catalog.length('_critical_hashes->''services/cs2-demo-parser/adapter.py''->>''observed''<>''34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/adapter.py''->>''observed''<>''34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71''', '_critical_hashes->''services/cs2-demo-parser/adapter.py''->>''observed''<>''34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/worker.py''->>''observed''<>''ecaac3968d68e1ed8fc03f8dfea42c223869f473''', '')))
     <> 1 * pg_catalog.length('_critical_hashes->''services/cs2-demo-parser/worker.py''->>''observed''<>''ecaac3968d68e1ed8fc03f8dfea42c223869f473''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/worker.py''->>''observed''<>''ecaac3968d68e1ed8fc03f8dfea42c223869f473''', '_critical_hashes->''services/cs2-demo-parser/worker.py''->>''observed''<>''ecaac3968d68e1ed8fc03f8dfea42c223869f473''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/raw_evidence.py''->>''observed''<>''ec28b075f9726e5c4cdb97f5820f4402bca23eae''', '')))
     <> 1 * pg_catalog.length('_critical_hashes->''services/cs2-demo-parser/raw_evidence.py''->>''observed''<>''ec28b075f9726e5c4cdb97f5820f4402bca23eae''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/raw_evidence.py''->>''observed''<>''ec28b075f9726e5c4cdb97f5820f4402bca23eae''', '_critical_hashes->''services/cs2-demo-parser/raw_evidence.py''->>''observed''<>''46df350b5298531ffc01409172f690ba161328de''');
  IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/settings.py''->>''observed''<>''dc76db86c9b0b8c0916d58501ae0c21af95dfe38''', '')))
     <> 1 * pg_catalog.length('_critical_hashes->''services/cs2-demo-parser/settings.py''->>''observed''<>''dc76db86c9b0b8c0916d58501ae0c21af95dfe38''') THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
  END IF;
  _def := pg_catalog.replace(_def, '_critical_hashes->''services/cs2-demo-parser/settings.py''->>''observed''<>''dc76db86c9b0b8c0916d58501ae0c21af95dfe38''', '_critical_hashes->''services/cs2-demo-parser/settings.py''->>''observed''<>''dc76db86c9b0b8c0916d58501ae0c21af95dfe38''');
  EXECUTE _def;
  EXECUTE pg_catalog.format('COMMENT ON FUNCTION %s IS %L', _fn, 'R5.8.9 re-pinned recorder: Railway deployment 09b50029-2508-4267-bb1d-28c5e99b95db, source and build commit c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d, semantic revision git:10815fb44e165963adfaf07f71c474ca628f4b7f, branch main, approved workflow blob 80c6cb645b81ba427ad3d97ee8feb1964ba62d87.');
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 <> 'd7c325bac1a98c6a7cac67a0f18ba08b' THEN
    RAISE EXCEPTION 'R5_8_10_ROLLBACK_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
  END IF;
END;
$rollback$;
