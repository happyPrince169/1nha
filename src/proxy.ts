import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Route constants — keep in one place so they never drift
// ---------------------------------------------------------------------------
const SIGN_IN_PATH = "/sign-in";
const DASHBOARD_PATH = "/dashboard";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    // Pass destination so callback can redirect back after login
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  /*
   * Run on every path except Next.js internals and common static assets.
   * The negative lookahead prevents the proxy from blocking CSS/JS/images.
   */
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
