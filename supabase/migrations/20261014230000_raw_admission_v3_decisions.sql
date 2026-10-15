-- RAW admission contract v3 (cs2.raw-admission.v3): append-only decision registry and the
-- per-job provenance the product reads.
--
-- The v2 forensic contract and every v1/v2 audit result stay exactly as recorded: this
-- migration rewrites nothing. A v3 decision is a NEW fact about one job attempt and one
-- RAW artifact, stored with the v2 producer reasons it was made against, its verdict
-- (PASS | LIMITED | BLOCKED), its registered limitations, the metrics those limitations
-- exclude, the full decision document and its digest (computed by the app over the
-- document; src/lib/pipeline/admissionV3.ts).
--
-- Rows are immutable (UPDATE, DELETE and TRUNCATE refused) and bound by identity: the
-- insert trigger refuses a decision whose job, upload, attempt, DEM sha256 or artifact
-- does not match the rows it names. Clients can neither read nor write the registry; the
-- owner reads the verdict and limitations through their own demo_jobs row (RLS
-- demo_jobs_select_own), never the decision document.

CREATE TABLE IF NOT EXISTS public.raw_admission_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.demo_jobs(id) ON DELETE RESTRICT,
  upload_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  artifact_id uuid NOT NULL REFERENCES public.raw_evidence_artifacts(id) ON DELETE RESTRICT,
  demo_sha256 text NOT NULL CHECK (demo_sha256 ~ '^[0-9a-f]{64}$'),
  contract text NOT NULL CHECK (contract = 'cs2.raw-admission.v3'),
  ruleset_version integer NOT NULL CHECK (ruleset_version >= 1),
  verdict text NOT NULL CHECK (verdict IN ('PASS', 'LIMITED', 'BLOCKED')),
  limitations text[] NOT NULL DEFAULT '{}'::text[],
  excluded_metrics text[] NOT NULL DEFAULT '{}'::text[],
  blocked_reasons text[] NOT NULL DEFAULT '{}'::text[],
  v2_producer_reasons text[] NOT NULL,
  v2_contract_digest text CHECK (v2_contract_digest IS NULL OR v2_contract_digest ~ '^[0-9a-f]{64}$'),
  artifact_root_digest text NOT NULL CHECK (artifact_root_digest ~ '^[0-9a-f]{64}$'),
  decision jsonb NOT NULL CHECK (jsonb_typeof(decision) = 'object'),
  decision_digest text NOT NULL CHECK (decision_digest ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_admission_decisions_job_digest_key UNIQUE (job_id, decision_digest),
  CONSTRAINT raw_admission_decisions_verdict_shape CHECK (
    (verdict = 'BLOCKED' AND cardinality(blocked_reasons) > 0)
    OR (verdict = 'LIMITED' AND cardinality(blocked_reasons) = 0 AND cardinality(limitations) > 0)
    OR (verdict = 'PASS' AND cardinality(blocked_reasons) = 0 AND cardinality(limitations) = 0)
  ),
  CONSTRAINT raw_admission_decisions_document_binding CHECK (
    decision->>'contract' = contract
    AND (decision->>'ruleset_version')::integer = ruleset_version
    AND decision->>'verdict' = verdict
    AND decision->>'job_id' = job_id::text
    AND decision->>'artifact_id' = artifact_id::text
    AND decision->>'demo_sha256' = demo_sha256
    AND decision->>'decision_digest' = decision_digest
    AND decision->'physical'->>'artifact_root_digest' = artifact_root_digest
  )
);

CREATE INDEX IF NOT EXISTS raw_admission_decisions_job_idx
  ON public.raw_admission_decisions (job_id, recorded_at DESC);

COMMENT ON TABLE public.raw_admission_decisions IS
  'RAW admission contract v3 decisions. Append-only, identity-bound, service-role only. v2 results are never rewritten.';

ALTER TABLE public.raw_admission_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_admission_decisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.raw_admission_decisions FROM PUBLIC, anon, authenticated;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.raw_admission_decisions FROM sandbox_exec';
  END IF;
