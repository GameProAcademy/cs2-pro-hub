-- Reconcile RAW evidence schema from disposable SQL reconstruction.
-- This migration brings the source in sync with the live database state.
-- Using IF NOT EXISTS and safety checks to allow safe application to environments where these already exist.

-- 1. Tables
CREATE TABLE IF NOT EXISTS public.raw_evidence_artifacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.demo_jobs(id) ON DELETE RESTRICT,
  upload_id uuid NOT NULL REFERENCES public.uploads(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  attempt_number integer NOT NULL CONSTRAINT raw_evidence_artifacts_attempt_check CHECK (attempt_number >= 1),
  demo_sha256 text NOT NULL,
  storage_bucket text NOT NULL,
  storage_prefix text NOT NULL,
  manifest_storage_path text NOT NULL,
  schema_version integer NOT NULL,
  status text NOT NULL DEFAULT 'creating'::text CONSTRAINT raw_evidence_artifacts_status_check CHECK (status IN ('creating','uploading','verifying','ready','failed')),
  raw_status text NOT NULL DEFAULT 'pending'::text CONSTRAINT raw_evidence_artifacts_raw_status_check CHECK (raw_status IN ('pending','writing','ready','failed')),
  audit_status text NOT NULL DEFAULT 'pending'::text CONSTRAINT raw_evidence_artifacts_audit_status_check CHECK (audit_status IN ('pending','running','approved','limited','blocked','failed')),
  root_digest text,
  total_bytes bigint NOT NULL DEFAULT 0 CONSTRAINT raw_evidence_artifacts_bytes_check CHECK (total_bytes >= 0),
  total_chunks integer NOT NULL DEFAULT 0 CONSTRAINT raw_evidence_artifacts_chunks_check CHECK (total_chunks >= 0),
  total_rows bigint NOT NULL DEFAULT 0 CONSTRAINT raw_evidence_artifacts_rows_check CHECK (total_rows >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  failed_at timestamptz,
  error_code text,
  error_message text
);

CREATE TABLE IF NOT EXISTS public.raw_evidence_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artifact_id uuid NOT NULL REFERENCES public.raw_evidence_artifacts(id) ON DELETE RESTRICT,
  section text NOT NULL CONSTRAINT raw_evidence_chunks_section_nonempty_check CHECK (length(btrim(section)) > 0),
  chunk_index integer NOT NULL CONSTRAINT raw_evidence_chunks_index_check CHECK (chunk_index >= 0),
  storage_path text NOT NULL CONSTRAINT raw_evidence_chunks_path_nonempty_check CHECK (length(btrim(storage_path)) > 0),
  first_row bigint,
  last_row bigint,
  row_count bigint NOT NULL DEFAULT 0 CONSTRAINT raw_evidence_chunks_rows_check CHECK (row_count >= 0),
  byte_size bigint NOT NULL DEFAULT 0 CONSTRAINT raw_evidence_chunks_bytes_check CHECK (byte_size >= 0),
  sha256 text NOT NULL,
  previous_chunk_sha256 text,
  status text NOT NULL DEFAULT 'pending'::text CONSTRAINT raw_evidence_chunks_status_check CHECK (status IN ('pending','uploading','stored','verified','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz,
  verified_at timestamptz,
  failed_at timestamptz,
  error_code text,
  error_message text,
  CONSTRAINT raw_evidence_chunks_range_check CHECK (first_row IS NULL OR last_row IS NULL OR last_row >= first_row)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS raw_evidence_artifacts_demo_attempt_idx ON public.raw_evidence_artifacts (demo_sha256, attempt_number DESC);
CREATE UNIQUE INDEX IF NOT EXISTS raw_evidence_artifacts_job_unique ON public.raw_evidence_artifacts (job_id);
CREATE INDEX IF NOT EXISTS raw_evidence_artifacts_status_idx ON public.raw_evidence_artifacts (status);
CREATE INDEX IF NOT EXISTS raw_evidence_artifacts_upload_idx ON public.raw_evidence_artifacts (upload_id);

CREATE INDEX IF NOT EXISTS raw_evidence_chunks_artifact_idx ON public.raw_evidence_chunks (artifact_id);
CREATE UNIQUE INDEX IF NOT EXISTS raw_evidence_chunks_artifact_section_index_unique ON public.raw_evidence_chunks (artifact_id, section, chunk_index);
CREATE INDEX IF NOT EXISTS raw_evidence_chunks_section_order_idx ON public.raw_evidence_chunks (artifact_id, section, chunk_index);
CREATE INDEX IF NOT EXISTS raw_evidence_chunks_status_idx ON public.raw_evidence_chunks (status);

-- 3. Security & Grants
ALTER TABLE public.raw_evidence_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_evidence_chunks ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.raw_evidence_artifacts TO authenticated, service_role;
GRANT ALL ON public.raw_evidence_chunks TO authenticated, service_role;

-- 4. Policies
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'raw_evidence_artifacts_select_own') THEN
    CREATE POLICY raw_evidence_artifacts_select_own ON public.raw_evidence_artifacts FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'raw_evidence_chunks_select_own') THEN
    CREATE POLICY raw_evidence_chunks_select_own ON public.raw_evidence_chunks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.raw_evidence_artifacts a WHERE a.id = raw_evidence_chunks.artifact_id AND a.user_id = auth.uid()));
  END IF;
END $$;
