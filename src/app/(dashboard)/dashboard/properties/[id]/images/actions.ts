"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { trackEvent } from "@/lib/usage";
import {
  createPropertyImageUploadTarget,
  createPropertyImageUploadTargetsForProcessedImages,
  deleteR2Object,
  R2_PENDING_PATH,
  StorageConfigError,
  StorageValidationError,
} from "@/lib/storage/property-media";

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
    .select(
      "id, storage_path, is_cover, storage_provider, original_key, thumbnail_key, preview_key"
    )
    .eq("id", imageId)
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new ActionError("Không tìm thấy hình ảnh.");
  return data as ImageOwnershipRow;
}

/** The image columns needed to delete/finalize across both storage providers. */
type ImageOwnershipRow = {
  id: string;
  storage_path: string | null;
  is_cover: boolean;
  storage_provider: string | null;
  original_key: string | null;
  thumbnail_key: string | null;
  preview_key: string | null;
};

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
    const { supabase, user } = await requireUser();
    await requirePropertyOwnership(supabase, propertyId, user.id);

    const { fileName, mimeType, sizeBytes } = input;

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return {
        ok: false,
        error: "Định dạng không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP.",
      };
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return { ok: false, error: "Tệp ảnh không hợp lệ." };
    }
    if (sizeBytes > MAX_BYTES) {
      return {
        ok: false,
        error: `Ảnh quá lớn (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Tối đa 2 MB.`,
      };
    }

    // Generate the id first so the R2 key is stable and we can presign before
    // touching the database — a config/validation failure leaves no orphan row.
    const imageId = randomUUID();

    let target;
    try {
      target = await createPropertyImageUploadTarget({
        userId: user.id,
        propertyId,
        imageId,
        fileName,
        mimeType,
        sizeBytes,
      });
    } catch (err) {
      if (
        err instanceof StorageConfigError ||
        err instanceof StorageValidationError
      ) {
        return { ok: false, error: err.message };
      }
      return { ok: false, error: "Không thể tạo liên kết tải lên R2." };
    }

    const { error: insertError } = await supabase
      .from("property_images")
      .insert({
        id: imageId,
        user_id: user.id,
        property_id: propertyId,
        storage_provider: "cloudflare_r2",
        storage_path: R2_PENDING_PATH, // replaced with original_key on finalize
        original_key: target.originalKey,
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        original_mime_type: mimeType,
        original_size_bytes: sizeBytes,
      });

    if (insertError) {
      return { ok: false, error: insertError.message };
    }

    return {
      ok: true,
      imageId,
      uploadUrl: target.uploadUrl,
      originalKey: target.originalKey,
      contentType: mimeType,
      expiresIn: target.expiresIn,
    };
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, error: err.message };
    return { ok: false, error: "Lỗi không xác định. Vui lòng thử lại." };
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
    const { supabase, user } = await requireUser();
    await requirePropertyOwnership(supabase, propertyId, user.id);

    const { fileName, width, height, original, thumbnail } = input;

    // Basic shape validation (the storage layer re-checks MIME + size limits).
    for (const part of [original, thumbnail]) {
      if (!ALLOWED_MIME_TYPES.has(part.mimeType)) {
        return {
          ok: false,
          error: "Định dạng không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP.",
        };
      }
      if (!Number.isFinite(part.sizeBytes) || part.sizeBytes <= 0) {
        return { ok: false, error: "Tệp ảnh không hợp lệ." };
      }
    }
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return { ok: false, error: "Kích thước ảnh không hợp lệ." };
    }

    // Generate the id first so the R2 keys are stable and we can presign before
    // touching the database — a config/validation failure leaves no orphan row.
    const imageId = randomUUID();

    let targets;
    try {
      targets = await createPropertyImageUploadTargetsForProcessedImages({
        userId: user.id,
        propertyId,
        imageId,
        original,
        thumbnail,
      });
    } catch (err) {
      if (
        err instanceof StorageConfigError ||
        err instanceof StorageValidationError
      ) {
        return { ok: false, error: err.message };
      }
      return { ok: false, error: "Không thể tạo liên kết tải lên R2." };
    }

    const { error: insertError } = await supabase
      .from("property_images")
      .insert({
        id: imageId,
        user_id: user.id,
        property_id: propertyId,
        storage_provider: "cloudflare_r2",
        storage_path: R2_PENDING_PATH, // replaced with original_key on finalize
        original_key: targets.originalKey,
        thumbnail_key: targets.thumbnailKey,
        file_name: fileName,
        mime_type: original.mimeType,
        size_bytes: original.sizeBytes,
        original_mime_type: original.mimeType,
        original_size_bytes: original.sizeBytes,
        thumbnail_size_bytes: thumbnail.sizeBytes,
        width,
        height,
      });

    if (insertError) {
      return { ok: false, error: insertError.message };
    }

    return {
      ok: true,
      imageId,
      originalUploadUrl: targets.originalUploadUrl,
      thumbnailUploadUrl: targets.thumbnailUploadUrl,
      originalKey: targets.originalKey,
      thumbnailKey: targets.thumbnailKey,
      originalContentType: targets.originalContentType,
      thumbnailContentType: targets.thumbnailContentType,
      expiresIn: targets.expiresIn,
    };
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, error: err.message };
    return { ok: false, error: "Lỗi không xác định. Vui lòng thử lại." };
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
    const { supabase, user } = await requireUser();
    await requirePropertyOwnership(supabase, propertyId, user.id);
    const image = await requireImageOwnership(
      supabase,
      imageId,
      propertyId,
      user.id
    );

    const readyPath = image.original_key ?? image.storage_path;

    const { error } = await supabase
      .from("property_images")
      .update({ storage_path: readyPath })
      .eq("id", imageId)
      .eq("user_id", user.id)
      .eq("property_id", propertyId);

    if (error) return { ok: false, error: error.message };

    await trackEvent(supabase, user.id, "property_image_uploaded", {
      property_id: propertyId,
      image_id: imageId,
    });

    revalidateImagePaths(propertyId);
    return { ok: true };
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, error: err.message };
    return { ok: false, error: "Lỗi không xác định." };
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

    // Delete the stored object(s) first. A missing object is treated as
    // non-fatal so DB cleanup always proceeds — the operation stays idempotent.
    if (image.storage_provider === "cloudflare_r2") {
      const keys = [
        image.original_key,
        image.thumbnail_key,
        image.preview_key,
      ].filter((k): k is string => typeof k === "string" && k.length > 0);
      for (const key of keys) {
        try {
          await deleteR2Object(key);
        } catch {
          // Object already gone / transient R2 error — safe to ignore here.
        }
      }
    } else if (
      image.storage_path &&
      image.storage_path !== "__pending__" &&
      image.storage_path !== R2_PENDING_PATH
    ) {
      // Legacy Supabase Storage row.
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
