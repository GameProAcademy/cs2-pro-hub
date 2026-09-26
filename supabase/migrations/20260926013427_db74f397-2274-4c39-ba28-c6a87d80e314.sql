-- R3: unpopulated, sealed evidence infrastructure. No execution events are generated.
CREATE TABLE public.h3e91_execution_evidence_ledger (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  event_type text NOT NULL CHECK (event_type IN ('EXECUTION_INTENT','EXECUTION_STARTED','EXECUTION_FINISHED','EXECUTION_FAILED','EXECUTION_ABORTED')),
  job_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  demo_sha256 text NOT NULL CHECK (demo_sha256 ~ '^[0-9a-f]{64}$'),
  file_size bigint NOT NULL CHECK (file_size > 0),
  parser_name text NOT NULL,
  parser_version text NOT NULL,
  parser_revision text NOT NULL,
  execution_surface text NOT NULL,
  source text NOT NULL,
  metadata_digest text NOT NULL CHECK (metadata_digest ~ '^[0-9a-f]{64}$')
);
GRANT SELECT ON public.h3e91_execution_evidence_ledger TO service_role;
ALTER TABLE public.h3e91_execution_evidence_ledger ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: no user or runner can read or write; no INSERT grant exists.
REVOKE ALL ON public.h3e91_execution_evidence_ledger FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.h3e91_execution_evidence_ledger FROM service_role;
CREATE FUNCTION public.h3e91_reject_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $fn$
BEGIN
  RAISE EXCEPTION 'H3E91_LEDGER_APPEND_ONLY';
END;
$fn$;
REVOKE ALL ON FUNCTION public.h3e91_reject_ledger_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER h3e91_ledger_no_update_delete BEFORE UPDATE OR DELETE ON public.h3e91_execution_evidence_ledger
FOR EACH ROW EXECUTE FUNCTION public.h3e91_reject_ledger_mutation();

