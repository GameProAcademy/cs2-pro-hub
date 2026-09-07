-- Canonical read ownership: matches.player_id is LEGACY COMPATIBILITY;
-- match_participants.internal_player_id is CANONICAL PARTICIPATION.
-- public.owns_canonical_match() already accepts both worlds.

DROP POLICY IF EXISTS "matches_select_own" ON public.matches;
CREATE POLICY "matches_select_own"
  ON public.matches FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.owns_canonical_match(id));

DROP POLICY IF EXISTS "match_rounds_select_own" ON public.match_rounds;
CREATE POLICY "match_rounds_select_own"
  ON public.match_rounds FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.owns_canonical_match(match_id));

DROP POLICY IF EXISTS "round_events_select_own" ON public.round_events;
CREATE POLICY "round_events_select_own"
  ON public.round_events FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.owns_canonical_match(match_id));

-- Canonical data is written ONLY by server-side persistence (service_role).
-- These grants were wider than the policies; close them.
REVOKE INSERT, UPDATE, DELETE ON public.match_series FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.match_sources FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.match_participants FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.round_players FROM authenticated;

GRANT ALL ON public.match_series TO service_role;
GRANT ALL ON public.match_sources TO service_role;
GRANT ALL ON public.match_participants TO service_role;
GRANT ALL ON public.round_players TO service_role;
GRANT ALL ON public.match_rounds TO service_role;
GRANT ALL ON public.round_events TO service_role;
GRANT ALL ON public.matches TO service_role;