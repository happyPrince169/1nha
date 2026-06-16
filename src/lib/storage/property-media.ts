// ---------------------------------------------------------------------------
// Property media storage abstraction
//
// Central, provider-aware layer for property image (and future video) media.
//   • New uploads  → Cloudflare R2 (S3-compatible, presigned URLs)
//   • Legacy rows  → Supabase Storage bucket "property-images"
//
// SERVER ONLY. R2 credentials are read from server env vars and must never
// reach the browser — the browser only ever receives short-lived presigned
// URLs produced here. Do not import this module from client components.
//
// Keep this file the single place that knows how/where media bytes live so
// future work (thumbnails, video) and a full R2 migration stay contained.
// ---------------------------------------------------------------------------

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { StorageProvider } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Legacy Supabase Storage bucket — still serves pre-R2 images. */
export const SUPABASE_BUCKET = "property-images";

/** Default signed-read TTL (1 hour — enough for a browse session). */
export const DEFAULT_READ_TTL = 3600;

/** Presigned upload URL TTL (5 minutes — uploads start immediately). */
export const UPLOAD_URL_TTL = 300;

/** Placeholder storage_path for an R2 row whose upload has not finalized. */
export const R2_PENDING_PATH = "__r2_pending__";

/** Allowed image MIME types for new uploads. */
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

// ---------------------------------------------------------------------------
// Errors — distinguishable so callers can surface dev-friendly messages
// ---------------------------------------------------------------------------
/** Thrown when R2 env configuration is missing/invalid (developer setup bug). */
export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}

/** Thrown when caller-supplied media params are invalid (e.g. bad MIME). */
export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageValidationError";
  }
}

// ---------------------------------------------------------------------------
// R2 client (S3-compatible)
// ---------------------------------------------------------------------------
type R2Env = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

/**
 * Read + validate R2 env vars. Throws a clear StorageConfigError listing every
 * missing variable so misconfiguration is obvious in development.
 */
