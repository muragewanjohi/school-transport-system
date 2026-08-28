-- Storage INSERT ... RETURNING * requires a SELECT policy on storage.objects.
-- Without it, parent/driver avatar uploads fail with RLS even when INSERT is allowed.
DROP POLICY IF EXISTS "Avatar owner select" ON storage.objects;
CREATE POLICY "Avatar owner select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
