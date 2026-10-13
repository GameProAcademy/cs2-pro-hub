-- H.3-E retention diagnosis: READ-ONLY, aggregates only (no ids, paths, user ids or names).
-- Run as one SELECT on the managed database. It calls only STABLE functions
-- (evaluate_demo_deletion_gate, get_demo_cleanup_authority) and reads
-- storage.objects metadata; it changes nothing. Output is the evidence that
-- docs/H3E_RETENTION_DIAGNOSIS.md interprets.
WITH jobs AS (
  SELECT j.status,
         j.cleanup_error,
         j.deletion_reason,
         j.storage_deleted_at IS NOT NULL AS deleted_flag,
         j.storage_delete_verified_at IS NOT NULL AS verified_flag,
         j.storage_delete_attempted_at IS NOT NULL AS attempted_flag,
         j.retain_until <= now() AS expired,
         j.worker_id IS NOT NULL AS has_worker,
         j.cleanup_claim_token IS NOT NULL AS has_claim,
         j.cleanup_attempt_count,
         j.file_size,
         j.finished_at,
         j.storage_deleted_at,
         EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'demos' AND o.name = j.storage_path) AS object_present,
         public.evaluate_demo_deletion_gate(j.id) ->> 'reason' AS gate_reason
  FROM public.demo_jobs j
), groups AS (
  SELECT status, cleanup_error, deletion_reason, deleted_flag, verified_flag, attempted_flag, expired,
         has_worker, has_claim, object_present, gate_reason,
         count(*) AS jobs, sum(cleanup_attempt_count) AS attempts, sum(file_size) AS declared_bytes,
         min(finished_at)::date AS first_finished, max(finished_at)::date AS last_finished,
         min(storage_deleted_at)::date AS first_deleted_flag, max(storage_deleted_at)::date AS last_deleted_flag
  FROM jobs
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
)
SELECT jsonb_build_object(
  'observed_at', now(),
  'authority', public.get_demo_cleanup_authority(),
  'metrics', public.get_demo_retention_metrics(),
  'groups', (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.status, g.object_present) FROM groups g),
  'bucket', (SELECT jsonb_build_object(
      'objects', count(*),
      'bytes', COALESCE(sum((o.metadata ->> 'size')::bigint), 0),
      'orphans', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.demo_jobs j WHERE j.storage_path = o.name)
                                    AND NOT EXISTS (SELECT 1 FROM public.uploads u WHERE u.storage_path = o.name)))
    FROM storage.objects o WHERE o.bucket_id = 'demos'),
  'cron', (SELECT COALESCE(jsonb_agg(jsonb_build_object('job', c.jobname, 'schedule', c.schedule, 'active', c.active,
                                                         'mentions_cleanup_or_delete', c.command ~* '(cleanup|delete)')), '[]'::jsonb)
           FROM cron.job c)
) AS retention_diagnosis;
