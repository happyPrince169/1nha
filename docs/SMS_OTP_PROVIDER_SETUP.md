# SMS OTP Provider Setup (Vietnam) — Supabase Send SMS Hook → eSMS

Phase 3A.3 routes Supabase Auth's SMS OTP through a **Vietnam provider (eSMS)**
instead of Supabase's built-in global SMS providers, using the **Supabase Send
SMS Hook**.

## Why this design

- Vietnam delivery + cost: built-in global SMS providers are expensive/unreliable
  for `+84`. eSMS (and later Zalo ZNS) is cheaper and more deliverable locally.
- **Supabase still owns OTP security.** Supabase **generates** the OTP and
  **verifies** it on `verifyOtp`. Our endpoint only **delivers** the code it
  receives from the hook. The app never generates, stores, or verifies OTPs, and
  never logs the OTP value.

```text
User taps "Gửi mã OTP"
  → sendPhoneOtp → supabase.auth.signInWithOtp({ phone })
  → Supabase generates OTP, calls Send SMS Hook → POST https://<host>/api/auth/sms-hook
  → our endpoint forwards OTP to eSMS → SMS/ZNS delivered
User enters code → verifyPhoneOtp → supabase.auth.verifyOtp({ phone, token, type:"sms" })
  → Supabase verifies → session
```

## Endpoint

```text
POST /api/auth/sms-hook            (runtime: nodejs)

Auth (shared secret, required):
  Preferred:  header  x-1nha-hook-secret: <SUPABASE_SEND_SMS_HOOK_SECRET>
  Fallback:   query   ?secret=<SUPABASE_SEND_SMS_HOOK_SECRET>   (keep long+random)

Request body (Supabase Send SMS Hook):
  { "user": { "id": "...", "phone": "+84..." }, "sms": { "otp": "123456" } }

Responses:
  200  { "ok": true }            OTP handed to provider
  401  { "ok": false, ... }      missing/invalid secret (or secret not configured)
  400  { "ok": false, ... }      malformed payload / missing phone or otp
  502  { "ok": false, ... }      provider call failed
  500  { "ok": false, ... }      provider env misconfigured (e.g. missing eSMS keys)
```

> If the project later adopts Supabase's official HMAC (standardwebhooks)
> signing for hooks, replace the secret check in `isAuthorized()` with signature
> verification. The header-secret approach is used here because the Supabase
> dashboard hook config reliably supports a custom value, and no signing library
> is currently a dependency.

## Environment variables (server-only — NEVER `NEXT_PUBLIC_*`)

```text
# Hook auth
SUPABASE_SEND_SMS_HOOK_SECRET=<long-random-string>

# Provider selection
OTP_PROVIDER=esms                 # default "esms"

# eSMS credentials
ESMS_API_KEY=...
ESMS_SECRET_KEY=...
ESMS_BRANDNAME=...                # required for SMS + the zns_sms SMS fallback
ESMS_MODE=sms_only                # sms_only | zns_sms
ESMS_SANDBOX=0                    # 1 = test mode (no real SMS billed)

# Only needed when ESMS_MODE=zns_sms (Zalo ZNS)
ESMS_OA_ID=...                    # Zalo Official Account id
ESMS_ZNS_TEMP_ID=...              # approved ZNS template id (param key "otp")
```

- `sms_only`: Brandname SMS via eSMS `SendMultipleMessage_V4` (non-unicode,
  `SmsType=2`).
- `zns_sms`: tries Zalo ZNS (`SendZaloMessage_V4`) first, then falls back to
  Brandname SMS on any ZNS failure.
- Message (non-unicode, ~1 segment):
  `Ma xac thuc 1nha cua ban la {OTP}. Ma co hieu luc trong 5 phut.`

> ⚠️ **Verify before production:** exact eSMS endpoint paths, field names,
> `SmsType`, and the ZNS `TempData` param key depend on your eSMS account /
> approved templates / API version. They are isolated in
> `src/lib/otp/providers/esms.ts` (small builder functions) — confirm against
> the eSMS dashboard/API docs and adjust there. Use `ESMS_SANDBOX=1` while
> validating.

## Supabase dashboard setup

1. **Authentication → Providers → Phone:** Enable (no built-in SMS provider
   needed once the hook is on).
2. **Authentication → Hooks → Send SMS Hook:** Enable, type **HTTP**, URL:
   ```
   https://<your-host>/api/auth/sms-hook
   ```
   - If the hook config lets you add a custom header, set
     `x-1nha-hook-secret: <SUPABASE_SEND_SMS_HOOK_SECRET>`.
   - Otherwise use the URL with `?secret=<SUPABASE_SEND_SMS_HOOK_SECRET>`
     (keep it long and random; it appears in the hook URL only).
3. **Authentication → Rate limits:** set sane OTP send/verify limits — these
   remain **authoritative** (our endpoint does no rate limiting).
4. Set the same env vars in **Vercel → Project → Settings → Environment
   Variables** (Production + Preview), never in `NEXT_PUBLIC_*`.

## Test checklist

1. **Local env:** put the vars in `.env.local`. With `ESMS_SANDBOX=1`, POST the
   sample payload (below) with the secret — expect `200 { "ok": true }` (sandbox
   does not bill). Without eSMS vars, expect `500` with a clear missing-env list.
2. **Vercel env:** set the same vars; redeploy.
3. **Supabase hook config:** point the Send SMS Hook at the deployed URL + secret.
4. **Real send:** on `/sign-in`, enter a real `+84` mobile → receive the SMS/ZNS.
5. **Verify:** enter the code → lands on `/dashboard`.
6. **Workspace:** confirm the new phone user has a personal organization
   (`organizations` + `organization_members`, see PHASE_2A_DB_VERIFICATION.md).
7. **Mobile token:** after phone login, the access token works:
   `curl -i https://<host>/api/properties -H "Authorization: Bearer <token>"`.

### Sample hook payload (docs/testing only — not a real OTP)

```bash
curl -i -X POST "https://<host>/api/auth/sms-hook" \
  -H "content-type: application/json" \
  -H "x-1nha-hook-secret: <SUPABASE_SEND_SMS_HOOK_SECRET>" \
  -d '{
    "user": { "id": "00000000-0000-0000-0000-000000000000", "phone": "+84901234567" },
    "sms": { "otp": "123456" }
  }'
```

## Operational notes (logs / cost / rate limits)

- **No OTP logs table** is added (not needed yet). The app never persists or
  logs the OTP. Dev-only `console.log` records that a send was *requested*
  (masked phone, mode) — never the code.
- **Supabase Auth rate limits remain authoritative** for OTP send/verify.
- **Monitor provider cost** (eSMS/ZNS) — each send is billable in production.
- **Future:** an OTP *send* log (provider, masked phone, result code, timestamp —
  **never the OTP**) can be added if delivery debugging needs it.

## Future provider options

The adapter is isolated behind `src/lib/otp/providers/*` + `OTP_PROVIDER`, so
adding providers is local:

- **Stringee** SMS-only
- **Zalo / ZNS** as primary with SMS fallback (already the `zns_sms` mode)
- **VIHAT / VietGuys / FPT / VNPT / Viettel** brandname SMS

Add a new `providers/<name>.ts` implementing `OtpProvider`, register it in
`send-otp.ts`, and select via `OTP_PROVIDER`. Do not put any provider secret in
`NEXT_PUBLIC_*`.
