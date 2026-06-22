"use server";

import { revalidatePath } from "next/cache";

import { getRequestContext } from "@/lib/workspace/request-context";
import { toApiError } from "@/lib/api/errors";
import {
  updateGeneratedContent,
  archiveGeneratedContent,
} from "@/lib/services/generated-content";
import {
  markContentCopied as markContentCopiedService,
  markContentScheduled as markContentScheduledService,
  markContentPosted as markContentPostedService,
} from "@/lib/services/post-assistant";

// ---------------------------------------------------------------------------
// Revalidate all paths that display content for a property.
// ---------------------------------------------------------------------------
function revalidateContentPaths(propertyId: string, contentId: string) {
  revalidatePath(`/dashboard/properties/${propertyId}/content`);
  revalidatePath(`/dashboard/properties/${propertyId}/content/${contentId}`);
  revalidatePath(
    `/dashboard/properties/${propertyId}/content/${contentId}/post`
  );
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
  try {
    const ctx = await getRequestContext();
    const { propertyId } = await markContentCopiedService(ctx, contentId);
    revalidateContentPaths(propertyId, contentId);
  } catch {
    // Swallow — fire-and-forget from the copy button; a failure just leaves
    // copied_at unchanged, which is safe.
  }
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
  try {
    const ctx = await getRequestContext();
    const scheduledAtRaw = formData.get("scheduled_at");
    const { propertyId } = await markContentScheduledService(ctx, contentId, {
      scheduledAt: typeof scheduledAtRaw === "string" ? scheduledAtRaw : null,
    });
    revalidateContentPaths(propertyId, contentId);
    return { error: null };
  } catch (err) {
    return { error: toApiError(err).message };
  }
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
  try {
    const ctx = await getRequestContext();
    const getString = (key: string) => {
      const v = formData.get(key);
      return typeof v === "string" ? v : null;
    };

    const { propertyId } = await markContentPostedService(ctx, contentId, {
      postedAt: getString("posted_at"),
      channelName: getString("channel_name"),
      postUrl: getString("post_url"),
    });

    revalidateContentPaths(propertyId, contentId);
    return { error: null };
  } catch (err) {
    return { error: toApiError(err).message };
  }
}

// ---------------------------------------------------------------------------
// archiveContent
//
// Sets status = 'archived'. Triggers content_archived usage event.
// ---------------------------------------------------------------------------
export async function archiveContent(contentId: string): Promise<void> {
  try {
    const ctx = await getRequestContext();
    const content = await archiveGeneratedContent(ctx, contentId);
    revalidateContentPaths(content.property_id, contentId);
  } catch {
    // Swallow — UI revalidates; a failure leaves the content unchanged, which
    // is safe (matches the previous fire-and-forget behavior).
  }
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
  try {
    const ctx = await getRequestContext();
    const raw = formData.get("output_text");
    const content = await updateGeneratedContent(ctx, contentId, {
      content: typeof raw === "string" ? raw : "",
    });
    revalidateContentPaths(content.property_id, contentId);
    return { error: null, success: true };
  } catch (err) {
    return { error: toApiError(err).message, success: false };
  }
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
  try {
    const ctx = await getRequestContext();
    const notes = formData.get("notes");
    const content = await updateGeneratedContent(ctx, contentId, {
      notes: typeof notes === "string" ? notes : null,
    });
    revalidateContentPaths(content.property_id, contentId);
    return { error: null };
  } catch (err) {
    return { error: toApiError(err).message };
  }
}
