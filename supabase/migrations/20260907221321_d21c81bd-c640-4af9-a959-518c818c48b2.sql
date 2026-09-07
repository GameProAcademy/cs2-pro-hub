CREATE INDEX IF NOT EXISTS gamers_club_profile_snapshots_connection_id_idx ON public.gamers_club_profile_snapshots (connection_id);
CREATE INDEX IF NOT EXISTS gamers_club_sync_jobs_connection_id_idx ON public.gamers_club_sync_jobs (connection_id);
CREATE INDEX IF NOT EXISTS steam_link_attempts_player_id_idx ON public.steam_link_attempts (player_id);
CREATE INDEX IF NOT EXISTS match_sources_series_id_idx ON public.match_sources (series_id);
CREATE INDEX IF NOT EXISTS match_sources_upload_id_idx ON public.match_sources (upload_id);
CREATE INDEX IF NOT EXISTS round_players_round_id_idx ON public.round_players (round_id);
CREATE INDEX IF NOT EXISTS round_players_internal_player_id_idx ON public.round_players (internal_player_id);