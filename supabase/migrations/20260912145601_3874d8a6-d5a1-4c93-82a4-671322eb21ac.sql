CREATE TABLE public.raw_demo_evidence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.demo_jobs(id) ON DELETE CASCADE,
  upload_id uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  demo_sha256 text NOT NULL,
  evidence_version integer NOT NULL DEFAULT 1,
  parser_name text NOT NULL,
  parser_version text NOT NULL,
  parser_revision text,
  contract_version integer NOT NULL,
  manifest jsonb NOT NULL,
  event_coverage jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  player_coverage jsonb NOT NULL DEFAULT '[]'::jsonb,
  tick_coverage jsonb NOT NULL DEFAULT '[]'::jsonb,
  tick_samples jsonb NOT NULL DEFAULT '[]'::jsonb,
  grenade_coverage jsonb NOT NULL DEFAULT '[]'::jsonb,
  grenade_samples jsonb NOT NULL DEFAULT '[]'::jsonb,
  round_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  economy_coverage jsonb NOT NULL DEFAULT '[]'::jsonb,
  field_mappings jsonb NOT NULL DEFAULT '[]'::jsonb,
  gates jsonb NOT NULL DEFAULT '[]'::jsonb,
  deterministic_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_demo_evidence_reports_sha256_check CHECK (demo_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT raw_demo_evidence_reports_version_check CHECK (evidence_version > 0 AND contract_version > 0),
  CONSTRAINT raw_demo_evidence_reports_digest_check CHECK (deterministic_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT raw_demo_evidence_reports_job_unique UNIQUE (job_id),
  CONSTRAINT raw_demo_evidence_reports_upload_version_unique UNIQUE (upload_id, evidence_version, parser_revision)
);

GRANT SELECT ON public.raw_demo_evidence_reports TO authenticated;
GRANT ALL ON public.raw_demo_evidence_reports TO service_role;

ALTER TABLE public.raw_demo_evidence_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_demo_evidence_reports_select_own_or_staff"
ON public.raw_demo_evidence_reports
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE INDEX raw_demo_evidence_reports_user_created_idx
ON public.raw_demo_evidence_reports (user_id, created_at DESC);

CREATE INDEX raw_demo_evidence_reports_sha_idx
ON public.raw_demo_evidence_reports (demo_sha256);

CREATE OR REPLACE FUNCTION public.touch_raw_demo_evidence_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER raw_demo_evidence_reports_touch
BEFORE UPDATE ON public.raw_demo_evidence_reports
FOR EACH ROW
EXECUTE FUNCTION public.touch_raw_demo_evidence_report();