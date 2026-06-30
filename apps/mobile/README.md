# 1nha Mobile (Expo)

Minimal Expo + React Native companion app for 1nha (Broker OS). **Phase 5A
skeleton: Sign In, Property List, Property Detail, Account.** Read-only.

## Architecture (read this first)

The mobile app is a **thin client**. It does **not** talk to the database.

- **Supabase** is used for **Auth/session only** (sign in, token refresh, sign
  out). Session tokens are stored in the device secure store (Keychain/Keystore)
  via a chunked `expo-secure-store` adapter.
- **All data** (properties, images, content, …) is fetched from the existing
  **Next.js API** (`/api/*`) with `Authorization: Bearer <access_token>`. Those
  routes reuse the web's service layer + RLS, so web and mobile enforce the
  exact same permissions.
- **No service-role key. No direct Supabase queries. No backend logic** lives in
  the mobile app.

```
Mobile (Expo)
  └─ Supabase Auth ──> access token
  └─ fetch(API_BASE_URL + /api/*, Bearer token) ──> Next.js API ──> service layer ──> RLS ──> DB
```

## Prerequisites

- Node 18+ and npm
- The Expo Go app on a phone, or an iOS Simulator / Android Emulator
- A running 1nha web app (local `npm run dev` or a deployed URL) that serves the
  `/api/*` routes

## Setup

```bash
cd apps/mobile
cp .env.example .env        # fill in the three EXPO_PUBLIC_* values
npm install
```

`.env` values:

| Var | Meaning |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | URL of the Next.js app hosting `/api`. On a **physical device** use your computer's LAN IP (e.g. `http://192.168.1.20:3000`), not `localhost`. |
| `EXPO_PUBLIC_SUPABASE_URL` | Same as the web `NEXT_PUBLIC_SUPABASE_URL`. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same as the web `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, RLS-scoped). |

> Only **public** values live in the app. There are no secrets and no
> service-role key.

If native dependency versions need reconciling for your installed Expo SDK:

```bash
npx expo install --fix
```

## Run

```bash
npm start          # Expo dev server (press i / a, or scan the QR in Expo Go)
npm run android    # open on Android emulator/device
npm run ios        # open on iOS simulator (macOS)
```

Sign in with an existing 1nha account (the same email/password used on the web).
New accounts and team/member management are done on the web.

## Checks

```bash
npm run typecheck   # tsc --noEmit
```

(The mobile app has its own toolchain; it is excluded from the web app's
`lint` / `typecheck` / `build`.)

## Scope (Phase 5A)

Included: email/password auth with secure session storage + refresh; property
list (pull-to-refresh, loading/error/empty states); property detail (core facts,
assignment, legal/planning shown only when present, read-only image thumbnails);
account + sign out.

Deferred: any create/edit/upload, quick add, content generation, post assistant,
workspace/member management, push, offline, video/map/legal features.
