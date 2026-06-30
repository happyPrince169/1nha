// ---------------------------------------------------------------------------
// Supabase client — AUTH ONLY.
//
// The mobile app uses Supabase exclusively for authentication/session: sign in,
// token refresh, sign out. It NEVER queries the database directly — all property
// / image / content reads + writes go through the Next.js API (see lib/api.ts),
// which reuses the server-side service layer + RLS. This keeps the web app as
// the single backend/permission surface. Anon key only; no service role.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { secureStorageAdapter } from "./secure-storage";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // React Native has no URL-based OAuth redirect to detect.
    detectSessionInUrl: false,
  },
});
