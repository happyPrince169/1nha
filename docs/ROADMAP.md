# 1nha Roadmap

## Product Direction

1nha is a property inventory and posting workflow assistant for Vietnamese real estate brokers.

Core positioning:

> 1nha — Kho nguồn & trợ lý đăng bài cho môi giới BĐS

Trust message:

> Nguồn của bạn là của bạn. Khách của bạn là của bạn. 1nha chỉ là công cụ giúp bạn làm việc gọn hơn, nhanh hơn và chuyên nghiệp hơn.

1nha should not become only an AI content tool. AI content is the wedge. Workflow is the product.

## Current Core Loop

The current product loop should be:

```text
Nhập nguồn
→ Quản lý kho căn
→ Upload ảnh
→ Tạo content AI
→ Chỉnh sửa content
→ Chọn văn phong riêng
→ Trợ lý đăng bài
→ Copy/tải ảnh
→ User đăng thủ công
→ Mark posted
```

This loop is the current priority.

## SaaS Architecture Roadmap (Phased)

1nha is moving toward a serious SaaS architecture for individual brokers, small
teams, small agencies, and a future native mobile app. This is delivered in
phases — **one phase at a time, never all at once**. Each phase must keep the
existing single-user broker workflow fully working.

### Phase 1 — Performance & scale guardrails 🟡 IN PROGRESS

```text
- Property list pagination / limit (default page size 50, server-side .range()).
- Loading skeletons for heavy dashboard routes
  (properties list, property detail, property images, Post Assistant).
- Post Assistant thumbnail/original split
  (preview grid uses thumbnail signed URLs; open/download/copy use originals).
- Review double auth validation + Vercel region config — implement ONLY if safe.
```

No schema changes. Query stays scoped by `user_id`. No `organization_id` yet.

### Phase 2 — Workspace foundation + RLS + migration

**Phase 2A — 🟢 IMPLEMENTED** (schema + RLS + migration + bootstrap):

```text
- organizations + organization_members tables (+ indexes, constraints).
- Personal workspace auto-created for EVERY existing user (backfill) and EVERY
  new user (auth.users AFTER INSERT trigger → personal "… Workspace").
- organization_id added to properties, generated_contents,
  content_style_profiles, usage_events (all backfilled).
- properties.created_by + properties.assigned_to (backfilled to the owner);
  generated_contents.created_by + content_style_profiles.created_by.
- BEFORE INSERT triggers auto-tag organization_id / created_by / assigned_to
  from user_id, so every insert is correctly scoped even from older code.
- Membership-based RLS via SECURITY DEFINER helpers
  (is_organization_member / organization_role / can_manage_organization),
  additive to the existing user_id policies; property_images is scoped
  through its parent property's organization.
- Server-only helper src/lib/workspace/current.ts resolves the current
  workspace; property/content/style-profile inserts now set organization_id.
- The single-user experience is unchanged.
```

Migrations: `20240109000001_organizations.sql`,
`20240109000002_core_tables_organization_id.sql`.

**Current limitation (by design):** there is NO Team UI, no member list, no
invite flow, and no workspace switcher yet. Reads remain user_id-scoped (which,
for a one-member personal workspace, is exactly equivalent to org-scoping).
**Phase 4** adds member management UI and org-scoped read filters
(team sources / my sources / assigned to me).

Remaining Phase 2 work (later): nothing blocking — the data model and RLS are
team-ready; tightening the new columns to NOT NULL can happen once the app is
fully deployed (see ARCHITECTURE.md migration notes).

### Phase 3 — Service layer + mobile-ready API routes

**Phase 3A — 🟢 IMPLEMENTED** (Properties workflow only):

```text
- Shared API conventions: src/lib/api/responses.ts (+ errors.ts).
    success → { ok: true, data }
    error   → { ok: false, error: { code, message } }
    codes   → UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | INTERNAL_ERROR
- Request/workspace context: src/lib/workspace/request-context.ts (server-only)
    resolves { supabase, userId, organizationId, role }; throws ApiError.
- Properties service: src/lib/services/properties.ts (server-only)
    listProperties / getPropertyById / createProperty / updateProperty /
    archiveProperty + parsePropertyListParams + validatePropertyInput.
    Organization-scoped; preserves Phase 1 pagination (PAGE_SIZE=50, +1 row →
    hasNextPage) and all filters/search/sort.
- Web Server Actions + pages now call the service (list page, new, edit,
  archive, detail) — UI unchanged.
- Mobile-ready API routes (Properties only):
    GET/POST  /api/properties
    GET/PATCH /api/properties/[id]
    POST      /api/properties/[id]/archive
```

Still using the SAME service from both web actions and API routes.

**Current limitations (by design):** API routes exist for Properties ONLY.
Images, content generation, style profiles, and Post Assistant are NOT yet
exposed as services/API routes. There is no mobile app yet. Remaining Phase 3
(images/content/style/post-assistant service + API migration) is future work.

**Phase 3A.1 — 🟢 IMPLEMENTED** (API auth contract):

