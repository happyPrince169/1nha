
# CLAUDE.md

## Project

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

## Tech Stack

* Next.js 16 App Router
* React 19
* TypeScript strict
* Tailwind CSS
* shadcn/ui style components
* Supabase Auth, Database, Storage
* Vercel deploy
* OpenAI REST API for AI/OCR/content generation

## Product Principles

1. Mobile-first.
2. Keep UI simple like a mobile app, not an admin panel.
3. Main bottom navigation has exactly 5 tabs:
   * Tổng quan
   * Kho nguồn
   * Nhập nhanh
   * Nội dung
   * Tài khoản
4. Do not auto-post to Facebook/Zalo/TikTok.
5. Post Assistant prepares text and images. The user manually posts and then marks content as posted.
6. User data trust is critical:
   * Nguồn của user là của user.
   * Khách của user là của user.
   * 1nha only provides software workflow.
7. Do not invent missing property facts in AI content.

## Important Routes

```text
/                                  Public landing
/pricing                           Pricing preview

/dashboard                         Main dashboard
/dashboard/properties              Property inventory
/dashboard/properties/quick-add    AI quick add
/dashboard/properties/[id]         Property detail
/dashboard/properties/[id]/images  Property images
/dashboard/properties/[id]/generate Generate AI content
/dashboard/content                 Content workspace
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

## Core Data Models

Main tables may include:

```text
properties
property_images
generated_contents
content_style_profiles
usage_events
user_profiles
upgrade_interest_requests
```

Always scope user-owned queries by `user_id`.

## Security Rules

* Never expose another user's data.
* Always check authenticated user before reading or writing dashboard data.
* Server actions must validate ownership by `user_id`.
* Do not fetch or display sensitive internal notes unless the specific page needs them.
* Do not expose `owner_note`, `planning_note`, customer info, or private broker notes in public-facing/posting screens.
* Do not add social login, auto-posting, or WebView JavaScript injection unless explicitly requested and reviewed.

## AI Content Rules

When generating real estate content:

* Use only property fields available in the database.
* Do not invent:
  * legal status
  * house direction
  * exact address
  * planning information
  * owner information
  * road width
  * frontage
  * price
  * area
  * number of bedrooms/bathrooms
* If a field is missing, write neutrally or omit it.
* If style profile rules are selected, use them only for tone, structure, formatting, emoji usage, CTA style, and phrasing rhythm.
* Never copy sample posts verbatim.

## Coding Guidelines

* Keep TypeScript strict.
* Avoid unsafe `any`.
* Prefer small components and clear server actions.
* Keep business logic in `src/lib` when possible.
* Do not duplicate logic already available in existing helpers/components.
* Prefer server-side ownership checks.
* Prefer URL search params for filters/search state.
* Use mobile-first UI.
* Keep copy in Vietnamese.

## Storage / Media Direction

Current image/media handling may use Supabase Storage.

Future direction may move media to Cloudflare R2, so isolate storage logic where possible.

Prefer a storage abstraction layer for media operations:

```text
upload image
delete image
create signed URL
create thumbnail URL
download/open image
```

Do not hardcode storage logic across many pages.

## Navigation Rules

Bottom navigation must have exactly 5 main items:

```text
Tổng quan     -> /dashboard
Kho nguồn     -> /dashboard/properties
Nhập nhanh    -> /dashboard/properties/quick-add
Nội dung      -> /dashboard/content
Tài khoản     -> /dashboard/account
```

Secondary features belong inside sections:

```text
Văn phong       -> inside Nội dung
Gói sử dụng     -> inside Tài khoản
Bảng giá        -> inside Tài khoản or public /pricing
Liên hệ & góp ý -> inside Tài khoản
```

## Commands

After code changes, run:

```bash
npm run lint
npm run typecheck
npm run build
```

Fix all errors before considering the task complete.

## Do Not Do Unless Asked

* Do not redesign unrelated screens.
* Do not add payment gateway.
* Do not enforce credits.
* Do not add native mobile code.
* Do not migrate storage provider.
* Do not add auto-posting to social platforms.
* Do not add Facebook/Zalo/TikTok API integration.
* Do not change database schema unless the task requires it.
* Do not remove existing working flows.

## Default Task Behavior

Before editing code:

1. Inspect relevant files.
2. Reuse existing patterns.
3. Make the smallest safe change.
4. Preserve existing behavior.
5. Run lint, typecheck, and build.
6. Summarize what changed and any follow-up risks.
