-- FASE 2.2.1 — non-sensitive public metadata for externally sourced matches.
-- Additive only: the demo pipeline never writes or reads this column.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS source_metadata jsonb;