
# 1nha Architecture

## Product Overview

1nha is a mobile-first web app for Vietnamese real estate brokers.

Positioning:

> 1nha — Kho nguồn & trợ lý đăng bài cho môi giới BĐS

Core workflow:

```text
Nhập nguồn
→ Quản lý kho căn
→ Upload ảnh
→ Tạo content AI
→ Chỉnh sửa content
→ Dùng văn phong riêng
→ Trợ lý đăng bài
→ Lưu lịch sử đã đăng
```

1nha is not only an AI content generator. It is a property inventory and posting workflow assistant.

## Current Stack

* Next.js 16 App Router
* React 19
* TypeScript strict
* Tailwind CSS
* shadcn/ui-style components
* Supabase Auth
* Supabase Postgres
* Supabase Storage, may later move media to Cloudflare R2
* Vercel deployment
* OpenAI REST API for AI/OCR/content generation

## Hosting

Current likely deployment:

```text
Frontend / Next.js app:
Vercel

Database / Auth:
Supabase

Media:
Currently Supabase Storage
Future direction: Cloudflare R2 for image/video media

AI:
OpenAI REST API
```

Important future concern:

Core user data may need a Vietnam-hosted architecture before commercial/public scale. Media and AI processing should be abstracted so providers can be changed later.

## Main Routes

```text
/                                  Public landing
/pricing                           Pricing preview

/dashboard                         Main dashboard
/dashboard/properties              Property inventory
/dashboard/properties/quick-add    AI quick add
/dashboard/properties/[id]         Property detail
/dashboard/properties/[id]/images  Property images
/dashboard/properties/[id]/generate Generate AI content

/dashboard/content                 Global content workspace
/dashboard/style-profiles          Writing style profiles
/dashboard/account                 Account/profile
/dashboard/billing                 Beta plan/billing preview
```

Nested content routes:

```text
/dashboard/properties/[id]/content
/dashboard/properties/[id]/content/[contentId]
/dashboard/properties/[id]/content/[contentId]/post
```

## Navigation Model

Bottom navigation must have exactly 5 main tabs:

```text
Tổng quan     -> /dashboard
Kho nguồn     -> /dashboard/properties
Nhập nhanh    -> /dashboard/properties/quick-add
Nội dung      -> /dashboard/content
Tài khoản     -> /dashboard/account
```

Secondary features:

```text
Văn phong       -> inside Nội dung
Gói sử dụng     -> inside Tài khoản
Bảng giá        -> inside Tài khoản or public /pricing
Liên hệ & góp ý -> inside Tài khoản
```

Do not turn the app into a dense admin panel.

## Main Database Tables

Expected/current tables:

```text
properties
property_images
generated_contents
content_style_profiles
usage_events
user_profiles
upgrade_interest_requests
```

Potential future tables:

```text
property_media
viewing_records
viewing_events
deal_rooms
split_ledgers
team_members
credit_ledger
subscriptions
```

## Workspaces / Organizations (Phase 2A)

1nha's data model is workspace-ready. Every user belongs to at least one
**organization** (their auto-created personal workspace). The single-user
experience is unchanged — there is no Team UI yet.

### Tables

```text
organizations
  id, name, type ('personal'|'team'|'company'), owner_user_id,
  created_at, updated_at

organization_members
  id, organization_id, user_id,
  role ('owner'|'admin'|'member'), status ('active'|'invited'|'removed'),
  invited_by, created_at, updated_at, unique(organization_id, user_id)
```

Core tables gained organization scoping (all NULLABLE, backfilled):

```text
properties.organization_id, properties.created_by, properties.assigned_to
generated_contents.organization_id, generated_contents.created_by
content_style_profiles.organization_id, content_style_profiles.created_by
usage_events.organization_id
property_images → scoped THROUGH properties.organization_id (no own column)
```

### Personal workspace bootstrap

```text
- Existing users: a backfill creates one personal organization + owner
  membership each (name = "<display name | email prefix> Workspace",
  else "Workspace cá nhân").
- New users: an AFTER INSERT trigger on auth.users
  (handle_new_user_organization → create_personal_organization_for) creates
  the personal workspace. This is the ONLY auth.users trigger; there is no
  prior handle_new_user function (user_profiles is still created in app code).
- BEFORE INSERT triggers on the core tables (set_org_from_user, etc.) auto-tag
  organization_id / created_by / assigned_to from user_id, so inserts are
  always scoped even from code that predates this change.
```

### RLS / security model

```text
- Membership is checked via SECURITY DEFINER helpers
  (is_organization_member, organization_role, can_manage_organization), all
  with search_path = '' and fully-qualified names. Being SECURITY DEFINER,
  they bypass RLS internally, so organization_members' own SELECT policy can
  call is_organization_member without infinite recursion.
- organizations: members SELECT; owner/admin UPDATE.
- organization_members: members SELECT the roster. NO insert/update/delete
  policies in Phase 2A — membership is created only by the SECURITY DEFINER
  bootstrap functions. Phase 4 adds owner/admin-gated member writes.
- Core tables: PERMISSIVE org-member policies are ADDED alongside the existing
  user_id policies (additive → can only widen access for active members, never
  restrict the solo flow). property_images is gated by membership of its parent
  property's organization.
- Internal bootstrap functions (create_personal_organization_for,
  set_org_from_user, handle_new_user_organization) are REVOKEd from PUBLIC;
  only ensure_personal_organization() (auth.uid()-scoped) is callable by
  authenticated clients via RPC.
- No service-role key is used anywhere in app code; all access is the user's
  RLS-scoped anon session.
```

### Resolving the current workspace (app code)

```text
src/lib/workspace/current.ts  (server-only)
  getCurrentWorkspace()      → { organizationId, role } | null
  getCurrentOrganizationId() → string | null
```

It prefers the personal organization, falls back to the earliest active
membership, and bootstraps via the `ensure_personal_organization` RPC if a user
somehow has none. Never import it from a Client Component. Phase 4 will layer a
workspace switcher on top of this single entry point.

### Migration / deployment notes

```text
- Apply 20240109000001 then 20240109000002 BEFORE deploying the app build.
  The BEFORE INSERT auto-tag triggers mean the OLD app build keeps working in
  the window between migration and deploy (its inserts get tagged at the DB).
- New org columns are intentionally left NULLABLE. A future migration may set
  them NOT NULL once the updated app is fully deployed and every insert path
  supplies them — do NOT tighten during this phase (would risk the rollout).
- The auth.users trigger requires the migration role's privileges (standard
  Supabase). If a hosted environment blocks auth.users triggers, the app-side
  ensure_personal_organization() RPC fallback still covers new users on first
  authenticated request.
```

## Ownership and Security

All dashboard data must be scoped by `user_id` (and, since Phase 2A, by
`organization_id` — currently equivalent for personal workspaces).

Rules:

```text
- Always auth-gate dashboard actions.
- Always verify ownership before read/write.
- Never expose another user's data.
- Do not fetch sensitive notes unless the screen needs them.
- Do not expose owner_note, planning_note, customer info, or private notes in post assistant screens.
- Do not auto-post to social platforms.
- Do not use WebView JavaScript injection for Facebook/Zalo/TikTok.
```

## Authentication

Auth uses **Supabase Auth with email + password** as the primary method.

```text
Sign in   -> /sign-in        signInWithPassword(email, password)
Sign up   -> /sign-up        signUp(email, password) + display_name/phone metadata
Forgot    -> /forgot-password resetPasswordForEmail(email)
Reset     -> /reset-password  updateUser({ password }) (recovery session)
Sign out  -> signOut()
```

Key points:

```text
- Password login is primary. Magic link remains as an optional, secondary
  fallback (a hidden toggle on /sign-in) — it is no longer the default flow.
- Signup may require email confirmation (Supabase "Confirm email" setting). On
  success the UI tells the user to check their email before signing in.
- Password recovery reuses the existing /api/auth/callback route: the email
  link carries ?next=/reset-password, the callback exchanges the code for a
  session, and the reset page calls updateUser to set the new password.
- Existing magic-link-only users have no password — they use "Quên mật khẩu?"
  to set one. No existing users/sessions are deleted or invalidated.
```

Profile data:

```text
- display_name + phone are captured at signup into auth user_metadata so they
  survive email confirmation.
- The user_profiles row (user_id, display_name, phone, company_name, role) is
  created best-effort: immediately when signup returns a session, otherwise a
  one-time backfill in the auth callback after confirmation. A failed profile
  write never fails signup. Editing happens later on /dashboard/account.
- Phone number is profile information only. There is NO SMS/OTP/phone auth in
  this sprint; phone/SMS verification and MFA are future options.
```

Server-side auth rules:

```text
- All auth calls use the Supabase anon key via the SSR client (server.ts).
- Never use the service role key on the client; never expose secrets.
- Dashboard pages/actions auth-gate via supabase.auth.getUser() (per-page),
  unchanged by this work.
```

### Auth callback + email links

