-- ---------------------------------------------------------------------------
-- property_images table
--
-- Stores metadata for images uploaded to the private property-images bucket.
-- Storage objects are at: users/{userId}/properties/{propertyId}/{imageId}.{ext}
-- Never store public URLs — always generate signed URLs at read time.
-- ---------------------------------------------------------------------------

create table if not exists public.property_images (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  property_id      uuid        not null references public.properties(id) on delete cascade,
  storage_path     text        not null,
  file_name        text,
  mime_type        text,
  size_bytes       integer,
  width            integer,
  height           integer,
  alt_text         text,
  caption          text,
  sort_order       integer     not null default 0,
  is_cover         boolean     not null default false,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Primary list query: all images for a property ordered by cover first, then
-- sort_order, then insertion order.
create index if not exists property_images_property_order_idx
  on public.property_images (property_id, sort_order, created_at);

-- Per-user lookup (admin queries, usage audits)
create index if not exists property_images_user_id_idx
  on public.property_images (user_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.property_images enable row level security;

-- SELECT: only the image owner
create policy "property_images_select_own"
  on public.property_images for select
  using (auth.uid() = user_id);

-- INSERT: user_id must match the requesting user (enforced by check)
create policy "property_images_insert_own"
  on public.property_images for insert
  with check (auth.uid() = user_id);

-- UPDATE: only the image owner
create policy "property_images_update_own"
  on public.property_images for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: only the image owner
create policy "property_images_delete_own"
  on public.property_images for delete
  using (auth.uid() = user_id);
