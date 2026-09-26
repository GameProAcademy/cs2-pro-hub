-- H3E91 writer v1: reconcile legacy NOT NULL requirements without changing historical rows.
-- Existing identity-less rows remain readable; every newly recorded event has complete identity.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.h3e91_execution_evidence_ledger FROM sandbox_exec, service_role, anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.h3e91_reject_ledger_mutation() FROM sandbox_exec, service_role, anon, authenticated, PUBLIC;
ALTER TABLE public.h3e91_execution_evidence_ledger
  ALTER COLUMN job_id DROP NOT NULL,
  ALTER COLUMN attempt_number DROP NOT NULL,
  ALTER COLUMN demo_sha256 DROP NOT NULL,
  ALTER COLUMN file_size DROP NOT NULL,
  ALTER COLUMN parser_name DROP NOT NULL,
  ALTER COLUMN parser_version DROP NOT NULL,
  ALTER COLUMN parser_revision DROP NOT NULL,
  ALTER COLUMN metadata_digest DROP NOT NULL,
  ADD COLUMN event_digest text;
ALTER TABLE public.h3e91_execution_evidence_ledger
  ADD CONSTRAINT h3e91_event_digest_format CHECK (event_id IS NULL OR (event_digest IS NOT NULL AND event_digest ~ '^[0-9a-f]{64}$')),
  ADD CONSTRAINT h3e91_event_required_fields CHECK (event_id IS NULL OR (
    execution_surface IS NOT NULL AND source IS NOT NULL AND
    (event_type = 'EXECUTION_INTENT' OR (parser_name IS NOT NULL AND parser_version IS NOT NULL AND parser_revision IS NOT NULL)) AND
    (event_type NOT IN ('EXECUTION_STARTED', 'EXECUTION_FINISHED', 'EXECUTION_FAILED') OR (demo_sha256 IS NOT NULL AND file_size IS NOT NULL)) AND
    ((event_type IN ('EXECUTION_INTENT', 'EXECUTION_STARTED') AND outcome_code IS NULL) OR
     (event_type IN ('EXECUTION_FINISHED', 'EXECUTION_FAILED', 'EXECUTION_ABORTED') AND outcome_code IS NOT NULL))
  ));
CREATE UNIQUE INDEX h3e91_one_transition_per_execution ON public.h3e91_execution_evidence_ledger (execution_id, event_type) WHERE execution_id IS NOT NULL;
CREATE UNIQUE INDEX h3e91_one_terminal_per_execution ON public.h3e91_execution_evidence_ledger (execution_id) WHERE execution_id IS NOT NULL AND event_type IN ('EXECUTION_FINISHED','EXECUTION_FAILED','EXECUTION_ABORTED');

