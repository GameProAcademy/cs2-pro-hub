DROP POLICY IF EXISTS "demos_update_own" ON storage.objects;
CREATE POLICY "demos_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'demos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name LIKE '%.dem'
  )
  WITH CHECK (
    bucket_id = 'demos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name LIKE '%.dem'
  );