END;
$grants$;
REVOKE ALL ON TABLE public.raw_admission_decisions FROM service_role;
GRANT SELECT ON TABLE public.raw_admission_decisions TO service_role;
-- Inserts go only through record_raw_admission_decision_v3 (below).

CREATE OR REPLACE FUNCTION public.refuse_raw_admission_decision_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION 'RAW_ADMISSION_DECISION_IMMUTABLE' USING ERRCODE = '55000';
END;
$fn$;
REVOKE ALL ON FUNCTION public.refuse_raw_admission_decision_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_raw_admission_decision_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _artifact public.raw_evidence_artifacts%ROWTYPE;
BEGIN
  SELECT * INTO _job FROM public.demo_jobs j WHERE j.id = NEW.job_id FOR SHARE;
  SELECT * INTO _artifact FROM public.raw_evidence_artifacts a WHERE a.id = NEW.artifact_id FOR SHARE;
  IF _job.id IS NULL
     OR _artifact.id IS NULL
     OR _job.upload_id IS DISTINCT FROM NEW.upload_id
     OR _job.attempt_number IS DISTINCT FROM NEW.attempt_number
     OR _job.demo_sha256 IS DISTINCT FROM NEW.demo_sha256
     OR _artifact.job_id IS DISTINCT FROM NEW.job_id
     OR _artifact.upload_id IS DISTINCT FROM NEW.upload_id
     OR _artifact.attempt_number IS DISTINCT FROM NEW.attempt_number
     OR _artifact.demo_sha256 IS DISTINCT FROM NEW.demo_sha256
     OR _artifact.root_digest IS DISTINCT FROM NEW.artifact_root_digest
     OR _artifact.status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'RAW_ADMISSION_DECISION_IDENTITY_MISMATCH' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.check_raw_admission_decision_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS raw_admission_decision_identity ON public.raw_admission_decisions;
CREATE TRIGGER raw_admission_decision_identity
BEFORE INSERT ON public.raw_admission_decisions
FOR EACH ROW EXECUTE FUNCTION public.check_raw_admission_decision_identity();

DROP TRIGGER IF EXISTS raw_admission_decision_immutable ON public.raw_admission_decisions;
CREATE TRIGGER raw_admission_decision_immutable
BEFORE UPDATE OR DELETE ON public.raw_admission_decisions
FOR EACH ROW EXECUTE FUNCTION public.refuse_raw_admission_decision_change();

DROP TRIGGER IF EXISTS raw_admission_decision_no_truncate ON public.raw_admission_decisions;
CREATE TRIGGER raw_admission_decision_no_truncate
BEFORE TRUNCATE ON public.raw_admission_decisions
FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_raw_admission_decision_change();

-- Per-job provenance the owner can read (demo_jobs is readable by its owner under RLS).
ALTER TABLE public.demo_jobs
  ADD COLUMN IF NOT EXISTS admission_contract text,
  ADD COLUMN IF NOT EXISTS admission_verdict text,
  ADD COLUMN IF NOT EXISTS admission_limitations text[],
  ADD COLUMN IF NOT EXISTS admission_excluded_metrics text[],
  ADD COLUMN IF NOT EXISTS admission_decision_id uuid
    REFERENCES public.raw_admission_decisions(id) ON DELETE RESTRICT;

ALTER TABLE public.demo_jobs DROP CONSTRAINT IF EXISTS demo_jobs_admission_shape;
ALTER TABLE public.demo_jobs ADD CONSTRAINT demo_jobs_admission_shape CHECK (
  (admission_decision_id IS NULL AND admission_contract IS NULL AND admission_verdict IS NULL
     AND admission_limitations IS NULL AND admission_excluded_metrics IS NULL)
  OR (admission_decision_id IS NOT NULL AND admission_contract = 'cs2.raw-admission.v3'
     AND admission_verdict IN ('PASS', 'LIMITED', 'BLOCKED')
     AND admission_limitations IS NOT NULL AND admission_excluded_metrics IS NOT NULL)
);

