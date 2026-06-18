"use server";

// ---------------------------------------------------------------------------
// Auth Server Actions — email + password authentication for 1nha.
//
// All actions run only on the server (no secrets reach the browser) and use the
// Supabase anon key via the SSR client. Password login is the primary method;
// magic link is kept as an optional secondary fallback.
// ---------------------------------------------------------------------------
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { normalizeVietnamesePhone } from "@/lib/auth/phone";

// ---------------------------------------------------------------------------
// Shared types + helpers
// ---------------------------------------------------------------------------
export type AuthFormState = {
  error: string | null;
  /** Set by flows that show an inline success message instead of redirecting. */
  success?: boolean;
};

/** State for the phone OTP flow (send → verify). */
export type PhoneOtpState = {
  error: string | null;
  /** Normalized E.164 phone the OTP was sent to (echoed for the verify step). */
  phone: string | null;
  /** True once an OTP has been dispatched, so the UI advances to the code step. */
  otpSent?: boolean;
};

const MSG = {
  emailRequired: "Vui lòng nhập email.",
  emailInvalid: "Email không hợp lệ. Vui lòng kiểm tra lại.",
  passwordRequired: "Vui lòng nhập mật khẩu.",
  passwordTooShort: "Mật khẩu cần có ít nhất 8 ký tự.",
  passwordMismatch: "Mật khẩu xác nhận không khớp.",
  invalidCredentials: "Email hoặc mật khẩu không đúng.",
  emailNotConfirmed: "Tài khoản chưa được xác nhận. Vui lòng kiểm tra email.",
  generic: "Có lỗi xảy ra. Vui lòng thử lại.",
} as const;

const MIN_PASSWORD_LENGTH = 8;

function readString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Loose email check — enough to catch obvious typos without over-rejecting. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Map raw Supabase auth error messages to friendly Vietnamese copy. */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return MSG.invalidCredentials;
  if (m.includes("email not confirmed")) return MSG.emailNotConfirmed;
  if (m.includes("password")) return MSG.passwordTooShort;
  return MSG.generic;
}

/**
 * Build the absolute auth-callback URL Supabase will redirect email links to.
 * Supabase requires an ABSOLUTE url here (and it must be listed in the project's
 * Redirect URLs). A relative path silently breaks recovery/confirmation, so we
 * fail loudly when NEXT_PUBLIC_SITE_URL is not configured.
 */
function callbackUrl(next: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL chưa được cấu hình. Đặt biến này trong .env.local " +
        "(ví dụ http://localhost:3000) để link email xác thực/đặt lại mật khẩu hoạt động."
    );
  }
  return `${base.replace(/\/+$/, "")}/api/auth/callback?next=${encodeURIComponent(next)}`;
}

// ---------------------------------------------------------------------------
// signInWithPassword — primary login
// ---------------------------------------------------------------------------
export async function signInWithPassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = readString(formData, "email");
  const password = readString(formData, "password");

  if (!email) return { error: MSG.emailRequired };
  if (!isValidEmail(email)) return { error: MSG.emailInvalid };
  if (!password) return { error: MSG.passwordRequired };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: friendlyAuthError(error.message) };

  // Success — establish session cookie then enter the dashboard.
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// signUpWithPassword — create account with email + password
//
// display_name + phone are stored in auth user_metadata so they survive email
// confirmation (no session yet → cannot write user_profiles under RLS). When
// confirmation is disabled and a session is returned, we also upsert the
// user_profiles row immediately. The auth callback backfills the profile after
// email confirmation. A failed profile write never fails the signup.
// ---------------------------------------------------------------------------
export async function signUpWithPassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const displayName = readString(formData, "display_name");
  const email = readString(formData, "email");
  const phone = readString(formData, "phone");
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirm_password");

  if (!email) return { error: MSG.emailRequired };
  if (!isValidEmail(email)) return { error: MSG.emailInvalid };
  if (!password) return { error: MSG.passwordRequired };
  if (password.length < MIN_PASSWORD_LENGTH)
    return { error: MSG.passwordTooShort };
  if (password !== confirmPassword) return { error: MSG.passwordMismatch };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl("/dashboard"),
      data: {
        display_name: displayName || null,
        phone: phone || null,
      },
    },
  });

  if (error) return { error: friendlyAuthError(error.message) };

  // If confirmation is disabled, Supabase returns a live session — persist the
  // profile now. Best-effort: never fail the signup on a profile write error.
  if (data.session && data.user) {
    try {
      await supabase.from("user_profiles").upsert(
        {
          user_id: data.user.id,
          display_name: displayName || null,
          phone: phone || null,
        },
        { onConflict: "user_id" }
      );
    } catch {
      // Ignore — profile can be completed later from the account page.
    }
  }

  return { error: null, success: true };
}

