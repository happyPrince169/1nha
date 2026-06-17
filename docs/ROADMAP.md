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

## Completed or Mostly Completed

### 1. Auth and Dashboard

```text
Supabase Auth
Protected dashboard
Mobile-first dashboard shell
Bottom navigation
```

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
