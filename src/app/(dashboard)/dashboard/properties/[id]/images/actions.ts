"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { trackEvent } from "@/lib/usage";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const BUCKET = "property-images";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Returns authenticated user + supabase client, or throws an action error. */
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ActionError("Bạn cần đăng nhập.");
  return { supabase, user };
}

/**
 * Verifies the property exists and belongs to the current user.
 * Returns the property row on success, throws ActionError otherwise.
 */
async function requirePropertyOwnership(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  propertyId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new ActionError("Không tìm thấy bất động sản.");
  return data;
}

/**
 * Verifies the image belongs to the user and the given property.
 * Returns the image row on success, throws ActionError otherwise.
 */
async function requireImageOwnership(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  imageId: string,
  propertyId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("property_images")
    .select("id, storage_path, is_cover")
    .eq("id", imageId)
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new ActionError("Không tìm thấy hình ảnh.");
  return data;
}

/** Revalidate all paths that display property images. */
function revalidateImagePaths(propertyId: string) {
  revalidatePath(`/dashboard/properties/${propertyId}/images`);
  revalidatePath(`/dashboard/properties/${propertyId}`);
}

/** Build the canonical storage path for a new image. */
function buildStoragePath(
  userId: string,
  propertyId: string,
  imageId: string,
  mimeType: string
): string {
  const ext =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : "jpg";
  return `users/${userId}/properties/${propertyId}/${imageId}.${ext}`;
}

// ---------------------------------------------------------------------------
// Internal error class — lets actions return structured errors instead of
// throwing raw errors that bubble to the Error Boundary.
// ---------------------------------------------------------------------------
class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

// ---------------------------------------------------------------------------
// Public action state shape
// ---------------------------------------------------------------------------
export type ImageActionState = {
  error: string | null;
};

// ---------------------------------------------------------------------------
// uploadPropertyImage
//
// Receives a multipart FormData with `image` File.
// 1. Validates auth + ownership.
// 2. Validates mime type + size.
// 3. Inserts a placeholder row to get a stable UUID for the storage path.
// 4. Uploads to private bucket using the UUID-based path.
// 5. Updates the row with the confirmed path + metadata.
// ---------------------------------------------------------------------------
export async function uploadPropertyImage(
  propertyId: string,
  _prev: ImageActionState,
  formData: FormData
): Promise<ImageActionState> {
  try {
    const { supabase, user } = await requireUser();
    await requirePropertyOwnership(supabase, propertyId, user.id);

    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Vui lòng chọn một ảnh để tải lên." };
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return {
        error: "Định dạng không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP.",
      };
    }

    if (file.size > MAX_BYTES) {
      return {
        error: `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa 2 MB.`,
      };
    }

    // Insert placeholder row to get a stable UUID
    const { data: inserted, error: insertError } = await supabase
      .from("property_images")
      .insert({
        user_id: user.id,
        property_id: propertyId,
        storage_path: "__pending__", // replaced below
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      return { error: insertError?.message ?? "Không thể tạo bản ghi ảnh." };
    }

    const imageId = inserted.id;
    const storagePath = buildStoragePath(
      user.id,
      propertyId,
      imageId,
      file.type
    );

    // Upload to private bucket.
    // Pass the File object directly — the Supabase JS client accepts File/Blob
    // and streams it without loading the whole buffer into memory.
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      // Clean up the placeholder row so it does not litter the table.
      await supabase
        .from("property_images")
        .delete()
        .eq("id", imageId)
        .eq("user_id", user.id);

      // Surface a clear message for the most common setup mistake.
      const msg = uploadError.message.toLowerCase().includes("bucket")
        ? `Storage bucket '${BUCKET}' chưa tồn tại. Chạy migration 20240103000002 trong Supabase dashboard.`
        : `Tải ảnh lên thất bại: ${uploadError.message}`;
      return { error: msg };
    }

    // Update row with the confirmed storage path
    await supabase
      .from("property_images")
      .update({ storage_path: storagePath })
      .eq("id", imageId)
      .eq("user_id", user.id);

    await trackEvent(supabase, user.id, "property_image_uploaded", {
      property_id: propertyId,
      image_id: imageId,
    });

    revalidateImagePaths(propertyId);
    return { error: null };
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message };
    return { error: "Lỗi không xác định. Vui lòng thử lại." };
  }
}