// ---------------------------------------------------------------------------
// sendPasswordReset — forgot password
//
// Always reports success so we never leak whether an email is registered.
// Existing magic-link-only users use this to set their first password.
// ---------------------------------------------------------------------------
export async function sendPasswordReset(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = readString(formData, "email");

  if (!email || !isValidEmail(email)) return { error: MSG.emailInvalid };

  const supabase = await createClient();
  // Recovery link lands on the callback which exchanges the code for a session,
  // then redirects to /reset-password where the user sets a new password.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl("/reset-password"),
  });

  // Intentionally ignore the error to avoid email enumeration.
  return { error: null, success: true };
}

// ---------------------------------------------------------------------------
// updatePassword — set a new password (requires an active recovery session)
// ---------------------------------------------------------------------------
export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirm_password");

  if (!password) return { error: MSG.passwordRequired };
  if (password.length < MIN_PASSWORD_LENGTH)
    return { error: MSG.passwordTooShort };
  if (password !== confirmPassword) return { error: MSG.passwordMismatch };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The recovery link must have established a session via the callback.
  if (!user) {
    return {
      error:
        "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: friendlyAuthError(error.message) };

  redirect("/sign-in?status=password_updated");
}

// ---------------------------------------------------------------------------
// sendMagicLink — optional secondary login fallback (no longer primary)
// ---------------------------------------------------------------------------
export async function sendMagicLink(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = readString(formData, "email");

  if (!email || !isValidEmail(email)) return { error: MSG.emailInvalid };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl("/dashboard") },
  });

  if (error) return { error: MSG.generic };

  redirect("/sign-in?status=check_email");
}

// ---------------------------------------------------------------------------
// Phone OTP — primary login UX (Vietnamese mobile + SMS OTP via Supabase)
//
// Uses Supabase Phone Auth directly. The SMS provider must be configured in the
// Supabase dashboard (see docs/ARCHITECTURE.md). We never generate, store, or
// log OTP codes — Supabase owns the OTP lifecycle.
// ---------------------------------------------------------------------------
const PHONE_MSG = {
  otpSendFailed: "Không thể gửi mã OTP. Vui lòng thử lại sau.",
  otpInvalid: "Mã xác thực không đúng hoặc đã hết hạn. Vui lòng thử lại.",
  otpFormat: "Mã OTP gồm 6 chữ số.",
} as const;

/**
 * sendPhoneOtp — normalize the phone to E.164 and ask Supabase to send an SMS
 * OTP. Never reveals whether the number already has an account (Supabase
 * creates the user on first verify by default). The normalized phone is echoed
 * back so the verify step + "resend" target the exact same number.
 */
export async function sendPhoneOtp(
  _prev: PhoneOtpState,
  formData: FormData
): Promise<PhoneOtpState> {
  const normalized = normalizeVietnamesePhone(readString(formData, "phone"));
  if (!normalized.ok) return { error: normalized.error, phone: null };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: normalized.e164,
  });

  if (error) {
    // Keep the (valid) phone so the user can simply retry. Do not echo provider
    // internals or hint at account existence.
    return { error: PHONE_MSG.otpSendFailed, phone: normalized.e164, otpSent: false };
  }

  return { error: null, phone: normalized.e164, otpSent: true };
}

/**
 * verifyPhoneOtp — validate the 6-digit code against Supabase. On success a
 * session cookie is established; we best-effort ensure a user_profiles row
 * (never overwriting an existing one) and enter the dashboard. The personal
 * workspace is created by the auth.users trigger (Phase 2A), independent of
 * whether the user has an email.
 */
export async function verifyPhoneOtp(
  _prev: PhoneOtpState,
  formData: FormData
): Promise<PhoneOtpState> {
  const normalized = normalizeVietnamesePhone(readString(formData, "phone"));
  if (!normalized.ok) return { error: normalized.error, phone: null };

  const token = readString(formData, "token");
  if (!/^\d{6}$/.test(token)) {
    return { error: PHONE_MSG.otpFormat, phone: normalized.e164, otpSent: true };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone: normalized.e164,
    token,
    type: "sms",
  });

  if (error || !data.user) {
    return { error: PHONE_MSG.otpInvalid, phone: normalized.e164, otpSent: true };
  }

  // Best-effort profile row for phone-first users (email may be null). Use
  // ignoreDuplicates so an existing profile (e.g. an email user adding phone
  // login) is never overwritten. A failure here must not block sign-in.
  try {
    await supabase.from("user_profiles").upsert(
      {
        user_id: data.user.id,
        display_name: null,
        phone: normalized.e164,
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );
  } catch {
    // Ignore — profile can be completed later from the account page.
  }

  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