-- Once a job carries a decision, it is never cleared or swapped for another one.
CREATE OR REPLACE FUNCTION public.guard_demo_job_admission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF OLD.admission_decision_id IS NOT NULL AND (
       NEW.admission_decision_id IS DISTINCT FROM OLD.admission_decision_id
    OR NEW.admission_contract IS DISTINCT FROM OLD.admission_contract
    OR NEW.admission_verdict IS DISTINCT FROM OLD.admission_verdict
    OR NEW.admission_limitations IS DISTINCT FROM OLD.admission_limitations
    OR NEW.admission_excluded_metrics IS DISTINCT FROM OLD.admission_excluded_metrics) THEN
    RAISE EXCEPTION 'DEMO_JOB_ADMISSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.guard_demo_job_admission() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS demo_jobs_admission_guard ON public.demo_jobs;
CREATE TRIGGER demo_jobs_admission_guard
BEFORE UPDATE OF admission_decision_id, admission_contract, admission_verdict,
  admission_limitations, admission_excluded_metrics ON public.demo_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_demo_job_admission();

-- Records one v3 decision for a job that is being processed, and its provenance on the
-- job, in one transaction. Idempotent for the same (job, decision digest): a retried
-- finalisation returns the existing row. A job that already carries a different
-- decision is refused.
CREATE OR REPLACE FUNCTION public.record_raw_admission_decision_v3(
  _job_id uuid,
  _artifact_id uuid,
  _decision jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _id uuid;
BEGIN
  IF jsonb_typeof(_decision) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'RAW_ADMISSION_DECISION_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _job FROM public.demo_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR _job.status IS DISTINCT FROM 'processing' THEN
    RAISE EXCEPTION 'RAW_ADMISSION_JOB_NOT_PROCESSING' USING ERRCODE = '55000';
  END IF;

  SELECT d.id INTO _id FROM public.raw_admission_decisions d
   WHERE d.job_id = _job_id AND d.decision_digest = _decision->>'decision_digest';
  IF _id IS NULL THEN
    INSERT INTO public.raw_admission_decisions (
      job_id, upload_id, attempt_number, artifact_id, demo_sha256, contract, ruleset_version,
      verdict, limitations, excluded_metrics, blocked_reasons, v2_producer_reasons,
      v2_contract_digest, artifact_root_digest, decision, decision_digest)
    VALUES (
      _job_id, _job.upload_id, _job.attempt_number, _artifact_id, _job.demo_sha256,
      _decision->>'contract', (_decision->>'ruleset_version')::integer, _decision->>'verdict',
      ARRAY(SELECT jsonb_array_elements_text(_decision->'limitations')),
      ARRAY(SELECT jsonb_array_elements_text(_decision->'excluded_metrics')),
      ARRAY(SELECT jsonb_array_elements_text(_decision->'blocked_reasons')),
      ARRAY(SELECT jsonb_array_elements_text(_decision->'v2'->'producer_reasons')),
      _decision->'v2'->>'contract_digest', _decision->'physical'->>'artifact_root_digest',
      _decision, _decision->>'decision_digest')
    RETURNING id INTO _id;
  END IF;

  IF _job.admission_decision_id IS NOT NULL AND _job.admission_decision_id IS DISTINCT FROM _id THEN
    RAISE EXCEPTION 'DEMO_JOB_ADMISSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF _job.admission_decision_id IS NULL THEN
    UPDATE public.demo_jobs SET
      admission_decision_id = _id,
      admission_contract = _decision->>'contract',
      admission_verdict = _decision->>'verdict',
      admission_limitations = ARRAY(SELECT jsonb_array_elements_text(_decision->'limitations')),
      admission_excluded_metrics = ARRAY(SELECT jsonb_array_elements_text(_decision->'excluded_metrics'))
    WHERE id = _job_id;
  END IF;
  RETURN _id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.record_raw_admission_decision_v3(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_raw_admission_decision_v3(uuid, uuid, jsonb) TO service_role;
