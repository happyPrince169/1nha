# Phase 2A — Database Safety Verification Checklist

Verification + manual RLS test plan for the Phase 2A workspace migrations:

- `supabase/migrations/20240109000001_organizations.sql`
- `supabase/migrations/20240109000002_core_tables_organization_id.sql`

Run everything in the **Supabase SQL Editor** (or `psql` as the project owner)
unless a step explicitly says to impersonate a user. Read-only verification
queries (Sections 1–3) are safe to run on production. The RLS impersonation
tests (Section 4) run inside a transaction and **end with `ROLLBACK`**, so they
write nothing.

> Scope: this is a **read-only verification** document. It does not change
> schema, RLS, or app code. If a check fails, see §6 (Interpreting failures).

---

## 0. Schema reference (what the migrations created)

```text
organizations(id, name, type['personal'|'team'|'company'], owner_user_id,
              created_at, updated_at)
organization_members(id, organization_id, user_id,
              role['owner'|'admin'|'member'], status['active'|'invited'|'removed'],
              invited_by, created_at, updated_at, unique(organization_id,user_id))

properties            + organization_id, created_by, assigned_to
generated_contents    + organization_id, created_by
content_style_profiles+ organization_id, created_by
usage_events          + organization_id
property_images       (NO org column — scoped THROUGH properties.organization_id)
```

Helper functions (all `SECURITY DEFINER`, `search_path = ''`):
`is_organization_member`, `organization_role`, `can_manage_organization`,
`create_personal_organization_for` (PUBLIC-revoked), `ensure_personal_organization`,
`handle_new_user_organization` (PUBLIC-revoked), `set_org_from_user`,
`set_property_member_defaults`, `set_created_by_from_user`.
New-user trigger: `on_auth_user_created_organization` on `auth.users`.

---

## 1. Structural verification (objects exist & are configured correctly)

### 1.1 Tables, columns, indexes exist

```sql
-- New tables present
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('organizations', 'organization_members')
order by table_name;
-- EXPECT: 2 rows

-- New columns present on core tables
select table_name, column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'properties'             and column_name in ('organization_id','created_by','assigned_to')) or
    (table_name = 'generated_contents'     and column_name in ('organization_id','created_by'))               or
    (table_name = 'content_style_profiles' and column_name in ('organization_id','created_by'))               or
    (table_name = 'usage_events'           and column_name in ('organization_id'))
  )
order by table_name, column_name;
-- EXPECT: 8 rows, all is_nullable = YES (Phase 2A leaves them nullable on purpose)

-- Org-related indexes present
select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'organizations_owner_user_id_idx',
    'organization_members_user_status_idx',
    'organization_members_org_status_idx',
    'properties_organization_id_idx',
    'properties_assigned_to_idx',
    'generated_contents_organization_id_idx',
    'content_style_profiles_organization_id_idx',
    'usage_events_organization_id_idx'
  )
order by indexname;
-- EXPECT: 8 rows
```

### 1.2 Helper functions are SECURITY DEFINER with a locked search_path

```sql
select p.proname,
       p.prosecdef                      as security_definer,
       p.proconfig                      as config   -- expect {search_path=""}
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_organization_member','organization_role','can_manage_organization',
    'create_personal_organization_for','ensure_personal_organization',
    'handle_new_user_organization','set_org_from_user',
    'set_property_member_defaults','set_created_by_from_user'
  )
order by p.proname;
-- EXPECT: security_definer = true for all; config contains search_path="" .
-- (set_property_member_defaults / set_created_by_from_user are plain field
--  copies — they may be security_definer=false, which is fine; they touch no
--  other table. The org-resolving ones MUST be security definer.)
```

### 1.3 New-user trigger is installed on auth.users

```sql
select tgname, tgrelid::regclass as table_name, tgenabled
from pg_trigger
where tgname = 'on_auth_user_created_organization';
-- EXPECT: 1 row, table_name = auth.users, tgenabled = 'O' (enabled)
```

