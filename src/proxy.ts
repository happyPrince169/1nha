import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Route constants — keep in one place so they never drift
// ---------------------------------------------------------------------------
const SIGN_IN_PATH = "/sign-in";
const DASHBOARD_PATH = "/dashboard";

// ---------------------------------------------------------------------------
// Known stale-session error codes. These are EXPECTED when a refresh token
// cookie is gone/rotated (e.g. after sign-out elsewhere, password change, or
// old browser cookies). We treat the user as logged out and clear the stale
// cookies — without crashing or spamming errors. We deliberately do NOT
// swallow other auth errors.
// ---------------------------------------------------------------------------
const STALE_SESSION_CODES = new Set([
  "refresh_token_not_found",
  "invalid_refresh_token",
  "refresh_token_already_used",
]);

function isStaleSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code && STALE_SESSION_CODES.has(e.code)) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("refresh token not found") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token already used")
  );
}

/** Supabase SSR auth cookies are named `sb-<ref>-auth-token` (optionally
 *  chunked: `…-auth-token.0`, `.1`). Match the family generically. */
function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("auth-token");
}

/** Expire any Supabase auth cookies on the given response so the browser drops
 *  the stale session and stops re-sending the dead refresh token. */
function clearAuthCookies(request: NextRequest, response: NextResponse): void {
  for (const cookie of request.cookies.getAll()) {
    if (isSupabaseAuthCookie(cookie.name)) {
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Build a mutable response we can attach refreshed auth cookies to.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // ---------------------------------------------------------------------------
  // Supabase client wired to the edge-compatible cookie store.
  // getUser() makes a lightweight JWT validation call — never skip it.
  // ---------------------------------------------------------------------------
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Propagate refreshed tokens to both the mutated request object
          // and the outgoing response so downstream Server Components see them.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the JWT on every request — never use getSession() here
  // because the session can be spoofed from the browser cookie store.
  //
  // A stale/missing refresh token is an EXPECTED condition: Supabase returns it
  // as an error (and may even throw on a network hiccup). Handle it gracefully
  // — treat the user as logged out and clear the dead cookies — rather than
  // letting it bubble up as a 500 or noisy console error.
  let user = null;
  let authError: unknown = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    authError = result.error;
  } catch (err) {
    authError = err;
  }

  const stale = isStaleSessionError(authError);
  const isAuthenticated = !!user;
  const isOnSignIn = pathname.startsWith(SIGN_IN_PATH);
  const isOnDashboard = pathname.startsWith(DASHBOARD_PATH);

  // Authenticated → never show sign-in page again
  if (isAuthenticated && isOnSignIn) {
    return NextResponse.redirect(new URL(DASHBOARD_PATH, request.url));
  }

  // Unauthenticated → block every dashboard route
  if (!isAuthenticated && isOnDashboard) {
    const loginUrl = new URL(SIGN_IN_PATH, request.url);
    // Pass destination so the user returns here after logging in
    loginUrl.searchParams.set("next", pathname);
    const redirectRes = NextResponse.redirect(loginUrl);
    // Drop the dead session cookies on the way out so the noise stops.
    if (stale) clearAuthCookies(request, redirectRes);
    return redirectRes;
  }

  // On a public/auth route with a stale cookie: clear it (so subsequent
  // requests carry no dead token) but let the request through.
  if (stale) clearAuthCookies(request, response);

  return response;
}

export const config = {
  /*
   * Only run the proxy where its auth logic is actually needed:
   *   • /dashboard/**  → block unauthenticated users (+ refresh session cookies)
   *   • /sign-in       → bounce already-authenticated users to the dashboard
   *
   * Every other path (public landing, /pricing, /sign-up, /forgot-password,
   * /reset-password, the /api/auth/callback handler, and ALL static assets /
   * _next internals / images) is skipped — so the expensive supabase.auth
   * .getUser() JWT-validation call (previously ~1s+ on every request) no longer
   * runs on pages that don't gate on auth. Those routes manage their own
   * Supabase session via the server client when they need one.
   */
  matcher: ["/dashboard/:path*", "/sign-in"],
};
