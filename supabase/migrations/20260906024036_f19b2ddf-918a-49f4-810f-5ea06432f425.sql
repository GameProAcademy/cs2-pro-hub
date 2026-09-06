REVOKE ALL ON FUNCTION public.persist_canonical_observation(jsonb, uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.owns_canonical_match(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.owns_canonical_series(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.canonical_source_priority(public.data_source) FROM anon;
REVOKE ALL ON TABLE public.match_series FROM anon;
REVOKE ALL ON TABLE public.match_sources FROM anon;
REVOKE ALL ON TABLE public.match_participants FROM anon;
REVOKE ALL ON TABLE public.round_players FROM anon;
