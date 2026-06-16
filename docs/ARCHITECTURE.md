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

## Ownership and Security

All dashboard data must be scoped by `user_id`.

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

- R2 rows store `original_key` (+ future `thumbnail_key` / `preview_key`) and
  mirror `original_key` into `storage_path` once finalized for backward compat.
- Supabase rows keep their original `storage_path`.

Future (later sprints): Cloudflare Images transforms, Cloudflare Stream video.
Not implemented here.

### Storage abstraction — use it for ALL media operations

`src/lib/storage/property-media.ts` is the single, provider-aware entry point.
Do NOT call `supabase.storage` or the R2 client directly from pages/components.

```text
createPropertyImageUploadTarget(params) → presigned R2 PUT URL + key
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

## Quality Gate

After implementation:

```bash
npm run lint
npm run typecheck
npm run build
```

All must pass.
