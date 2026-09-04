-- 1. Match deduplication: per (player, data_source, external_match_id), not per platform.
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_player_id_platform_external_match_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS matches_source_external_uniq
  ON public.matches (player_id, data_source, external_match_id)
  WHERE external_match_id IS NOT NULL;

-- 2. GRANT hardening. RLS stays enabled everywhere; this is defence in depth.
--    Pipeline-generated data: readable by the owner (RLS), never writable by clients.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['demo_jobs','match_features','match_rounds','round_events'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;

  -- Public catalogue: read-only for everyone; only the service role maintains it.
  FOREACH t IN ARRAY ARRAY['skills','skill_translations','lessons','lesson_translations','lesson_skills'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Connections: player may declare (pending) / read / remove; never update state.
REVOKE ALL ON public.player_connections FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.player_connections TO authenticated;
GRANT ALL ON public.player_connections TO service_role;

-- 3. player_connections.metadata may never become a secret store.
CREATE OR REPLACE FUNCTION public.jsonb_has_sensitive_key(_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH keys AS (
    SELECT regexp_replace(lower(k), '[^a-z0-9]', '', 'g') AS k
    FROM jsonb_object_keys(CASE WHEN jsonb_typeof(_value) = 'object' THEN _value ELSE '{}'::jsonb END) AS k
  )
  SELECT EXISTS (
    SELECT 1 FROM keys
    WHERE k IN ('accesstoken','refreshtoken','idtoken','token','tokens','apikey','apisecret',
                'clientsecret','clientid','secret','secrets','authorization','auth','cookie',
                'cookies','session','sessionid','password','passwd','bearer','credential',
                'credentials','privatekey','publickey','signature','jwt','otp','pin')
       OR k LIKE '%token%' OR k LIKE '%secret%' OR k LIKE '%password%'
       OR k LIKE '%cookie%' OR k LIKE '%credential%' OR k LIKE '%apikey%'
       OR k LIKE '%privatekey%' OR k LIKE '%bearer%' OR k LIKE '%authorization%'
  );
$$;

REVOKE ALL ON FUNCTION public.jsonb_has_sensitive_key(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_connection_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid := auth.uid();
BEGIN
  -- Applies to every writer, including the service role: metadata is documented
  -- as NON-SENSITIVE metadata and must never hold credentials.
  IF NEW.metadata IS NOT NULL AND public.jsonb_has_sensitive_key(NEW.metadata) THEN
    RAISE EXCEPTION 'Connection metadata must not contain credentials or secrets'
      USING ERRCODE = '22023';
  END IF;

  IF actor IS NULL THEN
    RETURN NEW; -- service_role / server-side path
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.connected_at := NULL;
    NEW.last_sync_at := NULL;
    NEW.last_sync_status := NULL;
    NEW.last_sync_error := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.last_sync_at IS DISTINCT FROM OLD.last_sync_at
     OR NEW.last_sync_status IS DISTINCT FROM OLD.last_sync_status
     OR NEW.last_sync_error IS DISTINCT FROM OLD.last_sync_error THEN
    RAISE EXCEPTION 'Connection state is managed by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$;