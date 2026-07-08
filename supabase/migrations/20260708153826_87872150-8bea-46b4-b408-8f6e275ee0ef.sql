
DROP POLICY IF EXISTS "Group members read recording files" ON storage.objects;
DROP POLICY IF EXISTS "Group members update recording files" ON storage.objects;
DROP POLICY IF EXISTS "Group members delete recording files" ON storage.objects;

CREATE POLICY "Group members read recording files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'recordings' AND (
    app_private.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.recordings r
      WHERE r.storage_path = storage.objects.name
        AND r.group_id IS NOT NULL
        AND app_private.has_group_access(auth.uid(), r.group_id)
    )
  )
);

CREATE POLICY "Group members update recording files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'recordings' AND (
    app_private.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.recordings r
      WHERE r.storage_path = storage.objects.name
        AND r.group_id IS NOT NULL
        AND app_private.has_group_access(auth.uid(), r.group_id)
    )
  )
)
WITH CHECK (
  bucket_id = 'recordings' AND (
    app_private.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.recordings r
      WHERE r.storage_path = storage.objects.name
        AND r.group_id IS NOT NULL
        AND app_private.has_group_access(auth.uid(), r.group_id)
    )
  )
);

CREATE POLICY "Group members delete recording files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'recordings' AND (
    app_private.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.recordings r
      WHERE r.storage_path = storage.objects.name
        AND r.group_id IS NOT NULL
        AND app_private.has_group_access(auth.uid(), r.group_id)
    )
  )
);
