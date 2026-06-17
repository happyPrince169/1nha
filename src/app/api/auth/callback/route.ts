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
      // Backfill the broker profile from signup metadata once the session is
      // live (email-confirmation path can't write user_profiles before this).
      // Best-effort: never block the redirect on a profile write.
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const meta = user?.user_metadata as
          | { display_name?: string | null; phone?: string | null }
          | undefined;
        if (user && meta && (meta.display_name || meta.phone)) {
          // Only create the row if it doesn't exist yet — never overwrite
          // profile edits the user later makes on the account page.
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
  }

  // Something went wrong — send back to sign-in with an error hint
  return NextResponse.redirect(
    new URL(`/sign-in?error=auth_callback_failed`, origin)
  );
}
