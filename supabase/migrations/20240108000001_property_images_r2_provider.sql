-- ---------------------------------------------------------------------------
-- property_images → Cloudflare R2 provider support
--
-- Backward-compatible: existing rows keep storage_path and default to the
-- 'supabase' provider. New uploads use 'cloudflare_r2' and populate the
-- *_key columns. storage_path is intentionally NOT removed — legacy Supabase
-- Storage rows still rely on it, and R2 rows mirror original_key into it for
-- compatibility with code paths that still read storage_path.
-- ---------------------------------------------------------------------------

alter table public.property_images
  add column if not exists storage_provider    text    not null default 'supabase',
  add column if not exists original_key        text,
  add column if not exists thumbnail_key       text,
  add column if not exists preview_key         text,
  add column if not exists original_mime_type  text,
  add column if not exists original_size_bytes integer,
  add column if not exists thumbnail_size_bytes integer,
  add column if not exists width               integer,
  add column if not exists height              integer;

-- Constrain provider to the known set. Added NOT VALID-free since the column
-- has a safe default, so every existing row already satisfies it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'property_images_storage_provider_check'
  ) then
    alter table public.property_images
      add constraint property_images_storage_provider_check
      check (storage_provider in ('supabase', 'cloudflare_r2'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Provider-aware ownership lookups (used when batching signed URLs by provider)
create index if not exists property_images_user_property_provider_idx
  on public.property_images (user_id, property_id, storage_provider);

-- Cover/ordering lookups for galleries and thumbnails
create index if not exists property_images_property_cover_order_idx
  on public.property_images (property_id, is_cover, sort_order, created_at);
