"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getRequestContext } from "@/lib/workspace/request-context";
import { toApiError } from "@/lib/api/errors";
import { trackEvent } from "@/lib/usage";
import * as propertyImages from "@/lib/services/property-images";

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

/** Revalidate all paths that display property images. */
function revalidateImagePaths(propertyId: string) {
  revalidatePath(`/dashboard/properties/${propertyId}/images`);
  revalidatePath(`/dashboard/properties/${propertyId}`);
  // Property list shows cover thumbnails.
  revalidatePath(`/dashboard/properties`);
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
// uploadPropertyImage  (LEGACY — Supabase Storage)
//
// Retained as a fallback path that routes file bytes through the Server Action
// into the Supabase Storage bucket. New uploads use the R2 presigned flow below
// (requestPropertyImageUpload → direct browser PUT → finalizePropertyImageUpload)
// to keep large files off the Server Action and store media in Cloudflare R2.
// Do not delete: it still works for environments without R2 configured and
// documents the original flow.
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
// requestPropertyImageUpload  (Cloudflare R2 — step 1 of 2)
//
// Validates ownership + file constraints, presigns a PUT URL for R2, and
// inserts a "pending" metadata row (storage_provider = 'cloudflare_r2',
// storage_path = R2_PENDING_PATH). The browser then uploads bytes directly to
// R2 using the returned uploadUrl, and calls finalizePropertyImageUpload.
//
// Bytes never pass through this Server Action — only metadata + a presigned URL.
// ---------------------------------------------------------------------------
export type RequestUploadInput = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type RequestUploadResult =
  | {
      ok: true;
      imageId: string;
      uploadUrl: string;
      originalKey: string;
      /** Echoed back so the browser PUTs with the exact signed Content-Type. */
      contentType: string;
      expiresIn: number;
    }
  | { ok: false; error: string };

export async function requestPropertyImageUpload(
  propertyId: string,
  input: RequestUploadInput
): Promise<RequestUploadResult> {
  try {
    const ctx = await getRequestContext();
    const result = await propertyImages.requestPropertyImageUpload(
      ctx,
      propertyId,
      input
    );
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: toApiError(err).message };
  }
}

// ---------------------------------------------------------------------------
// requestProcessedPropertyImageUpload  (Cloudflare R2 — processed, step 1 of 2)
//
// The browser has already resized/compressed the photo into a social-ready
// "main" image and a small "thumbnail". This validates ownership + the
// processed file metadata, presigns a PUT URL for each, and inserts a pending
// metadata row carrying both R2 keys + size/dimension fields. The browser then
// PUTs both files directly to R2 and calls finalizePropertyImageUpload.
//
// Bytes never pass through this Server Action — only metadata + presigned URLs.
// ---------------------------------------------------------------------------
export type ProcessedImageMeta = {
  mimeType: string;
  sizeBytes: number;
};

export type RequestProcessedUploadInput = {
  fileName: string;
  /** Dimensions of the processed MAIN image (stored on the row). */
  width: number;
  height: number;
  original: ProcessedImageMeta;
  thumbnail: ProcessedImageMeta;
};

export type RequestProcessedUploadResult =
  | {
      ok: true;
      imageId: string;
      originalUploadUrl: string;
      thumbnailUploadUrl: string;
      originalKey: string;
      thumbnailKey: string;
      /** Echoed so the browser PUTs with the exact signed Content-Type. */
      originalContentType: string;
      thumbnailContentType: string;
      expiresIn: number;
    }
  | { ok: false; error: string };

export async function requestProcessedPropertyImageUpload(
  propertyId: string,
  input: RequestProcessedUploadInput
): Promise<RequestProcessedUploadResult> {
  try {
    const ctx = await getRequestContext();
    const targets = await propertyImages.requestPropertyImageUploadTargets(
      ctx,
      propertyId,
      input
    );
    return { ok: true, ...targets };
  } catch (err) {
    return { ok: false, error: toApiError(err).message };
  }
}

// ---------------------------------------------------------------------------
// finalizePropertyImageUpload  (Cloudflare R2 — step 2 of 2)
//
// Called after the browser has PUT the bytes to R2. Re-verifies ownership and
// marks the row ready by mirroring original_key into storage_path (so any code
// still reading storage_path keeps working), then revalidates image surfaces.
// ---------------------------------------------------------------------------
export type FinalizeUploadResult = { ok: true } | { ok: false; error: string };

export async function finalizePropertyImageUpload(
  propertyId: string,
  imageId: string
): Promise<FinalizeUploadResult> {
  try {
    const ctx = await getRequestContext();
    await propertyImages.finalizePropertyImageUpload(ctx, propertyId, {
      imageId,
    });
    revalidateImagePaths(propertyId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toApiError(err).message };
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
    const ctx = await getRequestContext();
    await propertyImages.setPropertyCoverImage(ctx, propertyId, imageId);
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
    const ctx = await getRequestContext();
    await propertyImages.deletePropertyImage(ctx, propertyId, imageId);
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
    const ctx = await getRequestContext();

    const getString = (key: string): string | null => {
      const v = formData.get(key);
      return typeof v === "string" ? v : null;
    };

    await propertyImages.updatePropertyImage(ctx, propertyId, imageId, {
      caption: getString("caption"),
      alt_text: getString("alt_text"),
    });

    revalidateImagePaths(propertyId);
    return { error: null };
  } catch (err) {
    return { error: toApiError(err).message };
  }
}
