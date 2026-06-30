# Phase 4E-light — Production Backend Sanity Check

Pre-flight verification that the backend / API / auth / permission foundation is
safe for an Expo **mobile client** before that app is built. This is a checklist
phase: **no new product features, no mobile code, no provider changes.**

It validates the work of:

- **4A** workspace UI + invite, **4B** assignee workflow,
- **4C** service-layer team-permission hardening,
- **4D** RLS hardening + member management (`organization_members` writes via
  owner-gated SECURITY DEFINER RPCs only).

The contract a mobile client relies on:

> Every data path the client can reach — the `/api/*` JSON routes **and** any
> direct Supabase (anon-key, user-JWT) call — is permission-safe. The **service
> layer** is the primary boundary; **RLS** (Phase 4D) is the defensive backstop
> for direct-table access.

---

## 1. Migration apply checklist

Migration: `supabase/migrations/20240112000001_phase4d_rls_member_management.sql`

- [ ] Back up / snapshot the database (or confirm a restore path) before apply.
- [ ] Apply the migration to **staging** first (`supabase db push`, or paste into
      the SQL editor in dependency order — it is idempotent: `drop policy if
      exists` + `create or replace function`).
- [ ] Confirm the helper functions exist and are `GRANT`ed to `authenticated`:
      - `can_manage_property_row(uuid, uuid, uuid)`
      - `can_manage_property(uuid)`  *(SECURITY DEFINER)*
      - `can_manage_generated_content(uuid, uuid, uuid)`
      - `update_organization_member_role(uuid, text)`  *(SECURITY DEFINER)*
      - `remove_organization_member(uuid)`  *(SECURITY DEFINER)*
- [ ] Confirm no migration error and that existing solo users still load
      dashboard data (smoke: sign in, open Kho nguồn / Nội dung).
- [ ] Apply to **production** only after staging passes the checklists below.

Apply order note: this migration depends on the Phase 2A membership helpers
(`is_organization_member`, `can_manage_organization`) and the
`organization_members` table already existing — they do (20240109000001).

---

## 2. RLS `pg_policies` audit checklist

The base `properties` / `generated_contents` tables were created in the Supabase
dashboard, so they **may** carry dashboard-authored policies this migration
cannot drop by name. Audit after apply:

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'properties', 'property_images', 'generated_contents',
    'content_style_profiles', 'organization_members',
    'organizations', 'organization_invites', 'usage_events'
  )