### 1.4 Internal bootstrap functions are NOT callable by clients

```sql
-- authenticated/anon must NOT have EXECUTE on the privileged bootstrap fns.
select p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed_can_exec,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_can_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_personal_organization_for','handle_new_user_organization',
                    'set_org_from_user')
order by p.proname;
-- EXPECT: authed_can_exec = false AND anon_can_exec = false for all three.

-- Only the self-scoped wrapper is exposed to clients.
select has_function_privilege('authenticated',
         'public.ensure_personal_organization()', 'EXECUTE') as authed_can_ensure;
-- EXPECT: true
```

---

## 2. Backfill verification (every existing row is correctly scoped)

### 2.1 Every existing user has a personal organization

```sql
select u.id, u.email
from auth.users u
where not exists (
  select 1 from public.organizations o
  where o.owner_user_id = u.id and o.type = 'personal'
);
-- EXPECT: 0 rows
```

### 2.2 At most ONE personal organization per user (no duplicates)

```sql
select owner_user_id, count(*) as personal_org_count
from public.organizations
where type = 'personal'
group by owner_user_id
having count(*) > 1;
-- EXPECT: 0 rows
```

### 2.3 Every personal organization has an ACTIVE OWNER membership

```sql
select o.id as org_id, o.owner_user_id
from public.organizations o
where o.type = 'personal'
  and not exists (
    select 1 from public.organization_members m
    where m.organization_id = o.id
      and m.user_id = o.owner_user_id
      and m.role   = 'owner'
      and m.status = 'active'
  );
-- EXPECT: 0 rows  (any row here = an owner locked out of their own workspace)
```

### 2.4 No membership points at a missing org / user (referential sanity)

```sql
select m.id
from public.organization_members m
left join public.organizations o on o.id = m.organization_id
where o.id is null;
-- EXPECT: 0 rows  (FKs should already guarantee this)
```

### 2.5 properties — organization_id / created_by / assigned_to backfilled

```sql
-- Any property still missing organization_id (should be none for owned rows)
select count(*) as properties_without_org
from public.properties
where organization_id is null;
-- EXPECT: 0

select count(*) as properties_without_created_by
from public.properties
where created_by is null;
-- EXPECT: 0

select count(*) as properties_without_assigned_to
from public.properties
where assigned_to is null;
-- EXPECT: 0

-- The assigned org must actually belong to the row's owner (no cross-wiring)
select count(*) as properties_org_owner_mismatch
from public.properties p
join public.organizations o on o.id = p.organization_id
where o.owner_user_id <> p.user_id;
-- EXPECT: 0  (true while every user has only their personal workspace)
```

### 2.6 generated_contents — organization_id / created_by backfilled

```sql
select count(*) as contents_without_org
from public.generated_contents
where organization_id is null;
-- EXPECT: 0

select count(*) as contents_without_created_by
from public.generated_contents
where created_by is null;
-- EXPECT: 0

-- Content org should match its parent property's org (consistency)
select count(*) as content_property_org_mismatch
from public.generated_contents c
join public.properties p on p.id = c.property_id
where c.organization_id is distinct from p.organization_id;
-- EXPECT: 0
```

### 2.7 content_style_profiles — organization_id / created_by backfilled

```sql
select count(*) as profiles_without_org
from public.content_style_profiles
where organization_id is null;
-- EXPECT: 0

select count(*) as profiles_without_created_by
from public.content_style_profiles
where created_by is null;
-- EXPECT: 0
```

### 2.8 usage_events — organization_id backfilled where possible

```sql
select count(*) as usage_events_without_org
from public.usage_events
where organization_id is null;
-- EXPECT: 0
-- NOTE: usage_events keeps user-scoped RLS; the org column is for future
-- analytics only. A non-zero count here is informational, not a security
-- issue (these rows are still protected by the user_id policy).
```