-- Fixed-order JSONB array v1; JSON null is distinct from a missing value. The database
-- supplies the timestamp and digest. No URL, token, request body or parser output enters it.
CREATE FUNCTION public.h3e91_record_execution_event(
  _event_id uuid, _execution_id uuid, _event_type text,
  _upload_id uuid, _correlation_id uuid, _job_id uuid, _attempt_number integer,
  _demo_sha256 text, _file_size bigint, _parser_name text, _parser_version text,
  _parser_revision text, _execution_surface text, _source text,
  _metadata_digest text, _outcome_code text, _event_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  previous public.h3e91_execution_evidence_ledger%ROWTYPE;
  same_type public.h3e91_execution_evidence_ledger%ROWTYPE;
  same_id public.h3e91_execution_evidence_ledger%ROWTYPE;
  recorded_at timestamptz;
  canonical jsonb;
  semantic jsonb;
  existing_semantic jsonb;
  computed_digest text;
BEGIN
  IF _event_id IS NULL OR _execution_id IS NULL OR _event_version IS DISTINCT FROM 1
    OR _event_type NOT IN ('EXECUTION_INTENT','EXECUTION_STARTED','EXECUTION_FINISHED','EXECUTION_FAILED','EXECUTION_ABORTED')
    OR _execution_surface NOT IN ('APP_REMOTE_PARSER','RAILWAY_DURABLE_WORKER','RAILWAY_V1_PARSE')
    OR _source NOT IN ('APP','RAILWAY')
    OR (_source = 'APP' AND _execution_surface <> 'APP_REMOTE_PARSER')
    OR (_source = 'RAILWAY' AND _execution_surface = 'APP_REMOTE_PARSER')
    OR (_attempt_number IS NOT NULL AND _attempt_number < 1)
    OR (_file_size IS NOT NULL AND _file_size < 1)
    OR (_demo_sha256 IS NOT NULL AND _demo_sha256 !~ '^[0-9a-f]{64}$')
    OR (_metadata_digest IS NOT NULL AND _metadata_digest !~ '^[0-9a-f]{64}$')
    OR (_event_type IN ('EXECUTION_INTENT','EXECUTION_STARTED') AND _outcome_code IS NOT NULL)
    OR (_event_type IN ('EXECUTION_FINISHED','EXECUTION_FAILED','EXECUTION_ABORTED') AND (_outcome_code IS NULL OR _outcome_code !~ '^[A-Z][A-Z0-9_]{0,63}$'))
    OR (_event_type <> 'EXECUTION_INTENT' AND (coalesce(pg_catalog.length(pg_catalog.btrim(_parser_name)),0) = 0 OR coalesce(pg_catalog.length(pg_catalog.btrim(_parser_version)),0) = 0 OR coalesce(pg_catalog.length(pg_catalog.btrim(_parser_revision)),0) = 0))
    OR (_event_type IN ('EXECUTION_STARTED','EXECUTION_FINISHED','EXECUTION_FAILED') AND (_demo_sha256 IS NULL OR _file_size IS NULL))
    OR pg_catalog.length(coalesce(_parser_name,'')) > 128 OR pg_catalog.length(coalesce(_parser_version,'')) > 128
    OR pg_catalog.length(coalesce(_parser_revision,'')) > 128 OR pg_catalog.length(coalesce(_source,'')) > 32
  THEN RETURN pg_catalog.jsonb_build_object('status','REJECTED','code','INVALID_EVENT'); END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_execution_id::text, 39791));
  SELECT * INTO same_id FROM public.h3e91_execution_evidence_ledger WHERE event_id = _event_id;
  IF same_id.event_id IS NOT NULL AND same_id.execution_id IS DISTINCT FROM _execution_id THEN
    RETURN pg_catalog.jsonb_build_object('status','REJECTED','code','EVENT_ID_CONFLICT');
  END IF;
  SELECT * INTO same_type FROM public.h3e91_execution_evidence_ledger WHERE execution_id = _execution_id AND event_type = _event_type;
  SELECT * INTO previous FROM public.h3e91_execution_evidence_ledger
    WHERE execution_id = _execution_id ORDER BY event_at DESC, created_at DESC LIMIT 1;
  IF same_id.event_id IS NOT NULL AND (same_type.event_id IS NULL OR same_id.event_id IS DISTINCT FROM same_type.event_id) THEN
    RETURN pg_catalog.jsonb_build_object('status','REJECTED','code','EVENT_ID_CONFLICT');
  END IF;
  IF same_type.event_id IS NOT NULL THEN
    semantic := pg_catalog.jsonb_build_array(1, _execution_id, _event_type, _event_version, _upload_id, _correlation_id, _job_id, _attempt_number, _demo_sha256, _file_size, _parser_name, _parser_version, _parser_revision, _execution_surface, _source, _metadata_digest, _outcome_code);
    existing_semantic := pg_catalog.jsonb_build_array(1, same_type.execution_id, same_type.event_type, same_type.event_version, same_type.upload_id, same_type.correlation_id, same_type.job_id, same_type.attempt_number, same_type.demo_sha256, same_type.file_size, same_type.parser_name, same_type.parser_version, same_type.parser_revision, same_type.execution_surface, same_type.source, same_type.metadata_digest, same_type.outcome_code);
    IF semantic IS DISTINCT FROM existing_semantic THEN
      RETURN pg_catalog.jsonb_build_object('status','REJECTED','code','TRANSITION_CONFLICT');
    END IF;
    RETURN pg_catalog.jsonb_build_object('status','IDEMPOTENT_REPLAY','event_id',same_type.event_id,'execution_id',_execution_id,'event_digest',same_type.event_digest);
  END IF;
  IF same_id.event_id IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('status','REJECTED','code','EVENT_ID_CONFLICT'); END IF;
  IF (_event_type = 'EXECUTION_INTENT' AND previous.execution_id IS NOT NULL)
    OR (_event_type = 'EXECUTION_STARTED' AND previous.event_type IS DISTINCT FROM 'EXECUTION_INTENT')
    OR (_event_type IN ('EXECUTION_FINISHED','EXECUTION_FAILED') AND previous.event_type IS DISTINCT FROM 'EXECUTION_STARTED')
    OR (_event_type = 'EXECUTION_ABORTED' AND previous.event_type IS DISTINCT FROM 'EXECUTION_INTENT' AND previous.event_type IS DISTINCT FROM 'EXECUTION_STARTED')
  THEN RETURN pg_catalog.jsonb_build_object('status','REJECTED','code','INVALID_TRANSITION'); END IF;
  IF previous.execution_id IS NOT NULL AND (previous.execution_surface IS DISTINCT FROM _execution_surface OR previous.source IS DISTINCT FROM _source OR previous.upload_id IS DISTINCT FROM _upload_id OR previous.correlation_id IS DISTINCT FROM _correlation_id OR previous.job_id IS DISTINCT FROM _job_id OR previous.attempt_number IS DISTINCT FROM _attempt_number OR (previous.demo_sha256 IS NOT NULL AND previous.demo_sha256 IS DISTINCT FROM _demo_sha256) OR (previous.file_size IS NOT NULL AND previous.file_size IS DISTINCT FROM _file_size) OR (previous.parser_name IS NOT NULL AND previous.parser_name IS DISTINCT FROM _parser_name) OR (previous.parser_version IS NOT NULL AND previous.parser_version IS DISTINCT FROM _parser_version) OR (previous.parser_revision IS NOT NULL AND previous.parser_revision IS DISTINCT FROM _parser_revision)) THEN
    RETURN pg_catalog.jsonb_build_object('status','REJECTED','code','EXECUTION_IDENTITY_CONFLICT');
  END IF;
  recorded_at := pg_catalog.clock_timestamp();
  canonical := pg_catalog.jsonb_build_array(1, _event_id, _execution_id, _event_type, _event_version, recorded_at, _upload_id, _correlation_id, _job_id, _attempt_number, _demo_sha256, _file_size, _parser_name, _parser_version, _parser_revision, _execution_surface, _source, _metadata_digest, _outcome_code);
  computed_digest := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(canonical::text, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO public.h3e91_execution_evidence_ledger (event_id, execution_id, event_type, event_at, upload_id, correlation_id, job_id, attempt_number, demo_sha256, file_size, parser_name, parser_version, parser_revision, execution_surface, source, metadata_digest, outcome_code, event_version, event_digest)
  VALUES (_event_id, _execution_id, _event_type, recorded_at, _upload_id, _correlation_id, _job_id, _attempt_number, _demo_sha256, _file_size, _parser_name, _parser_version, _parser_revision, _execution_surface, _source, _metadata_digest, _outcome_code, _event_version, computed_digest);
  RETURN pg_catalog.jsonb_build_object('status','INSERTED','event_id',_event_id,'execution_id',_execution_id,'event_digest',computed_digest);
END;
$fn$;
REVOKE ALL ON FUNCTION public.h3e91_record_execution_event(uuid,uuid,text,uuid,uuid,uuid,integer,text,bigint,text,text,text,text,text,text,text,integer) FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.h3e91_record_execution_event(uuid,uuid,text,uuid,uuid,uuid,integer,text,bigint,text,text,text,text,text,text,text,integer) TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.h3e91_execution_evidence_ledger FROM sandbox_exec, service_role, anon, authenticated, PUBLIC;
