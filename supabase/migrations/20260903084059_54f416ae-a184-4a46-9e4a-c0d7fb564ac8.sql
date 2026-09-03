CREATE OR REPLACE FUNCTION public.claim_next_demo_job(_max_concurrent integer DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _id uuid;
  _busy integer;
BEGIN
  SELECT count(*) INTO _busy FROM public.demo_jobs WHERE status = 'processing';
  IF _busy >= COALESCE(_max_concurrent, 1) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO _id
  FROM public.demo_jobs
  WHERE status = 'pending'
  ORDER BY queued_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF _id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.demo_jobs
     SET status = 'processing',
         stage = 'validating',
         started_at = now(),
         updated_at = now()
   WHERE id = _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_demo_job(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_demo_job(integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_next_demo_job(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_demo_job(integer) TO service_role;