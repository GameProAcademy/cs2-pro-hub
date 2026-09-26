-- Correct the R3 diagnostic to read attempt_number from uploads, its real owner.
CREATE OR REPLACE FUNCTION public.h3e91_execution_ledger_after_baseline(_baseline_started_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
WITH jobs AS MATERIALIZED (
  SELECT j.created_at, j.started_at, j.finished_at, u.attempt_number,
         j.demo_sha256, j.file_size, j.status
  FROM public.demo_jobs j JOIN public.uploads u ON u.id = j.upload_id
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