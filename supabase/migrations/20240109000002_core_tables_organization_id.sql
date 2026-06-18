-- ---------------------------------------------------------------------------
-- Phase 2A — Organization scoping on core tables
--
-- Adds organization_id / created_by / assigned_to to the core user-owned
-- tables, backfills them from each row's owner → personal workspace, and adds
-- ORG-AWARE RLS alongside the existing user_id policies.
--
-- Safety choices:
--   • All new columns are NULLABLE. They are NOT tightened to NOT NULL in this
--     phase so that (a) the backfill can never fail mid-deploy and (b) older
--     app code still running during the rollout window can insert without
--     knowing about organization_id. A follow-up migration can tighten them
--     once the app is fully deployed (see docs/ARCHITECTURE.md).
--   • BEFORE INSERT triggers auto-tag organization_id (and created_by /
--     assigned_to) from user_id, so EVERY insert is correctly scoped even if
--     it comes from un-updated code. This removes the deploy-window race.
--   • New RLS policies are all PERMISSIVE, so they can only ADD access for
--     active org members — they can never restrict the existing solo flow.
--     A user_id fallback policy guarantees the owner always retains access
--     regardless of any pre-existing dashboard-created policies.
--   • property_images is scoped THROUGH its parent property (no duplicated
--     organization_id column) per the storage abstraction direction.
--   • usage_events keeps its user-scoped RLS unchanged; it only gains an
--     organization_id column (auto-tagged) for future org-level analytics.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Columns
-- ===========================================================================
alter table public.properties
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by      uuid references auth.users(id) on delete set null,
  add column if not exists assigned_to     uuid references auth.users(id) on delete set null;

alter table public.generated_contents
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by      uuid references auth.users(id) on delete set null;

alter table public.content_style_profiles
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by      uuid references auth.users(id) on delete set null;

alter table public.usage_events
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- ===========================================================================
-- 2. Indexes for organization-based queries
-- ===========================================================================
create index if not exists properties_organization_id_idx
  on public.properties (organization_id);
create index if not exists properties_assigned_to_idx
  on public.properties (assigned_to);
create index if not exists generated_contents_organization_id_idx
  on public.generated_contents (organization_id);
create index if not exists content_style_profiles_organization_id_idx
  on public.content_style_profiles (organization_id);
create index if not exists usage_events_organization_id_idx
  on public.usage_events (organization_id);

-- ===========================================================================
-- 3. Backfill from each row's owner → personal organization
-- ===========================================================================
update public.properties p
  set organization_id = (
    select o.id from public.organizations o
    where o.owner_user_id = p.user_id and o.type = 'personal'
    order by o.created_at asc limit 1
  )
  where p.organization_id is null;
update public.properties set created_by  = user_id where created_by  is null;
update public.properties set assigned_to = user_id where assigned_to is null;

update public.generated_contents c
  set organization_id = (
    select o.id from public.organizations o
    where o.owner_user_id = c.user_id and o.type = 'personal'
    order by o.created_at asc limit 1
  )
  where c.organization_id is null;
update public.generated_contents set created_by = user_id where created_by is null;

update public.content_style_profiles s
  set organization_id = (
    select o.id from public.organizations o
    where o.owner_user_id = s.user_id and o.type = 'personal'
    order by o.created_at asc limit 1
  )
  where s.organization_id is null;
update public.content_style_profiles set created_by = user_id where created_by is null;

update public.usage_events e
  set organization_id = (
    select o.id from public.organizations o
    where o.owner_user_id = e.user_id and o.type = 'personal'
    order by o.created_at asc limit 1
  )
  where e.organization_id is null;

-- ===========================================================================
-- 4. Auto-tag triggers — guarantee scoping on every insert
-- ===========================================================================
-- Fills organization_id from the row's user_id when the caller omitted it.
-- SECURITY DEFINER because it may have to create the personal org on the fly.
create or replace function public.set_org_from_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null and new.user_id is not null then
    new.organization_id := public.create_personal_organization_for(new.user_id);
  end if;
  return new;
end;
$$;
revoke all on function public.set_org_from_user() from public;

-- properties: default created_by + assigned_to to the inserting owner.
create or replace function public.set_property_member_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by  is null then new.created_by  := new.user_id; end if;
  if new.assigned_to is null then new.assigned_to := new.user_id; end if;
  return new;
end;
$$;
revoke all on function public.set_property_member_defaults() from public;

-- generated_contents / content_style_profiles: default created_by.
create or replace function public.set_created_by_from_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is null then new.created_by := new.user_id; end if;
  return new;
end;
$$;
revoke all on function public.set_created_by_from_user() from public;

drop trigger if exists properties_set_org on public.properties;
create trigger properties_set_org
  before insert on public.properties
  for each row execute function public.set_org_from_user();
drop trigger if exists properties_set_member_defaults on public.properties;
create trigger properties_set_member_defaults
  before insert on public.properties
  for each row execute function public.set_property_member_defaults();

drop trigger if exists generated_contents_set_org on public.generated_contents;
create trigger generated_contents_set_org
  before insert on public.generated_contents
  for each row execute function public.set_org_from_user();
drop trigger if exists generated_contents_set_created_by on public.generated_contents;
create trigger generated_contents_set_created_by
  before insert on public.generated_contents
  for each row execute function public.set_created_by_from_user();

drop trigger if exists content_style_profiles_set_org on public.content_style_profiles;
create trigger content_style_profiles_set_org
  before insert on public.content_style_profiles
  for each row execute function public.set_org_from_user();
drop trigger if exists content_style_profiles_set_created_by on public.content_style_profiles;
create trigger content_style_profiles_set_created_by
  before insert on public.content_style_profiles
  for each row execute function public.set_created_by_from_user();

drop trigger if exists usage_events_set_org on public.usage_events;
create trigger usage_events_set_org
  before insert on public.usage_events
  for each row execute function public.set_org_from_user();

-- ===========================================================================
-- 5. Org-aware RLS (PERMISSIVE — additive to any existing user_id policies)
-- ===========================================================================
-- Each table gets two permissive FOR-ALL policies, OR'd together:
--   • *_member_all   → active members of the row's organization (team-ready)
--   • *_own_user     → the owning user_id (guarantees the solo flow even if
--                      the table had no prior policy / RLS was just enabled)

alter table public.properties enable row level security;
drop policy if exists properties_member_all on public.properties;
create policy properties_member_all on public.properties
  for all
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
drop policy if exists properties_own_user on public.properties;
create policy properties_own_user on public.properties
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.generated_contents enable row level security;
drop policy if exists generated_contents_member_all on public.generated_contents;
create policy generated_contents_member_all on public.generated_contents
  for all
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
drop policy if exists generated_contents_own_user on public.generated_contents;
create policy generated_contents_own_user on public.generated_contents
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.content_style_profiles enable row level security;
drop policy if exists content_style_profiles_member_all on public.content_style_profiles;
create policy content_style_profiles_member_all on public.content_style_profiles
  for all
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
-- (existing style_profiles_*_own user_id policies from 20240105000001 remain.)

-- property_images: scoped through the parent property's organization.
-- Existing property_images_*_own user_id policies (20240103000001) remain.
alter table public.property_images enable row level security;
drop policy if exists property_images_member_all on public.property_images;
create policy property_images_member_all on public.property_images
  for all
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_images.property_id
        and public.is_organization_member(p.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.properties p
      where p.id = property_images.property_id
        and public.is_organization_member(p.organization_id)
    )
  );
