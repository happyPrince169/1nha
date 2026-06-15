"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { trackEvent } from "@/lib/usage";

// ---------------------------------------------------------------------------
// Shared auth helper — returns the authenticated user or throws.
// ---------------------------------------------------------------------------
async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Shared ownership check — verifies the content belongs to the user.
// Returns the content row on success, null on failure.
// ---------------------------------------------------------------------------
async function fetchOwnedContent(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  contentId: string,
  userId: string
) {
  const { data } = await supabase
    .from("generated_contents")
    .select("id, property_id, status")
    .eq("id", contentId)
    .eq("user_id", userId)
    .single();
  return data;
}

// ---------------------------------------------------------------------------
// Revalidate all paths that display content for a property.
// ---------------------------------------------------------------------------
function revalidateContentPaths(propertyId: string, contentId: string) {
  revalidatePath(`/dashboard/properties/${propertyId}/content`);
  revalidatePath(`/dashboard/properties/${propertyId}/content/${contentId}`);
  revalidatePath(`/dashboard/properties/${propertyId}`);
  revalidatePath("/dashboard/content");
}

// ---------------------------------------------------------------------------
// markContentCopied
//
// Sets copied_at = now(). Idempotent — repeated calls just refresh the
// timestamp. Triggers content_copied usage event.
// ---------------------------------------------------------------------------
export async function markContentCopied(contentId: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return;

  const content = await fetchOwnedContent(supabase, contentId, user.id);
  if (!content) return;

  await supabase
    .from("generated_contents")
    .update({ copied_at: new Date().toISOString() })
    .eq("id", contentId)
    .eq("user_id", user.id);

  await trackEvent(supabase, user.id, "content_copied", {
    content_id: contentId,
    property_id: content.property_id,
  });

  revalidateContentPaths(content.property_id, contentId);
}

// ---------------------------------------------------------------------------
// markContentScheduled
//
// Sets status = 'scheduled' and scheduled_at from formData.
// ---------------------------------------------------------------------------
export type MarkScheduledState = { error: string | null };

export async function markContentScheduled(
  contentId: string,
  _prev: MarkScheduledState,
  formData: FormData
): Promise<MarkScheduledState> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const content = await fetchOwnedContent(supabase, contentId, user.id);
  if (!content) return { error: "Không tìm thấy content." };

  const scheduledAtRaw = formData.get("scheduled_at");
  const scheduledAt =
    typeof scheduledAtRaw === "string" && scheduledAtRaw.trim()
      ? new Date(scheduledAtRaw).toISOString()
      : null;

  const { error } = await supabase
    .from("generated_contents")
    .update({
      status: "scheduled",
      scheduled_at: scheduledAt,
    })
    .eq("id", contentId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateContentPaths(content.property_id, contentId);
  return { error: null };
}

// ---------------------------------------------------------------------------
// markContentPosted
//
// Sets status = 'posted', posted_at = now(), plus optional channel_name /
// post_url from formData. Triggers content_marked_posted usage event.
// ---------------------------------------------------------------------------
export type MarkPostedState = { error: string | null };

export async function markContentPosted(
  contentId: string,
  _prev: MarkPostedState,
  formData: FormData
): Promise<MarkPostedState> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const content = await fetchOwnedContent(supabase, contentId, user.id);
  if (!content) return { error: "Không tìm thấy content." };

  const getString = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const postedAtRaw = getString("posted_at");
  const postedAt = postedAtRaw
    ? new Date(postedAtRaw).toISOString()
    : new Date().toISOString();

  const { error } = await supabase
    .from("generated_contents")
    .update({
      status: "posted",
      posted_at: postedAt,
      channel_name: getString("channel_name"),
      post_url: getString("post_url"),
    })
    .eq("id", contentId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  await trackEvent(supabase, user.id, "content_marked_posted", {
    content_id: contentId,
    property_id: content.property_id,
  });

  revalidateContentPaths(content.property_id, contentId);
  return { error: null };
}

// ---------------------------------------------------------------------------
// archiveContent
//
// Sets status = 'archived'. Triggers content_archived usage event.
// ---------------------------------------------------------------------------
export async function archiveContent(contentId: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return;

  const content = await fetchOwnedContent(supabase, contentId, user.id);
  if (!content) return;

  await supabase
    .from("generated_contents")
    .update({ status: "archived" })
    .eq("id", contentId)
    .eq("user_id", user.id);

  await trackEvent(supabase, user.id, "content_archived", {
    content_id: contentId,
    property_id: content.property_id,
  });

  revalidateContentPaths(content.property_id, contentId);
}

// ---------------------------------------------------------------------------
// updateContentText
//
// Saves an edited version of the AI-generated text body.
// Sets updated_at and edited_at = now() so the UI can show an "edited" badge.
// Scoped by both id and user_id.
// ---------------------------------------------------------------------------
export type UpdateTextState = { error: string | null; success: boolean };

export async function updateContentText(
  contentId: string,
  _prev: UpdateTextState,
  formData: FormData
): Promise<UpdateTextState> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { error: "Bạn cần đăng nhập.", success: false };

  const content = await fetchOwnedContent(supabase, contentId, user.id);
  if (!content) return { error: "Không tìm thấy content.", success: false };

  const raw = formData.get("output_text");
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: "Nội dung không được để trống.", success: false };
  }
  const text = raw.trim();

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("generated_contents")
    .update({
      content: text,
      updated_at: now,
      edited_at: now,
    })
    .eq("id", contentId)
    .eq("user_id", user.id);

  if (error) return { error: error.message, success: false };

  await trackEvent(supabase, user.id, "content_edited", {
    content_id: contentId,
    property_id: content.property_id,
  });

  revalidateContentPaths(content.property_id, contentId);
  return { error: null, success: true };
}

// ---------------------------------------------------------------------------
// updateContentNotes
//
// Saves the notes field. No status change.
// ---------------------------------------------------------------------------
export type UpdateNotesState = { error: string | null };

export async function updateContentNotes(
  contentId: string,
  _prev: UpdateNotesState,
  formData: FormData
): Promise<UpdateNotesState> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const content = await fetchOwnedContent(supabase, contentId, user.id);
  if (!content) return { error: "Không tìm thấy content." };

  const notes = formData.get("notes");
  const notesValue =
    typeof notes === "string" && notes.trim() ? notes.trim() : null;

  const { error } = await supabase
    .from("generated_contents")
    .update({ notes: notesValue })
    .eq("id", contentId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateContentPaths(content.property_id, contentId);
  return { error: null };
}