The `/api/auth/callback` route exchanges the one-time `code` for a session for
all email links (password recovery `?next=/reset-password`, email confirmation,
magic-link fallback). It is hardened against bad/expired links:

```text
- ?error / ?error_code on the callback  → redirect to /sign-in?status=...
    error_code=otp_expired → status=link_expired
    any other auth error   → status=auth_link_error
- exchangeCodeForSession fails / no code → /sign-in?status=auth_link_error
- `next` is validated: must start with "/" and not "//"; else /dashboard.
- Users never land on /?error=... with raw Supabase params.
```

Recovery `redirectTo` must be ABSOLUTE and built from `NEXT_PUBLIC_SITE_URL`
(`${SITE_URL}/api/auth/callback?next=/reset-password`). If `NEXT_PUBLIC_SITE_URL`
is missing the auth actions throw a clear developer error instead of sending a
broken relative link.

### Required Supabase Auth URL configuration

In the Supabase dashboard → Authentication → URL Configuration, the callback
must be listed under **Redirect URLs** (otherwise Supabase falls back to the
Site URL root and the link arrives as `/?error=...`):

```text
Local:
  http://localhost:3000/api/auth/callback

Production:
  https://1nha.online/api/auth/callback
  https://www.1nha.online/api/auth/callback   # if the www host is used
```

Set the **Site URL** to the production origin (e.g. `https://1nha.online`).

> If password recovery still redirects to the root with error params, the cause
> is almost always a missing/typo'd entry in Redirect URLs or a wrong Site URL —
> check Supabase Auth URL Configuration first.

### Stale refresh tokens

The proxy (`src/proxy.ts`) validates the session with `getUser()` on each
request. A missing/rotated refresh token is an EXPECTED condition (sign-out
elsewhere, old cookies). Known stale-session errors
(`refresh_token_not_found`, `invalid_refresh_token`,
`refresh_token_already_used`) are handled gracefully: the user is treated as
logged out, the `sb-*-auth-token` cookies are expired, and protected dashboard
routes redirect to `/sign-in`. Other auth errors are NOT suppressed. If a user
is somehow stuck, clearing site data removes the stale cookies.

### Phone-first auth + SMS OTP (Phase 3A.2)

Phone + SMS OTP is the **primary** sign-in UX; email/password remains a fully
working fallback (nothing was removed).

```text
Send OTP   -> sendPhoneOtp     normalizeVietnamesePhone() + signInWithOtp({ phone })
Verify     -> verifyPhoneOtp   verifyOtp({ phone, token, type: "sms" }) → session
Fallbacks  -> signInWithPassword / signUpWithPassword / forgot / reset (unchanged)
```

- **Normalization:** `src/lib/auth/phone.ts` (pure) maps VN input to E.164
  (`0936389336` / `84936…` / `+84936…` → `+84936389336`), strips spaces/dots/
  hyphens, rejects landlines + non-mobile with a Vietnamese error. Vietnam-only
  (+84); no country selector yet.
- **OTP lifecycle is Supabase's:** the app never generates, stores, or logs OTP
  codes/tokens. `verifyOtp` returns the session; cookies are set by the SSR
  client exactly like password login (so `/api/*` Bearer + cookie auth both keep
  working with the resulting access token).
- **Phone users with no email:** `verifyPhoneOtp` best-effort upserts a
  `user_profiles` row (`ignoreDuplicates` → never overwrites an existing one);
  the personal workspace is created by the existing `auth.users` trigger
  regardless of email (workspace name falls back to "Workspace cá nhân").
  `user_profiles` has no email column, so **no schema change was needed**.

#### Required Supabase dashboard setup (before phone login works)

```text
Authentication → Providers → Phone: ENABLE.
Authentication → Providers → Phone → SMS provider: configure one
  (Twilio / MessageBird / Vonage / Textlocal, or a custom Send-SMS hook later).
  → SMS provider secrets live in the Supabase dashboard, NEVER in NEXT_PUBLIC_* env.
Authentication → Rate limits: set OTP send/verify limits sensibly.
Test with a real Vietnamese mobile number (+84…).
Email/password remains the fallback and needs no extra config.
```

> Current phase uses **Supabase Phone Auth**. As of Phase 3A.3, OTP delivery is
> routed to a **Vietnam provider (eSMS)** via the **Supabase Send SMS Hook** —
> see below and `docs/SMS_OTP_PROVIDER_SETUP.md`.

### Vietnam OTP delivery via Send SMS Hook (Phase 3A.3)

Supabase still **generates and verifies** the OTP; it calls our endpoint only to
**deliver** it through a Vietnam provider. The app never generates/stores/
verifies/logs OTPs.

```text
Endpoint:  POST /api/auth/sms-hook   (nodejs runtime)
Auth:      shared secret SUPABASE_SEND_SMS_HOOK_SECRET
             header x-1nha-hook-secret (preferred) | ?secret= (fallback)
Payload:   { user:{ id, phone }, sms:{ otp } }   (Supabase Send SMS Hook contract)
Status:    200 sent · 401 bad secret · 400 bad payload · 502 provider failed ·
           500 provider/env misconfig
Provider:  src/lib/otp/send-otp.ts → providers/esms.ts (OTP_PROVIDER, default esms)
             ESMS_MODE = sms_only | zns_sms (Zalo ZNS → SMS fallback)
```

All provider secrets are server-only (never `NEXT_PUBLIC_*`). Supabase Auth rate
limits remain authoritative; no OTP logs table is added. The eSMS payload
specifics are isolated in `providers/esms.ts` and must be verified against eSMS
docs before production (use `ESMS_SANDBOX=1` to validate). Future providers
(Stringee/VIHAT/VietGuys/Zalo) plug in via the same abstraction.

## Service layer & mobile-ready API (Phase 3A)

Business logic lives in a server-only **service layer** that is the single
source of truth for both the web app (Server Actions / Server Components) and
the JSON API routes (future Expo mobile app). Phase 3A migrated the
**Properties** workflow only.

### Standard API envelope

```text
src/lib/api/responses.ts   jsonOk(data) / jsonError(err)
src/lib/api/errors.ts      ApiError + codes

success → { "ok": true,  "data": ... }
error   → { "ok": false, "error": { "code": "...", "message": "..." } }

codes (→ HTTP):
  UNAUTHORIZED 401 · FORBIDDEN 403 · NOT_FOUND 404 ·
  VALIDATION_ERROR 422 · INTERNAL_ERROR 500
```

Services THROW `ApiError`; route handlers `try/catch → jsonError(err)`; Server
Actions `try/catch → { error: toApiError(err).message }` (Vietnamese messages
preserved). `responses.ts` is the only piece that imports `next/server`, so the
service stays transport-agnostic.

### Request / workspace context

```text
src/lib/workspace/request-context.ts  (server-only)
  getRequestContext()     → { supabase, userId, organizationId, role } | throws
  tryGetRequestContext()  → same | null   (for Server Components that render a
                                            fallback instead of throwing)
```

Built on one Supabase server client (the user's RLS-scoped anon session — NO
service-role key). Workspace resolution is shared with Phase 2A via
`resolveWorkspaceForUser` in `src/lib/workspace/current.ts`.

### Properties service

```text
src/lib/services/properties.ts  (server-only)
  parsePropertyListParams(raw)            → typed filters/sort/page
  listProperties(ctx, params)             → { items, page, pageSize, hasNextPage }
  getPropertyById(ctx, id)                → PropertyRecord  (NOT_FOUND across orgs)
  createProperty(ctx, input)              → { id }
  updateProperty(ctx, id, input)          → void            (NOT_FOUND across orgs)
  archiveProperty(ctx, id)                → void            (NOT_FOUND across orgs)
  validatePropertyInput(input)            → throws VALIDATION_ERROR (Vietnamese)
```

- Organization-scoped: reads/writes match `organization_id = ctx.organizationId`
  (RLS is the backstop). For a solo broker this is identical to the previous
  `user_id` scoping. Inserts still set `user_id` (legacy) **plus**
  `organization_id` / `created_by` / `assigned_to`.
- Preserves Phase 1 pagination: `PAGE_SIZE = 50`, fetch `PAGE_SIZE + 1` →
  `hasNextPage` (no expensive COUNT). List select stays lightweight.
- Cross-org reads/writes return `NOT_FOUND`, never another workspace's data.

#### Numeric precision (decimal property fields)

Real estate values need decimals, so the service preserves them instead of
rounding to integers:

