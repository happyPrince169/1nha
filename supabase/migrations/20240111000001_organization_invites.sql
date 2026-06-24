-- ---------------------------------------------------------------------------
-- Phase 4A — Team UI MVP: organization invites + member roster helper
--
-- Builds the smallest safe storage + access layer needed for the first
-- Team/Workspace UI:
--   • organization_invites — link-based invitations (no email sending yet).
--   • list_organization_members() — lets a fellow member read the roster WITH
--     email / display_name / phone (auth.users + user_profiles are otherwise
--     invisible to other users under RLS). SECURITY DEFINER, gated on
--     is_organization_member().
--   • get_organization_invite() / accept_organization_invite() — token-based
--     invite preview + accept. Membership writes stay locked down (no broad
--     INSERT policy on organization_members); the accept RPC is the single
--     controlled path, mirroring the Phase 2A ensure_personal_organization()
--     pattern.
--
-- Security model notes:
--   • Every function pins search_path = '' and fully-qualifies objects.
--   • No service-role key is ever used by the app — these definer functions
--     are the controlled escalation points and are individually granted.
--   • An invite can never grant 'owner'. Role is constrained to admin/member.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. organization_invites table
-- ===========================================================================
create table if not exists public.organization_invites (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  email           text        not null,
  role            text        not null default 'member',
  token           text        not null unique,
  invited_by      uuid        references auth.users(id) on delete set null,
  status          text        not null default 'pending',
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  accepted_by     uuid        references auth.users(id) on delete set null
);

alter table public.organization_invites
  drop constraint if exists organization_invites_role_check;
alter table public.organization_invites
  add constraint organization_invites_role_check
  check (role in ('admin', 'member'));

alter table public.organization_invites
  drop constraint if exists organization_invites_status_check;
alter table public.organization_invites
  add constraint organization_invites_status_check
  check (status in ('pending', 'accepted', 'revoked', 'expired'));

create index if not exists organization_invites_org_status_idx
  on public.organization_invites (organization_id, status);

-- ===========================================================================
-- 2. RLS — managers (owner/admin) manage their org's invites
--
-- Reads/writes by token (preview + accept) are NOT exposed here: they flow
-- through the SECURITY DEFINER functions below so a non-member can act on a
-- single invite they hold the unguessable token for, without seeing the table.
-- ===========================================================================
alter table public.organization_invites enable row level security;

drop policy if exists organization_invites_select_manager on public.organization_invites;
create policy organization_invites_select_manager on public.organization_invites
  for select using (public.can_manage_organization(organization_id));

drop policy if exists organization_invites_insert_manager on public.organization_invites;
create policy organization_invites_insert_manager on public.organization_invites
  for insert with check (
    public.can_manage_organization(organization_id)
    and invited_by = auth.uid()
    and role in ('admin', 'member')
  );

drop policy if exists organization_invites_update_manager on public.organization_invites;
create policy organization_invites_update_manager on public.organization_invites
  for update using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

-- ===========================================================================
-- 3. Member roster (SECURITY DEFINER → expose email/phone to fellow members)
-- ===========================================================================
create or replace function public.list_organization_members(p_org_id uuid)
returns table (
  member_id    uuid,
  user_id      uuid,
  role         text,
  status       text,
  created_at   timestamptz,
  email        text,
  display_name text,
  phone        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.user_id,
    m.role,
    m.status,
    m.created_at,
    u.email::text,
    up.display_name,
    up.phone
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  left join public.user_profiles up on up.user_id = m.user_id
  -- Gate: only an active member of the org may read its roster.
  where m.organization_id = p_org_id
    and public.is_organization_member(p_org_id)
    and m.status = 'active'
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    m.created_at asc;
$$;

-- ===========================================================================
-- 4. Invite preview by token (SECURITY DEFINER, authenticated holder of token)
--    Returns only display-safe fields. Never exposes the token or invited_by.
-- ===========================================================================
create or replace function public.get_organization_invite(p_token text)
returns table (
  organization_id   uuid,
  organization_name text,
  email             text,
  role              text,
  status            text,
  expires_at        timestamptz,
  is_expired        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.organization_id,
    o.name,
    i.email,
    i.role,
    i.status,
    i.expires_at,
    (i.expires_at < now()) as is_expired
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token
  limit 1;
$$;

-- ===========================================================================
-- 5. Accept invite (SECURITY DEFINER) — the single controlled membership write
--
-- Adds the CALLER (auth.uid()) to the org with the invited role. An invite can
-- only ever grant admin/member (table constraint), so no self-escalation to
-- owner is possible. If the caller already belongs to the org, their existing
-- role is preserved (never silently downgraded) and only re-activated.
-- ===========================================================================
create or replace function public.accept_organization_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  inv     public.organization_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'invite_unauthenticated';
  end if;

  select * into inv
  from public.organization_invites
  where token = p_token
  limit 1;

  if not found then
    raise exception 'invite_not_found';
  end if;

  if inv.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  if inv.expires_at < now() then
    update public.organization_invites set status = 'expired' where id = inv.id;
    raise exception 'invite_expired';
  end if;

  select email into v_email from auth.users where id = v_uid;

  -- A user WITH an email must match the invited address. Phone-only accounts
  -- (email is null) may accept on the strength of the unguessable token alone.
  if v_email is not null and lower(v_email) <> lower(inv.email) then
    raise exception 'invite_email_mismatch';
  end if;

  insert into public.organization_members (organization_id, user_id, role, status, invited_by)
  values (inv.organization_id, v_uid, inv.role, 'active', inv.invited_by)
  on conflict (organization_id, user_id)
  do update set status = 'active', updated_at = now();

  update public.organization_invites
  set status = 'accepted', accepted_at = now(), accepted_by = v_uid
  where id = inv.id;

  return inv.organization_id;
end;
$$;

-- ===========================================================================
-- 6. Grants — only authenticated users may call these definer helpers
-- ===========================================================================
grant execute on function public.list_organization_members(uuid)   to authenticated;
grant execute on function public.get_organization_invite(text)      to authenticated;
grant execute on function public.accept_organization_invite(text)   to authenticated;
