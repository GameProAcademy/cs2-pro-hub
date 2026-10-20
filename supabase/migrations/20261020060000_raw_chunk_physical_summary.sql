-- RAW physical audit: per-chunk decode recorded at verification (2026-10-20).
--
-- Production evidence (job 2dc1ddd1, attempt 11, artifact d216adf8, 167 chunks /
-- 4,586,562 rows): the completion request re-decoded every RAW row in one request
-- and the app runtime aborted it with "Worker exceeded CPU time limit" (502 to the
-- worker) after EXECUTION_FINISHED/PARSE_SUCCEEDED, so the job ended JOB_STALE.
--
-- The APP now decodes each non-forensic chunk when it verifies that object (one
-- request per chunk) and records the result here, bound to the chunk's sha256.
-- The completion audit still downloads and re-hashes every object; it merges the
-- summary recorded for exactly those bytes instead of decoding them again.
-- Additive and nullable: chunks verified before this column existed have no
-- summary and are decoded in full at completion, as before.
ALTER TABLE public.raw_evidence_chunks
  ADD COLUMN IF NOT EXISTS physical_summary jsonb;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'raw_evidence_chunks_physical_summary_object_check'
      AND conrelid = 'public.raw_evidence_chunks'::regclass
  ) THEN
    ALTER TABLE public.raw_evidence_chunks
      ADD CONSTRAINT raw_evidence_chunks_physical_summary_object_check
      CHECK (physical_summary IS NULL OR jsonb_typeof(physical_summary) = 'object');
  END IF;
END;
$constraint$;

COMMENT ON COLUMN public.raw_evidence_chunks.physical_summary IS
  'Per-chunk decode (rows, decompressed bytes, fields, semantic inventory) computed by the APP from the physical object at verification; bound to sha256. Never written by the worker.';
