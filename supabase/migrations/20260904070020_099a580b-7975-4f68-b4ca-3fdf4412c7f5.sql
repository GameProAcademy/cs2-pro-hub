-- ============================================================
-- FASE 2.2.1 — FACEIT account linking (schema only, no tokens)
-- Idempotent. No destructive change. Demo pipeline untouched.
-- ============================================================

-- 1. Temporary OAuth state (server-only, never readable by clients)
CREATE TABLE IF NOT EXISTS public.oauth_connection_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.data_source NOT NULL,
  state_hash text NOT NULL,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_connection_states_state_hash_key
  ON public.oauth_connection_states (state_hash);
CREATE INDEX IF NOT EXISTS oauth_connection_states_expires_idx
  ON public.oauth_connection_states (expires_at);
CREATE INDEX IF NOT EXISTS oauth_connection_states_user_idx
  ON public.oauth_connection_states (user_id, provider);

ALTER TABLE public.oauth_connection_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oauth_connection_states FROM PUBLIC;
REVOKE ALL ON public.oauth_connection_states FROM anon;
REVOKE ALL ON public.oauth_connection_states FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_connection_states TO service_role;

-- 2. FACEIT sync jobs (separate from demo_jobs on purpose)
DO $$ BEGIN
  CREATE TYPE public.faceit_sync_job_type AS ENUM ('initial','incremental','manual','profile','match','stats');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.faceit_sync_job_status AS ENUM ('queued','processing','completed','failed','retrying');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.faceit_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.player_connections(id) ON DELETE CASCADE,
  type public.faceit_sync_job_type NOT NULL DEFAULT 'incremental',
  status public.faceit_sync_job_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  matches_found integer,
  matches_new integer,
  matches_updated integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faceit_sync_jobs_attempts_check CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS faceit_sync_jobs_one_active_per_connection
  ON public.faceit_sync_jobs (connection_id)
  WHERE status IN ('queued','processing','retrying');
CREATE INDEX IF NOT EXISTS faceit_sync_jobs_dispatch_idx
  ON public.faceit_sync_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS faceit_sync_jobs_player_idx
  ON public.faceit_sync_jobs (player_id, created_at DESC);

ALTER TABLE public.faceit_sync_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.faceit_sync_jobs FROM PUBLIC;
REVOKE ALL ON public.faceit_sync_jobs FROM anon;
REVOKE ALL ON public.faceit_sync_jobs FROM authenticated;
GRANT SELECT ON public.faceit_sync_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faceit_sync_jobs TO service_role;

DROP POLICY IF EXISTS faceit_sync_jobs_select_own ON public.faceit_sync_jobs;
CREATE POLICY faceit_sync_jobs_select_own
  ON public.faceit_sync_jobs FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));

-- 3. One FACEIT account may belong to exactly one CS2 PRO user
CREATE UNIQUE INDEX IF NOT EXISTS player_connections_faceit_external_uniq
  ON public.player_connections (source, external_id)
  WHERE source = 'faceit'::public.data_source AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS player_identities_faceit_external_uniq
  ON public.player_identities (platform, external_id)
  WHERE platform = 'FACEIT'::public.platform_kind AND external_id IS NOT NULL;

-- 4. FACEIT identities are server-resolved only.
CREATE OR REPLACE FUNCTION public.guard_faceit_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.platform = 'FACEIT'::public.platform_kind AND auth.uid() IS NOT NULL
       AND NOT public.is_admin_master(auth.uid()) THEN
      RAISE EXCEPTION 'FACEIT_IDENTITY_SERVER_ONLY';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.platform = 'FACEIT'::public.platform_kind AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'FACEIT_IDENTITY_SERVER_ONLY';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.platform = 'FACEIT'::public.platform_kind AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'FACEIT_IDENTITY_SERVER_ONLY';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_faceit_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_faceit_identity() FROM anon;
REVOKE ALL ON FUNCTION public.guard_faceit_identity() FROM authenticated;

DROP TRIGGER IF EXISTS player_identities_guard_faceit ON public.player_identities;
CREATE TRIGGER player_identities_guard_faceit
  BEFORE INSERT OR UPDATE OR DELETE ON public.player_identities
  FOR EACH ROW EXECUTE FUNCTION public.guard_faceit_identity();

-- 5. Expired OAuth state cleanup (server-only)
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _deleted integer;
BEGIN
  DELETE FROM public.oauth_connection_states
  WHERE expires_at < now() - interval '1 hour'
     OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '1 hour');
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_oauth_states() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_oauth_states() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_oauth_states() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_oauth_states() TO service_role;