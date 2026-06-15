-- ---------------------------------------------------------------------------
-- Property Images — Supabase Storage bucket + object policies
--
-- Run AFTER 20240103000001_property_images.sql.
--
-- Storage path convention:
--   users/{userId}/properties/{propertyId}/{imageId}.{ext}
--
-- split_part(name, '/', N) extracts path segments (1-indexed):
--   1 → 'users'
--   2 → userId
--   3 → 'properties'
--   4 → propertyId
--   5 → '{imageId}.{ext}'
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'property-images',
  'property-images',
  false,                                            -- private: no public URL
  2097152,                                          -- 2 MB per file
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Storage object policies
--
-- These sit on storage.objects (not the public.property_images table).
-- The auth check confirms the second path segment equals auth.uid() so a
-- user can only access objects they personally uploaded.
-- ---------------------------------------------------------------------------

-- SELECT (used by createSignedUrl / download)
create policy "property_images_objects_select"
  on storage.objects for select
  using (
    bucket_id = 'property-images'
    and auth.uid()::text = split_part(name, '/', 2)
  );

-- INSERT (upload)
create policy "property_images_objects_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'property-images'
    and auth.uid()::text = split_part(name, '/', 2)
  );

-- UPDATE (upsert / overwrite — not currently used but included for safety)
create policy "property_images_objects_update"
  on storage.objects for update
  using (
    bucket_id = 'property-images'
    and auth.uid()::text = split_part(name, '/', 2)
  )
  with check (
    bucket_id = 'property-images'
    and auth.uid()::text = split_part(name, '/', 2)
  );

-- DELETE (remove on image deletion)
create policy "property_images_objects_delete"
  on storage.objects for delete
  using (
    bucket_id = 'property-images'
    and auth.uid()::text = split_part(name, '/', 2)
  );
