// ---------------------------------------------------------------------------
// POST /api/auth/sms-hook — Supabase Auth "Send SMS Hook" endpoint
//
// Supabase generates the OTP and calls this endpoint to DELIVER it; Supabase
// also verifies it later. This route only forwards the OTP to a Vietnam SMS
// provider (eSMS) via the provider abstraction. It never generates, stores, or
// verifies OTPs, and never logs the OTP value.
//
// Auth: a shared secret (SUPABASE_SEND_SMS_HOOK_SECRET) is required — preferred
// via the `x-1nha-hook-secret` header, with a `?secret=` query fallback for
// dashboards that cannot send custom headers (keep it long + random). See
// docs/SMS_OTP_PROVIDER_SETUP.md. If the project later adopts Supabase's
// official HMAC (standardwebhooks) signing, swap `isAuthorized` for that.
//
// Status contract: 200 (sent) · 401 (bad/missing secret) · 400 (bad payload) ·
// 502 (provider send failed) · 500 (server/provider misconfig).
// ---------------------------------------------------------------------------
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { sendOtp, OtpProviderConfigError } from "@/lib/otp/send-otp";

// Node runtime: provider call + node:crypto, no edge constraints.
export const runtime = "nodejs";

type HookPayload = {
  user?: { id?: string; phone?: string };
  sms?: { otp?: string };
};

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Validate the shared secret from header (preferred) or query param. */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.SUPABASE_SEND_SMS_HOOK_SECRET;
  if (!expected) return false; // not configured → cannot authorize → reject

  const provided =
    request.headers.get("x-1nha-hook-secret") ??
    request.nextUrl.searchParams.get("secret") ??
    "";

  return provided.length > 0 && safeEqual(provided, expected);
}

export async function POST(request: NextRequest) {
  // 0. Refuse to run if the hook secret is not configured (no open endpoint).
  if (!process.env.SUPABASE_SEND_SMS_HOOK_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Hook secret chưa được cấu hình trên máy chủ." },
      { status: 500 }
    );
  }

  // 1. Authorize.
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // 2. Parse + validate payload.
  let payload: HookPayload;
  try {
    payload = (await request.json()) as HookPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const phone = payload.user?.phone?.trim();
  const otp = payload.sms?.otp?.trim();
  if (!phone || !otp) {
    return NextResponse.json(
      { ok: false, error: "Missing user.phone or sms.otp" },
      { status: 400 }
    );
  }

  // 3. Deliver via provider. Never log the OTP.
  try {
    const result = await sendOtp({
      phone,
      otp,
      userId: payload.user?.id,
      requestId: request.headers.get("x-request-id") ?? undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "Provider send failed" },
        { status: 502 }
      );
    }

    // Supabase only needs a 2xx; include a tiny body for debuggability.
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Missing/invalid provider env → setup bug, not a transient failure.
    if (err instanceof OtpProviderConfigError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "Unexpected provider error" },
      { status: 502 }
    );
  }
}
