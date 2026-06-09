// ---------------------------------------------------------------------------
// Supabase Auth callback — exchanges the one-time code for a session.
// Supabase redirects here after the user clicks the magic-link email.
// ---------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  // `next` is the path we stored in the sign-in redirect (defaults to /dashboard)
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Something went wrong — send back to sign-in with an error hint
  return NextResponse.redirect(
    new URL(`/sign-in?error=auth_callback_failed`, origin)
  );
}
