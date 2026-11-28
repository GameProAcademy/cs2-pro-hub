-- VGL 5.1 — Frente 2: the player's choice to import new FACEIT matches automatically.
--
-- auto_sync        NULL  = not chosen yet (existing connections keep today's effective behaviour:
--                          no periodic sync; the app asks the player to choose),
--                  true  = the scheduler queues an incremental sync periodically,
--                  false = never queued automatically (manual "sync now" and demo uploads keep
--                          working; already imported matches are kept).
-- auto_sync_set_at when the player last changed it (audit, no PII).
--
-- Only the server writes it (service role, after checking the caller owns the connection):
-- player_connections has no UPDATE policy for clients and none is added. RLS is unchanged.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS public.player_connections_faceit_auto_sync_due;
--   ALTER TABLE public.player_connections DROP COLUMN IF EXISTS auto_sync_set_at,
--                                         DROP COLUMN IF EXISTS auto_sync;

ALTER TABLE public.player_connections
  ADD COLUMN IF NOT EXISTS auto_sync boolean,
  ADD COLUMN IF NOT EXISTS auto_sync_set_at timestamptz;

-- The scheduler's lookup: connected FACEIT links that opted in, oldest sync first.
CREATE INDEX IF NOT EXISTS player_connections_faceit_auto_sync_due
  ON public.player_connections (last_sync_at NULLS FIRST)
  WHERE source = 'faceit' AND status = 'connected' AND auto_sync IS TRUE;

COMMENT ON COLUMN public.player_connections.auto_sync IS
  'VGL 5.1: player choice for automatic FACEIT import. NULL = not chosen (no periodic sync).';
COMMENT ON COLUMN public.player_connections.auto_sync_set_at IS
  'VGL 5.1: when the player last changed auto_sync.';
