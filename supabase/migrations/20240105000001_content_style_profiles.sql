-- ---------------------------------------------------------------------------
-- Content Style Profiles (Văn phong riêng)
--
-- Stores a broker's personal writing style extracted from sample content.
-- The style_rules column holds a JSONB snapshot of ContentStyleRules so the
-- AI generation step can inject it into the prompt without a JOIN.
-- ---------------------------------------------------------------------------

create table if not exists public.content_style_profiles (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,

  name        text        not null,
  description text,
  platform    text,

  -- Raw sample text the broker provided for analysis
  sample_text text,

  -- Structured analysis result (ContentStyleRules shape)
  style_rules jsonb,

  -- Only one default profile per user (enforced by partial unique index below)
  is_default  boolean     not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Primary lookup: all profiles for a user ordered by newest first
create index if not exists content_style_profiles_user_id_idx
  on public.content_style_profiles (user_id, created_at desc);

-- Fast lookup of the default profile per user (used at generation time)
create index if not exists content_style_profiles_default_idx
  on public.content_style_profiles (user_id)
  where is_default = true;

-- ---------------------------------------------------------------------------
-- Constraint: at most ONE default profile per user.
--
-- A partial unique index in PostgreSQL only indexes rows where the condition
-- is true, so rows with is_default = false are never considered for the
-- uniqueness check. This is the correct and idiomatic approach for
-- "at most one row with a flag per user".
-- ---------------------------------------------------------------------------
create unique index if not exists content_style_profiles_one_default_per_user
  on public.content_style_profiles (user_id)
  where is_default = true;

-- ---------------------------------------------------------------------------
-- updated_at trigger
--
-- Reuse the set_updated_at() function created in migration
-- 20240104000001_content_edit_timestamps.sql.
-- That function is defined with CREATE OR REPLACE so it is always present.
-- ---------------------------------------------------------------------------
drop trigger if exists content_style_profiles_set_updated_at
  on public.content_style_profiles;

create trigger content_style_profiles_set_updated_at
  before update on public.content_style_profiles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.content_style_profiles enable row level security;

-- SELECT: owner only
create policy "style_profiles_select_own"
  on public.content_style_profiles for select
  using (auth.uid() = user_id);

-- INSERT: user_id must match the requesting user
create policy "style_profiles_insert_own"
  on public.content_style_profiles for insert
  with check (auth.uid() = user_id);

-- UPDATE: owner only
create policy "style_profiles_update_own"
  on public.content_style_profiles for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: owner only
create policy "style_profiles_delete_own"
  on public.content_style_profiles for delete
  using (auth.uid() = user_id);
