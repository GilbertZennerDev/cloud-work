-- Restrictive policies on storage.objects for the 'recordings' bucket.
-- Access is intended to be server-only via signed URLs (service role bypasses RLS).
-- These RESTRICTIVE policies deny all direct client access even if a future
-- permissive policy is added that would otherwise grant it.

DROP POLICY IF EXISTS "recordings_bucket_server_only_select" ON storage.objects;
DROP POLICY IF EXISTS "recordings_bucket_server_only_insert" ON storage.objects;
DROP POLICY IF EXISTS "recordings_bucket_server_only_update" ON storage.objects;
DROP POLICY IF EXISTS "recordings_bucket_server_only_delete" ON storage.objects;

CREATE POLICY "recordings_bucket_server_only_select"
ON storage.objects AS RESTRICTIVE FOR SELECT
TO anon, authenticated
USING (bucket_id <> 'recordings');

CREATE POLICY "recordings_bucket_server_only_insert"
ON storage.objects AS RESTRICTIVE FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id <> 'recordings');

CREATE POLICY "recordings_bucket_server_only_update"
ON storage.objects AS RESTRICTIVE FOR UPDATE
TO anon, authenticated
USING (bucket_id <> 'recordings')
WITH CHECK (bucket_id <> 'recordings');

CREATE POLICY "recordings_bucket_server_only_delete"
ON storage.objects AS RESTRICTIVE FOR DELETE
TO anon, authenticated
USING (bucket_id <> 'recordings');