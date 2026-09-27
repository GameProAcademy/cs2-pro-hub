-- Native scheduler foundation for the CS2 demo pipeline.
--
-- Lovable Cloud's production scheduler is backed by pg_cron. The scheduler
-- credential is generated inside the private database schema and is never
-- committed to Git or embedded in a queue message.
--
-- IMPORTANT: the actual cron job is intentionally NOT created here.
-- This migration must be safe and side-effect free on a clean disposable
-- Supabase stack used by CI. Creating a job here would target the production
-- gamepro.network endpoint from a test database. Production scheduler
-- activation is an explicit deployment operation, not schema installation.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.pipeline_scheduler_secret (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.pipeline_scheduler_secret FROM PUBLIC, anon, authenticated;

INSERT INTO private.pipeline_scheduler_secret (token)
SELECT encode(gen_random_bytes(32), 'base64')
WHERE NOT EXISTS (
  SELECT 1 FROM private.pipeline_scheduler_secret WHERE id = true
);

CREATE OR REPLACE FUNCTION public.verify_pipeline_cron_secret(candidate text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT candidate IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM private.pipeline_scheduler_secret
      WHERE id = true
        AND token = candidate
    );
$$;

REVOKE ALL ON FUNCTION public.verify_pipeline_cron_secret(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pipeline_cron_secret(text)
  TO service_role;

-- Production activation must create the cron job explicitly after verifying
-- the target environment, endpoint and secret. Never schedule production HTTP
-- traffic as a side effect of `supabase db reset` or CI migration replay.