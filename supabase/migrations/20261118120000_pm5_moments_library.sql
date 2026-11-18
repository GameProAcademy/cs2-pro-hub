-- PM5 / Fase 4.2.10 — personal moments library (module I).
--
-- A bookmark is a REFERENCE to the caller's own canonical match (match id + round + tick range,
-- optional canonical event id) with a title, a note and tags. Nothing canonical is copied: no
-- DEM, no event payload, no position. Collections group bookmarks in an order the player chooses.
--
-- Security:
--   * every row carries user_id; RLS lets a player see and change only their own rows;
--   * a bookmark may only point at a match the caller owns (public.owns_canonical_match, the same
--     predicate the replay and every PM2–PM4 read use), checked by RLS on insert and update;
--   * a collection item may only join the caller's own bookmark to the caller's own collection;
--   * private by default: there is no share column and no public read in this release.
-- Retention: deleting a bookmark or a collection never touches matches or events. If a match is
-- deleted, its bookmarks keep their text with match_id = NULL and read as UNAVAILABLE.
--
-- Rollback (nothing existing is altered):
--   DROP TABLE IF EXISTS public.moment_collection_items, public.moment_collections,
--     public.moment_bookmarks;

CREATE TABLE IF NOT EXISTS public.moment_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  map text CHECK (map IS NULL OR map ~ '^[a-z0-9_]{1,40}$'),
  round_number integer CHECK (round_number IS NULL OR round_number BETWEEN 1 AND 99),
  tick_start integer NOT NULL CHECK (tick_start >= 0),
  tick_end integer NOT NULL CHECK (tick_end >= tick_start AND tick_end - tick_start <= 64 * 180),
  event_ref uuid,
  kind text NOT NULL CHECK (kind IN (
    'KILL', 'DEATH', 'OPENING', 'TRADE', 'CLUTCH', 'MULTIKILL', 'UTILITY', 'PLANT', 'DEFUSE',
    'ROUND', 'TICK_RANGE'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  tags text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (cardinality(tags) <= 12 AND char_length(array_to_string(tags, ',')) <= 400),
  source text NOT NULL DEFAULT 'REPLAY' CHECK (source IN ('REPLAY', 'ROUNDS', 'DEATHS', 'DUELS', 'UTILITY', 'MAPS', 'TRAINING')),
  schema_version smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moment_bookmarks_user_created_idx
  ON public.moment_bookmarks (user_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS moment_bookmarks_user_match_idx ON public.moment_bookmarks (user_id, match_id);
CREATE INDEX IF NOT EXISTS moment_bookmarks_tags_idx ON public.moment_bookmarks USING gin (tags);

CREATE TABLE IF NOT EXISTS public.moment_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moment_collections_user_idx ON public.moment_collections (user_id, archived, created_at);

CREATE TABLE IF NOT EXISTS public.moment_collection_items (
  collection_id uuid NOT NULL REFERENCES public.moment_collections(id) ON DELETE CASCADE,
  bookmark_id uuid NOT NULL REFERENCES public.moment_bookmarks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 10000),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, bookmark_id)
);
CREATE INDEX IF NOT EXISTS moment_collection_items_order_idx
  ON public.moment_collection_items (collection_id, position);
CREATE INDEX IF NOT EXISTS moment_collection_items_bookmark_idx
  ON public.moment_collection_items (bookmark_id);

ALTER TABLE public.moment_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_collection_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moment_bookmarks, public.moment_collections, public.moment_collection_items
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.moment_bookmarks, public.moment_collections, public.moment_collection_items TO authenticated;
GRANT ALL ON public.moment_bookmarks, public.moment_collections, public.moment_collection_items TO service_role;

DROP POLICY IF EXISTS moment_bookmarks_select_own ON public.moment_bookmarks;
CREATE POLICY moment_bookmarks_select_own ON public.moment_bookmarks FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS moment_bookmarks_insert_own ON public.moment_bookmarks;
CREATE POLICY moment_bookmarks_insert_own ON public.moment_bookmarks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND match_id IS NOT NULL AND public.owns_canonical_match(match_id));
DROP POLICY IF EXISTS moment_bookmarks_update_own ON public.moment_bookmarks;
CREATE POLICY moment_bookmarks_update_own ON public.moment_bookmarks FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND (match_id IS NULL OR public.owns_canonical_match(match_id)));
DROP POLICY IF EXISTS moment_bookmarks_delete_own ON public.moment_bookmarks;
CREATE POLICY moment_bookmarks_delete_own ON public.moment_bookmarks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS moment_collections_own ON public.moment_collections;
CREATE POLICY moment_collections_own ON public.moment_collections FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS moment_collection_items_select_own ON public.moment_collection_items;
CREATE POLICY moment_collection_items_select_own ON public.moment_collection_items FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS moment_collection_items_write_own ON public.moment_collection_items;
CREATE POLICY moment_collection_items_write_own ON public.moment_collection_items FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.moment_collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.moment_bookmarks b WHERE b.id = bookmark_id AND b.user_id = auth.uid())
  );
DROP POLICY IF EXISTS moment_collection_items_update_own ON public.moment_collection_items;
CREATE POLICY moment_collection_items_update_own ON public.moment_collection_items FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.moment_collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.moment_bookmarks b WHERE b.id = bookmark_id AND b.user_id = auth.uid())
  );
DROP POLICY IF EXISTS moment_collection_items_delete_own ON public.moment_collection_items;
CREATE POLICY moment_collection_items_delete_own ON public.moment_collection_items FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.moment_bookmarks IS
  'PM5 module I: private bookmark of a moment of the owner''s own match (reference only; no canonical data copied).';
COMMENT ON TABLE public.moment_collections IS 'PM5 module I: the owner''s collection/playlist of bookmarks.';
COMMENT ON TABLE public.moment_collection_items IS 'PM5 module I: ordered bookmark membership in a collection.';