order by tablename, cmd, policyname;
```

Confirm, per table:

- [ ] **properties** — exactly: `properties_member_select` (SELECT),
      `properties_member_insert` (INSERT), `properties_manage_update` (UPDATE),
      `properties_manage_delete` (DELETE), `properties_select_own` (SELECT).
      **No** leftover `properties_member_all` or any FOR-ALL `user_id` policy
      with a write `with_check`.
- [ ] **property_images** — `property_images_member_select` (SELECT),
      `property_images_manage_insert/update/delete`, `property_images_select_own`
      (SELECT). No `property_images_member_all`, no per-command `*_own` write.
- [ ] **generated_contents** — `generated_contents_member_select` (SELECT),
      `generated_contents_member_insert` (INSERT),
      `generated_contents_manage_update/delete`, `generated_contents_select_own`
      (SELECT). No `generated_contents_member_all`, no FOR-ALL `user_id` write.
- [ ] **content_style_profiles** — `content_style_profiles_member_select`,
      `content_style_profiles_member_insert`,
      `content_style_profiles_manage_update/delete`, `style_profiles_select_own`
      (SELECT). No `content_style_profiles_member_all`, no per-command `*_own`
      write.
- [ ] **organization_members** — only `organization_members_select_member`
      (SELECT). **No INSERT/UPDATE/DELETE policy** (writes flow only through the
      SECURITY DEFINER RPCs).
- [ ] **organizations / organization_invites / usage_events** — unchanged from
      4A/2A (member SELECT; manager update; invite manager policies; usage
      insert-own/read-own).
- [ ] **RED FLAG** to remediate: any policy with `qual = true` / `with_check =
      true` (USING true), or any FOR-ALL `user_id`-only policy that still permits
      writes. Drop it — it re-opens the cross-org INSERT gap 4D closed.
- [ ] Confirm `rowsecurity = true` for every table above:
      `select relname, relrowsecurity from pg_class where relname in (...)`.

---

## 3. Owner / member manual test checklist

Use two real accounts in **one shared workspace**: an **Owner** and a plain
**Member** (invite the member via the 4A link, accept, confirm role = Thành viên).

**Visibility (both roles):**

- [ ] Member sees the full workspace inventory (Kho nguồn), content list, images.

**Member management (Owner only):**

- [ ] Owner can change a member's role Thành viên ↔ Quản trị
      ("Đã cập nhật vai trò thành viên.").
- [ ] Owner can remove a member ("Đã xoá thành viên khỏi workspace.").
- [ ] Owner row shows the protected note; no role select / remove on owner rows.
- [ ] Last owner cannot be removed/demoted ("Không thể xoá chủ sở hữu cuối cùng.").
- [ ] Admin and Member see a read-only roster (no controls).
- [ ] A removed member loses access: their next request resolves to their own
      personal workspace, not the team's (re-login if a session is cached).

**Property management (Member):**

- [ ] Member can create a property; can edit/archive a property they created.
- [ ] Member can edit/archive a property assigned to them.
- [ ] Member **cannot** edit/archive an unrelated property (read-only UI; the
      service returns FORBIDDEN if forced).
- [ ] Member **cannot** mutate images/content of an unrelated property.
- [ ] Member cannot reassign a property to **another** user (service blocks it).

**Owner/Admin:**

- [ ] Owner/Admin can manage **any** property / images / content in the org.

**Style profiles:**

- [ ] Member can create a style profile and edit/delete their **own**.
- [ ] Member cannot edit/delete a style profile created by someone else.
- [ ] Owner/Admin can manage all org style profiles.
- [ ] Style selection at generation time still works for everyone (not broken).

**Invite (regression):**

- [ ] Invite accept still works; revoked/expired invite blocked; email match
      enforced; invite still cannot grant `owner`.

---

## 4. Bearer API smoke test checklist

Both scripts use **anon-key sign-in → Bearer token**, never print the token, and
never use the service-role key. Run against local / preview / prod.

**4.1 Core authenticated API (Phase 3D) — `npm run smoke:api`**

- [ ] Unauthenticated `GET /api/properties` & `/api/generated-contents` → **401**.
- [ ] Authenticated reads → **200** (`/api/properties`, `/api/style-profiles`,
      `/api/generated-contents`).
- [ ] (optional ids) property/content-scoped reads → 200; foreign ids → **404**.

```bash
SMOKE_BASE_URL=https://<env> \
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... \
npm run smoke:api
```

**4.2 Team permission boundary (Phase 4E) — `npm run smoke:team`**

- [ ] Unauthenticated requests → **401**.
- [ ] Member can **read** the property list / style profiles / content → **200**.
- [ ] Member mutating an **unrelated** content (`post-assistant/copied`) → **403**
      (`SMOKE_UNRELATED_CONTENT_ID`, a same-org asset the member doesn't manage).
- [ ] Member archiving an **unrelated** property → **403**
      (`SMOKE_UNRELATED_PROPERTY_ID` + `SMOKE_ALLOW_ARCHIVE_PROBE=1`).
- [ ] Owner basics → **200** (optional `SMOKE_OWNER_EMAIL/PASSWORD`).

```bash
SMOKE_BASE_URL=https://<env> \
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
SMOKE_MEMBER_EMAIL=... SMOKE_MEMBER_PASSWORD=... \
SMOKE_UNRELATED_CONTENT_ID=<same-org content the member can't manage> \
# optional: SMOKE_UNRELATED_PROPERTY_ID=<...> SMOKE_ALLOW_ARCHIVE_PROBE=1 \
# optional: SMOKE_OWNER_EMAIL=... SMOKE_OWNER_PASSWORD=... \
npm run smoke:team
```

> "Unrelated" ids must live in the **member's own workspace** but be owned by
> someone else. An id from another org returns 404 (cross-org isolation), not the
> 403 team-permission boundary this probe targets.

**Direct-Supabase backstop (manual, optional but recommended):** with the member
JWT, attempt a direct `supabase.from('properties').update(...)` on an unrelated
row and on a cross-org row — both must affect **0 rows** (RLS). This proves a
mobile client using supabase-js directly cannot bypass the service layer.

---

## 5. No-bypass coverage (what protects each surface)

| Surface | Service guard (4C) | RLS backstop (4D) |
|---|---|---|
| properties update/archive | `canEditProperty` / `canArchiveProperty` | `properties_manage_update/delete` = `can_manage_property_row` |
| property_images write | `requireManageablePropertyInOrg` | `property_images_manage_*` = `can_manage_property` |
| generated_contents write | `getManageableProperty` | `generated_contents_manage_*` = `can_manage_generated_content` |
| post-assistant mutations | `requireManageableContentParent` | (writes `generated_contents` → same RLS) |
| workspace member mgmt | `requireOwner` + owner-gated RPCs | no broad `organization_members` write policy |

Both the web Server Actions and the `/api/*` routes funnel through the same
service functions (`getRequestContext` → service), so there is **no UI-only or
client-trusted check**. Member management has **no JSON API** (web-action only,
owner-gated RPC) — intentional; revisit when the mobile app needs it.

---

## 6. Known deferred items

Not in scope for the mobile foundation; tracked for later:

- Workspace switcher (single current workspace today).
- Per-property ACL tables (visibility stays org-wide).
- Audit log of member/role/permission changes.
- Real email delivery for invites (link-share only).
- Owner-transfer flow (owner role is immutable via the current RPCs).
- Member-management **JSON API** routes (currently web action + RPC only).
- RLS-level enforcement of the `assigned_to` reassignment rule and INSERT
  assignee validation (kept in the service; documented in `ARCHITECTURE.md`).
- Automated two-user RLS integration tests in CI (the smoke scripts are manual /
  on-demand and require real test accounts).