```text
- /api routes authenticate via EITHER a Supabase session cookie (web) OR
  `Authorization: Bearer <supabase_access_token>` (future Expo/mobile).
- Both validated server-side via supabase.auth.getUser(); Bearer path uses the
  ANON key with the token as a global header (RLS-scoped, no service-role key).
- getRequestContext() signature unchanged — header read via next/headers, so no
  route-handler refactor was needed.
- Strict Authorization precedence: header absent → cookie auth; valid
  `Bearer <token>` → Bearer auth; header present but malformed/invalid → 401
  UNAUTHORIZED (NO cookie fallback once an Authorization header is present).
- Verified: unauthenticated → 401; malformed header → 401; invalid Bearer → 401.
- Prepares the backend for Expo/mobile clients. No mobile app exists yet.
```

**Phase 3A.2 — 🟢 IMPLEMENTED** (phone-first auth + SMS OTP foundation):

```text
- Vietnamese phone normalization helper (src/lib/auth/phone.ts → E.164, +84).
- sendPhoneOtp / verifyPhoneOtp server actions (Supabase Phone Auth;
  signInWithOtp + verifyOtp type:"sms"). App never generates/stores/logs OTP.
- /sign-in is phone-first ("Đăng nhập bằng số điện thoại" → OTP step with đổi
  số / gửi lại mã + cooldown); email/password kept as a clear fallback card.
- /sign-up nudges to phone login; email sign-up retained as fallback.
- Phone users (email may be null): best-effort user_profiles upsert
  (ignoreDuplicates) + personal workspace via the existing auth.users trigger.
  No DB schema change (user_profiles has no email column).
```

**Requires Supabase config** (Phone provider enabled; secrets never in
NEXT_PUBLIC env). No mobile app yet.

**Phase 3A.3 — 🟢 IMPLEMENTED** (Vietnam OTP provider via Send SMS Hook):

```text
- POST /api/auth/sms-hook receives Supabase's Send SMS Hook payload
  { user:{id,phone}, sms:{otp} }, authorized by SUPABASE_SEND_SMS_HOOK_SECRET
  (x-1nha-hook-secret header, or ?secret= fallback). Supabase still
  generates + verifies the OTP; the app only delivers it (never stores/logs it).
- Provider abstraction: src/lib/otp/send-otp.ts + providers/{types,esms}.ts.
  eSMS first (ESMS_MODE = sms_only | zns_sms with Zalo ZNS → SMS fallback),
  OTP_PROVIDER selectable; Stringee/VIHAT/VietGuys/Zalo can be added later.
- Status: 200 sent · 401 bad secret · 400 bad payload · 502 provider failed ·
  500 provider/env misconfig. Secure-by-default (rejects if secret unset).
- Setup + test checklist: docs/SMS_OTP_PROVIDER_SETUP.md.
```

Sign-in UI and sendPhoneOtp/verifyPhoneOtp from 3A.2 are unchanged. Exact eSMS
payload must be verified against eSMS docs before production (adapter isolated;
use ESMS_SANDBOX=1 to validate). No mobile app yet.

> ⏸️ **Vietnam SMS OTP provider integration is PAUSED** until provider
> credentials/contracts are finalized. The Send SMS Hook adapter (3A.3) and
> phone-first UI (3A.2) stay in place; no provider secrets are wired and no
> further SMS provider work happens until setup is finalized
> (see `docs/SMS_OTP_PROVIDER_SETUP.md`). Social OAuth is also NOT needed yet.

**Phase 3B-1 — 🟢 IMPLEMENTED** (Property Images service + mobile-ready API):

```text
- Shared server-only service: src/lib/services/property-images.ts
  list / get / requestUpload / requestUploadTargets / finalize / update /
  delete / setCover. Organization-aware THROUGH the parent property (verify
  property in ctx.organizationId, then scope images by property_id; RLS
  property_images_member_all is the backstop). Guessed cross-org id → NOT_FOUND.
- Web Server Actions (.../images/actions.ts) now delegate to the service for the
  R2 upload-target / finalize / delete / set-cover / update-meta flows. Gallery
  UI, client-side resize/compress, and the direct-to-R2 PUT flow are unchanged.
  Legacy Supabase Storage upload action retained untouched as a fallback.
- API routes (cookie + Bearer auth, { ok, data } / { ok, error } envelope):
  GET    /api/properties/[id]/images                  (?variant=thumbnail|original)
  POST   /api/properties/[id]/images/upload-targets
  POST   /api/properties/[id]/images/finalize
  PATCH  /api/properties/[id]/images/[imageId]
  DELETE /api/properties/[id]/images/[imageId]
  POST   /api/properties/[id]/images/[imageId]/cover
- Storage logic stays solely in src/lib/storage/property-media.ts. R2 remains
  the provider for new images; Supabase Storage remains the legacy fallback.
  Pending rows excluded from reads; thumbnails returned by default (originals
  only on explicit ?variant=original). No service-role / storage secrets exposed.
```

Verified: every image API route returns `401 { ok:false, error:{code:"UNAUTHORIZED"} }`
unauthenticated; lint + typecheck + build pass. No DB/RLS/schema changes, no
legacy image migration, no mobile app.

