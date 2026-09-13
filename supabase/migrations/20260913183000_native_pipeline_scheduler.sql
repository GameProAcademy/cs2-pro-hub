-- Native scheduler for the CS2 demo pipeline.
--
-- Lovable Cloud's Jobs surface is backed by pg_cron. The scheduler credential is
-- generated inside the private database schema and is never committed to Git
-- or embedded in the cron command itself.

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'cs2-demo-pipeline'
  ) THEN
    PERFORM cron.schedule(
      'cs2-demo-pipeline',
      '* * * * *',
      $job$
        SELECT net.http_post(
          url := 'https://gamepro.network/api/public/pipeline-cron',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization',
              'Bearer ' || (
                SELECT token
                FROM private.pipeline_scheduler_secret
                WHERE id = true
              )
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 60000
        ) AS request_id;
      $job$
    );
  END IF;
END
$$;