```text
- Decimal-safe parsing (validatePropertyInput → num()): accepts JS numbers and
  strings with a dot OR a Vietnamese comma decimal, tolerant of thousands
  separators — "32,8" → 32.8, "45,75" → 45.75, "1.234,5" → 1234.5. NaN /
  Infinity / non-finite → null (VALIDATION_ERROR for required price/area; never
  trusts client formatting). Shared by the web actions AND the /api routes.
- One shared rounding rule — `roundToDecimalPlaces(value, 5)` in
  `src/lib/format/price.ts` (rejects NaN/Infinity → NaN; callers guard):
    area / frontage / alley_width → rounded to 5 decimals on save
      (32,8123456789 → 32.81235 · 3,658912345 → 3.65891 · 2,35789999 → 2.3579)
    price       → the expressed UNIT (tỷ/triệu) is rounded to 5 decimals, THEN
      converted to integer raw VND ("8,123456789 tỷ" → 8.12346 tỷ → 8123460000)
    bedrooms / bathrooms → integer counts (rounded; no half-rooms)
  Long decimal input is accepted freely and rounded once, at save.
- Form inputs for area/frontage/alley_width are type="text" inputMode="decimal"
  so Vietnamese mobile keyboards can enter a comma or dot decimal (step="0.1"
  previously blocked 2-decimal values like 45.75). price stays a raw-VND number
  input. DB columns already store decimals — NO schema/RLS change.
- Display never mutates the stored value: formatVND shows up to 5 decimals in
  the expressed unit, trailing zeros dropped (8_650_000_000 → "8.65 tỷ",
  8_123_460_000 → "8.12346 tỷ", 850_123_460 → "850.12346 triệu"); area/frontage/
  alley render their stored value directly (32.81235 → "32.81235 m²").
- Quick Add parsers keep comma/dot decimals and the same rounding: the AI
  extractor reuses parseVietnamesePrice (price unit rounded to 5) and the
  service rounds area/frontage/alley to 5 on save, so a draft like
  "32,8123456789m2 … 8,123456789 tỷ" persists as 32.81235 / 8123460000.
- Filters use the same rules: price filters accept VN units + 5-decimal unit
  rounding; area filters accept long decimals rounded to 5; invalid → ignored
  (never a NaN query).
- DB columns: price stays integer raw VND (unchanged). area/frontage/alley_width
  must hold 5 decimals — migration `20240110000001_properties_decimal_scale.sql`
  is a conditional, introspecting DO block that widens ONLY numeric(scale<5)
  columns to numeric(14,5), leaves double precision / wide numeric untouched,
  and aborts if a column is integer (manual review). NO RLS/policy change.

#### Phase 3E — natural price input + filter parsing (one shared parser)

`src/lib/format/price.ts` is the single, PURE (isomorphic) home for all price +
number parsing, reused by the form, the quick-add extractor, the Properties
service, and the `/api/properties` routes (so web, API, and the future mobile
client never diverge):

```text
parseLooseNumber(s)      dot OR comma decimal, thousands-tolerant → number|null
parseVietnamesePrice(s)  "8 tỷ 650" / "850tr" / "3,5 tỷ" → integer VND | undefined
hasVietnamesePriceUnit(s) detects a tỷ/triệu/tr unit in the text
parsePriceToVnd(in)      VN expression / bare number / raw VND → integer VND | null
formatPriceForInput(vnd) raw VND → human-friendly editable string, ONLY when it
                         round-trips exactly (else raw VND — never lossy)
```

**Bare-number rule in the price field** (`parsePriceToVnd`, string input only —
a NUMBER argument is always raw VND for the API contract). A broker who types a
small number means tỷ; a number in the hundreds/thousands is genuinely
ambiguous (850 could be 850 **triệu** or 850 **tỷ**) and must never be silently
saved as an enormous tỷ value. Decided purely by the magnitude of the typed
value — **decimals included**:

```text
< 100         → tỷ (unit rounded to 5 decimals)
                "8" → 8_000_000_000 · "8.35" → 8_350_000_000 · "12.5" → 12_500_000_000
                "8.123456789" → 8.12346 tỷ → 8_123_460_000
                edge: "99.999999" rounds the unit to 100.00000 → 100_000_000_000
≥ 1_000_000   → raw VND ("8350000000" → 8_350_000_000; decimals → integer VND,
                "8350000000.7" → 8_350_000_001)
100 … 999_999 → AMBIGUOUS → null, INCLUDING decimals
                "850" / "850.5" / "999999.5" → null → the existing
                "Vui lòng nhập giá (VND) hợp lệ." validation; the broker adds an
                explicit unit ("850 triệu" / "8 tỷ 650").
