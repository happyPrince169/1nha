# Phase 3D — Org-read alignment + authenticated API smoke tests

## Purpose

Phase 3D is a hardening/refactor pass before the Team UI MVP (Phase 4). It has
two parts:

1. **Org-read alignment** — remaining dashboard server-component read paths that
   still filtered by `user_id` now go through the organization/workspace-scoped
   **service layer** (Properties / Property Images / Style Profiles / Generated
   Content / Post Assistant). Solo-user behavior is unchanged; team access
   becomes correct later. Cross-org ids resolve to `NOT_FOUND`.
2. **Authenticated API smoke test** — a safe, read-only-by-default Node script
   that signs in as a test user and exercises the core mobile-ready APIs with a
   Bearer token.

No product features, UI, schema, RLS, auth flows, billing, or nav changed.

## Read paths aligned (Part A)

All now use `tryGetRequestContext()` + shared services instead of direct
`.eq("user_id", user.id)` Supabase reads:

| Page | Before | After |
| --- | --- | --- |
| `dashboard/page.tsx` (stat counts) | `properties` / `generated_contents` by `user_id` | counts by `organization_id` (via ctx) |
| `properties/page.tsx` (list thumbnails) | `property_images` by `user_id` | by org-scoped `property_id IN (...)` + RLS |
| `properties/[id]/page.tsx` (detail) | `property_images` + `generated_contents` by `ctx.userId` | `listPropertyImages` + `listPropertyGeneratedContents` |
| `properties/[id]/generate/page.tsx` | `properties` + `content_style_profiles` by `user_id` | `getPropertyById` + `listStyleProfiles` |
| `properties/[id]/edit/page.tsx` | `properties` by `user_id` | `getPropertyById` |
| `properties/[id]/images/page.tsx` | `properties` + `property_images` by `user_id` | `getPropertyById` + `listPropertyImages` |
| `properties/[id]/content/page.tsx` | `properties` + `generated_contents` by `user_id` | `getPropertyById` + `listPropertyGeneratedContents` |
| `properties/[id]/content/[contentId]/page.tsx` | `generated_contents` + profile + property by `user_id` | `getGeneratedContentForProperty` + `getStyleProfile` + `getPropertyById` |
| `properties/[id]/content/[contentId]/post/page.tsx` | content + property + `property_images` by `user_id` | `getGeneratedContentForProperty` + `getPropertyById` + `listPropertyImages` (thumbnail + original) |
| `content/page.tsx` (already 3B-3) | — | `listGeneratedContents` |
| `style-profiles/page.tsx` | `content_style_profiles` by `user_id` | `listStyleProfiles` |
| `style-profiles/[profileId]/page.tsx` | `content_style_profiles` by `user_id` | `getStyleProfile` |

### Intentionally left `user_id`-scoped (justified)

- `account/page.tsx` → `user_profiles` is **personal user metadata** (display
  name, phone, company, role), not an org resource. Correctly user-scoped.
- `api/auth/callback/route.ts` → auth identity bootstrap. Correct.
- `properties/[id]/images/actions.ts` legacy `uploadPropertyImage` → legacy
  Supabase Storage fallback **write** action (kept since Phase 3B-1); the R2
  flow already delegates to the org-scoped service.

## Running the authenticated smoke test (Part B)

```bash
SMOKE_BASE_URL=http://localhost:3000 \
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
SMOKE_TEST_EMAIL=<test-user-email> \
SMOKE_TEST_PASSWORD=<test-user-password> \
npm run smoke:api
```

(Or run a built/preview/prod URL by changing `SMOKE_BASE_URL`.)

### Required env

| Var | Meaning |
| --- | --- |
| `SMOKE_BASE_URL` | Base URL of the running app (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (NEVER the service-role key) |
| `SMOKE_TEST_EMAIL` | Test account email |
| `SMOKE_TEST_PASSWORD` | Test account password |

### Optional env (unlock deeper checks)

| Var | Effect |
| --- | --- |
| `SMOKE_PROPERTY_ID` | GET property, its images, its generated-contents |
| `SMOKE_CONTENT_ID` | GET content + its post-assistant package |
| `SMOKE_STYLE_PROFILE_ID` | GET single style profile |
| `SMOKE_IMAGE_ID` | (with `SMOKE_CONTENT_ID`) POST image-urls (thumbnail + original) |
| `SMOKE_FOREIGN_PROPERTY_ID` | Expect `404 NOT_FOUND` (cross-org isolation) |
| `SMOKE_FOREIGN_CONTENT_ID` | Expect `404 NOT_FOUND` (cross-org isolation) |
| `SMOKE_RUN_MUTATIONS=1` | Enables the low-risk `post-assistant/copied` mutation |
| `SMOKE_RUN_GENERATE=1` | Enables ONE OpenAI generation (**costs tokens**) |

### Read-only vs mutation mode

- **Default = read-only.** Only GETs + the explicit `image-urls` POST (which
  signs URLs but mutates nothing) run.
- `SMOKE_RUN_MUTATIONS=1` adds **only** `mark copied` (sets `copied_at`) — the
  safest, idempotent status write.
- `SMOKE_RUN_GENERATE=1` adds one content generation.

### Why generate / regenerate / archive / scheduled / posted are off by default

- **generate / regenerate** call OpenAI → cost + non-determinism; off unless
  `SMOKE_RUN_GENERATE=1`.
- **archive** changes content lifecycle/visibility → not safe to run against
  real data automatically.
- **scheduled / posted** mutate posting status/history → would pollute the
  broker's records; only `copied` (idempotent timestamp) is allowed, behind
  `SMOKE_RUN_MUTATIONS=1`.

### Expected output

```
1nha API smoke test → http://localhost:3000
Mode: read-only

  [PASS] sign-in (email/password) — access token acquired
  [PASS] GET /api/properties (no auth) → 401 — status=401 code=UNAUTHORIZED
  [PASS] GET /api/generated-contents (no auth) → 401 — status=401 code=UNAUTHORIZED
  [PASS] GET /api/properties — status=200
  [PASS] GET /api/style-profiles — status=200
  [PASS] GET /api/generated-contents — status=200
  [skip] property-scoped reads (set SMOKE_PROPERTY_ID)
  ...
──────────────────────────────────────────────
Smoke summary: 6/6 passed, 0 failed
──────────────────────────────────────────────
```

Exit code is `0` when all checks pass, `1` otherwise (CI-friendly). The access
token is **never** printed.

## Known limitations

- The script does not create fixtures; deeper checks require ids you provide via
  the optional env vars (use a dedicated test workspace).
- Cross-org checks require ids from a *different* organization that the test
  user cannot access.
- `mark copied` is idempotent but still writes `copied_at`; keep it behind the
  mutation flag for prod runs.
- The script validates HTTP status + `{ ok }` envelope shape, not full payload
  schemas.

## Next phase

After manual web smoke + this authenticated smoke pass, proceed to
**Phase 4 — Team UI MVP** (workspace settings, members, invites, roles). Vietnam
SMS OTP provider remains paused; social OAuth still not needed; no auto-posting.
