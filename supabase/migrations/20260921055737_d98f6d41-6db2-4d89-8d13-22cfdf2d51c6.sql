-- FASE 2.7.2G.6 emergency compatibility quarantine for the pre-G.6 published cleanup.
UPDATE public.demo_jobs j
SET retain_until = GREATEST(j.retain_until, now() + interval '24 hours'),
    retention_policy_version = 'demo-retention-v1',
    cleanup_error = CASE
      WHEN j.storage_deleted_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'demos' AND o.name = j.storage_path
      ) THEN 'DELETION_METADATA_MISMATCH'
      ELSE j.cleanup_error
    END,
    updated_at = now()
WHERE j.status IN ('processed','failed','blocked_raw_audit','cancelled')
  AND j.storage_delete_verified_at IS NULL
  AND j.storage_path IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'demos' AND o.name = j.storage_path
  );

COMMENT ON COLUMN public.demo_jobs.cleanup_claim_expires_at IS 'Cleanup claim lease; historical objects were quarantined for 24h during G.6 rollout so the pre-G.6 published cleanup could not bypass verified deletion.';