### 2.9 property_images stay reachable only through an authorized parent

`property_images` has no `organization_id`; it is scoped through its parent
property. Verify every image row points at a property that exists and whose
organization is resolvable.

```sql
-- Orphan / cross-owner images (image.user_id must match its property.user_id,
-- and the parent property must have an organization_id to scope through)
select pi.id as image_id, pi.property_id, pi.user_id as image_user,
       p.user_id as property_user, p.organization_id
from public.property_images pi
left join public.properties p on p.id = pi.property_id
where p.id is null                       -- image with no parent property
   or p.user_id <> pi.user_id            -- image owned by a different user than the property
   or p.organization_id is null;         -- parent property not org-scoped
-- EXPECT: 0 rows
```

---

## 3. Policy surface verification (no broad "read-all" policy)

### 3.1 List every policy on the in-scope tables

```sql
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual            as using_expr,
       with_check      as check_expr
from pg_policies
where schemaname = 'public'
  and tablename in (
    'organizations','organization_members','properties',
    'generated_contents','content_style_profiles','property_images','usage_events'
  )
order by tablename, policyname;
```

Manually confirm every `using_expr` / `check_expr` is scoped by one of:
`is_organization_member(...)`, `can_manage_organization(...)`, `auth.uid() = user_id`,
or a parent-property membership `EXISTS (...)`. **None should be `true` or NULL
for a broad read.**

### 3.2 Automated flag: any policy that reads ALL rows

```sql
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename in (
    'organizations','organization_members','properties',
    'generated_contents','content_style_profiles','property_images','usage_events'
  )
  and cmd in ('SELECT','ALL')
  and (
    qual is null                                   -- no USING clause = unrestricted read
    or btrim(lower(qual)) in ('true','(true)')     -- literal allow-all
  );
-- EXPECT: 0 rows.  Any row here is a broad read-all policy → STOP and review.
```

### 3.3 RLS is actually enabled on every in-scope table

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'organizations','organization_members','properties',
    'generated_contents','content_style_profiles','property_images','usage_events'
  )
order by c.relname;
-- EXPECT: rls_enabled = true for all 7
```

### 3.4 organization_members / organizations have NO direct client write policy

```sql
-- Membership + org rows may only be created by SECURITY DEFINER functions.
-- There must be no INSERT/UPDATE/DELETE policy that lets a normal user write.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('organization_members','organizations')
  and cmd in ('INSERT','DELETE');
-- EXPECT: 0 rows.
-- (organizations has ONE UPDATE policy gated by can_manage_organization — that
--  is expected and fine; there should be NO INSERT/DELETE policy on either,
--  and NO UPDATE policy on organization_members in Phase 2A.)
```

---

## 4. Manual RLS tests (impersonate two real users)

These prove cross-organization isolation. They simulate a logged-in user by
setting the role to `authenticated` and the JWT `sub` claim that `auth.uid()`
reads. **Everything runs inside one transaction and ends with `ROLLBACK`.**

### 4.0 Pick two users and a known row from user A

```sql
-- Grab two user ids (note them for the blocks below)
select id, email from auth.users order by created_at limit 2;

-- A property owned by USER A (replace the uuid)
select id, user_id, organization_id
from public.properties
where user_id = '<USER_A_UUID>'
limit 1;
```

Fill `<USER_A_UUID>`, `<USER_B_UUID>`, `<A_PROPERTY_ID>` into the blocks below.

### 4.1 User A CAN read their own property  → EXPECT ≥ 1 row

```sql
begin;
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
                    json_build_object('sub','<USER_A_UUID>','role','authenticated')::text,
                    true);
  set local role authenticated;

  select id, title
  from public.properties
  where id = '<A_PROPERTY_ID>';
  -- EXPECT: 1 row (A sees their own property)