function readR2Env(): R2Env {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const endpointEnv = process.env.CLOUDFLARE_R2_ENDPOINT;

  const missing: string[] = [];
  if (!accessKeyId) missing.push("CLOUDFLARE_R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("CLOUDFLARE_R2_BUCKET_NAME");
  // Endpoint can be derived from the account id, so only one of the two is required.
  if (!endpointEnv && !accountId) {
    missing.push("CLOUDFLARE_R2_ENDPOINT (hoặc CLOUDFLARE_R2_ACCOUNT_ID)");
  }

  if (missing.length > 0) {
    throw new StorageConfigError(
      `Thiếu cấu hình Cloudflare R2: ${missing.join(", ")}. ` +
        "Đặt các biến môi trường này trong .env.local (chỉ dùng phía server)."
    );
  }

  const endpoint =
    endpointEnv ?? `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: bucket!,
    endpoint,
  };
}

let cachedClient: S3Client | null = null;

function getR2(): { client: S3Client; bucket: string } {
  const env = readR2Env();
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: env.endpoint,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
      // R2 does not support the AWS default flexible-checksum trailers; computing
      // them also breaks presigned PUTs from the browser (the signed request would
      // expect headers the browser never sends). Only add checksums when required.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return { client: cachedClient, bucket: env.bucket };
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------
function extForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/** Canonical R2 object key for the full-size original of an image. */
export function buildOriginalKey(
  userId: string,
  propertyId: string,
  imageId: string,
  mimeType: string
): string {
  return `users/${userId}/properties/${propertyId}/images/${imageId}/original.${extForMime(
    mimeType
  )}`;
}

// ---------------------------------------------------------------------------
// 1. createPropertyImageUploadTarget — presigned PUT for a new R2 upload
// ---------------------------------------------------------------------------
export type CreateUploadTargetParams = {
  userId: string;
  propertyId: string;
  imageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type UploadTarget = {
  provider: "cloudflare_r2";
  originalKey: string;
  uploadUrl: string;
  expiresIn: number;
};

export async function createPropertyImageUploadTarget(
  params: CreateUploadTargetParams
): Promise<UploadTarget> {
  if (!ALLOWED_IMAGE_MIME.has(params.mimeType)) {
    throw new StorageValidationError(
      "Định dạng không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP."
    );
  }

  const { client, bucket } = getR2();
  const originalKey = buildOriginalKey(
    params.userId,
    params.propertyId,
    params.imageId,
    params.mimeType
  );

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: originalKey,
      ContentType: params.mimeType,
    }),
    { expiresIn: UPLOAD_URL_TTL }
  );

  return {
    provider: "cloudflare_r2",
    originalKey,
    uploadUrl,
    expiresIn: UPLOAD_URL_TTL,
  };
}

// ---------------------------------------------------------------------------
// 2 & 3. Presigned read URLs (single + batch)
// ---------------------------------------------------------------------------
export async function createR2SignedReadUrl(
  key: string,
  expiresInSeconds: number = DEFAULT_READ_TTL
): Promise<string> {
  const { client, bucket } = getR2();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

/** Batch helper — returns a Map<key, signedUrl>. Signing is local (no network),
 *  so Promise.all is cheap. Duplicate/empty keys are de-duplicated. */
export async function createR2SignedReadUrls(
  keys: string[],
  expiresInSeconds: number = DEFAULT_READ_TTL
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(keys.filter((k) => !!k)));
  const entries = await Promise.all(
    unique.map(
      async (key) =>
        [key, await createR2SignedReadUrl(key, expiresInSeconds)] as const
    )
  );
  return new Map(entries);
}

// ---------------------------------------------------------------------------
// 4. deleteR2Object — idempotent (missing object is a no-op on R2)
// ---------------------------------------------------------------------------
export async function deleteR2Object(key: string): Promise<void> {
  if (!key) return;
  const { client, bucket } = getR2();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// ---------------------------------------------------------------------------
// 5 & 6. Provider-aware signed read URLs for property images
// ---------------------------------------------------------------------------
/** Minimal shape needed to resolve a signed URL for any image, either provider. */
export type MediaImageRef = {
  id: string;
  storage_provider: StorageProvider | string | null;
  storage_path: string | null;
  original_key: string | null;
  thumbnail_key: string | null;
  preview_key: string | null;
};

type ReadOpts = {
  expiresIn?: number;
  /** "thumbnail" prefers thumbnail_key → preview_key → original_key. */
  variant?: "original" | "thumbnail";
};

function isR2(provider: MediaImageRef["storage_provider"]): boolean {
  return provider === "cloudflare_r2";
}

function pickR2Key(
  image: MediaImageRef,
  variant: ReadOpts["variant"]
): string | null {
  if (variant === "thumbnail") {
    return (
      image.thumbnail_key ?? image.preview_key ?? image.original_key ?? null
    );
  }
  return image.original_key ?? null;
}

function isUsableSupabasePath(path: string | null): path is string {
  return !!path && path !== "__pending__" && path !== R2_PENDING_PATH;
}

/**
 * Resolve a single signed read URL for an image, regardless of provider.
 * Returns null if the image has no usable key/path. `supabase` is required for
 * legacy Supabase-Storage rows.
 */
export async function getPropertyImageSignedUrl(
  image: MediaImageRef,
  supabase: SupabaseClient,
  opts: ReadOpts = {}
): Promise<string | null> {
  const expiresIn = opts.expiresIn ?? DEFAULT_READ_TTL;

  if (isR2(image.storage_provider)) {
    const key = pickR2Key(image, opts.variant);
    if (!key) return null;
    return createR2SignedReadUrl(key, expiresIn);
  }

  // Legacy Supabase Storage
  if (!isUsableSupabasePath(image.storage_path)) return null;
  const { data } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(image.storage_path, expiresIn);
  return data?.signedUrl ?? null;
}

/**
 * Batch resolve signed URLs for a mixed list of images. Splits by provider so
 * legacy Supabase rows are signed in a single createSignedUrls() call and R2
 * rows are signed locally — no N+1. Returns Map<imageId, signedUrl>; images
 * without a usable key/path are simply absent from the map.
 */
export async function getPropertyImageSignedUrls(
  images: MediaImageRef[],
  supabase: SupabaseClient,
  opts: ReadOpts = {}
): Promise<Map<string, string>> {
  const expiresIn = opts.expiresIn ?? DEFAULT_READ_TTL;
  const result = new Map<string, string>();

  const r2Images = images.filter((i) => isR2(i.storage_provider));
  const supaImages = images.filter((i) => !isR2(i.storage_provider));

  // --- Cloudflare R2 rows ---
  if (r2Images.length > 0) {
    const keyByImage = new Map<string, string>();
    for (const img of r2Images) {
      const key = pickR2Key(img, opts.variant);
      if (key) keyByImage.set(img.id, key);
    }
    const urlByKey = await createR2SignedReadUrls(
      Array.from(keyByImage.values()),
      expiresIn
    );
    for (const [imageId, key] of keyByImage) {
      const url = urlByKey.get(key);
      if (url) result.set(imageId, url);
    }
  }

  // --- Legacy Supabase Storage rows (single batch) ---
  if (supaImages.length > 0) {
    const pathByImage = new Map<string, string>();
    for (const img of supaImages) {
      if (isUsableSupabasePath(img.storage_path)) {
        pathByImage.set(img.id, img.storage_path);
      }
    }
    const paths = Array.from(new Set(pathByImage.values()));
    if (paths.length > 0) {
      const { data } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrls(paths, expiresIn);
      const urlByPath = new Map<string, string>();
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }
      for (const [imageId, path] of pathByImage) {
        const url = urlByPath.get(path);
        if (url) result.set(imageId, url);
      }
    }
  }

  return result;
}
