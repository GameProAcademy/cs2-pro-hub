-- Native scheduler for the CS2 demo pipeline.
--
-- The Lovable Cloud Jobs screen is backed by pg_cron, so the job is created
-- directly in the production database. The scheduler credential is generated
-- inside Vault and is never stored in source control or in the cron command.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'pipeline_cron_secret'
  ) THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'pipeline_cron_secret',
      'Dedicated bearer secret for the CS2 demo pipeline native pg_cron scheduler.'
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.verify_pipeline_cron_secret(candidate text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT candidate IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM vault.decrypted_secrets
      WHERE name = 'pipeline_cron_secret'
        AND decrypted_secret = candidate
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
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'pipeline_cron_secret'
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
