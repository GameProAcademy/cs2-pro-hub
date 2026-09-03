-- Default privileges in this project granted `anon` access to the new table.
-- Connections are never public: revoke every anon privilege explicitly.
REVOKE ALL ON public.player_connections FROM anon;