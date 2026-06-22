// ---------------------------------------------------------------------------
// Client-side image processing
//
// CLIENT ONLY. Uses browser APIs (createImageBitmap, <canvas>, canvas.toBlob)
// to resize/compress property photos before they are uploaded directly to
// Cloudflare R2. Do NOT import server code here, and do NOT import this module
// from server components / server actions.
//
// Why process on the client:
//   • keep large camera originals off the network / Server Actions
//   • produce a high-quality social-ready "main" image (download/copy/post)
//   • produce a small "thumbnail" for fast in-app list/gallery previews
//
// The main image is intentionally NOT a tiny thumbnail — brokers download/copy
// it to post on Facebook/Zalo/TikTok, so it stays at social-ready quality.
// ---------------------------------------------------------------------------

/** Output formats we know how to encode via canvas.toBlob. */
export type OutputMimeType = "image/jpeg" | "image/webp" | "image/png";

/** Accepted input formats. HEIC is intentionally excluded this sprint — it only
 *  works if the browser already decodes it, which most do not. */
const ALLOWED_INPUT_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Reject raw selections above this size before doing any (expensive) work. */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20 MB

// Social-ready main image targets.
export const MAIN_MAX_LONG_EDGE = 2048;
export const MAIN_QUALITY = 0.86;

// In-app thumbnail targets.
export const THUMBNAIL_MAX_LONG_EDGE = 480;
export const THUMBNAIL_QUALITY = 0.72;

// User-facing messages (Vietnamese).
const ERR_DECODE =
  "Không xử lý được ảnh này. Vui lòng chọn ảnh JPG, PNG hoặc WEBP.";
const ERR_TOO_LARGE = "Ảnh quá lớn. Vui lòng chọn ảnh dưới 20MB.";
const ERR_PROCESS = "Không xử lý được ảnh. Vui lòng thử ảnh khác.";

// OCR-specific messages.
export const ERR_OCR_NOT_IMAGE =
  "Tệp bạn chọn không phải ảnh. Vui lòng chọn ảnh JPG, PNG hoặc WEBP.";
export const ERR_OCR_TOO_HEAVY =
  "Ảnh quá nặng. Vui lòng chụp lại gần hơn hoặc chọn ảnh nhẹ hơn.";
export const ERR_OCR_HEIC_UNSUPPORTED =
  "Ảnh HEIC từ iPhone chưa được hỗ trợ. Vui lòng đổi sang JPG trong cài đặt camera hoặc chụp màn hình rồi tải lại.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ResizeImageParams = {
  file: File;
  maxLongEdge: number;
  quality: number;
  /** Defaults to image/jpeg — best for real-estate photos. */
  outputMimeType?: OutputMimeType;
  outputFileName?: string;
};

export type ProcessedImage = {
  file: File;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
};

export type MainAndThumbnailImages = {
  main: ProcessedImage;
  thumbnail: ProcessedImage;
};

// ---------------------------------------------------------------------------
// Helpers
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

