// ---------------------------------------------------------------------------
// Supabase Auth callback — exchanges the one-time code for a session.
// Used by password recovery (?next=/reset-password), email confirmation, and
// the optional magic-link fallback. Handles expired/invalid links cleanly so
// users never land on /?error=... with raw Supabase error params.
// ---------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Only allow internal redirect targets. Rejects external URLs and
 * protocol-relative ("//evil.com") paths. Falls back to /dashboard.
 */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // 1. Supabase appended an auth error to the callback (expired/invalid link,
  //    access denied, etc.). Map to a friendly sign-in status — never expose
  //    the raw error params to the user.
  const errorParam = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  if (errorParam || errorCode) {
    const status = errorCode === "otp_expired" ? "link_expired" : "auth_link_error";
    return NextResponse.redirect(new URL(`/sign-in?status=${status}`, origin));
  }

  // 2. Exchange the one-time code for a session.
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/sign-in?status=auth_link_error", origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/sign-in?status=auth_link_error", origin)
    );
  }

  // Backfill the broker profile from signup metadata once the session is live
  // (email-confirmation path can't write user_profiles before this).
  // Best-effort: never block the redirect on a profile write.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const meta = user?.user_metadata as
      | { display_name?: string | null; phone?: string | null }
      | undefined;
    if (user && meta && (meta.display_name || meta.phone)) {
      // Only create the row if it doesn't exist yet — never overwrite profile
      // edits the user later makes on the account page.
      const { data: existing } = await supabase
        .from("user_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) {
        await supabase.from("user_profiles").insert({
          user_id: user.id,
          display_name: meta.display_name ?? null,
          phone: meta.phone ?? null,
        });
      }
    }
  } catch {
    // Ignore — profile can be completed later from the account page.
  }

  return NextResponse.redirect(new URL(next, origin));
}