```

The middle band is rejected (not silently saved wrong). Explicit unit
expressions and raw VND ≥ 1e6 are never affected. The "Giá (tỷ)"-labelled list
FILTERS keep their own rule (bare number = tỷ; see `parsePriceFilterTy`) — they
do NOT use `parsePriceToVnd`, so a bare filter value stays tỷ per its label.

- **Manual price input** is a free-form text field — `type="text"` with **no
  `inputMode`** at all (and no pattern/step/min/max). `inputMode="decimal"` /
  `"numeric"`, and even `"text"` on some mobile browsers, coerce a numeric
  keypad that cannot type "tỷ"/"triệu"/"tr"; omitting `inputMode` lets the
  device show the full text keyboard. Helper copy: "Có thể nhập: 8 tỷ 650, 8.65
  tỷ, 850 triệu…". Brokers no longer type raw VND. `validatePropertyInput` runs
  `parsePriceToVnd`, so create/edit/quick-add/API all normalise to the
  **unchanged raw-VND** stored convention (never text). The decimal dimension
  fields (area/frontage/alley_width) DO keep `inputMode="decimal"`.
- **Edit prefill** shows the stored price human-friendly ("8.65 tỷ") only when
  it round-trips to the exact same VND; odd amounts stay raw VND — zero data loss.
- **List filters** accept decimals + units and fail gracefully (invalid → filter
  ignored, never a NaN query). Price filters stay in **tỷ** (existing "Giá (tỷ)"
  UI + `price_min * 1e9` query): a unit expression ("850 triệu") is converted to
  tỷ, a bare number is treated as tỷ. Area filters accept comma/dot decimals.
  The filter inputs became `type="text" inputMode="decimal"`.
- No DB/RLS/schema change (price stays raw VND); the duplicate parser that lived
  in `extract-property.ts` now re-exports from this module (no divergence).
- Display is unchanged from Phase 3D: `formatVND` preserves decimals
  ("8.65 tỷ", "850.5 triệu") and never mutates the stored value; the content
  prompt mapping already uses `formatVND`, so generated content is unaffected.

### Properties API routes (web + future Expo)

```text
GET    /api/properties              list (query params = same as the web URL)
POST   /api/properties              create
GET    /api/properties/[id]         fetch one
PATCH  /api/properties/[id]         update
POST   /api/properties/[id]/archive archive
```

All authenticated + organization-scoped, paginated by default, same service as
the web actions. Verified: unauthenticated requests return
`401 { ok:false, error:{ code:"UNAUTHORIZED" } }`.

**Service/API coverage:** Phase 3A covers Properties, 3B-1 Property Images,
3B-2 Style Profiles, 3B-3 Generated Content + AI generation, and 3C the
Post Assistant (manual posting workflow) — all below. The full broker workflow
now has a shared service + mobile-ready API. Vietnam SMS OTP provider
integration remains **paused** until provider credentials are finalized; social
OAuth is still not needed; there is **no auto-posting**. No mobile app yet.

### Property Images service + API (Phase 3B-1)

`src/lib/services/property-images.ts` is the shared, server-only home for
property-image business logic — consumed by both the web Server Actions
(`.../images/actions.ts`) and the new image API routes, so web and the future
Expo client run the same code.

```text
listPropertyImages(ctx, propertyId, { variant })           cover→sort_order→created_at; excludes pending
getPropertyImage(ctx, propertyId, imageId, { variant })    single resource; excludes pending
requestPropertyImageUpload(ctx, propertyId, input)         R2 presigned PUT (single file) + pending row
requestPropertyImageUploadTargets(ctx, propertyId, input)  R2 presigned PUTs (processed main + thumbnail)
finalizePropertyImageUpload(ctx, propertyId, { imageId })  mark row ready (mirror original_key → storage_path)
updatePropertyImage(ctx, propertyId, imageId, input)       edit caption / alt_text
deletePropertyImage(ctx, propertyId, imageId)              delete object(s) + row
setPropertyCoverImage(ctx, propertyId, imageId)            clear covers, set this one
```

- **Organization-aware through the parent property:** every call first verifies
  the property is in `ctx.organizationId`, then scopes image queries by
  `property_id`. RLS `property_images_member_all` (scoped through the property's
  org) is the backstop, so a guessed cross-org property/image id resolves to
  `NOT_FOUND` — never a leak.
- **Storage stays in one place:** the service delegates all signing/PUT/delete
  to `src/lib/storage/property-media.ts`. Both providers preserved — Cloudflare
  R2 (new uploads) and legacy Supabase Storage (existing rows). Pending rows
  (`__pending__` / `__r2_pending__`) are excluded from every read.
- **Thumbnails by default:** list/gallery resolve `variant:"thumbnail"`; full
  originals are only signed when a caller explicitly asks (`?variant=original`).
- The public `PropertyImageItem` returns metadata + a short-lived signed `url`
  only — raw storage paths / R2 object keys are never serialized.

```text
GET    /api/properties/[id]/images                       list (?variant=thumbnail|original, default thumbnail)
POST   /api/properties/[id]/images/upload-targets        presign processed main+thumbnail PUTs (step 1)
POST   /api/properties/[id]/images/finalize              mark upload ready (step 2)  { imageId }
POST   /api/properties/[id]/images/reorder               set order  { orderedImageIds } (sort_order=index)
PATCH  /api/properties/[id]/images/[imageId]             update caption / alt_text
DELETE /api/properties/[id]/images/[imageId]             delete image
POST   /api/properties/[id]/images/[imageId]/cover       set as cover
```

Same `getRequestContext()` auth (cookie + Bearer), same `{ ok, data }` /
`{ ok, error }` envelope. The upload flow is unchanged end to end: client
processes the image → `/upload-targets` returns presigned R2 PUT URLs → browser
PUTs bytes directly to R2 → `/finalize`. Validation throws `VALIDATION_ERROR`
(HTTP **422**, the established envelope status) for bad UUID/MIME/size; missing
or cross-org ids return `NOT_FOUND` (404); unauthenticated returns 401.
Verified: every image route returns `401 { ok:false, error:{code:"UNAUTHORIZED"} }`
without a session. No service-role key and no R2/storage secrets are ever
exposed — only short-lived signed URLs.

### Style Profiles service + API (Phase 3B-2)

`src/lib/services/style-profiles.ts` is the shared, server-only home for
content-style-profile ("Văn phong") logic — consumed by both the web Server
Actions (`.../style-profiles/actions.ts`) and the new style-profile API routes,
so web and the future Expo client run the same code.

```text
listStyleProfiles(ctx, { platform? })             org-scoped; default first → newest; { profiles, defaultProfileId }
getStyleProfile(ctx, id)                          single resource (incl. sample_text); NOT_FOUND across orgs
getDefaultStyleProfile(ctx)                        the org's default profile, or null
createStyleProfile(ctx, input)                    validate → AI analyze sample → insert (style_rules JSONB)
updateStyleProfile(ctx, id, input)                edit name / description / is_default
setDefaultStyleProfile(ctx, id)                   clear org default, set this one
deleteStyleProfile(ctx, id)                       org-scoped delete
```

- **Organization-scoped:** all reads/writes filter by `ctx.organizationId`;
  RLS `content_style_profiles_member_all` (org-membership) is the backstop, so a
  guessed cross-org id resolves to `NOT_FOUND` — never a leak. Inserts set
  `user_id` (legacy, kept for the existing own-RLS policies) + `organization_id`
  + `created_by`.
- **One default per org:** setting a default clears the org's previous default
  first, then sets the target — achieved purely in service logic (no schema
  change; the legacy per-user partial unique index remains).
- `style_rules` is produced by `analyzeContentStyle()` and stored as JSONB; it
  is NOT user-editable, so no client-supplied JSON is trusted. Editable inputs
  are `name` (required, ≤100), `description` (optional, ≤2000), `platform`
  (whitelist), `sample_text` (required, ≤20000). The public payload omits
  `user_id` / `organization_id` / `created_by`; `sample_text` is returned only
  on the single-resource read, not in lists.

```text
GET    /api/style-profiles            list  → { profiles, defaultProfileId }
POST   /api/style-profiles            create (analyzes sample) → { profile }
GET    /api/style-profiles/[id]       fetch one → { profile }
PATCH  /api/style-profiles/[id]       update → { profile }
DELETE /api/style-profiles/[id]       delete → { id }
POST   /api/style-profiles/[id]/default  set default → { profile, defaultProfileId }
```

Same `getRequestContext()` auth (cookie + Bearer), same `{ ok, data }` /
`{ ok, error }` envelope. Validation throws `VALIDATION_ERROR` (HTTP **422**,
the established envelope status); missing/cross-org ids return `NOT_FOUND`
(404); unauthenticated returns 401. Verified: every style-profile route returns
`401 { ok:false, error:{code:"UNAUTHORIZED"} }` without a session.

**Content-generation compatibility:** the generate page/action still read +
select style profiles and pass `style_rules` to the AI prompt exactly as
before. Generation itself is migrated in **Phase 3B-3** (below).

### Generated Content service + API (Phase 3B-3)

`src/lib/services/generated-content.ts` is the shared, server-only home for
generated-content + AI content-generation logic — consumed by both the web
Server Actions (generate / edit / notes / archive) and the new generated-content
API routes, so web and the future Expo client run the same code. It **depends
on** the Properties service (org-scoped property access) and the Style Profiles
service (org-scoped voice lookup).

```text
listGeneratedContents(ctx, { platform?, status?, q?, limit? })   org-scoped; { contents, nextPage }
listPropertyGeneratedContents(ctx, propertyId, { status?, limit? })  property-scoped; { contents }
getGeneratedContent(ctx, contentId)                              single resource
getGeneratedContentForProperty(ctx, propertyId, contentId)       single, property-scoped
generateContentForProperty(ctx, propertyId, input)              build prompt → AI → persist
regenerateGeneratedContent(ctx, contentId, input?)             new variation (parent_content_id)
updateGeneratedContent(ctx, contentId, { content?, title?, notes? })  edit; sets edited_at on body change
archiveGeneratedContent(ctx, contentId)                          status = 'archived'
```

- **Organization-scoped:** reads/writes filter by `ctx.organizationId`; RLS
  `generated_contents_member_all` is the backstop. Property access is verified
  via `getPropertyById` and a selected style profile via `getStyleProfile`, so a
  guessed cross-org property / content / style-profile id resolves to
  `NOT_FOUND` — never a leak. Inserts set `user_id` (legacy) + `organization_id`
  + `created_by`.
- **AI behaviour unchanged:** `buildPropertyPrompt` + the `"tone:<id>"` /
  `"style:<id>"` voice resolution are byte-for-byte the same; a selected style
  profile's `style_rules` are injected exactly as before and sample text is
  never sent verbatim. `prompt_used` is stored but **never** returned to clients,
  and `user_id` / `organization_id` / `created_by` are omitted from payloads.
- **No AI on reads:** list/get never call the model. Generation/regeneration are
  the only AI calls and keep the existing honest pending UX (no fake instant
  completion).

```text
GET    /api/generated-contents                          list → { contents, nextPage }
GET    /api/generated-contents/[id]                     fetch → { content }
PATCH  /api/generated-contents/[id]                     update → { content }
POST   /api/generated-contents/[id]/regenerate          new variation → { content }
POST   /api/generated-contents/[id]/archive             archive → { id, archived: true }
GET    /api/properties/[id]/generated-contents          property list → { contents }
POST   /api/properties/[id]/generated-contents/generate generate → { content }
```

Same `getRequestContext()` auth (cookie + Bearer), same `{ ok, data }` /
`{ ok, error }` envelope. Validation throws `VALIDATION_ERROR` (HTTP **422**);
missing/cross-org ids return `NOT_FOUND` (404); unauthenticated returns 401.
Verified: every generated-content route returns
`401 { ok:false, error:{code:"UNAUTHORIZED"} }` without a session. No OpenAI /
provider secrets or service-role key are ever exposed. The web generate page,
content detail page, "Giọng văn" selection, and prompt strategy are unchanged;
the `/dashboard/content` list now reads through the service. Post Assistant
status actions move to the Post Assistant service in **Phase 3C** (below).

### Post Assistant service + API (Phase 3C)

`src/lib/services/post-assistant.ts` is the shared, server-only home for the
**manual** posting-helper workflow — consumed by the web Server Actions
(mark copied / scheduled / posted) and the new Post Assistant API routes.

> **Manual workflow only.** Post Assistant prepares post text, returns signed
> image URLs, and records the broker's copied/scheduled/posted intent. It does
> **NOT** post to Facebook / Zalo / TikTok, store social tokens, automate a
> browser, scrape, or call any social API. There is no auto-posting anywhere.

```text
getPostAssistantPackage(ctx, contentId, { includeImages? })          content + property summary + thumbnails + posting
getPostAssistantPackageForProperty(ctx, propertyId, contentId, ...)  property-scoped variant
getPostAssistantImageUrls(ctx, contentId, { imageIds, variant })     explicit signed URLs (only way to get originals)
markContentCopied(ctx, contentId)                                    sets copied_at
markContentScheduled(ctx, contentId, { scheduledAt })                status = 'scheduled'
markContentPosted(ctx, contentId, { postedAt, channelName, postUrl }) status = 'posted'
```

- **Composition, not duplication:** content access is verified via the
  Generated Content service, parent-property access via the Properties service,
  and image URLs via the Property Images service / `property-media` abstraction —
  so storage signing stays in one place. All reads are org-scoped; cross-org /
  unknown / archived ids resolve to `NOT_FOUND`.
- **Thumbnails by default:** the package signs only thumbnail URLs. Originals
  are returned **exclusively** by `image-urls` with `variant:"original"`, and
  only for image ids that belong to the content's property (others → 404), so
  clients never pull full-resolution images on screen load.
- **No leakage:** payloads expose only the content body/metadata, a public
  property summary (no owner/planning notes), thumbnail URLs, and posting
  status. `prompt_used`, raw R2 keys / Supabase paths, storage secrets, and
  `user_id` / `organization_id` / `created_by` are never returned. No AI is
  called anywhere in Post Assistant.

```text
GET  /api/generated-contents/[id]/post-assistant             package (thumbnails)
POST /api/generated-contents/[id]/post-assistant/image-urls  { imageIds, variant? } → signed URLs
POST /api/generated-contents/[id]/post-assistant/copied      mark copied  → { posting }
POST /api/generated-contents/[id]/post-assistant/scheduled   { scheduledAt? } → { posting }
POST /api/generated-contents/[id]/post-assistant/posted      { postedAt?, channelName?, postUrl? } → { posting }
GET  /api/properties/[id]/generated-contents/[contentId]/post-assistant   property-scoped package
```

Same `getRequestContext()` auth (cookie + Bearer), same `{ ok, data }` /
`{ ok, error }` envelope. Validation throws `VALIDATION_ERROR` (HTTP **422**);
missing/cross-org/archived ids return `NOT_FOUND` (404); unauthenticated returns
401. Verified: every Post Assistant route returns
`401 { ok:false, error:{code:"UNAUTHORIZED"} }` without a session. The web Post
Assistant page, copy/open/download/share behaviour, and mark-posted UI are
unchanged (the mark actions now delegate to this service).

### Org-read alignment + API smoke (Phase 3D)

Hardening pass before Team UI. The remaining dashboard Server-Component reads
that still filtered by `user_id` now go through the org-scoped service layer, so
team access becomes correct (solo behaviour unchanged; cross-org → `NOT_FOUND`):

- `dashboard` stat counts → `organization_id` (via `tryGetRequestContext`).
- properties **list** thumbnails → org-scoped `property_id IN (...)` + RLS (no
  `user_id`); **detail** → `listPropertyImages` + `listPropertyGeneratedContents`.
- generate / edit / images / per-property content pages → `getPropertyById`,
  `listStyleProfiles`, `listPropertyImages`, `listPropertyGeneratedContents`.
- content detail + Post Assistant pages → `getGeneratedContentForProperty`,
  `getStyleProfile`, `getPropertyById`, `listPropertyImages` (the Post Assistant
  page still signs thumbnails for the grid + originals for actions, unchanged).
- style-profile list/detail → `listStyleProfiles` / `getStyleProfile`.

Intentionally still `user_id`-scoped (justified): `account` (`user_profiles` is
personal metadata), `api/auth/callback` (auth identity), and the legacy
Supabase-Storage `uploadPropertyImage` fallback action.

**Authenticated smoke test:** `scripts/smoke-authenticated-api.mjs`
(`npm run smoke:api`) signs in via the Supabase anon client, then calls the core
APIs with a Bearer token. Read-only by default (no OpenAI, no archive, no
scheduled/posted); the token is never printed; only the anon key is used. See
`docs/PHASE_3D_SMOKE_TESTS.md`.

**Next:** **Phase 4 — Team UI MVP** (workspace settings, members, invites,
roles). Vietnam SMS OTP provider stays paused; social OAuth still not needed; no
auto-posting.

### Team / Workspace UI (Phase 4A)

First Team UI on top of the Phase 2A org foundation. No change to existing
tables or RLS policies; one additive migration
(`20240111000001_organization_invites.sql`). Entry point is a **"Không gian làm
việc"** card under Account → `/dashboard/account/workspace` (no new bottom-nav
tab — secondary features stay inside the 5 main tabs).

**Workspace page** (`getCurrentWorkspaceDetails` / `listOrganizationMembers` /
`listOrganizationInvites` in `src/lib/services/workspace.ts`):

- Overview: workspace name, type (Cá nhân/Nhóm/Công ty), current user role,
  active member count, created date.
- **Rename** (owner/admin only): updates `organizations.name`; RLS
  `organizations_update_manager` (Phase 2A) is the backstop — no new policy.
- **Members list**: id/role/status/joined plus email + display_name + phone.
  Other users' email (auth.users) and profile (user_profiles) are RLS-hidden, so
  the roster comes from `list_organization_members(org_id)` — a SECURITY DEFINER
  RPC gated on `is_organization_member`. Role labels: owner=Chủ sở hữu,
  admin=Quản trị, member=Thành viên.
- **Invite by link** (owner/admin): email + role (member/admin, default member).
  No email is sent — `createOrganizationInvite` returns an unguessable token and
  the client builds a `/invite/<token>` link to copy and forward (Zalo/email).
  Pending invites can be copied again or revoked.

**Invite storage + accept** (`organization_invites`):

```text
id, organization_id, email, role(admin|member), token(unique),
invited_by, status(pending|accepted|revoked|expired), expires_at(+7d),
created_at, accepted_at, accepted_by
```

- RLS: managers (`can_manage_organization`) select/insert/update their org's
  invites. Token-based preview/accept do NOT go through table RLS — they use
  gated SECURITY DEFINER RPCs so a not-yet-member holding the token can act on
  exactly one invite without seeing the table.
- `/invite/[token]` page (outside the dashboard layout, NOT matched by
  `src/proxy.ts`): signed-out → sign-in CTA (link stays valid to reopen);
  signed-in → `get_organization_invite(token)` preview, then
  `accept_organization_invite(token)` which is the **single controlled
  membership write** (mirrors Phase 2A `ensure_personal_organization`). It adds
  the caller with the invited role, enforces email match for email accounts
  (phone-only accounts accept on the token alone), can never grant `owner`, and
  never downgrades an existing member. On success → workspace page.

**Permissions:** owner/admin can view + rename + invite + revoke; member can
view only (rename is read-only, invite card explains the restriction). No
service-role key anywhere.

**Deferred to 4A.2:** change member role / remove member (no member
UPDATE/DELETE policy yet — the page shows a note); `?next=` redirect after
sign-in for the signed-out invite path; workspace switcher; real email delivery.

### Property team assignment (Phase 4B)

Activates the Phase 2A `properties.created_by` / `properties.assigned_to`
columns in the UI — no schema or RLS change. Org scoping is unchanged: every
active member sees the full workspace inventory.

**Assignee context.** `buildAssigneeContext(ctx)` / `listAssignableMembers(ctx)`
(workspace service) reuse the gated `list_organization_members` RPC to return
active members with resolved labels (display name → email → phone). The
serializable `AssigneeContext` (`src/lib/workspace/assignee.ts`, a non-server
module so client components can import the type) carries `{ currentUserId, canAssignOthers, members[] }` down to the property form.

**Form field "Người phụ trách"** lives in the shared `PropertyFields`, so it
appears identically in manual create, quick-add review, and edit. Owner/Admin
get an editable select (Chưa phân công + Tôi phụ trách + each member); a Member
gets a read-only display + hidden input (cannot reassign). A historical
ex-member assignee stays selectable so saving never silently unassigns.

**Service validation (the real boundary — covers `/api/properties` too).**
`createProperty` defaults `assigned_to` to the creator when omitted;
`updateProperty` resolves it only when supplied (reads the current assignee
first). `resolveAssignee` enforces: the target must be an active org member
(`isActiveMember`, else VALIDATION_ERROR); Owner/Admin may set anyone or null;
a Member may only set themselves or keep the current value (else FORBIDDEN).

**List + detail.** `LIST_COLUMNS` and `PropertyListItem` gained `assigned_to`;
cards show "Phụ trách: Bạn / <tên> / Chưa phân công"; the detail page adds
"Người tạo" + "Người phụ trách". Ids resolve to labels via the roster
(self → "Bạn", null → "Chưa phân công", ex-member → "Không rõ"). created_by is
shown only on detail to keep cards uncluttered.

**Filters.** `parsePropertyListParams` + `listProperties` gained `scope`
(`all` | `created_by_me` | `assigned_to_me` | `unassigned`) and `assigned_to`
(UUID-validated; an explicit member id supersedes scope). All clauses stay
within `organization_id`, COUNT-free pagination (PAGE_SIZE + 1) is preserved,
and a malformed `assigned_to` is ignored rather than crashing.

**Deferred to 4C:** deeper per-property access control, a Member reassigning a
colleague's source, member role changes/removal, workspace switcher.

### Team permissions hardening (Phase 4C)

MVP permission model so a small team can share a workspace safely. **The service
layer is the permission boundary** — every web Server Action and JSON API route
funnels through the same services, so there are no UI-only or client-trusted
checks. No schema or RLS change.

**Model.** Visibility: all active members READ the full workspace inventory.
Management: Owner/Admin manage everything; a Member manages a property only when
`created_by = them` OR `assigned_to = them`. Assignment-to-others stays
Owner/Admin-only (Phase 4B `resolveAssignee`).

**One helper module** — `src/lib/workspace/permissions.ts`:
`isWorkspaceManager`, `canManageProperty` (+ intent aliases `canEditProperty` /
`canArchiveProperty` / `canManagePropertyImages` / `canManageGeneratedContent`),
`canAssignPropertyToOthers`, and `assertCanManageProperty` (throws FORBIDDEN).
`canManageProperty` is the single predicate; the aliases keep call sites
readable and the rule un-duplicated.

**Service enforcement** (FORBIDDEN when a Member oversteps; NOT_FOUND preserved
for cross-org / missing):

- **properties**: `updateProperty` + `archiveProperty` fetch the row, assert
  `canEdit/canArchive`, then proceed. `getManageableProperty(ctx, id)` =
  `getPropertyById` + `assertCanManageProperty` — the shared gate reused by the
  content + post-assistant services. `createProperty` stays open to all active
  members (creator becomes `created_by`/`assigned_to`).
- **property-images**: a new `requireManageablePropertyInOrg` guard replaces the
  org-only `requirePropertyInOrg` on every MUTATION (request/finalize upload,
  update meta, delete, set cover, reorder). Reads (`list`/`get`) stay org-only —
  images remain visible to all members.
- **generated-content**: `runGeneration` (generate + regenerate),
  `updateGeneratedContent`, `archiveGeneratedContent` call `getManageableProperty`
  on the parent. Reads/lists unchanged.
- **post-assistant**: `markContentCopied/Scheduled/Posted` call
  `requireManageableContentParent` (resolves the content's property, then
  `getManageableProperty`). Read package + image URLs stay open.

**UI** mirrors the services: property detail hides edit/archive/generate behind a
read-only note; edit + generate pages render a friendly forbidden block; the
images page + `ImageCard` go read-only (upload/cover/delete/caption hidden);
content detail + post pages hide edit/archive/mark/regenerate for non-managers
(copy-to-clipboard + viewing stay open). `src/components/property/manage-notice.tsx`
holds the shared `ReadOnlyNote` / `ManageForbidden` components.

**RLS posture (reviewed, unchanged).** The Phase 2A `*_member_all` policies
grant any active member full CRUD, so **RLS remains the organization boundary**
and the **service layer is the per-property boundary**. Tightening RLS to
creator/assignee/role would need role lookups + parent-property joins inside
every policy (properties, images-via-parent, content) — higher risk, deferred.

**Deferred to 4D:** member role change / remove member (no `organization_members`
UPDATE/DELETE policy yet); DB-level per-property RLS; per-property ACL tables;
workspace switcher; real email invite; audit log.

### RLS hardening + member management (Phase 4D)

Makes RLS a **defensive backstop** for the Phase 4C model (the service layer
stays primary) and adds owner-driven member management. One migration:
`20240112000001_phase4d_rls_member_management.sql`.

**Row-manage helpers** (no policy recursion — they delegate to the Phase 2A
membership definers `is_organization_member` / `can_manage_organization`, which
already bypass RLS):

- `can_manage_property_row(org, created_by, assigned_to)` — pure predicate: true
  for Owner/Admin, or an active member who created / is assigned the row.
- `can_manage_property(property_id)` — **SECURITY DEFINER** (reads
  `public.properties` directly, never the child table that calls it → no
  recursion). Used by `property_images` + `generated_contents` policies.
- `can_manage_generated_content(org, property_id, created_by)` — parent-property
  rule, with an orphan fallback (no `property_id` → Owner/Admin or the creator).

**Policy split.** The broad Phase 2A `*_member_all` (FOR ALL) policies on
`properties` / `property_images` / `generated_contents` / `content_style_profiles`
are dropped and replaced with:

```text
SELECT  -> every active org member (visibility stays org-wide)
INSERT  -> active member (content: must manage the parent property)
UPDATE  -> Owner/Admin, or the row's creator/assignee (property-derived)
DELETE  -> same management rule
style profiles UPDATE/DELETE -> Owner/Admin (creator covered by the kept own-policy)
```

The Phase 2A FOR-ALL `user_id` policies (`*_own_user`, `*_*_own`) are **replaced
by a SELECT-only `*_select_own` net**. Their old `WITH CHECK` was just
`user_id = auth.uid()` (no `organization_id`), so a member could INSERT a row into
ANOTHER org by setting `organization_id` explicitly — the write side is dropped;
INSERT/UPDATE/DELETE now always require org membership + the manage rule. The
kept SELECT-only net only ever surfaces a user's own rows (cannot leak) and
prevents a read lockout on any legacy null-`organization_id` row.

**Service-vs-RLS nuances (service is authoritative; documented intentionally):**

- A Member reassigning `assigned_to` to *another* user is blocked by the service
  (`resolveAssignee`), not RLS (the WITH CHECK passes because `created_by=self`).
- INSERT assignee validation stays in the service (RLS only checks membership).
- `generated_contents` orphan rows (no `property_id`) — historical only; the app
  always sets `property_id`. Such a row is manageable by Owner/Admin or its
  creator (`created_by`) via `can_manage_generated_content`.
- **CAVEAT:** the base `properties` / `generated_contents` tables were created in
  the Supabase dashboard and may carry dashboard-authored policies this migration
  cannot drop by name. Audit `pg_policies` after deploy (query in the migration
  header) and drop any leftover broad / write-enabling user_id FOR-ALL policy.

**Member management.** `organization_members` still has no broad write policy;
role changes + removals flow through two **owner-gated SECURITY DEFINER RPCs**
(the single controlled membership write, mirroring `accept_organization_invite`):

- `update_organization_member_role(member_id, 'admin'|'member')` — owner-only;
  refuses to touch an `owner` row (owner transfer deferred → also blocks
  last-owner demotion); can never grant `owner`.
- `remove_organization_member(member_id)` — owner-only soft remove
  (`status='removed'`, so `is_organization_member` / `resolveWorkspaceForUser`
  stop seeing them); refuses to remove the last active owner.

Service: `workspace.updateOrganizationMemberRole` / `removeOrganizationMember`
(re-check Owner up front, map RPC exceptions → ApiError). Style profiles gained a
`requireManageableProfileInOrg` guard (creator OR Owner/Admin) on
update/delete/setDefault. UI: `members-section.tsx` gives the Owner a per-member
role select + remove (owner rows protected, last owner cannot be removed); Admin
and Member see a read-only roster. A removed member's assigned properties are
**not** auto-reassigned (manual, as in Phase 4B).

**Deferred past 4D:** workspace switcher; per-property ACL tables; audit log;
real email delivery; owner-transfer flow; member-management JSON API routes.

### API authentication contract (Phase 3A.1)

`getRequestContext()` authenticates from **two** sources, both validated
server-side via `supabase.auth.getUser()` (never a local JWT decode):

```text
1. Authorization: Bearer <supabase_access_token>   ← non-browser clients (Expo)
2. Supabase session cookies                         ← the web app (default)
```

- **Strict Authorization precedence** (Phase 3A.1 correction):
  - Header **absent** → cookie/session auth (web app default).
  - `Authorization: Bearer <token>` → Bearer auth.
  - Header **present but malformed** (wrong scheme, empty, or no token) →
    `UNAUTHORIZED` immediately — it does **NOT** fall back to cookies.
  - `Bearer <invalid/expired token>` → `UNAUTHORIZED` (rejected by `getUser()`).
    Cookie fallback happens **only** when the Authorization header is absent.
    The header is read via `next/headers`, so the helper keeps a stable signature
    across route handlers, Server Components, and Server Actions (no `NextRequest`
    threading).
- The Bearer path uses `createBearerClient(token)` (`src/lib/supabase/server.ts`):
  the public **anon** key with the token as a global `Authorization` header, so
  both auth validation and every DB/Storage call run AS that user — RLS-scoped
  exactly like the cookie session. No session is persisted; **no service-role
  key** is ever used.
- `/api/*` routes are NOT matched by the proxy (`src/proxy.ts` matcher is
  `/dashboard/:path*` + `/sign-in`); each route self-authenticates through the
  service context. This prepares the backend for an Expo/mobile client — **no
  mobile app exists yet.**

#### Manual API auth tests

```bash
# 1. Unauthenticated → 401 standard envelope
curl -i https://<host>/api/properties
# → { "ok": false, "error": { "code": "UNAUTHORIZED", "message": "..." } }

# 2. Bearer token (future mobile client) → 200 success envelope
curl -i https://<host>/api/properties \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>"
# → { "ok": true, "data": { "items": [...], "page": 1, "pageSize": 50, "hasNextPage": false } }

# 3. Invalid/expired Bearer token → 401 (validated server-side, never trusted)
curl -i https://<host>/api/properties -H "Authorization: Bearer invalid.token"

# 4. Malformed Authorization header → 401 (strict: NO cookie fallback)
curl -i https://<host>/api/properties -H "Authorization: Invalid token"
```

Obtain a real `<SUPABASE_ACCESS_TOKEN>` for testing by signing in via the
Supabase JS client and reading `session.access_token` (e.g. in browser devtools
after login: `JSON.parse(localStorage[Object.keys(localStorage).find(k=>k.endsWith('-auth-token'))]).access_token`),
or from a `signInWithPassword` response. **Never commit real tokens.**
The cookie path is exercised by simply using the web app while signed in.

## Property Flow

Property inventory is the core object.

Main property workflow:

```text
Manual create or Quick Add
→ Save property
→ Upload images
→ Generate AI content
→ Edit generated content
→ Use Post Assistant
→ Mark posted
```

Property image rules:

```text
- Prefer cover image first.
- Then sort_order ascending.
- Then created_at ascending.
- Exclude storage_path = "__pending__".
- Do not use full-size original images as thumbnails if thumbnail support exists.
```

## Content Flow

AI content is treated as a draft, not final truth.

Workflow:

```text
Generate AI content
→ Save as draft
→ User edits text
→ User copies or uses Post Assistant
→ User manually posts
→ User marks content as posted
```

Generated content statuses:

```text
draft
scheduled
posted
archived
```

Archived content should generally be read-only.

## Style Profile Flow

Users can create writing style profiles by pasting sample posts.

Style profile flow:

```text
User pastes sample posts
→ AI analyzes writing style
→ Save style_rules
→ User chooses style profile when generating content
→ AI writes content using style_rules
```

Rules:

```text
- Do not fine-tune a model.
- Do not copy sample posts verbatim.
- Use style profiles only for tone, structure, formatting, emoji usage, CTA style, and rhythm.
- Do not pass sample_text to generation if style_rules are enough.
```

## AI Generation Rules

When generating real estate content:

```text
Use only property fields available in the database.
Do not invent missing facts.
Do not invent legal status, road width, exact address, planning info, owner info, direction, frontage, price, area, bedrooms, bathrooms, or other missing details.
If data is missing, omit it or write neutrally.
```

## Post Assistant

Post Assistant is not auto-posting.

It prepares:

```text
- Edited content text
- Selected property images
- Platform suggestion
- Posting checklist
- Mark posted form
```

Supported actions:

```text
- Copy post text
- Select images
- Download/open/copy images if browser supports it
- Mark content as posted
```

Do not implement social auto-posting unless explicitly requested and legally/technically reviewed.

## Media Direction

Current state (implemented):

```text
Cloudflare R2  → main store for NEW property image uploads
Supabase Storage ("property-images") → legacy fallback for existing images
Supabase/Postgres → metadata source of truth (property_images table)
```

New uploads go to Cloudflare R2 via presigned PUT URLs (S3-compatible, AWS SDK
v3). Existing rows remain on Supabase Storage and keep working unchanged — old
files are NOT migrated in this sprint. Each `property_images` row records where
its bytes live via `storage_provider` (`'supabase' | 'cloudflare_r2'`):

- R2 rows store `original_key` + `thumbnail_key` (`preview_key` reserved for
  later) and mirror `original_key` into `storage_path` once finalized for
  backward compat.
- Supabase rows keep their original `storage_path`.

Future (later sprints): Cloudflare Images transforms, Cloudflare Stream video.
Not implemented here.

### Client-side image processing (new uploads)

New property image uploads are processed **in the browser** before any bytes
leave the device (`src/lib/images/client-image-processing.ts`, client-only).
From a single selected photo the browser produces two JPEGs and uploads both
directly to R2 via separate presigned PUT URLs:

```text
Main (social-ready) image  → original_key
  - max long edge 2048px, quality 0.86, JPEG
  - used for open / download / copy / social posting
  - NOT a tiny thumbnail — brokers post this to Facebook/Zalo/TikTok

Thumbnail image            → thumbnail_key
  - max long edge 480px, quality 0.72, JPEG
  - used only for fast in-app previews (property list, gallery, detail)
```

Flow: select file → `createMainAndThumbnailImages(file)` →
`requestProcessedPropertyImageUpload` (presigns both PUTs, inserts a pending
row with both keys + `width`/`height` + size fields) → browser PUTs main → PUTs
thumbnail → `finalizePropertyImageUpload` (mirrors `original_key` into
`storage_path`). Raw input is capped at 20 MB before processing; the server
re-validates the processed sizes (main ≤ 4 MB, thumbnail ≤ 700 KB) and MIME
types. Aspect ratio is preserved, transparent areas get a white background
before JPEG conversion, and EXIF orientation is applied so phone photos are not
rotated. Supabase Storage legacy rows still work unchanged.

### Optional images in the create-property form (one flow, two safe steps)

`/dashboard/properties/new` lets the broker select images **inside** the "Thêm
căn mới" form (section "Hình ảnh căn nhà", optional). To the user it is one
flow — fill fields + pick images → "Tạo bất động sản" → property is created →
images upload → redirect. Technically it stays the **same safe two-step flow**
as the gallery upload; no image bytes ever pass through the property-create
Server Action:

```text
1. createPropertyWithImages(formData) → { ok, propertyId }   (fields only)
   - a no-redirect sibling of createProperty(); returns the new id so the
     client can keep orchestrating instead of redirecting immediately.
2. if images selected → uploadPropertyImagesToR2(propertyId, files):
     per image: createMainAndThumbnailImages → request presigned R2 targets →
     PUT main + thumbnail directly to R2 → finalize row   (bytes never hit the
     Server Action — identical direct-to-R2 architecture as the images page)
3. redirect:
     no images / all uploaded → /dashboard/properties/[id]
     some uploads failed      → /dashboard/properties/[id]/images?upload=partial
```

Key behaviours:

```text
- The property is NEVER rolled back if an image upload fails. The broker has
  already entered the source; a friendly notice on the images page invites a
  retry ("Căn đã được lưu, nhưng một số ảnh chưa tải lên thành công…").
- Progress text is honest: "Đang lưu thông tin căn…", "Đang tối ưu ảnh i/n…",
  "Đang tải ảnh i/n…", "Đang hoàn tất…". Submit is disabled while pending and
  double-submit is prevented.
- The select-time picker reuses classifyImageFile / isProbablyImageFile and the
  20 MB raw cap; real-format handling (JPG/PNG/WebP/HEIC) is identical to the
  gallery because the upload path is the SAME helper.
```

Shared client upload helper (`src/lib/images/upload-property-images.ts`):

```text
uploadProcessedPropertyImage(propertyId, file, {requestTargets, finalize}, onStatus)
  → process + presign + PUT main + PUT thumbnail + finalize a SINGLE image;
    returns { ok } | { ok:false, error } with friendly Vietnamese messages
    (non-image / HEIC / process-failed / CORS / upload-failed).
uploadPropertyImagesToR2(propertyId, files, actions, onProgress)
  → run the single-image flow over many files, tolerant of partial failure;
    returns { total, uploaded, failed, firstError }.
```

The R2 request/finalize Server Actions are **injected**, so the helper has no
app-route coupling and is reused by BOTH the property images page
(`image-upload-form.tsx`, single file) and the create form
(`new/new-property-form.tsx`, many files). The separate
`/dashboard/properties/[id]/images` page remains available and unchanged.
`PropertyFields` (shared field cards) is extracted from `PropertyForm` so the
create-with-images form (`NewPropertyForm`) and the edit form reuse the exact
same fields without duplication.

### One shared "Hình ảnh căn nhà" section across ALL property/source forms

Every property/source form renders the **same** image section component
(`src/components/property/property-image-section.tsx`) so the experience is
consistent. It has two modes:

```text
mode="draft"     — no propertyId yet. Used by the manual create form
                   (NewPropertyForm) and the Quick Add review form (text + image
                   OCR both end on the same NewPropertyForm). Collect pending
                   images via PropertyImagePicker; the parent uploads them to R2
                   AFTER the property is created (create → upload → redirect).
                   No image bytes pass through the create Server Action.
mode="existing"  — propertyId exists. Used by the edit form. Renders
                   PropertyImageManager: live add / delete / set-cover / reorder,
                   each applied IMMEDIATELY and INDEPENDENTLY of the property
                   fields form. An image failure never blocks field editing.
```

Quick Add: the review form is now `NewPropertyForm` (draft mode), so both text
and image OCR flows create the property first, then upload any selected listing
images. The OCR source image is intentionally **not** carried forward as a
listing photo (it is frequently a screenshot of someone else's post); the broker
selects their own images in the review form.

Edit form image management (`PropertyImageManager`, existing mode):

```text
- Add:      PropertyImagePicker + "Tải N ảnh lên" → uploadPropertyImagesToR2
            (same direct-to-R2 helper), then router.refresh() for new thumbnails.
- Set cover: setPropertyCoverImage action (existing).
- Delete:    deletePropertyImage action (existing).
- Reorder:   ↑ / ↓ buttons → reorderPropertyImages (NEW). Writes sort_order =
             index; cover flag is preserved (list/gallery stay cover-first).
- The cover/delete actions now RETURN { ok } | { ok:false, error } (was void) so
  the manager can show friendly messages; ImageCard ignores the return value, so
  the standalone images page is unchanged.
```

Reorder service/API (uses the existing `sort_order` column — no schema change):

```text
service: reorderPropertyImages(ctx, propertyId, orderedImageIds)
  - verifies the property is in ctx.organizationId, then verifies EVERY id is a
    finalized image of that property (cross-org/foreign id → NOT_FOUND).
  - writes sort_order = index per id (cover flag untouched).
action:  reorderPropertyImages(propertyId, orderedImageIds) → { ok } | { ok:false }
API:     POST /api/properties/[id]/images/reorder  { orderedImageIds: string[] }
         (cookie + Bearer auth, same { ok, data } / { ok, error } envelope)
```

The generic picker (`src/components/property/property-image-picker.tsx`) is
reused by draft mode and the edit-form "add" sub-flow, so a future Quick Add
camera-first capture reuses the same "create then upload selected images" path.

### Storage abstraction — use it for ALL media operations

`src/lib/storage/property-media.ts` is the single, provider-aware entry point.
Do NOT call `supabase.storage` or the R2 client directly from pages/components.

```text
createPropertyImageUploadTarget(params) → presigned R2 PUT URL + key (single)
createPropertyImageUploadTargetsForProcessedImages(params) → presigned PUT URLs
  + keys for both the main image and the thumbnail
createR2SignedReadUrl(key) / createR2SignedReadUrls(keys) → presigned GET URLs
deleteR2Object(key)
getPropertyImageSignedUrl(image, supabase) → one URL, either provider
getPropertyImageSignedUrls(images, supabase) → Map<imageId,url>, batched per provider
```

`getPropertyImageSignedUrls` splits the list by provider: legacy Supabase rows
are signed in a single `createSignedUrls()` call; R2 rows are signed locally.
Always batch — never sign per-image in a loop.

### Security / credentials

- R2 credentials are **server-only**. The browser only ever receives short-lived
  presigned URLs. Never expose `CLOUDFLARE_R2_SECRET_ACCESS_KEY` to the client
  and never import `property-media.ts` from a client component.
- The bucket stays private — access is always via presigned URLs, never public.
- All property/image queries are scoped by `user_id`; upload signing requires a
  verified property-ownership check first.

Required server env vars (set in `.env.local`, never committed):

```text
CLOUDFLARE_R2_ACCOUNT_ID
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
CLOUDFLARE_R2_BUCKET_NAME
CLOUDFLARE_R2_ENDPOINT   # optional — derived from account id if omitted
```

Missing config produces a clear `StorageConfigError` listing the absent vars.

### R2 CORS requirement

Browsers upload bytes directly to R2 via the presigned PUT URL, so the R2
bucket **must** allow CORS for each app origin (e.g. `http://localhost:3000`
in dev and the production origin). Allow method `PUT`, header `Content-Type`,
and `GET`/`HEAD` for reads. If CORS is misconfigured the browser PUT fails and
the upload form surfaces a friendly message telling the developer to fix the
bucket CORS rules — it does not crash.

## Performance Priorities

For image-heavy flows:

```text
- Resize/compress images before upload.
- Avoid routing large files through Vercel Server Actions.
- Prefer direct upload to storage provider.
- Use thumbnails in lists.
- Batch signed URL creation.
- Lazy-load images.
```

## Quick Add Image OCR

`/dashboard/properties/quick-add` (image mode) reads a property listing photo /
screenshot, OCRs the text via OpenAI vision, then reuses the text extractor.

Real phone-camera photos broke this: they are large (3–12 MB) and often HEIC,
so the raw file exceeded the Server Action body limit (1 MB default) and
surfaced as a generic "server error". Internet images / screenshots are small,
so they kept working.

Handling now:

```text
- Client preprocesses every OCR image before upload
  (src/lib/images/client-image-processing.ts → processImageForOcr):
    • resize to 1800px long edge, JPEG q0.84, strip metadata via canvas
    • retry at 1400px / q0.78 if still > 2.5 MB
    • accept the optimized JPEG as long as it fits the 5 MB server cap
- Robust decode: resizeImageFile tries createImageBitmap first, then falls back
  to an <img>/canvas decode. Some valid phone JPEGs throw in createImageBitmap
  (orientation option / progressive / CMYK quirks) but decode fine via <img>.
- Raw-file fallback: if preprocessing still fails for a valid JPG/PNG/WebP that
  is within the 5 MB server cap, the ORIGINAL file is uploaded for OCR. A real
  2.8 MB phone JPG that previews fine must never be rejected as "unsupported
  format" just because client preprocessing failed.
- Type detection uses BOTH file.type and filename extension (camera files often
  have an empty/generic MIME type).
- HEIC/HEIF: converted client-side when the browser can decode it; otherwise a
  friendly Vietnamese guidance message (no raw file is submitted, no crash).
- Server Action body limit raised to 6 MB (next.config.ts) as headroom.
- Server action resolves the effective MIME (inferring from extension when the
  type is empty/octet-stream), re-validates MIME/size, rejects HEIC + oversized
  with friendly messages, and logs only file metadata (name/type/inferred/size)
  — never image bytes or extracted text.
- EXIF orientation: preserved on the createImageBitmap path and on modern <img>
  decoders; in rare older engines the <img> fallback may not rotate perfectly —
  a correctly-read (if slightly rotated) OCR is preferred over a hard failure.
- No R2 / gallery upload behavior changed; the gallery flow keeps using
  createMainAndThumbnailImages and direct R2 upload.
```

### Shared image decode/classification

`src/lib/images/client-image-processing.ts` is the single source of truth for
client image decode + type handling, shared by **both** Quick Add OCR
(`processImageForOcr`) and the **property gallery upload**
(`createMainAndThumbnailImages`):

```text
- classifyImageFile(file): "supported" | "heic" | "other", by MIME AND extension
  (phone photos often have an empty/non-standard MIME like image/jpg).
- resizeImageFile decodes via createImageBitmap → falls back to <img>/canvas, so
  valid JPEGs that createImageBitmap can't handle still process.
- Gallery upload no longer does file.type-only validation; a valid JPG/PNG/WebP
  with an empty/odd MIME type is no longer rejected as "unsupported format".
- Gallery error mapping: non-image / HEIC-undecodable / valid-but-process-failed
  / too-large each get their own friendly message (never the misleading
  "choose JPG/PNG/WEBP" for a valid JPG).
- Gallery still outputs main (≈2048px / q0.86) + thumbnail (≈480px / q0.72) JPEG
  and uploads directly to R2 — architecture unchanged. Output is always JPEG, so
  the server/service MIME allowlist still passes.
```

### Scale guardrails (Phase 1)

```text
- Property list is paginated server-side: PAGE_SIZE = 50, Supabase .range().
  The query fetches PAGE_SIZE + 1 rows to detect "has next page" cheaply
  (no expensive exact COUNT). `?page=N` search param keeps URLs shareable and
  composes with all existing filter/search/sort params.
- Property list select stays lightweight (id, title, district, price, area,
  status, created_at) — heavy fields (description/notes/etc.) load only on the
  detail page.
- Heavy dashboard routes have loading.tsx skeletons so navigation feels instant:
  /dashboard/properties, /dashboard/properties/[id],
  /dashboard/properties/[id]/images, and the Post Assistant
  (/dashboard/properties/[id]/content/[contentId]/post).
- Post Assistant previews use THUMBNAIL signed URLs in the grid; the
  original/main signed URL is used only for open / download / copy actions.
  Both URLs are passed to the client; <img> never loads the original.
```

### Double auth validation — reviewed, kept intentional

The proxy (`src/proxy.ts`) validates the session on `/dashboard/**`, and each
dashboard Server Component ALSO calls `supabase.auth.getUser()`. This duplicate
call is **deliberately retained**:

```text
- getUser() is the authoritative per-request JWT validation. A Server Component
  must not trust that the proxy ran (matcher edits, future route moves, direct
  RSC/data requests) — it needs the verified user to scope queries by user_id.
- The proxy and the page run in different execution contexts; the page cannot
  read a "user" the proxy validated without re-fetching it.
- Security/ownership correctness outweighs shaving one cached JWT check.
```

Do not remove per-page `getUser()` without a vetted, shared auth helper that
preserves the same security guarantees.

### TODO — confirm Supabase region before pinning Vercel region

No `vercel.json` region is pinned. The Supabase project region is **not
inferable** from the project ref / env vars, so we do NOT guess. Before adding a
`vercel.json` `regions` entry, confirm the Supabase project region (Supabase
Dashboard → Project Settings → General → Region) and pin the nearest Vercel
region to it (e.g. `sin1` for `ap-southeast-1` / Singapore) to minimise
function ↔ database round-trip latency. Pinning the wrong region would make
latency worse, so this stays a documented TODO until the region is confirmed.

## Quality Gate

After implementation:

```bash
npm run lint
npm run typecheck
npm run build
```

All must pass.
