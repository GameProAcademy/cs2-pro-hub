-- H.3-E gate semantics v2: append-only registry of owner-authorized executions at attempt >= 9.
--
-- `attempt_9_absent` (semantics v1) asked "has no job reached attempt 9?". It was a pre-DEM
-- question and became permanently FAIL the moment an authorized execution reached attempt 9,
-- so it can no longer separate an authorized execution from an unauthorized one. Semantics v2
-- (snapshot schema 4) asks "is every job at attempt >= 9 covered by an owner authorization
-- recorded here, for exactly that job, upload, attempt and DEM?". The v1 measure stays in the
-- snapshot and in every report; nothing is deleted or rewritten.
--
-- A row binds one demo_jobs row by identity. The insert trigger refuses a row that does not
-- match the job it names (upload, attempt number, DEM sha256), so the registry cannot excuse a
-- different execution. Rows are immutable: UPDATE, DELETE and TRUNCATE are refused; there is no
-- revocation path here (it would need its own reviewed mechanism). The referenced job cannot be
-- deleted while authorized (ON DELETE RESTRICT).
--
-- This migration records no authorization. Recording one is an explicit owner step
-- (docs/H3E_GATE_SEMANTICS_V2.md). Clients can neither read nor write the registry.

CREATE TABLE IF NOT EXISTS public.h3e_attempt_authorizations (
  job_id uuid PRIMARY KEY REFERENCES public.demo_jobs(id) ON DELETE RESTRICT,
  upload_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number >= 9),
  demo_sha256 text NOT NULL CHECK (demo_sha256 ~ '^[0-9a-f]{64}$'),
  decision_ref text NOT NULL CHECK (length(btrim(decision_ref)) BETWEEN 1 AND 300),
  authorized_by text NOT NULL CHECK (length(btrim(authorized_by)) BETWEEN 1 AND 200),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.h3e_attempt_authorizations IS
  'H.3-E append-only registry of owner-authorized executions at attempt >= 9 (gate semantics v2). Rows bind one job by identity. No revocation path.';

ALTER TABLE public.h3e_attempt_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.h3e_attempt_authorizations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.h3e_attempt_authorizations FROM PUBLIC, anon, authenticated;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.h3e_attempt_authorizations FROM sandbox_exec';
  END IF;
END;
$grants$;
REVOKE ALL ON TABLE public.h3e_attempt_authorizations FROM service_role;
GRANT SELECT, INSERT ON TABLE public.h3e_attempt_authorizations TO service_role;
-- Service role bypasses RLS; no policy exists for any client role, so clients see nothing.

CREATE OR REPLACE FUNCTION public.refuse_h3e_attempt_authorization_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_IMMUTABLE' USING ERRCODE = '55000';
END;
$fn$;
REVOKE ALL ON FUNCTION public.refuse_h3e_attempt_authorization_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_h3e_attempt_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  _job public.demo_jobs%ROWTYPE;
BEGIN
  SELECT * INTO _job FROM public.demo_jobs j WHERE j.id = NEW.job_id FOR SHARE;
  IF NOT FOUND
     OR _job.upload_id IS DISTINCT FROM NEW.upload_id
     OR _job.attempt_number IS DISTINCT FROM NEW.attempt_number
     OR _job.demo_sha256 IS DISTINCT FROM NEW.demo_sha256 THEN
    RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_IDENTITY_MISMATCH' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.check_h3e_attempt_authorization() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS h3e_attempt_authorization_identity ON public.h3e_attempt_authorizations;
CREATE TRIGGER h3e_attempt_authorization_identity
BEFORE INSERT ON public.h3e_attempt_authorizations
FOR EACH ROW EXECUTE FUNCTION public.check_h3e_attempt_authorization();

DROP TRIGGER IF EXISTS h3e_attempt_authorization_immutable ON public.h3e_attempt_authorizations;
CREATE TRIGGER h3e_attempt_authorization_immutable
BEFORE UPDATE OR DELETE ON public.h3e_attempt_authorizations
FOR EACH ROW EXECUTE FUNCTION public.refuse_h3e_attempt_authorization_change();

DROP TRIGGER IF EXISTS h3e_attempt_authorization_no_truncate ON public.h3e_attempt_authorizations;
CREATE TRIGGER h3e_attempt_authorization_no_truncate
BEFORE TRUNCATE ON public.h3e_attempt_authorizations
FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_h3e_attempt_authorization_change();