**Phase 3B-2 — 🟢 IMPLEMENTED** (Style Profiles service + mobile-ready API):

```text
- Shared server-only service: src/lib/services/style-profiles.ts
  list / get / getDefault / create / update / setDefault / delete.
  Organization-scoped (filter by ctx.organizationId; RLS
  content_style_profiles_member_all is the backstop). Guessed cross-org id →
  NOT_FOUND. Inserts set user_id (legacy) + organization_id + created_by.
  Setting a default clears the org's previous default first (one default per
  org via service logic — no schema change).
- Web Server Actions (.../style-profiles/actions.ts) now delegate to the
  service for create / update / set-default / delete. The AI analyze-style step
  (analyzeContentStyle) runs inside the service create. UI, form behavior,
  Vietnamese error messages, redirect/revalidate all unchanged.
- API routes (cookie + Bearer auth, { ok, data } / { ok, error } envelope):
  GET    /api/style-profiles                  → { profiles, defaultProfileId }
  POST   /api/style-profiles                  → { profile }
  GET    /api/style-profiles/[id]             → { profile }
  PATCH  /api/style-profiles/[id]             → { profile }
  DELETE /api/style-profiles/[id]             → { id }
  POST   /api/style-profiles/[id]/default     → { profile, defaultProfileId }
- style_rules is AI-generated JSONB (not user-editable). Public payload omits
  user_id/organization_id/created_by; sample_text only on single-resource read.
```

Verified: every style-profile API route returns
`401 { ok:false, error:{code:"UNAUTHORIZED"} }` unauthenticated; lint +
typecheck + build pass. Content generation is migrated in Phase 3B-3 (below).
Post Assistant API stays future **Phase 3C**. Vietnam SMS OTP provider remains
**paused**; social OAuth still not needed. No DB/RLS/schema changes, no mobile app.

**Phase 3B-3 — 🟢 IMPLEMENTED** (Content Generation service + mobile-ready API):

```text
- Shared server-only service: src/lib/services/generated-content.ts
  list / listForProperty / get / getForProperty / generate / regenerate /
  update / archive. Organization-scoped (filter by ctx.organizationId; RLS
  generated_contents_member_all is the backstop). Property access verified via
  the Properties service, style profile via the Style Profiles service →
  guessed cross-org property/content/profile id = NOT_FOUND. Inserts set
  user_id (legacy) + organization_id + created_by.
- AI behaviour unchanged: buildPropertyPrompt + "tone:<id>"/"style:<id>" voice
  resolution are identical; selected style_rules injected as before; sample
  text never sent verbatim. prompt_used stored but never returned; payloads omit
  user_id/organization_id/created_by. No AI is called on reads.
- Web Server Actions delegate to the service: generatePropertyContent
  (generate), updateContentText + updateContentNotes (→ updateGeneratedContent),
  archiveContent (→ archiveGeneratedContent). /dashboard/content list now reads
  through listGeneratedContents. UI, "Giọng văn" UX, redirects, pending states,
  filters/search all unchanged. Post Assistant status actions (mark copied /
  scheduled / posted) intentionally left on their existing actions.
- API routes (cookie + Bearer auth, { ok, data } / { ok, error } envelope):
  GET    /api/generated-contents                          → { contents, nextPage }
  GET    /api/generated-contents/[id]                     → { content }
  PATCH  /api/generated-contents/[id]                     → { content }
  POST   /api/generated-contents/[id]/regenerate          → { content }
  POST   /api/generated-contents/[id]/archive             → { id, archived: true }
  GET    /api/properties/[id]/generated-contents          → { contents }
  POST   /api/properties/[id]/generated-contents/generate → { content }
```

Depends on the Properties service (3A) and Style Profiles service (3B-2).
Verified: every generated-content API route returns
`401 { ok:false, error:{code:"UNAUTHORIZED"} }` unauthenticated; lint +
typecheck + build pass. No OpenAI/provider secrets or service-role key exposed.
Vietnam SMS OTP provider remains **paused**; social OAuth still not needed. No
DB/RLS/schema changes, no mobile app.

**Phase 3C — 🟢 IMPLEMENTED** (Post Assistant service + mobile-ready API):

```text
- Shared server-only service: src/lib/services/post-assistant.ts
  getPostAssistantPackage / ...ForProperty / getPostAssistantImageUrls /
  markContentCopied / markContentScheduled / markContentPosted.
  Composes the Generated Content + Properties + Property Images services
  (no duplicated storage signing). Organization-scoped; cross-org / unknown /
  archived ids → NOT_FOUND.
- MANUAL workflow only: prepares text, returns signed image URLs, records
  copied/scheduled/posted intent. NO auto-posting, NO Facebook/Zalo API, NO
  social tokens, NO browser automation. (Aligns with the product principle.)
- Thumbnails by default; full-resolution originals only via the explicit
  image-urls endpoint (variant: "original"), and only for image ids belonging
  to the content's property. No prompt_used / storage keys / secrets / user_id /
  organization_id exposed. No AI calls in Post Assistant.
- Web mark actions (markContentCopied / markContentScheduled / markContentPosted
  in the content actions) now delegate to the service; Post Assistant page,
  copy/open/download/share UI, pending states all unchanged.
- API routes (cookie + Bearer auth, { ok, data } / { ok, error } envelope):
  GET  /api/generated-contents/[id]/post-assistant
  POST /api/generated-contents/[id]/post-assistant/image-urls
  POST /api/generated-contents/[id]/post-assistant/copied
  POST /api/generated-contents/[id]/post-assistant/scheduled
  POST /api/generated-contents/[id]/post-assistant/posted
  GET  /api/properties/[id]/generated-contents/[contentId]/post-assistant
```

