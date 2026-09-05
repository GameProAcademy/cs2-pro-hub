-- FASE 2.4.1B — least privilege on Gamers Club server-owned tables.
REVOKE ALL ON public.gamers_club_sync_jobs FROM anon;
REVOKE ALL ON public.gamers_club_profile_snapshots FROM anon;

REVOKE ALL ON public.gamers_club_sync_jobs FROM authenticated;
REVOKE ALL ON public.gamers_club_profile_snapshots FROM authenticated;

GRANT SELECT ON public.gamers_club_sync_jobs TO authenticated;
GRANT SELECT ON public.gamers_club_profile_snapshots TO authenticated;

GRANT ALL ON public.gamers_club_sync_jobs TO service_role;
GRANT ALL ON public.gamers_club_profile_snapshots TO service_role;