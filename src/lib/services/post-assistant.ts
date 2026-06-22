// ---------------------------------------------------------------------------
// Post Assistant service layer  (SERVER ONLY)
//
// Single source of the MANUAL posting-helper workflow, shared by:
//   • web Server Actions / Server Components
//   • /api/generated-contents/[id]/post-assistant* route handlers (future Expo)
//
// Post Assistant is a manual helper ONLY. It prepares post text, returns signed
// image URLs, and records the broker's copied/scheduled/posted intent. It does
// NOT post to Facebook / Zalo / TikTok, store social tokens, automate a browser,
// or call any social API. There is no auto-posting anywhere in this module.
//
// Composition over duplication: content access is verified through the
// Generated Content service, parent-property access through the Properties
// service, and image URLs through the Property Images service / property-media
// abstraction — so storage signing lives in exactly one place and all reads
// stay organization-scoped (cross-org ids → NOT_FOUND). Payloads never expose
// prompt_used, raw storage keys/paths, storage secrets, or user_id /
// organization_id / created_by.
// ---------------------------------------------------------------------------
import "server-only";

import type { RequestContext } from "@/lib/workspace/request-context";
import { validationError, notFound, internalError } from "@/lib/api/errors";
import { trackEvent } from "@/lib/usage";
import {
  getGeneratedContent,
  getGeneratedContentForProperty,
  type GeneratedContentRecord,
} from "@/lib/services/generated-content";
import { getPropertyById } from "@/lib/services/properties";
import {
  listPropertyImages,
  type ImageUrlVariant,
} from "@/lib/services/property-images";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_VARIANTS = new Set<ImageUrlVariant>(["thumbnail", "original"]);

export const MAX_CHANNEL_NAME_LENGTH = 200;
export const MAX_POST_URL_LENGTH = 2_000;
/** Cap how many image URLs one image-urls request may resolve. */
export const MAX_IMAGE_URL_BATCH = 30;

