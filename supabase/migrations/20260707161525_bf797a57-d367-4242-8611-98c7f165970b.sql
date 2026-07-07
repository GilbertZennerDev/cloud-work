
-- Align storage policies for the 'recordings' bucket. Uploads write files under
-- a top-level folder equal to the uploader's auth.uid(). Previously the
-- SELECT/UPDATE/DELETE policies treated that same folder segment as a group_id,
-- which was inconsistent with the INSERT policy. Rewrite them to interpret the
-- folder as a user_id (matching the upload convention), and grant access to
-- super admins, the file owner, or members of the same group as the owner.

DROP POLICY IF EXISTS "Group members read recording files" ON storage.objects;
DROP POLICY IF EXISTS "Group members update recording files" ON storage.objects;
DROP POLICY IF EXISTS "Group members delete recording files" ON storage.objects;

CREATE POLICY "Group members read recording files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'recordings'
  AND (
    app_private.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR (
      app_private.current_group_id(auth.uid()) IS NOT NULL
      AND app_private.current_group_id(auth.uid())
          = app_private.current_group_id(((storage.foldername(name))[1])::uuid)
    )
  )
);

CREATE POLICY "Group members update recording files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'recordings'
  AND (
    app_private.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR (
      app_private.current_group_id(auth.uid()) IS NOT NULL
      AND app_private.current_group_id(auth.uid())
          = app_private.current_group_id(((storage.foldername(name))[1])::uuid)
    )
  )
)
WITH CHECK (
  bucket_id = 'recordings'
  AND (
    app_private.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR (
      app_private.current_group_id(auth.uid()) IS NOT NULL
      AND app_private.current_group_id(auth.uid())
          = app_private.current_group_id(((storage.foldername(name))[1])::uuid)
    )
  )
);

CREATE POLICY "Group members delete recording files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'recordings'
  AND (
    app_private.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR (
      app_private.current_group_id(auth.uid()) IS NOT NULL
      AND app_private.current_group_id(auth.uid())
          = app_private.current_group_id(((storage.foldername(name))[1])::uuid)
    )
  )
);
