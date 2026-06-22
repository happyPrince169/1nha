// ---------------------------------------------------------------------------
// Property Images service layer  (SERVER ONLY)
//
// Single source of property-image business logic, shared by:
//   • web Server Actions / Server Components
//   • /api/properties/[id]/images route handlers (future Expo mobile app)
//
// Organization-aware (Phase 2A/3A): every operation first verifies the parent
// PROPERTY belongs to the caller's current organization, then scopes image
// queries by property_id. RLS (`property_images_member_all`, scoped through the
// parent property's organization) is the backstop, so a guessed
// property/image id from another workspace resolves to NOT_FOUND, never a leak.
//
// Storage is delegated entirely to src/lib/storage/property-media.ts — this
// file never signs URLs or talks to R2/Supabase Storage directly, so signing
// logic stays in exactly one place. Both providers (Cloudflare R2 for new
// uploads, legacy Supabase Storage) are preserved. Pending (not-yet-finalized)
// rows are excluded from every read surface.
//
// Validation throws ApiError (VALIDATION_ERROR / NOT_FOUND) with Vietnamese
// messages, consistent with the Properties service.
// ---------------------------------------------------------------------------
import "server-only";

import { randomUUID } from "node:crypto";

import type { RequestContext } from "@/lib/workspace/request-context";
import { validationError, notFound, internalError } from "@/lib/api/errors";
import { trackEvent } from "@/lib/usage";
import {
  createPropertyImageUploadTarget,
  createPropertyImageUploadTargetsForProcessedImages,
  deleteR2Object,
  getPropertyImageSignedUrls,
  R2_PENDING_PATH,
  SUPABASE_BUCKET,
  StorageConfigError,
  StorageValidationError,
  type MediaImageRef,
} from "@/lib/storage/property-media";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Max accepted size for the simple (single-file) R2 upload target path. */
export const MAX_SIMPLE_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
/** Editable caption / alt-text length caps. */
export const MAX_CAPTION_LENGTH = 500;
export const MAX_ALT_TEXT_LENGTH = 500;

/** Legacy placeholder path for a Supabase row whose upload has not finalized. */
const LEGACY_PENDING_PATH = "__pending__";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns needed to render a gallery row + resolve a signed URL (both providers). */
const IMAGE_LIST_COLUMNS =
  "id, property_id, storage_path, file_name, mime_type, size_bytes, width, height, " +
  "alt_text, caption, sort_order, is_cover, created_at, storage_provider, " +
  "original_key, thumbnail_key, preview_key";

/** Minimal columns to act on an image (delete / finalize / cover). */
const IMAGE_ACTION_COLUMNS =
  "id, storage_path, is_cover, storage_provider, original_key, thumbnail_key, preview_key";

// ---------------------------------------------------------------------------
// Internal row shapes (Supabase type-gen predates the R2 columns)
// ---------------------------------------------------------------------------
type ImageDbRow = {
  id: string;
  property_id: string;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
  storage_provider: string | null;
  original_key: string | null;
  thumbnail_key: string | null;
  preview_key: string | null;
};

type ImageActionRow = {
  id: string;
  storage_path: string | null;
  is_cover: boolean;
  storage_provider: string | null;
  original_key: string | null;
  thumbnail_key: string | null;
  preview_key: string | null;
};

// ---------------------------------------------------------------------------
// Public output shape
//
// Deliberately omits storage_path / *_key — clients consume the short-lived
// signed `url` only. No storage secrets or raw object keys cross the wire.
// ---------------------------------------------------------------------------
export type ImageUrlVariant = "thumbnail" | "original";

export type PropertyImageItem = {
  id: string;
  property_id: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
  storage_provider: string | null;
  /** Signed read URL for the requested variant; null if unresolved (e.g. pending). */
  url: string | null;
};