// ---------------------------------------------------------------------------
// Public output shapes — deliberately minimal + client-safe
// ---------------------------------------------------------------------------
export type PostAssistantContent = {
  id: string;
  title: string | null;
  body: string;
  platform: string | null;
  contentType: string | null;
  status: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type PostAssistantProperty = {
  id: string;
  title: string;
  propertyType: string | null;
  district: string | null;
  city: string | null;
  price: number | null;
  area: number | null;
};

export type PostAssistantImage = {
  id: string;
  thumbnailUrl: string | null;
  isCover: boolean;
  caption: string | null;
  altText: string | null;
};

export type PostingStatus = {
  copiedAt: string | null;
  scheduledAt: string | null;
  postedAt: string | null;
  postStatus: string | null;
};

export type PostAssistantPackage = {
  content: PostAssistantContent;
  property: PostAssistantProperty;
  images: PostAssistantImage[];
  posting: PostingStatus;
};

export type PostAssistantImageUrl = {
  id: string;
  url: string | null;
  variant: ImageUrlVariant;
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function assertUuid(value: string, label: string): void {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    throw validationError(`${label} không hợp lệ.`);
  }
}

function parseOptionalDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw validationError(`${label} không hợp lệ.`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw validationError(`${label} không hợp lệ.`);
  return d.toISOString();
}

function normaliseOptionalText(
  value: unknown,
  maxLength: number,
  label: string
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw validationError(`${label} không hợp lệ.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    throw validationError(`${label} quá dài (tối đa ${maxLength} ký tự).`);
  }
  return trimmed;
}

function normaliseVariant(value: unknown): ImageUrlVariant {
  if (typeof value === "string" && VALID_VARIANTS.has(value as ImageUrlVariant)) {
    return value as ImageUrlVariant;
  }
  throw validationError("Loại ảnh không hợp lệ (chỉ chấp nhận thumbnail | original).");
}

// ---------------------------------------------------------------------------
// Mappers (content/property/images → client-safe package pieces)
// ---------------------------------------------------------------------------
function toContent(record: GeneratedContentRecord): PostAssistantContent {
  return {
    id: record.id,
    title: record.title,
    body: record.content,
    platform: record.platform,
    contentType: record.content_type,
    status: record.status,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function toPosting(record: GeneratedContentRecord): PostingStatus {
  return {
    copiedAt: record.copied_at,
    scheduledAt: record.scheduled_at,
    postedAt: record.posted_at,
    postStatus: record.status,
  };
}

async function buildPackage(
  ctx: RequestContext,
  record: GeneratedContentRecord,
  includeImages: boolean
): Promise<PostAssistantPackage> {
  // Archived content is not a valid posting target (mirrors the web page,
  // which 404s archived content in the Post Assistant).
  if (record.status === "archived") {
    throw notFound("Không tìm thấy content.");
  }

  // Parent property (org-scoped). Map only public summary fields — owner/
  // planning notes are never included.
  const property = await getPropertyById(ctx, record.property_id);
  const propertySummary: PostAssistantProperty = {
    id: property.id,
    title: property.title,
    propertyType: property.property_type,
    district: property.district,
    city: property.city,
    price: property.price,
    area: property.area,
  };

  // Thumbnails by default — originals are never signed here. Clients request
  // full-resolution URLs explicitly via getPostAssistantImageUrls.
  let images: PostAssistantImage[] = [];
  if (includeImages) {
    const items = await listPropertyImages(ctx, record.property_id, {
      variant: "thumbnail",
    });
    images = items.map((img) => ({
      id: img.id,
      thumbnailUrl: img.url,
      isCover: img.is_cover,
      caption: img.caption,
      altText: img.alt_text,
    }));
  }

  return {
    content: toContent(record),
    property: propertySummary,
    images,
    posting: toPosting(record),
  };
}

// ---------------------------------------------------------------------------
// getPostAssistantPackage — everything the posting screen needs (thumbnails)
// ---------------------------------------------------------------------------
export type PostAssistantPackageOptions = {
  /** Skip image resolution (metadata-only). Defaults to true. */
  includeImages?: boolean;
};

export async function getPostAssistantPackage(
  ctx: RequestContext,
  contentId: string,
  options: PostAssistantPackageOptions = {}
): Promise<PostAssistantPackage> {
  const record = await getGeneratedContent(ctx, contentId);
  return buildPackage(ctx, record, options.includeImages ?? true);
}

// ---------------------------------------------------------------------------
// getPostAssistantPackageForProperty — property-scoped variant
// ---------------------------------------------------------------------------
export async function getPostAssistantPackageForProperty(
  ctx: RequestContext,
  propertyId: string,
  contentId: string,
  options: PostAssistantPackageOptions = {}
): Promise<PostAssistantPackage> {
  const record = await getGeneratedContentForProperty(ctx, propertyId, contentId);
  return buildPackage(ctx, record, options.includeImages ?? true);
}

// ---------------------------------------------------------------------------
// getPostAssistantImageUrls — explicit, on-demand signed URLs for a subset
//
// Verifies the content (org-scoped) and resolves URLs only for image ids that
// belong to the content's parent property. Any id outside that set → NOT_FOUND.
// originals are returned only when variant === "original" is requested.
// ---------------------------------------------------------------------------
export type GetImageUrlsInput = {
  imageIds: string[];
  variant?: ImageUrlVariant;
};

export async function getPostAssistantImageUrls(
  ctx: RequestContext,
  contentId: string,
  input: GetImageUrlsInput
): Promise<{ images: PostAssistantImageUrl[] }> {
  const record = await getGeneratedContent(ctx, contentId);

  const imageIds = Array.isArray(input?.imageIds) ? input.imageIds : null;
  if (!imageIds || imageIds.length === 0) {
    throw validationError("Vui lòng chọn ít nhất một ảnh.");
  }
  if (imageIds.length > MAX_IMAGE_URL_BATCH) {
    throw validationError(`Tối đa ${MAX_IMAGE_URL_BATCH} ảnh mỗi lần.`);
  }
  imageIds.forEach((id) => assertUuid(id, "Mã hình ảnh"));
  const variant = normaliseVariant(input?.variant ?? "thumbnail");

  // Org-verified images for the content's property (signing handled by the
  // Property Images service / property-media abstraction — never here).
  const propertyImages = await listPropertyImages(ctx, record.property_id, {
    variant,
  });
  const urlById = new Map(propertyImages.map((img) => [img.id, img.url]));

  // De-duplicate while preserving request order; every requested id must belong
  // to this property/content context.
  const seen = new Set<string>();
  const images: PostAssistantImageUrl[] = [];
  for (const id of imageIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (!urlById.has(id)) {
      throw notFound("Không tìm thấy hình ảnh.");
    }
    images.push({ id, url: urlById.get(id) ?? null, variant });
  }

  return { images };
}

// ---------------------------------------------------------------------------
// Posting-status mutations — manual intent tracking only
//
// Each verifies content access (org-scoped) then updates the existing posting
// columns on generated_contents. No social API is ever called.
// ---------------------------------------------------------------------------
async function applyPostingUpdate(
  ctx: RequestContext,
  contentId: string,
  patch: Record<string, unknown>
): Promise<{ posting: PostingStatus; propertyId: string }> {
  assertUuid(contentId, "Mã content");

  const { data, error } = await ctx.supabase
    .from("generated_contents")
    .update(patch)
    .eq("id", contentId)
    .eq("organization_id", ctx.organizationId)
    .select("copied_at, scheduled_at, posted_at, status, property_id")
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!data) throw notFound("Không tìm thấy content.");

  const row = data as unknown as {
    copied_at: string | null;
    scheduled_at: string | null;
    posted_at: string | null;
    status: string | null;
    property_id: string;
  };

  return {
    posting: {
      copiedAt: row.copied_at,
      scheduledAt: row.scheduled_at,
      postedAt: row.posted_at,
      postStatus: row.status,
    },
    propertyId: row.property_id,
  };
}

export type MarkCopiedResult = { posting: PostingStatus; propertyId: string };

export async function markContentCopied(
  ctx: RequestContext,
  contentId: string
): Promise<MarkCopiedResult> {
  const result = await applyPostingUpdate(ctx, contentId, {
    copied_at: new Date().toISOString(),
  });

  await trackEvent(ctx.supabase, ctx.userId, "content_copied", {
    content_id: contentId,
    property_id: result.propertyId,
  });

  return result;
}

export type MarkScheduledInput = { scheduledAt?: string | null };

export async function markContentScheduled(
  ctx: RequestContext,
  contentId: string,
  input: MarkScheduledInput = {}
): Promise<MarkCopiedResult> {
  const scheduledAt = parseOptionalDate(input?.scheduledAt, "Thời điểm hẹn đăng");

  return applyPostingUpdate(ctx, contentId, {
    status: "scheduled",
    scheduled_at: scheduledAt,
  });
}

export type MarkPostedInput = {
  postedAt?: string | null;
  channelName?: string | null;
  postUrl?: string | null;
};

export async function markContentPosted(
  ctx: RequestContext,
  contentId: string,
  input: MarkPostedInput = {}
): Promise<MarkCopiedResult> {
  const postedAt =
    parseOptionalDate(input?.postedAt, "Thời điểm đăng") ??
    new Date().toISOString();
  const channelName = normaliseOptionalText(
    input?.channelName,
    MAX_CHANNEL_NAME_LENGTH,
    "Tên kênh"
  );
  const postUrl = normaliseOptionalText(
    input?.postUrl,
    MAX_POST_URL_LENGTH,
    "Link bài đăng"
  );

  const result = await applyPostingUpdate(ctx, contentId, {
    status: "posted",
    posted_at: postedAt,
    channel_name: channelName,
    post_url: postUrl,
  });

  await trackEvent(ctx.supabase, ctx.userId, "content_marked_posted", {
    content_id: contentId,
    property_id: result.propertyId,
  });

  return result;
}
