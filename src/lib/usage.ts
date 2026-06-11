// ---------------------------------------------------------------------------
// usage.ts — fire-and-forget usage event tracker
//
// Inserts a row into `usage_events`. Designed to never throw so a tracking
// failure never breaks the primary user action.
//
// Usage:
//   import { trackEvent } from "@/lib/usage";
//   await trackEvent(supabase, user.id, "property_created", { property_id });
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";

export type UsageEventType =
  | "property_created"
  | "property_updated"
  | "quick_add_text"
  | "quick_add_image"
  | "content_generated";

/**
 * Insert a usage event row. Never throws — errors are silently swallowed so
 * a tracking failure cannot block the calling Server Action.
 */
export async function trackEvent(
  supabase: SupabaseClient,
  userId: string,
  eventType: UsageEventType,
  metadata: Record<string, string | number | boolean | null> = {}
): Promise<void> {
  try {
    await supabase.from("usage_events").insert({
      user_id: userId,
      event_type: eventType,
      metadata,
    });
  } catch {
    // Intentionally swallowed — tracking must not break primary flows.
  }
}
