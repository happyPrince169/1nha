// ---------------------------------------------------------------------------
// Public runtime config (Expo inlines EXPO_PUBLIC_* at build time).
//
// These are all PUBLIC values: the API base URL and the Supabase anon key
// (RLS-scoped by design). No secrets, no service-role key — the mobile app
// never holds privileged credentials.
// ---------------------------------------------------------------------------

function read(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    // Surface misconfiguration early and clearly rather than failing deep in a
    // network/auth call. (Does not print any secret — only the missing key.)
    throw new Error(
      `Missing env ${name}. Copy apps/mobile/.env.example to .env and fill it in.`
    );
  }
  return value.trim();
}

export const API_BASE_URL = read(
  "EXPO_PUBLIC_API_BASE_URL",
  process.env.EXPO_PUBLIC_API_BASE_URL
).replace(/\/$/, "");

export const SUPABASE_URL = read(
  "EXPO_PUBLIC_SUPABASE_URL",
  process.env.EXPO_PUBLIC_SUPABASE_URL
);

export const SUPABASE_ANON_KEY = read(
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);