-- Correct the previously deployed mutable-job diagnostic: starts before the baseline
-- remain historical, even when a job finishes later or stays open.
CREATE OR REPLACE FUNCTION public.h3e91_execution_ledger_after_baseline(_baseline_started_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
WITH jobs AS MATERIALIZED (
  SELECT j.created_at, j.started_at, j.finished_at, j.attempt_number,
         j.demo_sha256, j.file_size, j.status
  FROM public.demo_jobs j
), summary AS (
  SELECT
    count(*) FILTER (WHERE started_at < _baseline_started_at AND finished_at < _baseline_started_at) AS historical_started_job_count,
    count(*) FILTER (WHERE started_at < _baseline_started_at AND (finished_at IS NULL OR finished_at >= _baseline_started_at)) AS historical_spanning_baseline_count,
    count(*) FILTER (WHERE started_at >= _baseline_started_at AND started_at <= pg_catalog.statement_timestamp()) AS started_job_count_after_baseline,
    count(*) FILTER (WHERE started_at >= _baseline_started_at AND started_at <= pg_catalog.statement_timestamp()
      AND demo_sha256 = '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d'
      AND file_size = 473748061) AS cache_started_job_count_after_baseline,
    count(*) FILTER (WHERE attempt_number = 9 AND created_at >= _baseline_started_at) AS attempt9_created_after_baseline,
    count(*) FILTER (WHERE attempt_number = 9 AND started_at >= _baseline_started_at) AS attempt9_started_after_baseline,
    count(*) FILTER (WHERE attempt_number >= 10 AND created_at >= _baseline_started_at) AS attempt10_plus_created_after_baseline,
    count(*) FILTER (WHERE attempt_number >= 10 AND started_at >= _baseline_started_at) AS attempt10_plus_started_after_baseline,
    count(*) FILTER (WHERE started_at IS NULL AND status IN ('processing','processed')) AS started_at_missing_count,
    count(*) FILTER (WHERE started_at > pg_catalog.statement_timestamp() OR finished_at < started_at OR finished_at > pg_catalog.statement_timestamp()) AS invalid_timestamps_count
  FROM jobs
)
SELECT pg_catalog.jsonb_build_object(
  'baselineValid', _baseline_started_at IS NOT NULL AND _baseline_started_at <= pg_catalog.statement_timestamp()
    AND _baseline_started_at >= pg_catalog.statement_timestamp() - interval '10 minutes',
  'historicalStartedJobCount', historical_started_job_count,
  'historicalExecutionSpanningBaselineCount', historical_spanning_baseline_count,
  'realDemoExecutionCountAfterBaseline', started_job_count_after_baseline,
  'cacheDemoExecutionCountAfterBaseline', cache_started_job_count_after_baseline,
  'attempt9CreatedAfterBaseline', attempt9_created_after_baseline,
  'attempt9StartedAfterBaseline', attempt9_started_after_baseline,
  'attempt10PlusCreatedAfterBaseline', attempt10_plus_created_after_baseline,
  'attempt10PlusStartedAfterBaseline', attempt10_plus_started_after_baseline,
  'attempt9CountAfterBaseline', attempt9_created_after_baseline + attempt9_started_after_baseline,
  'attempt10PlusCountAfterBaseline', attempt10_plus_created_after_baseline + attempt10_plus_started_after_baseline,
  'startedAtMissingCount', started_at_missing_count,
  'invalidTimestampsCount', invalid_timestamps_count
) FROM summary;
$fn$;
REVOKE ALL ON FUNCTION public.h3e91_execution_ledger_after_baseline(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.h3e91_execution_ledger_after_baseline(timestamptz) TO service_role;

-- Read-only inspection of the sealed ledger; uninstrumented writers mean zero is
-- NEVER an authoritative proof of absence, even if the table is empty.
CREATE FUNCTION public.h3e91_authoritative_execution_evidence(_baseline_started_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
WITH events AS MATERIALIZED (
  SELECT event_type, created_at, attempt_number, demo_sha256, file_size
  FROM public.h3e91_execution_evidence_ledger
), totals AS (
 SELECT
   count(*) FILTER (WHERE event_type = 'EXECUTION_STARTED' AND created_at < _baseline_started_at) AS historical_count,
   count(*) FILTER (WHERE event_type = 'EXECUTION_STARTED' AND created_at >= _baseline_started_at) AS after_baseline_count,
   count(*) FILTER (WHERE event_type = 'EXECUTION_STARTED' AND created_at >= _baseline_started_at AND demo_sha256 = '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d' AND file_size = 473748061) AS cache_after_baseline_count,
   count(*) FILTER (WHERE attempt_number = 9 AND created_at >= _baseline_started_at) AS attempt9_after_baseline_count,
   count(*) FILTER (WHERE attempt_number >= 10 AND created_at >= _baseline_started_at) AS attempt10_plus_after_baseline_count,
   count(*) FILTER (WHERE created_at > pg_catalog.statement_timestamp()) AS invalid_timestamps_count,
   count(*) AS total_count
 FROM events
)
SELECT pg_catalog.jsonb_build_object(
 'baselineValid', _baseline_started_at IS NOT NULL AND _baseline_started_at <= pg_catalog.statement_timestamp() AND _baseline_started_at >= pg_catalog.statement_timestamp() - interval '10 minutes',
 'ledgerType', 'APPEND_ONLY_PREPARED', 'ledgerAuthority', 'UNINSTRUMENTED',
 'writerCoverageVerified', false, 'historicalCount', historical_count,
 'spanningBaselineCount', NULL, 'afterBaselineCount', after_baseline_count,
 'cacheAfterBaselineCount', cache_after_baseline_count,
 'attempt9AfterBaselineCount', attempt9_after_baseline_count,
 'attempt10PlusAfterBaselineCount', attempt10_plus_after_baseline_count,
 'invalidTimestampsCount', invalid_timestamps_count, 'totalCount', total_count,
 'rlsEnabled', (SELECT c.relrowsecurity FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'h3e91_execution_evidence_ledger'),
 'noClientPrivileges', NOT pg_catalog.has_table_privilege('anon', 'public.h3e91_execution_evidence_ledger', 'SELECT,INSERT,UPDATE,DELETE') AND NOT pg_catalog.has_table_privilege('authenticated', 'public.h3e91_execution_evidence_ledger', 'SELECT,INSERT,UPDATE,DELETE'),
 'serviceReadOnly', pg_catalog.has_table_privilege('service_role', 'public.h3e91_execution_evidence_ledger', 'SELECT') AND NOT pg_catalog.has_table_privilege('service_role', 'public.h3e91_execution_evidence_ledger', 'INSERT,UPDATE,DELETE,TRUNCATE'),
 'mutationTriggerPresent', EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid WHERE c.oid = 'public.h3e91_execution_evidence_ledger'::pg_catalog.regclass AND t.tgname = 'h3e91_ledger_no_update_delete' AND t.tgenabled = 'O'),
 'rpcServiceRoleOnly', NOT pg_catalog.has_function_privilege('anon', 'public.h3e91_authoritative_execution_evidence(timestamptz)', 'EXECUTE') AND NOT pg_catalog.has_function_privilege('authenticated', 'public.h3e91_authoritative_execution_evidence(timestamptz)', 'EXECUTE') AND pg_catalog.has_function_privilege('service_role', 'public.h3e91_authoritative_execution_evidence(timestamptz)', 'EXECUTE')
) FROM totals;
$fn$;
REVOKE ALL ON FUNCTION public.h3e91_authoritative_execution_evidence(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.h3e91_authoritative_execution_evidence(timestamptz) TO service_role;