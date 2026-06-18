// ---------------------------------------------------------------------------
// Supabase server client  (used in Server Components, Route Handlers,
// Server Actions — reads/writes cookies via next/headers)
// ---------------------------------------------------------------------------
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from a Server Component — safe to ignore.
          }
        },
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Bearer-token client (stateless) — for API requests from non-browser clients
// (future Expo/mobile app) that send `Authorization: Bearer <access_token>`.
//
// Uses the public ANON key (never the service-role key). The user's access
// token is attached as a global Authorization header so BOTH JWT validation
// (auth.getUser) and every PostgREST/Storage request run AS that user — i.e.
// RLS-scoped exactly like the cookie session. No session is persisted.
// ---------------------------------------------------------------------------
export function createBearerClient(accessToken: string) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
