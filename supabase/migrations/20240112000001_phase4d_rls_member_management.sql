-- ---------------------------------------------------------------------------
-- Phase 4D — RLS hardening + member management cleanup
--
-- Until now RLS acted mostly as an ORGANIZATION boundary: the broad
-- `*_member_all` (FOR ALL) policies from Phase 2A let ANY active member
-- read AND write every row in their workspace. The Phase 4C service layer
-- already enforces the MVP permission model, but RLS should be a defensive
-- backstop before wider beta / mobile / API usage.
--
-- This migration:
--   1. Adds row-level "can manage" helper functions (no policy recursion).
--   2. Splits the broad write policies on properties / property_images /
--      generated_contents / content_style_profiles into:
--        • SELECT  → every active org member (visibility stays org-wide)
--        • INSERT  → active org member (assignee rules stay in the service)
--        • UPDATE/DELETE → Owner/Admin, or the row's creator/assignee
--   3. Adds owner-gated SECURITY DEFINER RPCs for member role changes and
--      soft-removal (the single controlled membership write path, mirroring
--      accept_organization_invite).
--
-- Permission model (matches src/lib/workspace/permissions.ts):
--   Visibility — all active members READ workspace inventory/content/images.
--   Management — Owner/Admin manage everything; a Member manages a property
--                only when created_by = auth.uid() OR assigned_to = auth.uid().
--                Image / content / post-assistant writes inherit the parent
--                property's permission. Style profiles: creator OR Owner/Admin.
--
-- Safety choices (must not break existing solo users):
--   • The Phase 2A FOR-ALL user_id fallback policies are REPLACED by a SELECT-
--     only user_id safety net. The old FOR-ALL `*_own_user` / `*_*_own` policies
--     had a WITH CHECK of only `user_id = auth.uid()` (no organization_id check),
--     so a member could INSERT a row into ANOTHER org by setting organization_id
--     explicitly. We drop the write side of those policies; INSERT/UPDATE/DELETE
--     now ALWAYS require org membership (and, for writes, the manage rule). The
--     kept SELECT-only `*_select_own` policies only ever surface a user's OWN
--     rows, so they can never leak and guarantee a solo broker is never read-
--     locked-out (e.g. a legacy row with a null organization_id).
--   • Every helper pins search_path and fully-qualifies objects. The row-manage
--     helpers delegate to the existing SECURITY DEFINER membership helpers
--     (is_organization_member / can_manage_organization), so they read NO table
--     that has a policy referencing the table being protected → no recursion.
--   • can_manage_property() is SECURITY DEFINER because it reads
--     public.properties directly; it never references the protected child table
--     (property_images / generated_contents), so policies that call it cannot
--     recurse.
--   • CAVEAT: the base `properties` / `generated_contents` tables were created in
--     the Supabase dashboard, so they may carry additional dashboard-authored
--     policies this migration cannot drop by name. After deploy, audit with:
--       select tablename, policyname, cmd, qual, with_check
--       from pg_policies where schemaname = 'public'
--       and tablename in ('properties','property_images','generated_contents',
--                         'content_style_profiles','organization_members');
--     and drop any leftover broad (USING true) or write-enabling user_id FOR-ALL
--     policy that would re-open the gap closed here.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Row-level "can manage" helpers
-- ===========================================================================

-- can_manage_property_row — pure predicate over a property's ownership columns.
-- Plain (NOT security definer): it touches no table itself, only delegates to
-- the membership helpers (which ARE definer and bypass RLS). True when the
-- caller is Owner/Admin of the org, or an active member who created / is
-- assigned the row.
create or replace function public.can_manage_property_row(
  p_organization_id uuid,
  p_created_by      uuid,
  p_assigned_to     uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    public.can_manage_organization(p_organization_id)
    or (
      auth.uid() is not null
      and public.is_organization_member(p_organization_id)
      and (p_created_by = auth.uid() or p_assigned_to = auth.uid())
    );
$$;

-- can_manage_property — looks up a property by id and applies the rule above.
-- SECURITY DEFINER so it reads public.properties regardless of the caller's own
-- visibility AND without re-evaluating RLS. It does NOT reference any child
-- table, so policies on property_images / generated_contents may call it freely.
create or replace function public.can_manage_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = p_property_id
      and public.can_manage_property_row(p.organization_id, p.created_by, p.assigned_to)
  );
