-- Avatars: enforce allowed content types at policy level.
-- (Bucket-level allowed_mime_types is not configurable through the platform tooling,
--  so the restriction is enforced on storage.objects instead.)
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND name = auth.uid()::text || '/avatar.webp'
    AND COALESCE(metadata->>'mimetype', 'image/webp') IN ('image/jpeg','image/png','image/webp')
  );

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND name = auth.uid()::text || '/avatar.webp')
  WITH CHECK (
    bucket_id = 'avatars'
    AND name = auth.uid()::text || '/avatar.webp'
    AND COALESCE(metadata->>'mimetype', 'image/webp') IN ('image/jpeg','image/png','image/webp')
  );

-- Demos: own folder + .dem extension only.
DROP POLICY IF EXISTS "demos_insert_own" ON storage.objects;
CREATE POLICY "demos_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'demos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name LIKE '%.dem'
  );