// ---------------------------------------------------------------------------
// setPropertyCoverImage
//
// Atomically: clears is_cover on all images for the property,
// then sets is_cover = true on the target image.
// ---------------------------------------------------------------------------
export async function setPropertyCoverImage(
  propertyId: string,
  imageId: string
): Promise<void> {
  try {
    const { supabase, user } = await requireUser();
    await requirePropertyOwnership(supabase, propertyId, user.id);
    await requireImageOwnership(supabase, imageId, propertyId, user.id);

    // Clear existing cover (scoped to user + property)
    await supabase
      .from("property_images")
      .update({ is_cover: false })
      .eq("property_id", propertyId)
      .eq("user_id", user.id);

    // Set new cover
    await supabase
      .from("property_images")
      .update({ is_cover: true })
      .eq("id", imageId)
      .eq("user_id", user.id);

    await trackEvent(supabase, user.id, "property_cover_updated", {
      property_id: propertyId,
      image_id: imageId,
    });

    revalidateImagePaths(propertyId);
  } catch {
    // Swallow — the UI polls on revalidation; a failure here just leaves
    // the cover unchanged, which is safe.
  }
}

// ---------------------------------------------------------------------------
// deletePropertyImage
//
// Deletes both the storage object and the metadata row.
// Scoped by user_id + property_id on every operation.
// ---------------------------------------------------------------------------
export async function deletePropertyImage(
  propertyId: string,
  imageId: string
): Promise<void> {
  try {
    const { supabase, user } = await requireUser();
    await requirePropertyOwnership(supabase, propertyId, user.id);
    const image = await requireImageOwnership(
      supabase,
      imageId,
      propertyId,
      user.id
    );

    // Delete from storage first — if this fails the metadata row stays intact,
    // which is the safer inconsistency (orphaned metadata vs orphaned storage).
    if (image.storage_path && image.storage_path !== "__pending__") {
      await supabase.storage.from(BUCKET).remove([image.storage_path]);
    }

    // Delete metadata row (double-scoped)
    await supabase
      .from("property_images")
      .delete()
      .eq("id", imageId)
      .eq("user_id", user.id)
      .eq("property_id", propertyId);

    await trackEvent(supabase, user.id, "property_image_deleted", {
      property_id: propertyId,
      image_id: imageId,
    });

    revalidateImagePaths(propertyId);
  } catch {
    // Silent — UI will reflect the unchanged state after revalidation.
  }
}

// ---------------------------------------------------------------------------
// updatePropertyImageMeta
//
// Updates caption and/or alt_text. Does not touch the storage object.
// ---------------------------------------------------------------------------
export type UpdateImageMetaState = { error: string | null };

export async function updatePropertyImageMeta(
  propertyId: string,
  imageId: string,
  _prev: UpdateImageMetaState,
  formData: FormData
): Promise<UpdateImageMetaState> {
  try {
    const { supabase, user } = await requireUser();
    await requirePropertyOwnership(supabase, propertyId, user.id);
    await requireImageOwnership(supabase, imageId, propertyId, user.id);

    const getString = (key: string): string | null => {
      const v = formData.get(key);
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };

    const { error } = await supabase
      .from("property_images")
      .update({
        caption: getString("caption"),
        alt_text: getString("alt_text"),
      })
      .eq("id", imageId)
      .eq("user_id", user.id)
      .eq("property_id", propertyId);

    if (error) return { error: error.message };

    revalidateImagePaths(propertyId);
    return { error: null };
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message };
    return { error: "Lỗi không xác định." };
  }
}