Verified: every Post Assistant API route returns
`401 { ok:false, error:{code:"UNAUTHORIZED"} }` unauthenticated; lint +
typecheck + build pass. No auto-posting / social-token handling anywhere.

**Phase 3D — 🟢 IMPLEMENTED** (Org-read alignment + authenticated API smoke):

```text
- Org-read alignment: dashboard Server-Component reads that still filtered by
  user_id now go through the org-scoped service layer (or organization_id for
  the dashboard stat counts). Solo behaviour unchanged; cross-org → NOT_FOUND.
  Aligned: dashboard counts; properties list thumbnails + detail; generate;
  edit; images; per-property content; content detail; Post Assistant page;
  style-profile list + detail. (content list was already aligned in 3B-3.)
- Justified user_id reads kept: account (user_profiles = personal metadata),
  api/auth/callback (auth identity), legacy uploadPropertyImage fallback.
- Post Assistant page still signs thumbnails (grid) + originals (actions) via
  the Property Images service — behaviour unchanged, now org-scoped.
- Authenticated API smoke test: scripts/smoke-authenticated-api.mjs
  (npm run smoke:api). Signs in via Supabase anon client, calls core APIs with
  a Bearer token, prints pass/fail. Read-only by default; never prints the
  token; anon key only (no service-role). generate/regenerate/archive/
  scheduled/posted are OFF by default; only idempotent "copied" behind
  SMOKE_RUN_MUTATIONS=1, and generate behind SMOKE_RUN_GENERATE=1.
- Docs: docs/PHASE_3D_SMOKE_TESTS.md (env vars, modes, expected output).
```

Verified: lint + typecheck + build pass; unauthenticated 401 behaviour
unchanged. No UI/schema/RLS/auth/billing/nav changes; no auto-posting.

**Phase 3E — 🟢 IMPLEMENTED** (Form polish & data integrity — pre-Team-UI):

```text
- One shared, pure price/number parser: src/lib/format/price.ts
  (parseLooseNumber / parseVietnamesePrice / hasVietnamesePriceUnit /
  parsePriceToVnd / formatPriceForInput). Reused by the form, the quick-add
  extractor (re-exports from here — no divergent copy), the Properties service
  (validatePropertyInput + list-filter parsing), and the /api/properties routes.
- Manual price input is a free-form text field (type=text with NO inputMode at
  all — decimal/numeric, and even text on some browsers, force a numeric keypad
  that can't type "tỷ"/"triệu"/"tr"; no pattern/step/min/max; helper "8 tỷ 650,
  8.65 tỷ, 850 triệu…"). parsePriceToVnd normalises
  "8 tỷ 650" / "850 triệu" / "8,65 tỷ" / raw VND → the unchanged raw-VND store.
  Edit prefill shows a human-friendly price only when it round-trips exactly
  (else raw VND — no data loss).
- List filters accept comma/dot decimals + Vietnamese price units and fail
  gracefully (invalid → ignored, never a NaN query). Price filters stay in tỷ
  ("850 triệu" → 0.85 tỷ; bare number = tỷ); area filters accept "32,8". Filter
  inputs are now type=text inputMode=decimal.
- area / frontage / alley_width still preserve up to 2 decimals; bedrooms /
  bathrooms stay integers. Display (formatVND) unchanged from 3D — preserves
  "8.65 tỷ" / "850.5 triệu", never mutates the stored value.
- No DB/RLS/schema/auth/billing/Team-UI/nav/AI-strategy changes. Stored price
  convention remains raw VND.
```

Verified: lint + typecheck + build pass; price parser round-trips checked
against the spec examples.

**Phase 3F — 🟢 IMPLEMENTED** (uniform 5-decimal rounding for property numbers):

```text
- One shared rounding rule: roundToDecimalPlaces(value, 5) in
  src/lib/format/price.ts (rejects NaN/Infinity). Used by the Properties service
  AND the price parser, so create/edit/quick-add/API/filters round identically.
- Decimal fields (area/frontage/alley_width) accept free long decimals (comma or
  dot) and round to 5 on save: 32,8123456789 → 32.81235 · 3,658912345 → 3.65891
  · 2,35789999 → 2.3579. Trailing zeros dropped on display.
- Price: the expressed unit (tỷ/tỉ/ty/ti, triệu/trieu/tr) is rounded to 5
  decimals, THEN stored as integer raw VND. 8,123456789 tỷ → 8.12346 tỷ →
  8123460000; 850,123456789 triệu → 850.12346 triệu → 850123460. Existing cases
  (8 tỷ 650, 850 triệu, 3,5 tỷ, raw VND) unchanged.
- formatVND shows up to 5 decimals (zeros dropped): 8123460000 → "8.12346 tỷ".
- bedrooms/bathrooms stay integers. Filters use the same rounding; invalid →
  ignored (no NaN query).
- DB: price stays integer raw VND. Conditional migration
  20240110000001_properties_decimal_scale.sql widens ONLY numeric(scale<5)
  area/frontage/alley_width columns to numeric(14,5); double precision / wide
  numeric untouched; aborts on integer. No RLS/auth/billing/Team-UI/AI changes.
```

