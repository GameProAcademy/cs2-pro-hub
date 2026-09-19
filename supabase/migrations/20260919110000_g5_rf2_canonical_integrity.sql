-- FASE 2.7.2G.5-R-F.2.6 — Canonical integrity + terminal convergence hardening.
--
-- Production Run 1 proved three concrete defects:
-- 1) finish_demo_job_processed attempted to assign text[] to demo_jobs.quality_flags (jsonb);
-- 2) approved durable RAW artifacts without a raw_demo_evidence_reports row were not
--    recognized as idempotently processed;
-- 3) impossible round intervals could reach the DB because the DB had no boundary check.
--
-- This migration is fail-closed and idempotent. It does NOT rewrite historical
-- Canonical data. Historical invalid rows remain preserved for forensic review.

CREATE OR REPLACE FUNCTION public.finish_demo_job_processed(
  _job_id uuid,
  _result jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _canonical_match_id uuid;
  _result_match_id uuid;
BEGIN
  SELECT *
  INTO _job
  FROM public.demo_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF _job.id IS NULL THEN
    RETURN false;
  END IF;

  -- Idempotent terminal replay.
  IF _job.status = 'processed' THEN
    RETURN true;
  END IF;

  IF _job.status <> 'processing' THEN
    RETURN false;
  END IF;

  -- Terminal success is only legal after Canonical persistence has committed.
  -- The match_source is the durable bridge between upload attempt and Canonical.
  SELECT ms.match_id
  INTO _canonical_match_id
  FROM public.match_sources ms
  WHERE ms.upload_id = _job.upload_id
    AND ms.source = 'demo'
    AND ms.match_id IS NOT NULL
  ORDER BY ms.updated_at DESC, ms.created_at DESC
  LIMIT 1;

  IF _canonical_match_id IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_NOT_PERSISTED'
      USING ERRCODE = '55000';
  END IF;

  _result_match_id := NULLIF(_result->>'match_id', '')::uuid;
  IF _result_match_id IS NOT NULL AND _result_match_id <> _canonical_match_id THEN
    RAISE EXCEPTION 'CANONICAL_MATCH_MISMATCH'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.demo_jobs
  SET
    status = 'processed',
    stage = 'done',
    finished_at = COALESCE(NULLIF(_result->>'finished_at', '')::timestamptz, now()),
    duration_ms = NULLIF(_result->>'duration_ms', '')::bigint,
    match_id = _canonical_match_id,
    player_id = NULLIF(_result->>'player_id', '')::uuid,
    resolved_steam_id = NULLIF(_result->>'resolved_steam_id', ''),
    identity_status = COALESCE(NULLIF(_result->>'identity_status', ''), identity_status),
    attachment_state = COALESCE(NULLIF(_result->>'attachment_state', ''), attachment_state),
    attachment_method = NULLIF(_result->>'attachment_method', ''),
    attachment_confidence = NULLIF(_result->>'attachment_confidence', '')::numeric,
    attachment_confidence_label = NULLIF(_result->>'attachment_confidence_label', ''),
    attachment_source = NULLIF(_result->>'attachment_source', ''),
    attachment_confirmation_status = COALESCE(
      NULLIF(_result->>'attachment_confirmation_status', ''),
      attachment_confirmation_status
    ),
    attachment_participant_key = NULLIF(_result->>'attachment_participant_key', ''),
    attachment_reason = NULLIF(_result->>'attachment_reason', ''),
    observed_nickname = NULLIF(_result->>'observed_nickname', ''),
    parser_name = NULLIF(_result->>'parser_name', ''),
    parser_version = NULLIF(_result->>'parser_version', ''),
    parser_revision = NULLIF(_result->>'parser_revision', ''),
    schema_version = NULLIF(_result->>'schema_version', '')::integer,
    analysis_version = NULLIF(_result->>'analysis_version', ''),
    rounds_detected = NULLIF(_result->>'rounds_detected', '')::integer,
    rounds_valid = NULLIF(_result->>'rounds_valid', '')::integer,
    players_detected = NULLIF(_result->>'players_detected', '')::integer,
    events_detected = NULLIF(_result->>'events_detected', '')::integer,
    extraction_confidence = NULLIF(_result->>'extraction_confidence', '')::numeric,
    partial_parse = COALESCE(
      NULLIF(_result->>'partial_parse', '')::boolean,
      partial_parse
    ),
    -- IMPORTANT: quality_flags is JSONB. Never coerce it to text[].
    quality_flags = COALESCE(_result->'quality_flags', '[]'::jsonb),
    retain_until = NULLIF(_result->>'retain_until', '')::timestamptz,
    error_code = NULL,
    error_message = NULL,
    heartbeat_at = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE id = _job_id
    AND status = 'processing';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.uploads
  SET
    status = 'processed',
    processed_at = COALESCE(NULLIF(_result->>'finished_at', '')::timestamptz, now()),
    processing_duration_ms = NULLIF(_result->>'duration_ms', '')::bigint,
    parser_name = NULLIF(_result->>'parser_name', ''),
    parser_version = NULLIF(_result->>'parser_version', ''),
    schema_version = NULLIF(_result->>'schema_version', '')::integer,
    analysis_version = NULLIF(_result->>'analysis_version', ''),
    error_code = NULL,
    error_message = NULL
  WHERE id = _job.upload_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_demo_job_processed(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_demo_job_processed(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.finish_demo_job_processed(uuid, jsonb) IS
  'Idempotent terminalization of a demo job after a committed Canonical demo match source; quality_flags is JSONB and Canonical persistence is a required postcondition.';

-- Approved durable RAW artifacts are valid forensic admission evidence even when
-- the legacy report table is intentionally absent. Treat either immutable
-- approved representation as sufficient for duplicate idempotency.
CREATE OR REPLACE FUNCTION public.reserve_demo_upload(
  _user_id uuid,
  _upload_id uuid,
  _file_name text,
  _file_size bigint,
  _demo_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _upload public.uploads%ROWTYPE;
  _job public.demo_jobs%ROWTYPE;
  _processed_job public.demo_jobs%ROWTYPE;
  _storage_path text;
  _replacement_reason text;
  _attempt_number integer := 1;
  _stale boolean := false;
  _had_previous_upload boolean := false;
BEGIN
  IF _demo_sha256 IS NULL OR _demo_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_DEMO_SHA256' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':' || _demo_sha256, 0)
  );

  SELECT j.*
  INTO _processed_job
  FROM public.demo_jobs j
  WHERE j.user_id = _user_id
    AND j.demo_sha256 = _demo_sha256
    AND j.status = 'processed'
    AND (
      EXISTS (
        SELECT 1
        FROM public.raw_demo_evidence_reports r
        WHERE r.job_id = j.id
          AND r.approved_for_canonical = true
          AND r.raw_audit_status = 'APPROVED'
      )
      OR EXISTS (
        SELECT 1
        FROM public.raw_evidence_artifacts a
        WHERE a.job_id = j.id
          AND a.upload_id = j.upload_id
          AND a.status = 'ready'
          AND a.raw_status = 'ready'
          AND a.audit_status = 'approved'
          AND a.root_digest IS NOT NULL
      )
    )
  ORDER BY j.attempt_number DESC, j.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _processed_job.id IS NOT NULL THEN
    SELECT * INTO _upload
    FROM public.uploads
    WHERE id = _processed_job.upload_id;

    RETURN jsonb_build_object(
      'upload_id', _upload.id,
      'storage_path', COALESCE(
        _upload.storage_path,
        _user_id::text || '/' || _upload.id::text || '.dem'
      ),
      'duplicate', true,
      'duplicate_status', 'processed',
      'job_id', _processed_job.id,
      'new_attempt', false,
      'attempt_number', _processed_job.attempt_number,
      'supersedes_job_id', NULL,
      'replacement_reason', NULL
    );
  END IF;

  SELECT *
  INTO _upload
  FROM public.uploads
  WHERE user_id = _user_id
    AND demo_sha256 = _demo_sha256
  ORDER BY attempt_number DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _upload.id IS NOT NULL THEN
    _had_previous_upload := true;

    SELECT *
    INTO _job
    FROM public.demo_jobs
    WHERE upload_id = _upload.id
    FOR UPDATE;

    IF _job.id IS NULL AND _upload.status IN ('pending', 'processing', 'cancel_requested') THEN
      RETURN jsonb_build_object(
        'upload_id', _upload.id,
        'storage_path', COALESCE(
          _upload.storage_path,
          _user_id::text || '/' || _upload.id::text || '.dem'
        ),
        'duplicate', true,
        'duplicate_status', 'pending',
        'job_id', NULL,
        'new_attempt', false,
        'attempt_number', _upload.attempt_number,
        'supersedes_job_id', _upload.supersedes_job_id,
        'replacement_reason', _upload.replacement_reason
      );
    END IF;

    IF _job.id IS NULL THEN
      IF _upload.status = 'failed' THEN
        _replacement_reason := 'failed';
      ELSIF _upload.status = 'cancelled' THEN
        _replacement_reason := 'cancelled';
      ELSIF _upload.status = 'blocked_raw_audit' THEN
        _replacement_reason := 'raw_audit_blocked';
      ELSIF _upload.status = 'processed' THEN
        _replacement_reason := 'legacy_unvalidated';
      ELSE
        RAISE EXCEPTION 'UPLOAD_NOT_REPLACEABLE';
      END IF;
      _attempt_number := COALESCE(_upload.attempt_number, 1) + 1;
    ELSE
      _stale := _job.status = 'processing'
        AND COALESCE(_job.heartbeat_at, _job.started_at) < now() - interval '15 minutes'
        AND (
          (
            _job.durable_dispatch_enabled
            AND _job.queue_message_id IS NOT NULL
            AND _job.lease_expires_at IS NOT NULL
            AND _job.lease_expires_at < now()
          )
          OR
          (
            NOT _job.durable_dispatch_enabled
            AND (_job.lease_expires_at IS NULL OR _job.lease_expires_at < now())
          )
        );

      IF _job.status IN ('pending', 'cancel_requested')
         OR (_job.status = 'processing' AND NOT _stale) THEN
        RETURN jsonb_build_object(
          'upload_id', _upload.id,
          'storage_path', COALESCE(
            _upload.storage_path,
            _user_id::text || '/' || _upload.id::text || '.dem'
          ),
          'duplicate', true,
          'duplicate_status', 'pending',
          'job_id', _job.id,
          'new_attempt', false,
          'attempt_number', _job.attempt_number,
          'supersedes_job_id', _job.supersedes_job_id,
          'replacement_reason', NULL
        );
      END IF;

      IF _stale THEN
        _replacement_reason := 'stale';
        IF _job.queue_message_id IS NOT NULL THEN
          PERFORM pgmq.archive('demo_parse', _job.queue_message_id);
        END IF;
        UPDATE public.demo_jobs SET
          status = 'failed',
          stage = 'failed',
          finished_at = now(),
          error_code = 'JOB_STALE',
          error_message = NULL,
          lease_expires_at = NULL,
          heartbeat_at = NULL,
          worker_id = NULL,
          replacement_reason = 'stale',
          updated_at = now()
        WHERE id = _job.id;

        UPDATE public.uploads SET
          status = 'failed',
          processed_at = NULL,
          error_code = 'JOB_STALE',
          error_message = NULL,
          replacement_reason = 'stale'
        WHERE id = _upload.id;
      ELSIF _job.status = 'failed' OR _upload.status = 'failed' THEN
        _replacement_reason := 'failed';
      ELSIF _job.status = 'cancelled' OR _upload.status = 'cancelled' THEN
        _replacement_reason := 'cancelled';
      ELSIF _job.status = 'blocked_raw_audit' OR _upload.status = 'blocked_raw_audit' THEN
        _replacement_reason := 'raw_audit_blocked';
      ELSIF _job.status = 'processed' OR _upload.status = 'processed' THEN
        _replacement_reason := 'legacy_unvalidated';
      ELSE
        RETURN jsonb_build_object(
          'upload_id', _upload.id,
          'storage_path', COALESCE(
            _upload.storage_path,
            _user_id::text || '/' || _upload.id::text || '.dem'
          ),
          'duplicate', true,
          'duplicate_status', 'pending',
          'job_id', _job.id,
          'new_attempt', false,
          'attempt_number', _job.attempt_number,
          'supersedes_job_id', _job.supersedes_job_id,
          'replacement_reason', NULL
        );
      END IF;

      _attempt_number := GREATEST(
        COALESCE(_job.attempt_number, 1),
        COALESCE(_upload.attempt_number, 1)
      ) + 1;
    END IF;
  END IF;

  _storage_path := _user_id::text || '/' || _upload_id::text || '.dem';

  INSERT INTO public.uploads (
    id, user_id, type, source, file_name, file_size, mime_type, demo_sha256,
    storage_path, status, processed_at, error_message, attempt_number,
    supersedes_job_id, replacement_reason
  ) VALUES (
    _upload_id, _user_id, 'demo', 'manual', _file_name, _file_size,
    'application/octet-stream', _demo_sha256, _storage_path, 'pending', NULL, NULL,
    _attempt_number,
    CASE WHEN _job.id IS NOT NULL THEN _job.id ELSE NULL END,
    _replacement_reason
  );

  RETURN jsonb_build_object(
    'upload_id', _upload_id,
    'storage_path', _storage_path,
    'duplicate', _had_previous_upload,
    'duplicate_status', CASE
      WHEN _replacement_reason = 'cancelled' THEN 'cancelled'
      WHEN _replacement_reason IN ('failed', 'stale', 'raw_audit_blocked') THEN 'failed'
      ELSE NULL
    END,
    'job_id', NULL,
    'new_attempt', _attempt_number > 1,
    'attempt_number', _attempt_number,
    'supersedes_job_id', CASE WHEN _job.id IS NOT NULL THEN _job.id ELSE NULL END,
    'replacement_reason', _replacement_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text)
  TO service_role;

COMMENT ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text) IS
  'Serialized demo reservation; processed is idempotent only when immutable RAW admission exists as either an approved report or an approved durable RAW artifact.';

-- New/updated Canonical rows must never accept an impossible round interval.
-- NOT VALID preserves historical rows for forensic repair while enforcing the
-- invariant for every future INSERT/UPDATE.
ALTER TABLE public.match_rounds
  DROP CONSTRAINT IF EXISTS match_rounds_tick_order_check;

ALTER TABLE public.match_rounds
  ADD CONSTRAINT match_rounds_tick_order_check
  CHECK (
    start_tick IS NULL
    OR end_tick IS NULL
    OR end_tick >= start_tick
  ) NOT VALID;

COMMENT ON CONSTRAINT match_rounds_tick_order_check ON public.match_rounds IS
  'New Canonical round rows must not end before they start; historical invalid rows remain preserved for forensic repair.';
