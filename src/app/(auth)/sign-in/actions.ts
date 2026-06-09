"use server";

// ---------------------------------------------------------------------------
// Server Actions — sign-in and sign-out. Both run only on the server;
// no secrets are exposed to the browser.
// ---------------------------------------------------------------------------
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// sendMagicLink
// ---------------------------------------------------------------------------
export async function sendMagicLink(formData: FormData) {
  const email = formData.get("email");

  if (typeof email !== "string" || !email.includes("@")) {
    redirect("/sign-in?error=invalid_email");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // After clicking the link Supabase redirects here; the route handler
      // in app/api/auth/callback/route.ts finalises the session exchange.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
    },
  });

  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  // All good — tell the page to show the "check your email" screen
  redirect("/sign-in?status=check_email");
}

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