Verified: lint + typecheck + build pass; the 5-decimal rule checked against the
spec examples (price + decimal + formatVND + round-trip).

**Phase 3G — 🟢 IMPLEMENTED** (bare-number price rule for the price field):

```text
- parsePriceToVnd reads a UNIT-LESS price by the MAGNITUDE of the typed value
  (decimals included — no integer/decimal special-case):
    bare value < 100         → tỷ, unit rounded to 5dp
      ("8" → 8e9 · "8.35" → 8_350_000_000 · "12.5" → 12_500_000_000 ·
       "99.999999" → unit rounds to 100 → 100e9)
    bare value ≥ 1_000_000   → raw VND ("8350000000"; "8350000000.7" → ...001)
    bare value 100…999_999   → AMBIGUOUS → null, INCLUDING decimals
      ("850" / "850.5" / "999999.5" → null → existing validation; add a unit)
  Safety refinement: "850.5" is no longer read as 850.5 tỷ — a bare value in the
  hundreds could mean triệu, so it is rejected, not silently saved as a huge
  tỷ price. A NUMBER argument stays raw VND (API contract).
- Unchanged: all unit expressions (8 tỷ 650 / 850 triệu / 3,5 tỷ /
  8,123456789 tỷ), raw VND ≥ 1e6, area/frontage/alley 5-decimal rounding,
  formatVND/formatPriceForInput, the free-text price input (no inputMode), and
  the "Giá (tỷ)" filters (separate parsePriceFilterTy — bare = tỷ per label).
- DB unchanged (price still integer raw VND).
```

Verified: lint + typecheck + build pass; bare + unit + raw-VND + ambiguous +
round-trip checked against the spec examples. Next: **Phase 4 — Team UI MVP**.
Vietnam SMS OTP provider stays paused; social OAuth still not needed.

### Phase 4 — Team UI MVP

```text
- Workspace settings
- Member list
- Invite member
- Roles: owner / admin / member
- created_by / assigned_to visibility
- Filters: team sources / my sources / assigned to me
```

#### Phase 4A — Workspace UI (🟢 DONE)

First Team/Workspace UI on top of the Phase 2A org foundation. No schema change
to existing tables; one additive migration for invites.

```text
- Account → "Không gian làm việc" card → /dashboard/account/workspace
- Workspace page: name, type, role, member count, created date
- Rename workspace (owner/admin) — RLS organizations_update_manager backstop
- Members list with email / phone / role / joined date (vi role labels)
- Invite by LINK (owner/admin): email + role (member/admin), copy /invite/<token>
- Pending invites list: copy link + revoke
- Accept flow: /invite/[token] → accept_organization_invite RPC → workspace page
- Roles: owner=Chủ sở hữu, admin=Quản trị, member=Thành viên
```

New migration `20240111000001_organization_invites.sql`:

- `organization_invites` table (org-scoped, RLS: managers select/insert/update).
- `list_organization_members(org_id)` SECURITY DEFINER — exposes fellow members'
  email/phone (auth.users + user_profiles otherwise RLS-hidden), gated on
  `is_organization_member`.
- `get_organization_invite(token)` / `accept_organization_invite(token)`
  SECURITY DEFINER — token-based preview + the single controlled membership
  write (no broad INSERT policy on organization_members). An invite can never
  grant `owner`; existing members are never silently downgraded.

No service-role key anywhere. No email is sent — invites are shareable links the
broker forwards via Zalo/email.

**Deferred to 4A.2:** change member role, remove member (no member UPDATE/DELETE
policy added yet — page shows a note); honoring `?next=` after sign-in for the
signed-out invite path (today the invite page shows a sign-in CTA and the link
stays valid to reopen); workspace switcher / multi-workspace; real email
delivery.

#### Phase 4B — Property team assignment (🟢 DONE)

Makes property/source management team-aware in the UI. No schema change — Phase
2A already added `properties.created_by` / `properties.assigned_to`; this phase
activates them in the UI, validation, and filtering.

```text
- "Người phụ trách" field on every property form (manual, quick-add, edit)
- Detail page shows "Người tạo" + "Người phụ trách"
- Inventory cards show "Phụ trách: Bạn / <tên> / Chưa phân công"
- Filters: Tất cả nguồn / Nguồn tôi tạo / Tôi phụ trách / Chưa phân công + by member
- URL params: scope=all|created_by_me|assigned_to_me|unassigned, assigned_to=<id>
```

