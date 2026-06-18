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

### Phase 4 — Team UI MVP

```text
- Workspace settings
- Member list
- Invite member
- Roles: owner / admin / member
- created_by / assigned_to visibility
- Filters: team sources / my sources / assigned to me
```

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
