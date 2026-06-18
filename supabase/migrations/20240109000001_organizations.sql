-- ---------------------------------------------------------------------------
-- Phase 2A — Workspace foundation
--
-- Adds organizations + organization_members, membership helper functions, and
-- the personal-workspace bootstrap for BOTH existing users (backfill) and new
-- users (auth.users trigger). No Team UI in this phase — every user simply
-- gets exactly one private "personal" workspace and the app keeps behaving as
-- a single-user product.
--
-- Security model notes:
--   • Membership lookups go through SECURITY DEFINER helpers so that the RLS
--     policy on organization_members can call them WITHOUT recursing on itself.
--   • All helpers pin search_path = '' and fully-qualify every object.
--   • Internal bootstrap functions are REVOKEd from PUBLIC so a client cannot
--     mint organizations for arbitrary users; only the trigger and the
--     auth.uid()-scoped ensure_personal_organization() wrapper may call them.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Tables
-- ===========================================================================
create table if not exists public.organizations (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  type          text        not null default 'personal',
  owner_user_id uuid        not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.organizations
  drop constraint if exists organizations_type_check;
alter table public.organizations
  add constraint organizations_type_check
  check (type in ('personal', 'team', 'company'));

create index if not exists organizations_owner_user_id_idx
  on public.organizations (owner_user_id);

create table if not exists public.organization_members (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  role            text        not null default 'owner',
  status          text        not null default 'active',
  invited_by      uuid        references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table public.organization_members
  drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'admin', 'member'));

alter table public.organization_members
  drop constraint if exists organization_members_status_check;
alter table public.organization_members
  add constraint organization_members_status_check
  check (status in ('active', 'invited', 'removed'));

create index if not exists organization_members_user_status_idx
  on public.organization_members (user_id, status);
create index if not exists organization_members_org_status_idx
  on public.organization_members (organization_id, status);

-- updated_at triggers reuse set_updated_at() from 20240104000001.
drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 2. Membership helpers (SECURITY DEFINER → bypass RLS → no policy recursion)
-- ===========================================================================
create or replace function public.is_organization_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.organization_role(org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = org_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.can_manage_organization(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

-- ===========================================================================
-- 3. Personal-workspace bootstrap
-- ===========================================================================
-- Core routine: return the caller-specified user's personal organization,
-- creating it (and the owner membership) on first call. Idempotent.
-- SECURITY DEFINER + REVOKEd from PUBLIC: only trusted callers (the auth
-- trigger and the auth.uid() wrapper) may invoke it.
create or replace function public.create_personal_organization_for(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_label  text;
  v_name   text;
begin
  if p_user_id is null then
    raise exception 'create_personal_organization_for: user id is null';
  end if;

  -- Already a member of an org? Prefer the personal one, else the earliest.
  select m.organization_id
    into v_org_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = p_user_id
    and m.status = 'active'
  order by (o.type = 'personal') desc, o.created_at asc
  limit 1;

  if v_org_id is not null then
    return v_org_id;
  end if;

  -- Name: "<display name or email prefix> Workspace", else "Workspace cá nhân".
  select coalesce(
           nullif(up.display_name, ''),
           nullif(split_part(u.email, '@', 1), '')
         )
    into v_label
  from auth.users u
  left join public.user_profiles up on up.user_id = u.id
  where u.id = p_user_id;

  v_name := case
              when v_label is not null then v_label || ' Workspace'
              else 'Workspace cá nhân'
            end;

  insert into public.organizations (name, type, owner_user_id)
  values (v_name, 'personal', p_user_id)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org_id, p_user_id, 'owner', 'active')
  on conflict (organization_id, user_id) do nothing;

  return v_org_id;
end;
$$;

revoke all on function public.create_personal_organization_for(uuid) from public;

-- auth.uid()-scoped wrapper the app may call via RPC. A user can only ever
-- bootstrap their OWN personal workspace.
create or replace function public.ensure_personal_organization()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'ensure_personal_organization: no authenticated user';
  end if;
  return public.create_personal_organization_for(auth.uid());
end;
$$;

-- New-user trigger: every new auth user gets a personal workspace, regardless
-- of which sign-up path created them.
create or replace function public.handle_new_user_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_personal_organization_for(new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user_organization() from public;

drop trigger if exists on_auth_user_created_organization on auth.users;
create trigger on_auth_user_created_organization
  after insert on auth.users
  for each row execute function public.handle_new_user_organization();

-- ===========================================================================
-- 4. RLS
-- ===========================================================================
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;

-- organizations: members can read their org; owner/admin can update metadata.
drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations
  for select using (public.is_organization_member(id));

drop policy if exists organizations_update_manager on public.organizations;
create policy organizations_update_manager on public.organizations
  for update using (public.can_manage_organization(id))
  with check (public.can_manage_organization(id));

-- organization_members: members can read their org's roster.
-- Writes are deliberately NOT exposed in Phase 2A (no Team UI). All membership
-- creation flows through the SECURITY DEFINER bootstrap functions above.
-- Phase 4 will add owner/admin-gated insert/update/delete policies.
drop policy if exists organization_members_select_member on public.organization_members;
create policy organization_members_select_member on public.organization_members
  for select using (public.is_organization_member(organization_id));

-- ===========================================================================
-- 5. Grants — only the self-scoped helpers are callable by authenticated users
-- ===========================================================================
grant execute on function public.is_organization_member(uuid)   to authenticated;
grant execute on function public.organization_role(uuid)        to authenticated;
grant execute on function public.can_manage_organization(uuid)  to authenticated;
grant execute on function public.ensure_personal_organization() to authenticated;

-- ===========================================================================
-- 6. Backfill — one personal workspace + owner membership per existing user
-- ===========================================================================
insert into public.organizations (name, type, owner_user_id)
select
  case
    when coalesce(nullif(up.display_name, ''), nullif(split_part(u.email, '@', 1), '')) is not null
      then coalesce(nullif(up.display_name, ''), nullif(split_part(u.email, '@', 1), '')) || ' Workspace'
    else 'Workspace cá nhân'
  end,
  'personal',
  u.id
from auth.users u
left join public.user_profiles up on up.user_id = u.id
where not exists (
  select 1 from public.organizations o
  where o.owner_user_id = u.id and o.type = 'personal'
);

insert into public.organization_members (organization_id, user_id, role, status)
select o.id, o.owner_user_id, 'owner', 'active'
from public.organizations o
where o.type = 'personal'
  and not exists (
    select 1 from public.organization_members m
    where m.organization_id = o.id and m.user_id = o.owner_user_id
  );
