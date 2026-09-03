CREATE OR REPLACE FUNCTION public.claim_next_demo_job(_max_concurrent integer DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _id uuid;
  _busy integer;
BEGIN
  -- Transaction-level serialization of the whole claim decision. Without it the
  -- concurrency count below and the row lock are two separate observations and
  -- two concurrent callers could both conclude there is a free slot.
  PERFORM pg_advisory_xact_lock(hashtext('public.claim_next_demo_job'));

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
$function$;

REVOKE ALL ON FUNCTION public.claim_next_demo_job(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_demo_job(integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_next_demo_job(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_demo_job(integer) TO service_role;