Assignment defaults to the creator on create. Validation + permission live in
the properties service (the security boundary, covers the API too):

- `assigned_to` must be an active member of the current org (else
  VALIDATION_ERROR); cross-org / arbitrary ids are rejected.
- **Owner/Admin** may assign to anyone or leave unassigned.
- **Member** may only assign to themselves or keep an existing assignee
  unchanged (else FORBIDDEN). The form renders read-only for members.

Member options come from `buildAssigneeContext` / `listAssignableMembers`
(workspace service), which reuse the Phase 4A gated `list_organization_members`
RPC — no service-role, no cross-org exposure. List/detail resolve ids → labels
via the same roster (null → "Chưa phân công", self → "Bạn", ex-member →
"Không rõ").

**Visibility model:** all active members see the full workspace inventory (org
scoping unchanged). **Deferred to 4C:** deeper per-property access control,
member role changes/removal, workspace switcher, reassigning a colleague's
source as a plain member.

### Phase 5 — Mobile app skeleton (Expo React Native, later)

```text
- Auth
- Workspace
- Property list / detail
- Quick Add (basic)
```

### Phase 6 — Native mobile workflow

```text
- Camera-first upload
- Multi-image picker
- Native share sheet
- Receive shared content/images from Zalo/Facebook if feasible
- Push reminders
- Offline draft (later)
```

> Phases 2–6 are recorded here for direction only. Do NOT implement them until
> the current phase is complete and reviewed.

## Completed or Mostly Completed

### 1. Auth and Dashboard

```text
Supabase Auth
Email + password sign in / sign up (primary)  ✅
Forgot password + reset password              ✅
Magic link kept as optional secondary fallback ✅
Protected dashboard
Mobile-first dashboard shell
Bottom navigation
```

Magic-link-only login has been replaced by email + password (DONE). Existing
magic-link users set a password via "Quên mật khẩu?". Phone is profile-only.

### 2. Property Inventory

```text
Property CRUD
Archive property
Property list
Property detail
Search/filter support
Property thumbnails
```

### 3. Quick Add

```text
Quick Add by pasted text
Quick Add by image/OCR
Vietnamese real estate price parsing
Draft review before saving
```

### 4. Property Images

```text
Upload property images
Private bucket
Storage policies
Cover image
Image gallery
Signed URLs
Property thumbnails
Post Assistant image picker
```

### 5. AI Content

```text
Generate content from property
Platform/tone/content type options
Save generated content
Content history
Content detail
Editable generated content
Copy content
Regenerate if available
```

### 6. Content Workspace

```text
Content statuses: draft, scheduled, posted, archived
Mark posted
Notes
Archive content
Global content page
Property-scoped content workspace
```

### 7. Social Post Assistant

```text
Route: /dashboard/properties/[id]/content/[contentId]/post
Platform selector
Content copy
Image selection
Posting checklist
Mark posted from assistant
```

### 8. Style Profiles

```text
User can create writing style profiles
AI analyzes sample posts
Save style_rules
Style profiles listed in dashboard
```

### 9. Account / Beta Billing Foundation

```text
Account/profile page
Beta plan information
Pricing preview
Upgrade interest form
No real payment yet
No credit enforcement yet
```

## Immediate Priority

### Priority 1 — Use Style Profiles in Content Generation

Goal:

```text
When generating content, user can select a saved style profile.
The selected style_rules must influence the AI output.
```

Requirements:

```text
- Fetch user's style profiles on generate page.
- Add "Văn phong" dropdown.
- Default option: "Mặc định 1nha".
- If user has default style profile, preselect it.
- On submit, pass style_profile_id.
- Server action must fetch selected profile by id + user_id.
- Include style_rules in AI prompt.
- Do not pass sample_text unless necessary.
- Do not copy sample posts verbatim.
- Preserve anti-hallucination rules.
- Save style_profile_id to generated_contents if schema supports it.
- Track style_profile_used if usage_events supports it.
```

This is the most important next step because it makes AI output feel less generic and more useful.

## Near-Term Roadmap

### 1. Post Assistant Image Tools

Goal:

```text
Make selected images easier to use when user manually posts.
```

Features:

```text
- Download single image
- Open image
- Copy image to clipboard when browser supports it
- Download selected images one by one
```

Do not implement ZIP, watermark, or auto-post yet.

### 2. Freshness & Source Status

Goal:

```text
Prevent brokers from posting stale or wrong listings.
```

Suggested fields:

```text
source_status
last_verified_at
price_updated_at
source_note
```

Suggested statuses:

```text
Mới nhập
Đã xác minh gần đây
Cần kiểm tra lại
Tạm dừng bán
Đã bán
Không còn nguồn
```

Actions:

```text
Còn bán
Đổi giá
Tạm dừng
Đã bán
```

Warnings:

```text
Căn này đã lâu chưa cập nhật. Hãy kiểm tra lại giá/trạng thái trước khi đăng.
```

### 3. Image Performance Optimization — 🟢 DONE

Goal:

```text
Improve app responsiveness when working with images.
```

Done:

