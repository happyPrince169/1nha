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
  | "content_generated"
  | "content_copied"
  | "content_marked_posted"
  | "content_archived"
  | "property_image_uploaded"
  | "property_image_deleted"
  | "property_cover_updated"
  | "content_edited"
  | "post_assistant_opened"
  | "post_assistant_text_copied"
  | "post_assistant_marked_posted"
  | "style_profile_created"
  | "style_profile_updated"
  | "style_profile_deleted"
  | "style_profile_used"
  | "account_profile_updated"
  | "billing_viewed"
  | "upgrade_interest_submitted";

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