/** Swap a filename's extension to match the output mime type. */
function withExtension(name: string, mimeType: string): string {
  const ext = extForMime(mimeType);
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "image"}.${ext}`;
}

/** Promisified canvas.toBlob — rejects with a friendly error on failure. */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(ERR_PROCESS))),
      mimeType,
      quality
    );
  });
}

// ---------------------------------------------------------------------------
// resizeImageFile — resize (if needed) + compress a single image
// ---------------------------------------------------------------------------
export async function resizeImageFile(
  params: ResizeImageParams
): Promise<ProcessedImage> {
  const { file, maxLongEdge, quality } = params;
  const outputMimeType: OutputMimeType = params.outputMimeType ?? "image/jpeg";

  let bitmap: ImageBitmap;
  try {
    // imageOrientation: "from-image" applies EXIF orientation so phone photos
    // are not rotated/mirrored after processing.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(ERR_DECODE);
  }

  try {
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const longEdge = Math.max(srcW, srcH);

    // Preserve aspect ratio; only shrink, never upscale.
    const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(ERR_PROCESS);

    // JPEG has no alpha channel: fill a white background first so transparent
    // PNG/WebP areas become white instead of black.
    if (outputMimeType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, dstW, dstH);
    }
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);

    const blob = await canvasToBlob(canvas, outputMimeType, quality);

    const fileName =
      params.outputFileName ?? withExtension(file.name, outputMimeType);
    const out = new File([blob], fileName, {
      type: blob.type || outputMimeType,
    });

    return {
      file: out,
      width: dstW,
      height: dstH,
      sizeBytes: out.size,
      mimeType: out.type || outputMimeType,
    };
  } catch (err) {
    if (err instanceof Error && err.message) throw err;
    throw new Error(ERR_PROCESS);
  } finally {
    // Free decoded pixels promptly.
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// createMainAndThumbnailImages — produce both outputs from one source file
// ---------------------------------------------------------------------------
export async function createMainAndThumbnailImages(
  file: File
): Promise<MainAndThumbnailImages> {
  if (!ALLOWED_INPUT_MIME.has(file.type)) {
    throw new Error(ERR_DECODE);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(ERR_TOO_LARGE);
  }

  // Main social-ready image — high quality, used for download/copy/open/post.
  const main = await resizeImageFile({
    file,
    maxLongEdge: MAIN_MAX_LONG_EDGE,
    quality: MAIN_QUALITY,
    outputMimeType: "image/jpeg",
    outputFileName: withExtension(file.name, "image/jpeg"),
  });

  // Thumbnail — small, used only for fast in-app previews.
  const thumbnail = await resizeImageFile({
    file,
    maxLongEdge: THUMBNAIL_MAX_LONG_EDGE,
    quality: THUMBNAIL_QUALITY,
    outputMimeType: "image/jpeg",
    outputFileName: withExtension(`${file.name}-thumb`, "image/jpeg"),
  });

  return { main, thumbnail };
}

// ---------------------------------------------------------------------------
// processImageForOcr — prepare a phone photo / screenshot for server OCR
//
// Real phone-camera photos are large (often 3–12 MB) and frequently HEIC, which
// either exceeds the Server Action body limit or is an unsupported MIME type.
// We resize + re-encode to a small JPEG entirely on the client so the payload
// that reaches the OCR Server Action stays small and always a supported type.
//
// Quality matters: listing screenshots/photos must stay readable for OCR, so we
// keep a generous long edge (1800px) before falling back to a smaller pass.
// ---------------------------------------------------------------------------

/** OCR target: keep the uploaded JPEG comfortably small for Server Actions. */
export const OCR_TARGET_MAX_BYTES = 2.5 * 1024 * 1024; // 2.5 MB

// First pass keeps text readable; second pass trades a little quality for size.
const OCR_PASS_1 = { maxLongEdge: 1800, quality: 0.84 };
const OCR_PASS_2 = { maxLongEdge: 1400, quality: 0.78 };

/** True when a file looks like HEIC/HEIF by MIME type or extension. */
function looksLikeHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  return /\.(heic|heif)$/i.test(file.name);
}

/** True when a selection plausibly is an image we can try to decode. */
function looksLikeImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  // Some browsers report an empty MIME type for camera files — fall back to ext.
  return /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(file.name);
}

export async function processImageForOcr(file: File): Promise<ProcessedImage> {
  if (!looksLikeImage(file)) {
    throw new Error(ERR_OCR_NOT_IMAGE);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(ERR_OCR_TOO_HEAVY);
  }

  const heic = looksLikeHeic(file);

  // First pass — high readability. createImageBitmap is what decodes HEIC when
  // the browser supports it; if it throws on a HEIC file, the browser can't
  // decode it and we surface a HEIC-specific message instead of a generic one.
  let processed: ProcessedImage;
  try {
    processed = await resizeImageFile({
      file,
      maxLongEdge: OCR_PASS_1.maxLongEdge,
      quality: OCR_PASS_1.quality,
      outputMimeType: "image/jpeg",
    });
  } catch (err) {
    if (heic) throw new Error(ERR_OCR_HEIC_UNSUPPORTED);
    throw err instanceof Error ? err : new Error(ERR_PROCESS);
  }

  if (processed.sizeBytes <= OCR_TARGET_MAX_BYTES) return processed;

  // Second pass — smaller + slightly lower quality.
  const second = await resizeImageFile({
    file,
    maxLongEdge: OCR_PASS_2.maxLongEdge,
    quality: OCR_PASS_2.quality,
    outputMimeType: "image/jpeg",
  });

  if (second.sizeBytes <= OCR_TARGET_MAX_BYTES) return second;

  throw new Error(ERR_OCR_TOO_HEAVY);
}