```text
- Client-side resize/compress before upload (src/lib/images/client-image-processing.ts).
- Large files no longer routed through Server Actions (direct PUT to R2).
- Real client-generated thumbnails (480px) + social-ready main image (2048px).
- Thumbnails used in property list, gallery grid, and property detail preview.
- Original images used for Post Assistant open/download/copy/posting.
- Batched signed URLs per provider via getPropertyImageSignedUrls().
- Storage abstraction in src/lib/storage/property-media.ts.
```

Follow-up (later):

```text
- Lazy-load / progressive loading polish.
```

### 3a. Optional images in the create-property form — 🟢 DONE

Goal:

```text
Adding a new source should feel like one flow: enter property fields AND pick
photos, then save — instead of save-first, then a separate images page.
```

Done:

```text
- /dashboard/properties/new gained an optional "Hình ảnh căn nhà" section
  (multi-select, previews, remove-before-submit). Mobile-first, consistent UI.
- One flow to the user, two safe technical steps to the system:
    1. createPropertyWithImages(formData) → { ok, propertyId }  (fields only;
       a no-redirect sibling of createProperty)
    2. if images → uploadPropertyImagesToR2(propertyId, files): per image,
       process client-side → presign R2 targets → PUT main + thumbnail direct
       to R2 → finalize. NO image bytes pass through the create Server Action.
    3. redirect to /properties/[id], or /properties/[id]/images?upload=partial
       when some uploads failed (the property is NEVER rolled back).
- Shared client helper src/lib/images/upload-property-images.ts
  (uploadProcessedPropertyImage / uploadPropertyImagesToR2), reused by BOTH the
  create form and the existing images page (image-upload-form refactored onto
  it — no duplicated R2 PUT/finalize logic). Request/finalize actions injected,
  so the helper has no app-route coupling.
- PropertyFields extracted from PropertyForm so create-with-images + edit share
  the same fields. Generic PropertyImagePicker component prepared for a future
  Quick Add reuse.
- Honest progress text + disabled/anti-double-submit; friendly Vietnamese
  errors (non-image / HEIC / process / upload). Same R2 + Supabase-legacy
  architecture; no schema/RLS/auth/nav changes; separate images page preserved.
```

### 3a-bis. Consistent image section across ALL property/source forms — 🟢 DONE

Goal:

```text
Every property/source form (manual create, Quick Add review, edit) should share
the same "Hình ảnh căn nhà" section, so adding/editing a source always includes
images in one consistent place.
```

Done:

```text
- One shared component src/components/property/property-image-section.tsx with
  two modes:
    • draft    — manual create + Quick Add review (text AND image OCR). Collect
      pending images, upload to R2 AFTER the property is created. NO image bytes
      through create. Quick Add review form is now NewPropertyForm (draft mode).
    • existing — edit form. PropertyImageManager: live add / delete / set-cover /
      reorder (↑/↓), applied immediately and INDEPENDENTLY of the fields form;
      an image failure never blocks text editing.
- Reorder added on the existing sort_order column (no schema change):
    service reorderPropertyImages(ctx, propertyId, orderedImageIds) — verifies
      property in org + every id belongs to the property (cross-org → NOT_FOUND),
      writes sort_order = index, preserves cover flag.
    action reorderPropertyImages(propertyId, orderedImageIds) → { ok }|{ ok:false }.
    API POST /api/properties/[id]/images/reorder { orderedImageIds }.
- Cover/delete actions now RETURN { ok }|{ ok:false, error } (was void) so the
  edit-form manager shows friendly messages; ImageCard ignores the return, so
  the standalone /properties/[id]/images page is unchanged.
- Reuses classifyImageFile / isProbablyImageFile / createMainAndThumbnailImages /
  uploadPropertyImagesToR2 — no duplicated processing, no file.type-only checks.
- OCR source image intentionally NOT carried forward as a listing photo (often a
  screenshot of someone else's post). Direct-to-R2 + Supabase-legacy unchanged;
  no auth/billing/Team-UI/nav/AI changes; separate images page preserved.
```

### 3b. UX Responsiveness Pass — 🟢 DONE

Goal:

```text
Improve perceived performance — buttons must give immediate feedback on tap,
without any backend / schema / API-contract changes.
```

Done:

```text
- Audited every auth, property, quick-add, image, content, style-profile and
  Post Assistant action button/form. All server-action forms already show an
  immediate pending state via useActionState (disabled + "Đang …" label), and
  manual async buttons already use useTransition with disabled + loading text.
  No fake "instant" completion for genuinely slow AI/upload steps — they keep
  clear progress text ("Đang trích xuất…", "Đang tải ảnh lên…", "Đang tạo
  content…").
- Added the remaining gap: primary navigation CTAs (button-styled links that
  route to a server-rendered page) previously gave no feedback on tap. New
  reusable LinkButton (src/components/ui/link-button.tsx) shows an inline
  pending spinner via next/link useLinkStatus() and blocks repeat taps while
  navigating, with byte-for-byte identical styling.
- Applied to the primary CTAs across key workflows: dashboard quick actions,
  Kho nguồn (Nhập nhanh / Thủ công / empty-state create), property detail
  (Tạo content AI / Chỉnh sửa), content empty-state, and Văn phong create.
```

