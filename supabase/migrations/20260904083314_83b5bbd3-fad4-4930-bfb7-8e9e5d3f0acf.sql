-- FASE 2.2.1C (MEDIUM I): disconnect must never leave orphan state.
--
-- Deleting a player_connections row cascades into faceit_sync_jobs but leaves
-- public.player_identities behind, producing an inconsistent pair. Disconnection
-- is therefore a SERVER-SIDE STATE TRANSITION (status = 'disconnected'), which
-- keeps history, identity and reconnection semantics coherent.
--
-- A never-completed connection intent ('pending') stays deletable: it carries no
-- identity and no jobs.
DROP POLICY IF EXISTS "connections_delete_own" ON public.player_connections;

CREATE POLICY "connections_delete_own_pending" ON public.player_connections
  FOR DELETE TO authenticated
  USING (public.owns_player(player_id) AND status = 'pending');