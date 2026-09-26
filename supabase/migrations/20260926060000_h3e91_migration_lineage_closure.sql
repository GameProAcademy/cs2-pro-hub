-- H.3-E.9.1-R4.1-C / F.5.3-CLOSURE.2
-- MIGRATION LINEAGE CLOSURE & AUTHORITATIVE READER FINALIZATION

-- Ensure the lifecycle reader matches the authoritative requirements.
-- This supersedes 20260926053000, 20260926055410, and 20260926055608.

CREATE OR REPLACE FUNCTION public.h3e91_read_execution_lifecycle(_execution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $reader$
DECLARE
  _total_count integer;
  _intent_count integer;
  _started_count integer;
  _terminal_count integer;
  _intent_at timestamptz;
  _started_at timestamptz;
  _terminal_type text;
  _terminal_event_id uuid;
  _terminal_outcome text;
  _terminal_at timestamptz;
  _lifecycle text;
BEGIN
  IF _execution_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'executionId', NULL, 'lifecycle', 'INVALID',
      'terminalEventId', NULL, 'terminalOutcome', NULL,
      'terminalEventAt', NULL, 'hasStarted', false, 'hasTerminal', false
    );
  END IF;

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (WHERE event_type = 'EXECUTION_INTENT'),
    pg_catalog.count(*) FILTER (WHERE event_type = 'EXECUTION_STARTED'),
    pg_catalog.count(*) FILTER (WHERE event_type IN ('EXECUTION_FINISHED', 'EXECUTION_FAILED', 'EXECUTION_ABORTED')),
    pg_catalog.min(event_at) FILTER (WHERE event_type = 'EXECUTION_INTENT'),
    pg_catalog.min(event_at) FILTER (WHERE event_type = 'EXECUTION_STARTED')
  INTO _total_count, _intent_count, _started_count, _terminal_count, _intent_at, _started_at
  FROM public.h3e91_execution_evidence_ledger
  WHERE execution_id = _execution_id;

  IF _total_count = 0 THEN
    _lifecycle := 'NONE';
  ELSIF _total_count <> _intent_count + _started_count + _terminal_count
    OR _intent_count <> 1 OR _started_count > 1 OR _terminal_count > 1
    OR (_started_count = 1 AND _intent_at > _started_at) THEN
    _lifecycle := 'INVALID';
  ELSIF _terminal_count = 1 THEN
    SELECT event_type, event_id, outcome_code, event_at
    INTO _terminal_type, _terminal_event_id, _terminal_outcome, _terminal_at
    FROM public.h3e91_execution_evidence_ledger
    WHERE execution_id = _execution_id
      AND event_type IN ('EXECUTION_FINISHED', 'EXECUTION_FAILED', 'EXECUTION_ABORTED')
    LIMIT 1;

    IF (_terminal_type IN ('EXECUTION_FINISHED', 'EXECUTION_FAILED') AND _started_count <> 1)
      OR (_terminal_type = 'EXECUTION_ABORTED' AND _started_count NOT IN (0, 1))
      OR (_started_count = 1 AND _started_at > _terminal_at)
      OR (_started_count = 0 AND _intent_at > _terminal_at) THEN
      _lifecycle := 'INVALID';
    ELSE
      _lifecycle := pg_catalog.replace(_terminal_type, 'EXECUTION_', '');
    END IF;
  ELSIF _started_count = 1 THEN
    _lifecycle := 'STARTED';
  ELSE
    _lifecycle := 'INTENT_ONLY';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'executionId', _execution_id, 'lifecycle', _lifecycle,
    'terminalEventId', _terminal_event_id, 'terminalOutcome', _terminal_outcome,
    'terminalEventAt', _terminal_at, 'hasStarted', _started_count = 1,
    'hasTerminal', _terminal_count = 1
  );
END;
$reader$;

-- Enforcement of security policies.
REVOKE ALL ON FUNCTION public.h3e91_read_execution_lifecycle(uuid) FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.h3e91_read_execution_lifecycle(uuid) TO service_role;

-- Documented lineage versions.
-- SOURCE_MIGRATION_VERSION: 20260926060000
-- LIVE_MIGRATION_VERSION: 20260926055608 (assumed latest live)
-- FINAL_SCHEMA_VERSION: 20260926060000