rollback;
```

### 4.2 User B CANNOT read user A's property  → EXPECT 0 rows

```sql
begin;
  select set_config('request.jwt.claims',
                    json_build_object('sub','<USER_B_UUID>','role','authenticated')::text,
                    true);
  set local role authenticated;

  select id, title
  from public.properties
  where id = '<A_PROPERTY_ID>';
  -- EXPECT: 0 rows  (B is not a member of A's org and user_id != B)
rollback;
```

### 4.3 User B CANNOT read user A's generated content  → EXPECT 0 rows

```sql
begin;
  select set_config('request.jwt.claims',
                    json_build_object('sub','<USER_B_UUID>','role','authenticated')::text,
                    true);
  set local role authenticated;

  select count(*) as visible_rows
  from public.generated_contents
  where user_id = '<USER_A_UUID>';
  -- EXPECT: visible_rows = 0
rollback;
```

### 4.4 User B CANNOT read user A's style profile  → EXPECT 0 rows

```sql
begin;
  select set_config('request.jwt.claims',
                    json_build_object('sub','<USER_B_UUID>','role','authenticated')::text,
                    true);
  set local role authenticated;

  select count(*) as visible_rows
  from public.content_style_profiles
  where user_id = '<USER_A_UUID>';
  -- EXPECT: visible_rows = 0
rollback;
```

### 4.5 User B CANNOT read image rows for user A's property  → EXPECT 0 rows

```sql
begin;
  select set_config('request.jwt.claims',
                    json_build_object('sub','<USER_B_UUID>','role','authenticated')::text,
                    true);
  set local role authenticated;

  select count(*) as visible_rows
  from public.property_images
  where property_id = '<A_PROPERTY_ID>';
  -- EXPECT: visible_rows = 0
  --   (blocked by BOTH the user_id policy AND the parent-property membership
  --    policy — B is not a member of A's org)
rollback;
```

### 4.6 Positive control — User A CAN read their own related rows

```sql
begin;
  select set_config('request.jwt.claims',
                    json_build_object('sub','<USER_A_UUID>','role','authenticated')::text,
                    true);
  set local role authenticated;

  select
    (select count(*) from public.generated_contents     where user_id = '<USER_A_UUID>') as contents,
    (select count(*) from public.content_style_profiles where user_id = '<USER_A_UUID>') as profiles,
    (select count(*) from public.property_images        where property_id = '<A_PROPERTY_ID>') as images;
  -- EXPECT: counts match what A actually owns (sanity that we did not over-lock)
rollback;
```

> If `set_config('request.jwt.claims', …)` is unavailable in your tool, use the
> equivalent `set local "request.jwt.claims" = '{"sub":"…","role":"authenticated"}';`
> The key requirement is `role = authenticated` + a `sub` claim equal to the
> user's `auth.users.id`, because `auth.uid()` derives from that claim.

---

## 5. Deployment order

Follow in order. Do not skip the backup or the verification gate.

1. **Backup**
   - Take a full database backup / PITR checkpoint (Supabase Dashboard →
     Database → Backups, or `pg_dump`). Confirm the backup completed before
     proceeding. This is the rollback path if anything in §2 fails.

2. **Apply migrations** (in filename order)
   - `20240109000001_organizations.sql`
   - `20240109000002_core_tables_organization_id.sql`
   - Apply via your normal pipeline (Supabase CLI `db push`, or paste in SQL
     Editor in order). Both are idempotent (`if not exists` / `drop ... if
     exists` / `on conflict do nothing`), so a re-run is safe.
   - Apply **before** deploying the new app build. The BEFORE INSERT auto-tag
     triggers keep the OLD app build correct during the window between migrate
     and deploy.

3. **Run verification SQL** (this document)
   - Section 1 (structural), Section 2 (backfill), Section 3 (policy surface).
   - **Gate:** every "EXPECT 0 rows" / "EXPECT N rows" must hold. If any fail,
     STOP and go to §6 before deploying the app.

4. **Deploy app**
   - Deploy the build that includes `src/lib/workspace/current.ts` and the
     org-tagging inserts. No env var changes are required.

5. **Smoke test** (production, as a real logged-in broker)
   - Sign in → dashboard loads.
   - Property list + pagination loads; open a property detail.
   - Create a property (manual + via Quick Add form) → succeeds; in SQL the new
     row has `organization_id`, `created_by`, `assigned_to` set.
   - Open the images page; existing R2 **and** legacy Supabase images display.
   - Generate content → new `generated_contents` row has `organization_id` +
     `created_by`.
   - Create a style profile → tagged; selecting it during generation works.
   - Open Post Assistant → thumbnails render, download/copy/open work.
   - Create a brand-new test user → confirm a personal org + active owner
     membership appear (re-run §2.1 and §2.3 filtered to that user).
   - Run the §4 cross-user tests with two real accounts.

---

## 6. Interpreting failures

| Failing check | Likely cause | Action |
|---|---|---|
| §2.1 users without personal org | backfill skipped (migration 1 not applied / partial) | re-run `20240109000001`; it is idempotent |
| §2.3 org without owner membership | second backfill insert didn't run | re-run `20240109000001`; investigate before app deploy (owner would be locked out) |
| §2.5–2.8 NULL org/created_by | migration 2 not applied, or rows created by a path that bypasses triggers | re-run `20240109000002`; check for any direct SQL inserts |
| §2.6 content/property org mismatch | only possible once teams exist; in Phase 2A means a row was hand-edited | review the offending rows |
| §3.2 a broad read-all policy found | an unexpected/legacy policy | **security issue** — review & remove the offending policy before deploy |
| §3.3 RLS disabled on a table | migration not applied or table recreated | re-run migration 2 (`enable row level security` is idempotent) |
| §4.2–4.5 user B sees user A data | RLS gap | **security issue** — do NOT deploy; capture the policy list (§3.1) and escalate |

---

## 7. Security review notes (migration audit, Phase 2A)

Reviewed `20240109000001` + `20240109000002`. **No concrete security bug found.**
RLS was therefore left unchanged. Observations recorded for future phases:

- **No recursion risk.** `organization_members` SELECT calls
  `is_organization_member`, which is `SECURITY DEFINER` and so bypasses RLS
  inside its own body — the policy cannot recurse on itself. ✔
- **No privilege escalation via membership.** There is no client-facing
  INSERT/UPDATE/DELETE policy on `organization_members` or INSERT/DELETE on
  `organizations`; membership is minted only by PUBLIC-revoked SECURITY DEFINER
  functions. A user cannot add themselves to another org. ✔
- **Bootstrap cannot be abused.** `create_personal_organization_for(uuid)` is
  `REVOKE … FROM public`; only `ensure_personal_organization()` (which forces
  `auth.uid()`) is granted to `authenticated`, so a client can only ever
  bootstrap their **own** workspace. ✔
- **Permissive-only policies.** All new policies are PERMISSIVE, so they can
  only widen access for active members; the `*_own_user` user_id fallback keeps
  the solo flow working even if a table had no prior policy. ✔
- **NULL organization_id is not a leak.** `is_organization_member(NULL)` returns
  false (no membership matches a NULL org), so a row that somehow has a NULL
  `organization_id` is reachable only via the `auth.uid() = user_id` policy —
  i.e. only by its owner. ✔ (Verification §2.5–2.8 still expect 0 NULLs.)
- **Non-bug notes (no action in Phase 2A):**
  - `usage_events` keeps user-scoped RLS; its `organization_id` is analytics
    metadata only.
  - `generated_contents.organization_id` is expected to equal its parent
    property's org (verified in §2.6). They could diverge only once teams +
    cross-member assignment exist — revisit in Phase 4.
  - `organizations_update_manager` lets an owner/admin update org metadata
    (incl. `type`/`owner_user_id`). Acceptable now; Phase 4 may narrow the
    updatable columns when the Team UI lands.