// ---------------------------------------------------------------------------
// Validation helpers (Vietnamese messages, consistent with properties.ts)
// ---------------------------------------------------------------------------
function assertUuid(value: string, label: string): void {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    throw validationError(`${label} không hợp lệ.`);
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validationError(`${label} không hợp lệ.`);
  }
  return value.trim();
}

function assertImageMime(mimeType: unknown): asserts mimeType is string {
  if (typeof mimeType !== "string" || !ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw validationError(
      "Định dạng không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP."
    );
  }
}

function assertPositiveSize(sizeBytes: unknown, maxBytes?: number): number {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw validationError("Tệp ảnh không hợp lệ.");
  }
  if (maxBytes !== undefined && sizeBytes > maxBytes) {
    throw validationError(
      `Ảnh quá lớn (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Tối đa ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`
    );
  }
  return sizeBytes;
}

function assertPositiveDimension(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw validationError(`${label} không hợp lệ.`);
  }
  return value;
}

/** Normalise an optional editable text field: trim, empty → null, length cap. */
function normaliseOptionalText(
  value: unknown,
  maxLength: number,
  label: string
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw validationError(`${label} không hợp lệ.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    throw validationError(`${label} quá dài (tối đa ${maxLength} ký tự).`);
  }
  return trimmed;
}

/** Map storage-layer errors onto the shared ApiError vocabulary. */
function rethrowStorageError(err: unknown): never {
  if (err instanceof StorageValidationError) throw validationError(err.message);
  if (err instanceof StorageConfigError) throw internalError(err.message);
  throw internalError("Không thể tạo liên kết tải lên R2.");
}

// ---------------------------------------------------------------------------
// Access guards — organization-aware through the parent property
// ---------------------------------------------------------------------------
/**
 * Verify the property exists in the caller's current organization. Throws
 * VALIDATION_ERROR (bad UUID) or NOT_FOUND (missing / another workspace). A
 * guessed cross-org propertyId can never pass this check.
 */
async function requirePropertyInOrg(
  ctx: RequestContext,
  propertyId: string
): Promise<void> {
  assertUuid(propertyId, "Mã bất động sản");

  const { data, error } = await ctx.supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!data) throw notFound("Không tìm thấy bất động sản.");
}

/**
 * Verify the image belongs to the given property. Call AFTER
 * requirePropertyInOrg so the org check has already gated the parent.
 */
async function requireImageRow(
  ctx: RequestContext,
  propertyId: string,
  imageId: string
): Promise<ImageActionRow> {
  assertUuid(imageId, "Mã hình ảnh");

  const { data, error } = await ctx.supabase
    .from("property_images")
    .select(IMAGE_ACTION_COLUMNS)
    .eq("id", imageId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!data) throw notFound("Không tìm thấy hình ảnh.");
  return data as unknown as ImageActionRow;
}

function toPublicItem(row: ImageDbRow, url: string | null): PropertyImageItem {
  return {
    id: row.id,
    property_id: row.property_id,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    width: row.width,
    height: row.height,
    alt_text: row.alt_text,
    caption: row.caption,
    sort_order: row.sort_order,
    is_cover: row.is_cover,
    created_at: row.created_at,
    storage_provider: row.storage_provider,
    url,
  };
}

// ---------------------------------------------------------------------------
// listPropertyImages — gallery read (cover → sort_order → created_at)
//
// Excludes not-yet-finalized rows from either provider. By default resolves
// THUMBNAIL signed URLs (cheap, fast) — callers must opt into "original"
// explicitly so list/gallery surfaces never pull full-resolution URLs.
// ---------------------------------------------------------------------------
export type ListPropertyImagesOptions = {
  variant?: ImageUrlVariant;
  /** Skip signed-URL resolution entirely (metadata only). */
  includeUrls?: boolean;
};

export async function listPropertyImages(
  ctx: RequestContext,
  propertyId: string,
  options: ListPropertyImagesOptions = {}
): Promise<PropertyImageItem[]> {
  await requirePropertyInOrg(ctx, propertyId);

  const variant: ImageUrlVariant = options.variant ?? "thumbnail";
  const includeUrls = options.includeUrls ?? true;

  const { data, error } = await ctx.supabase
    .from("property_images")
    .select(IMAGE_LIST_COLUMNS)
    .eq("property_id", propertyId)
    .neq("storage_path", LEGACY_PENDING_PATH)
    .neq("storage_path", R2_PENDING_PATH)
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw internalError(error.message);

  const rows = (data ?? []) as unknown as ImageDbRow[];
  if (rows.length === 0) return [];

  if (!includeUrls) {
    return rows.map((row) => toPublicItem(row, null));
  }

  const urlById = await getPropertyImageSignedUrls(
    rows as unknown as MediaImageRef[],
    ctx.supabase,
    { variant }
  );

  return rows.map((row) => toPublicItem(row, urlById.get(row.id) ?? null));
}

// ---------------------------------------------------------------------------
// getPropertyImage — single resource (excludes pending rows)
// ---------------------------------------------------------------------------
export async function getPropertyImage(
  ctx: RequestContext,
  propertyId: string,
  imageId: string,
  options: { variant?: ImageUrlVariant } = {}
): Promise<PropertyImageItem> {
  await requirePropertyInOrg(ctx, propertyId);
  assertUuid(imageId, "Mã hình ảnh");

  const { data, error } = await ctx.supabase
    .from("property_images")
    .select(IMAGE_LIST_COLUMNS)
    .eq("id", imageId)
    .eq("property_id", propertyId)
    .neq("storage_path", LEGACY_PENDING_PATH)
    .neq("storage_path", R2_PENDING_PATH)
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!data) throw notFound("Không tìm thấy hình ảnh.");

  const row = data as unknown as ImageDbRow;
  const url = await getPropertyImageSignedUrls(
    [row as unknown as MediaImageRef],
    ctx.supabase,
    { variant: options.variant ?? "thumbnail" }
  );
  return toPublicItem(row, url.get(row.id) ?? null);
}

// ---------------------------------------------------------------------------
// requestPropertyImageUpload — Cloudflare R2 single-file presigned PUT (step 1)
//
// Validates ownership + file metadata, presigns ONE PUT URL, and inserts a
// pending metadata row. The browser/mobile client PUTs bytes directly to R2,
// then calls finalizePropertyImageUpload. Bytes never pass through the server.
// ---------------------------------------------------------------------------
export type RequestUploadInput = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type RequestUploadResult = {
  imageId: string;
  uploadUrl: string;
  originalKey: string;
  /** Echoed so the client PUTs with the exact signed Content-Type. */
  contentType: string;
  expiresIn: number;
};

export async function requestPropertyImageUpload(
  ctx: RequestContext,
  propertyId: string,
  input: RequestUploadInput
): Promise<RequestUploadResult> {
  await requirePropertyInOrg(ctx, propertyId);

  const fileName = requireNonEmptyString(input?.fileName, "Tên tệp");
  assertImageMime(input?.mimeType);
  const sizeBytes = assertPositiveSize(input?.sizeBytes, MAX_SIMPLE_UPLOAD_BYTES);
  const mimeType = input.mimeType;

  // Generate the id first so the R2 key is stable and presigning happens before
  // any DB write — a config/validation failure leaves no orphan row.
  const imageId = randomUUID();

  let target;
  try {
    target = await createPropertyImageUploadTarget({
      userId: ctx.userId,
      propertyId,
      imageId,
      fileName,
      mimeType,
      sizeBytes,
    });
  } catch (err) {
    rethrowStorageError(err);
  }

  const { error: insertError } = await ctx.supabase
    .from("property_images")
    .insert({
      id: imageId,
      user_id: ctx.userId,
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

  if (insertError) throw internalError(insertError.message);

  return {
    imageId,
    uploadUrl: target.uploadUrl,
    originalKey: target.originalKey,
    contentType: mimeType,
    expiresIn: target.expiresIn,
  };
}

// ---------------------------------------------------------------------------
// requestPropertyImageUploadTargets — R2 presigned PUTs for a client-processed
// main (social-ready) image + small thumbnail (step 1). This is the default
// upload path used by the web app today and the future mobile client.
// ---------------------------------------------------------------------------
export type ProcessedImagePartInput = {
  mimeType: string;
  sizeBytes: number;
};

export type RequestUploadTargetsInput = {
  fileName: string;
  /** Dimensions of the processed MAIN image (stored on the row). */
  width: number;
  height: number;
  original: ProcessedImagePartInput;
  thumbnail: ProcessedImagePartInput;
};

export type RequestUploadTargetsResult = {
  imageId: string;
  originalUploadUrl: string;
  thumbnailUploadUrl: string;
  originalKey: string;
  thumbnailKey: string;
  originalContentType: string;
  thumbnailContentType: string;
  expiresIn: number;
};

export async function requestPropertyImageUploadTargets(
  ctx: RequestContext,
  propertyId: string,
  input: RequestUploadTargetsInput
): Promise<RequestUploadTargetsResult> {
  await requirePropertyInOrg(ctx, propertyId);

  const fileName = requireNonEmptyString(input?.fileName, "Tên tệp");
  const width = assertPositiveDimension(input?.width, "Chiều rộng ảnh");
  const height = assertPositiveDimension(input?.height, "Chiều cao ảnh");

  // Shape validation; the storage layer re-checks MIME + the per-variant size
  // limits (4 MB main / 700 KB thumbnail) as the authority.
  assertImageMime(input?.original?.mimeType);
  assertPositiveSize(input?.original?.sizeBytes);
  assertImageMime(input?.thumbnail?.mimeType);
  assertPositiveSize(input?.thumbnail?.sizeBytes);

  const original = input.original;
  const thumbnail = input.thumbnail;

  const imageId = randomUUID();

  let targets;
  try {
    targets = await createPropertyImageUploadTargetsForProcessedImages({
      userId: ctx.userId,
      propertyId,
      imageId,
      original,
      thumbnail,
    });
  } catch (err) {
    rethrowStorageError(err);
  }

  const { error: insertError } = await ctx.supabase
    .from("property_images")
    .insert({
      id: imageId,
      user_id: ctx.userId,
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

  if (insertError) throw internalError(insertError.message);

  return {
    imageId,
    originalUploadUrl: targets.originalUploadUrl,
    thumbnailUploadUrl: targets.thumbnailUploadUrl,
    originalKey: targets.originalKey,
    thumbnailKey: targets.thumbnailKey,
    originalContentType: targets.originalContentType,
    thumbnailContentType: targets.thumbnailContentType,
    expiresIn: targets.expiresIn,
  };
}

// ---------------------------------------------------------------------------
// finalizePropertyImageUpload — step 2: mark the row ready after the direct R2
// PUT(s). Mirrors original_key into storage_path so any code still reading
// storage_path keeps working, then the row becomes visible to reads.
// ---------------------------------------------------------------------------
export type FinalizeUploadInput = { imageId: string };

export async function finalizePropertyImageUpload(
  ctx: RequestContext,
  propertyId: string,
  input: FinalizeUploadInput
): Promise<{ id: string }> {
  await requirePropertyInOrg(ctx, propertyId);
  const imageId = input?.imageId ?? "";
  const image = await requireImageRow(ctx, propertyId, imageId);

  const readyPath = image.original_key ?? image.storage_path;

  const { error } = await ctx.supabase
    .from("property_images")
    .update({ storage_path: readyPath })
    .eq("id", imageId)
    .eq("property_id", propertyId);

  if (error) throw internalError(error.message);

  await trackEvent(ctx.supabase, ctx.userId, "property_image_uploaded", {
    property_id: propertyId,
    image_id: imageId,
  });

  return { id: imageId };
}

// ---------------------------------------------------------------------------
// updatePropertyImage — edit caption / alt text. Does not touch storage bytes.
// At least one editable field must be supplied.
// ---------------------------------------------------------------------------
export type UpdatePropertyImageInput = {
  caption?: string | null;
  alt_text?: string | null;
};

export async function updatePropertyImage(
  ctx: RequestContext,
  propertyId: string,
  imageId: string,
  input: UpdatePropertyImageInput
): Promise<{ id: string }> {
  await requirePropertyInOrg(ctx, propertyId);
  await requireImageRow(ctx, propertyId, imageId);

  const patch: { caption?: string | null; alt_text?: string | null } = {};
  if (input && "caption" in input) {
    patch.caption = normaliseOptionalText(
      input.caption,
      MAX_CAPTION_LENGTH,
      "Chú thích"
    );
  }
  if (input && "alt_text" in input) {
    patch.alt_text = normaliseOptionalText(
      input.alt_text,
      MAX_ALT_TEXT_LENGTH,
      "Mô tả ảnh"
    );
  }

  if (Object.keys(patch).length === 0) {
    throw validationError("Không có thay đổi nào để lưu.");
  }

  const { error } = await ctx.supabase
    .from("property_images")
    .update(patch)
    .eq("id", imageId)
    .eq("property_id", propertyId);

  if (error) throw internalError(error.message);
  return { id: imageId };
}

// ---------------------------------------------------------------------------
// deletePropertyImage — remove stored object(s) then the metadata row.
// Idempotent on the storage side (a missing object is non-fatal).
// ---------------------------------------------------------------------------
export async function deletePropertyImage(
  ctx: RequestContext,
  propertyId: string,
  imageId: string
): Promise<{ id: string }> {
  await requirePropertyInOrg(ctx, propertyId);
  const image = await requireImageRow(ctx, propertyId, imageId);

  // Delete bytes first; failures here are swallowed so DB cleanup always
  // proceeds and the operation stays idempotent.
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
        // Object already gone / transient R2 error — safe to ignore.
      }
    }
  } else if (
    image.storage_path &&
    image.storage_path !== LEGACY_PENDING_PATH &&
    image.storage_path !== R2_PENDING_PATH
  ) {
    // Legacy Supabase Storage row.
    await ctx.supabase.storage
      .from(SUPABASE_BUCKET)
      .remove([image.storage_path]);
  }

  const { error } = await ctx.supabase
    .from("property_images")
    .delete()
    .eq("id", imageId)
    .eq("property_id", propertyId);

  if (error) throw internalError(error.message);

  await trackEvent(ctx.supabase, ctx.userId, "property_image_deleted", {
    property_id: propertyId,
    image_id: imageId,
  });

  return { id: imageId };
}

// ---------------------------------------------------------------------------
// setPropertyCoverImage — clear is_cover across the property, then set it on
// the target image. Scoped by property_id (org already verified).
// ---------------------------------------------------------------------------
export async function setPropertyCoverImage(
  ctx: RequestContext,
  propertyId: string,
  imageId: string
): Promise<{ id: string }> {
  await requirePropertyInOrg(ctx, propertyId);
  await requireImageRow(ctx, propertyId, imageId);

  const { error: clearError } = await ctx.supabase
    .from("property_images")
    .update({ is_cover: false })
    .eq("property_id", propertyId);

  if (clearError) throw internalError(clearError.message);

  const { error: setError } = await ctx.supabase
    .from("property_images")
    .update({ is_cover: true })
    .eq("id", imageId)
    .eq("property_id", propertyId);

  if (setError) throw internalError(setError.message);

  await trackEvent(ctx.supabase, ctx.userId, "property_cover_updated", {
    property_id: propertyId,
    image_id: imageId,
  });

  return { id: imageId };
}
