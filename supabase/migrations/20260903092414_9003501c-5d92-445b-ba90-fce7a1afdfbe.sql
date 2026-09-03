-- Phase 2.1.2 — Integration Readiness.
-- No external integration is enabled here. This migration only prepares the
-- schema so FACEIT / Gamers Club / Steam / public profiles can later converge
-- into the SAME canonical pipeline.
--
-- ARCHITECTURAL RULE (enforced by convention + RLS): no future external
-- integration writes directly into analytical tables (match_metrics,
-- match_features, analyses, player_dna_snapshots). Every source must go through
-- COLLECTOR -> ADAPTER -> CANONICAL NORMALIZER -> PIPELINE.

-- 1. Stable data-source identifiers (never renamed, never aliased).
DO $$ BEGIN
  CREATE TYPE public.data_source AS ENUM ('demo', 'faceit', 'gamers_club', 'steam', 'public_profile');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.connection_type AS ENUM ('oauth', 'public_profile', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.connection_status AS ENUM ('pending', 'connected', 'disconnected', 'expired', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. player_connections: "the player authorised us to access this account".
-- Distinct from player_identities, which only means "this identity belongs to
-- this player". NO TOKENS ARE STORED HERE. If OAuth tokens are ever needed they
-- must live in a server-only secret store, never in a Data-API readable table,
-- never returned to loaders/clients, never logged.
CREATE TABLE IF NOT EXISTS public.player_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  source public.data_source NOT NULL,
  connection_type public.connection_type NOT NULL,
  status public.connection_status NOT NULL DEFAULT 'pending',
  external_id text,
  external_username text,
  profile_url text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_connections_source_supported CHECK (source <> 'demo'),
  CONSTRAINT player_connections_profile_url_https CHECK (profile_url IS NULL OR profile_url ~* '^https://'),
  CONSTRAINT player_connections_unique_source UNIQUE (player_id, source, connection_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_connections TO authenticated;
GRANT ALL ON public.player_connections TO service_role;

ALTER TABLE public.player_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connections_select_own_or_admin" ON public.player_connections;
CREATE POLICY "connections_select_own_or_admin" ON public.player_connections
  FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_admin_master(auth.uid()));

-- A player may declare an intent to connect (pending) and remove it. The server
-- (service_role) is the only writer that may move a connection to connected /
-- expired / error or set sync bookkeeping.
DROP POLICY IF EXISTS "connections_insert_own_pending" ON public.player_connections;
CREATE POLICY "connections_insert_own_pending" ON public.player_connections
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_player(player_id) AND status = 'pending');

DROP POLICY IF EXISTS "connections_delete_own" ON public.player_connections;
CREATE POLICY "connections_delete_own" ON public.player_connections
  FOR DELETE TO authenticated
  USING (public.owns_player(player_id));

-- Deliberately NO update policy for `authenticated`: players cannot flip status,
-- last_sync_* or metadata. Status transitions are server-side only.

CREATE INDEX IF NOT EXISTS player_connections_player_idx ON public.player_connections (player_id);
CREATE INDEX IF NOT EXISTS player_connections_status_idx ON public.player_connections (status);

DROP TRIGGER IF EXISTS player_connections_touch ON public.player_connections;
CREATE TRIGGER player_connections_touch BEFORE UPDATE ON public.player_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Defence in depth: even if a policy is widened by mistake, a player cannot
-- self-promote a connection to `connected` nor forge sync bookkeeping.
CREATE OR REPLACE FUNCTION public.guard_connection_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
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
END; $$;

REVOKE ALL ON FUNCTION public.guard_connection_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS player_connections_guard_status ON public.player_connections;
CREATE TRIGGER player_connections_guard_status
  BEFORE INSERT OR UPDATE ON public.player_connections
  FOR EACH ROW EXECUTE FUNCTION public.guard_connection_status();

-- 3. Data provenance on matches. `platform` stays as-is (display/legacy);
-- `data_source` is the stable machine identifier the pipeline reasons about.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS data_source public.data_source NOT NULL DEFAULT 'demo',
  ADD COLUMN IF NOT EXISTS source_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_version text;

-- Deduplication: the same external match may only be imported once PER SOURCE.
-- A FACEIT import and its corresponding demo remain two rows on purpose — the
-- demo is the richer source and neither is deleted automatically.
CREATE UNIQUE INDEX IF NOT EXISTS matches_source_external_uniq
  ON public.matches (player_id, data_source, external_match_id)
  WHERE external_match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS matches_data_source_idx ON public.matches (data_source);