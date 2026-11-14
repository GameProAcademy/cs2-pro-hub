-- PM6 D: allow the stored attachment method of an automatic attachment made from the user's
-- own confirmed nickname history (src/lib/pipeline/attachment.ts matchConfirmedNicknameHistory).
-- Additive: every value accepted before is still accepted. Re-running is a no-op.
BEGIN;
ALTER TABLE public.demo_jobs DROP CONSTRAINT IF EXISTS demo_jobs_attachment_method_check;
ALTER TABLE public.demo_jobs ADD CONSTRAINT demo_jobs_attachment_method_check CHECK (
  attachment_method IS NULL OR attachment_method = ANY (ARRAY[
    'steam_id_profile', 'steam_id_confirmed', 'self_declared_player', 'self_declared_nickname',
    'confirmed_nickname_history'
  ])
);
COMMIT;
