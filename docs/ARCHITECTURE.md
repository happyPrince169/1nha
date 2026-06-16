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

Current media may be Supabase Storage.

Future preferred direction:

```text
Cloudflare R2 as main media store
Supabase/Postgres for metadata
Optional Cloudflare Images for dynamic transformations
Optional Cloudflare Stream for video playback
```

Media abstraction should be introduced before major migration:

```text
upload image
delete image
create signed URL
create thumbnail URL
download/open image
```

Avoid hardcoding storage provider logic across many pages.

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