$$;

-- can_manage_generated_content — parent-property rule, with an orphan fallback
-- (rows that historically have no property_id): Owner/Admin manage them, and so
-- does the content's own creator. Plain function (no direct table read here;
-- can_manage_property is the definer that reads properties).
create or replace function public.can_manage_generated_content(
  p_organization_id uuid,
  p_property_id     uuid,
  p_created_by      uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    case
      when p_property_id is not null then public.can_manage_property(p_property_id)
      else
        public.can_manage_organization(p_organization_id)
        or (
          auth.uid() is not null
          and p_created_by = auth.uid()
          and public.is_organization_member(p_organization_id)
        )
    end;
$$;

grant execute on function public.can_manage_property_row(uuid, uuid, uuid)        to authenticated;
grant execute on function public.can_manage_property(uuid)                        to authenticated;
grant execute on function public.can_manage_generated_content(uuid, uuid, uuid)   to authenticated;

-- ===========================================================================
-- 2. properties — split the broad FOR ALL policy
-- ===========================================================================
-- Drop the Phase 2A broad member policy (it granted writes to every member).
drop policy if exists properties_member_all on public.properties;
-- Drop any re-runs of the new policies so this migration is idempotent.
drop policy if exists properties_member_select on public.properties;
drop policy if exists properties_member_insert on public.properties;
drop policy if exists properties_manage_update on public.properties;
drop policy if exists properties_manage_delete on public.properties;

-- SELECT: org-wide visibility for every active member.
create policy properties_member_select on public.properties
  for select using (public.is_organization_member(organization_id));

-- INSERT: any active member may add a property to their org. created_by /
-- assigned_to are stamped by the BEFORE INSERT trigger; the per-member assignee
-- rule (a Member may only self-assign) is enforced in the properties service —
-- expressing it at RLS level is intentionally deferred (see report).
create policy properties_member_insert on public.properties
  for insert with check (public.is_organization_member(organization_id));

-- UPDATE: Owner/Admin → any property; Member → own-created or assigned-to-them.
-- (Archive is a status UPDATE, so it is covered here.) NOTE: the WITH CHECK uses
-- the NEW row's columns, so a Member who keeps created_by = self can still alter
-- assigned_to; preventing a Member from reassigning to ANOTHER user is enforced
-- in the service (resolveAssignee), not at RLS — documented in the report.
create policy properties_manage_update on public.properties
  for update
  using (public.can_manage_property_row(organization_id, created_by, assigned_to))
  with check (public.can_manage_property_row(organization_id, created_by, assigned_to));

-- DELETE: same management rule (the app archives rather than hard-deletes).
create policy properties_manage_delete on public.properties
  for delete
  using (public.can_manage_property_row(organization_id, created_by, assigned_to));

-- Replace the Phase 2A FOR-ALL user_id policy with a SELECT-only safety net
-- (the write side allowed cross-org inserts; writes now go through the policies
-- above, which require org membership). The creator already retains write access
-- via the manage policies (created_by = self).
drop policy if exists properties_own_user on public.properties;
drop policy if exists properties_select_own on public.properties;
create policy properties_select_own on public.properties
  for select using (auth.uid() = user_id);

-- ===========================================================================
-- 3. property_images — inherit the parent property's permission
-- ===========================================================================
drop policy if exists property_images_member_all on public.property_images;
drop policy if exists property_images_member_select on public.property_images;
drop policy if exists property_images_manage_insert on public.property_images;
drop policy if exists property_images_manage_update on public.property_images;
drop policy if exists property_images_manage_delete on public.property_images;

-- SELECT: visible to every active member of the parent property's org.
create policy property_images_member_select on public.property_images
  for select using (
    exists (
      select 1 from public.properties p
      where p.id = property_images.property_id
        and public.is_organization_member(p.organization_id)
    )
  );

-- INSERT / UPDATE / DELETE: only when the caller can manage the parent property
-- (covers upload finalize, caption/alt edits, delete, set-cover, reorder).
create policy property_images_manage_insert on public.property_images
  for insert with check (public.can_manage_property(property_id));

create policy property_images_manage_update on public.property_images
  for update
  using (public.can_manage_property(property_id))
  with check (public.can_manage_property(property_id));

create policy property_images_manage_delete on public.property_images
  for delete using (public.can_manage_property(property_id));

-- Replace the Phase 2A per-command user_id policies with a SELECT-only net. The
-- old insert/update/delete-own policies let the original uploader keep writing
-- even after losing access to the parent property; image writes now follow the
-- parent property exactly.
drop policy if exists property_images_select_own on public.property_images;
drop policy if exists property_images_insert_own on public.property_images;
drop policy if exists property_images_update_own on public.property_images;
drop policy if exists property_images_delete_own on public.property_images;
create policy property_images_select_own on public.property_images
  for select using (auth.uid() = user_id);

-- ===========================================================================
-- 4. generated_contents — inherit the parent property's permission
-- ===========================================================================
drop policy if exists generated_contents_member_all on public.generated_contents;
drop policy if exists generated_contents_member_select on public.generated_contents;
drop policy if exists generated_contents_member_insert on public.generated_contents;
drop policy if exists generated_contents_manage_update on public.generated_contents;
drop policy if exists generated_contents_manage_delete on public.generated_contents;

-- SELECT: org-wide visibility for every active member.
create policy generated_contents_member_select on public.generated_contents
  for select using (public.is_organization_member(organization_id));

-- INSERT: an active member may create content only for a property they manage
-- (matches generateContentForProperty → getManageableProperty). A null
-- property_id is permitted for any member (defensive; the app always sets it).
create policy generated_contents_member_insert on public.generated_contents
  for insert with check (
    public.is_organization_member(organization_id)
    and (property_id is null or public.can_manage_property(property_id))
  );

-- UPDATE / DELETE (edit / archive / mark posted): manage the parent property,
-- or — for orphaned rows with no property_id — Owner/Admin or the creator.
create policy generated_contents_manage_update on public.generated_contents
  for update
  using (public.can_manage_generated_content(organization_id, property_id, created_by))
  with check (public.can_manage_generated_content(organization_id, property_id, created_by));

create policy generated_contents_manage_delete on public.generated_contents
  for delete
  using (public.can_manage_generated_content(organization_id, property_id, created_by));

-- Replace the Phase 2A FOR-ALL user_id policy with a SELECT-only net (the write
-- side allowed cross-org inserts). The creator still manages orphaned (no
-- property_id) rows via can_manage_generated_content's created_by branch.
drop policy if exists generated_contents_own_user on public.generated_contents;
drop policy if exists generated_contents_select_own on public.generated_contents;
create policy generated_contents_select_own on public.generated_contents
  for select using (auth.uid() = user_id);

-- ===========================================================================
-- 5. content_style_profiles — read org-wide; manage by creator or Owner/Admin
-- ===========================================================================
drop policy if exists content_style_profiles_member_all on public.content_style_profiles;
drop policy if exists content_style_profiles_member_select on public.content_style_profiles;
drop policy if exists content_style_profiles_member_insert on public.content_style_profiles;
drop policy if exists content_style_profiles_manager_update on public.content_style_profiles;
drop policy if exists content_style_profiles_manager_delete on public.content_style_profiles;

-- SELECT: every active member can read org style profiles (style selection at
-- generation time must keep working for all members).
create policy content_style_profiles_member_select on public.content_style_profiles
  for select using (public.is_organization_member(organization_id));

-- INSERT: any active member may create an org style profile.
create policy content_style_profiles_member_insert on public.content_style_profiles
  for insert with check (public.is_organization_member(organization_id));

-- UPDATE / DELETE: Owner/Admin manage all org profiles; the creator manages
-- their own. Both branches require active org membership, so neither re-opens
-- the cross-org write gap.
create policy content_style_profiles_manage_update on public.content_style_profiles
  for update
  using (
    public.can_manage_organization(organization_id)
    or (
      auth.uid() is not null
      and created_by = auth.uid()
      and public.is_organization_member(organization_id)
    )
  )
  with check (
    public.can_manage_organization(organization_id)
    or (
      auth.uid() is not null
      and created_by = auth.uid()
      and public.is_organization_member(organization_id)
    )
  );

create policy content_style_profiles_manage_delete on public.content_style_profiles
  for delete
  using (
    public.can_manage_organization(organization_id)
    or (
      auth.uid() is not null
      and created_by = auth.uid()
      and public.is_organization_member(organization_id)
    )
  );

-- Replace the Phase 2A per-command user_id policies with a SELECT-only net (the
-- old insert/update/delete-own policies allowed cross-org writes). Creator write
-- access is now handled by the created_by branch above.
drop policy if exists style_profiles_select_own on public.content_style_profiles;
drop policy if exists style_profiles_insert_own on public.content_style_profiles;
drop policy if exists style_profiles_update_own on public.content_style_profiles;
drop policy if exists style_profiles_delete_own on public.content_style_profiles;
create policy style_profiles_select_own on public.content_style_profiles
  for select using (auth.uid() = user_id);

-- usage_events: unchanged. Insert-own / read-own remains correct and minimal.

-- ===========================================================================
-- 6. Member management — owner-gated SECURITY DEFINER RPCs
--
-- organization_members has NO broad write policy (only select-member). Role
-- changes + removals flow exclusively through these controlled functions, which
-- verify the caller is an active OWNER of the target's org. They can never grant
-- 'owner' and never demote/remove the last owner — mirroring the Phase 4A
-- accept_organization_invite() controlled-write pattern.
-- ===========================================================================

-- Change a member's role to admin/member. Owner-only. Cannot touch an owner row
-- (owner transfer/demotion is deferred), which also protects the last owner.
create or replace function public.update_organization_member_role(
  p_member_id uuid,
  p_role      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_caller_role text;
  m             public.organization_members%rowtype;
begin
  if v_uid is null then
    raise exception 'member_unauthenticated';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'member_role_invalid';
  end if;

  select * into m
  from public.organization_members
  where id = p_member_id;

  if not found then
    raise exception 'member_not_found';
  end if;

  -- Caller must be an active OWNER of the target member's organization.
  select role into v_caller_role
  from public.organization_members
  where organization_id = m.organization_id
    and user_id = v_uid
    and status = 'active';

  if v_caller_role is distinct from 'owner' then
    raise exception 'member_forbidden';
  end if;

  -- An owner's role is immutable in this phase (no owner transfer yet). This
  -- also makes demoting the last owner impossible.
  if m.role = 'owner' then
    raise exception 'member_owner_protected';
  end if;

  update public.organization_members
  set role = p_role
  where id = m.id;
end;
$$;

-- Soft-remove a member (status → 'removed'). Owner-only. The last active owner
-- can never be removed (covers "cannot remove self if last owner").
create or replace function public.remove_organization_member(
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_caller_role text;
  v_owner_count int;
  m             public.organization_members%rowtype;
begin
  if v_uid is null then
    raise exception 'member_unauthenticated';
  end if;

  select * into m
  from public.organization_members
  where id = p_member_id;

  if not found then
    raise exception 'member_not_found';
  end if;

  select role into v_caller_role
  from public.organization_members
  where organization_id = m.organization_id
    and user_id = v_uid
    and status = 'active';

  if v_caller_role is distinct from 'owner' then
    raise exception 'member_forbidden';
  end if;

  -- Protect the last active owner of the org.
  if m.role = 'owner' then
    select count(*) into v_owner_count
    from public.organization_members
    where organization_id = m.organization_id
      and role = 'owner'
      and status = 'active';

    if v_owner_count <= 1 then
      raise exception 'member_last_owner';
    end if;
  end if;

  -- Soft remove: keep the row for history; status <> 'active' drops all access
  -- (is_organization_member / resolveWorkspaceForUser filter on status).
  update public.organization_members
  set status = 'removed'
  where id = m.id;
end;
$$;

grant execute on function public.update_organization_member_role(uuid, text) to authenticated;
grant execute on function public.remove_organization_member(uuid)            to authenticated;