Result: buttons now show immediate pending state and perceived performance
improved with no backend, schema, RLS, auth or API-contract changes.

### 4. PWA

Goal:

```text
Make webapp feel like a mobile app.
```

Tasks:

```text
- manifest
- app icon
- theme color
- install prompt if appropriate
- safe-area polish
- mobile viewport polish
```

### 5. Auth Enhancements (later)

Goal:

```text
Strengthen auth after product validation — not now.
```

Future options (only if real need appears):

```text
- Optional phone number verification (profile-level, not identity).
- SMS OTP signup/login — only if the market clearly needs phone-first auth.
- MFA (multi-factor) for higher-security accounts / teams.
- OAuth / Zalo login — not planned yet.
```

Current sprint deliberately excludes SMS OTP, Twilio/Vonage, OAuth, MFA,
passkeys, and phone-only identity.

## Medium-Term Roadmap

### 1. Storage Abstraction and Cloudflare R2 — 🟡 IN PROGRESS

Goal:

```text
Prepare for scalable image/video media.
```

Direction:

```text
Supabase/Postgres for metadata
Cloudflare R2 for media files
Optional Cloudflare Images for transformations (later)
Optional Cloudflare Stream for video playback (later)
```

Done (this sprint):

```text
- src/lib/storage/property-media.ts provider-aware abstraction
- New property image uploads go to Cloudflare R2 (presigned PUT, direct from browser)
- property_images gains storage_provider + R2 key columns (migration 20240108000001)
- All image surfaces (gallery, property detail, property list, post assistant)
  read both R2 and legacy Supabase rows via getPropertyImageSignedUrls()
- Provider-aware delete (original_key + thumbnail_key + preview_key); legacy
  Supabase Storage retained as fallback
- Client-side resize/compress: social-ready main image (2048px) → original_key,
  thumbnail (480px) → thumbnail_key, both uploaded direct to R2 (presigned PUTs)
```

Follow-up tasks:

```text
- Migrate existing Supabase Storage images to R2 (backfill original_key/thumbnail_key, flip provider)
- Optional: store the raw camera original separately only if a real need appears
- Add video media support (Cloudflare Stream) via the same abstraction — later
- Optional Cloudflare Images for on-the-fly transforms — only if needed later
```

### 2. Viewing Records

Goal:

```text
Create evidence that broker introduced or led customer to view a property.
```

Flow:

```text
Broker creates viewing record
→ Sends confirmation link to customer
→ Customer confirms
→ Timeline saved
```

V1 should be simple:

```text
viewing_records
viewing_events
public confirmation link
no GPS/OTP/PDF at first
```

### 3. Team Workspace

Goal:

```text
Support small broker teams.
```

Features:

```text
team members
team property inventory
roles/permissions
team content history
team billing/setup later
```

### 4. Deal Room / Split Ledger

Goal:

```text
Record collaboration and commission split agreements.
```

Important:

```text
1nha does not hold money.
1nha records agreement, roles, percentages, timeline, and confirmations.
```

### 5. Video Template Lightweight

Do not start with real video rendering immediately.

V1 should generate:

```text
video script
scene list
image order
text overlay
caption
shot suggestions
```

Later:

```text
render MP4
store video in R2
download/share video
optional Cloudflare Stream if playback is needed
```

## Long-Term Direction

1nha can evolve from personal workflow to controlled collaboration network:

```text
Private inventory
→ Content workflow
→ Posting assistant
→ Viewing proof
→ Team workspace
→ Deal room
→ Split ledger
→ Controlled collaboration
```

Important: preserve neutrality.

1nha should not:

```text
- Take deal commission
- Sell user sources
- Sell user/customer data
- Force brokers into closed brokerage network
```

## Do Not Prioritize Yet

Do not prioritize these until real user traction demands them:

```text
Native mobile app
Auto-post via Facebook/Zalo/TikTok API
Payment gateway
Credit enforcement
Full video rendering
Complex CRM
Map/search by coordinates
Enterprise team permissions
AI fine-tuning
```

## Native App Strategy

Current priority is mobile-first webapp and PWA.

Native app only makes sense when there is clear native value:

```text
Share from Zalo/Facebook into 1nha
Camera-first source capture
Voice note to property draft
Push reminders
Offline capture and sync
```

Do not build a native app just to wrap the website.

## Commercial Strategy

Current beta is free.

Near-term commercial foundation:

```text
Account/profile
Beta plan page
Pricing preview
Upgrade interest request
```

Do not enforce credits or payment yet.

Future pricing direction:

```text
Free trial
Beta / early plan
Pro personal
Team setup + monthly subscription
```

## Success Metrics to Watch

Early product signals:

```text
number of real properties saved
number of images uploaded
number of AI contents generated
number of edited contents
number of post assistant opens
number of copied posts
number of contents marked posted
number of style profiles created
number of repeat weekly users
```

The most important sign:

```text
Users return weekly to manage real property inventory and create/post content.
```
