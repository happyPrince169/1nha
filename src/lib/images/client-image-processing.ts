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
  "File này không phải ảnh. Vui lòng chọn ảnh JPG, PNG hoặc WEBP.";
export const ERR_OCR_TOO_HEAVY =
  "Ảnh quá nặng để đọc tự động. Vui lòng chụp lại rõ phần tin đăng hoặc chọn ảnh nhẹ hơn.";
export const ERR_OCR_HEIC_UNSUPPORTED =
  "Ảnh HEIC từ iPhone chưa được hỗ trợ trên trình duyệt này. Vui lòng chụp màn hình hoặc đổi camera sang JPG.";

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
// Decode — robust two-strategy image decode
//
// createImageBitmap is fast and applies EXIF orientation, but it throws on some
// perfectly valid phone-camera JPEGs (the `imageOrientation` option, progressive
// / CMYK encoding, or codec quirks in specific browsers). When it fails we fall
// back to an <img> element, which decodes a broader set of files. The <img>
// path relies on the browser's default `image-orientation: from-image`, which
// modern browsers honor when drawing to canvas; in rare older engines a photo
// could be rotated, but a correctly-rotated successful OCR beats a hard crash.
// ---------------------------------------------------------------------------
type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

function loadHTMLImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(ERR_DECODE));
    img.src = url;
  });
}

async function decodeImage(file: File): Promise<DecodedImage> {
  // Strategy 1 — createImageBitmap (fast, EXIF-aware).
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  } catch {
    // fall through to the <img> strategy
  }

  // Strategy 2 — HTMLImageElement via object URL.
  const url = URL.createObjectURL(file);
  try {
    const img = await loadHTMLImageFromUrl(url);
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error(ERR_DECODE);
    }
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err instanceof Error ? err : new Error(ERR_DECODE);
  }
}

// ---------------------------------------------------------------------------
// resizeImageFile — resize (if needed) + compress a single image
// ---------------------------------------------------------------------------
export async function resizeImageFile(
  params: ResizeImageParams
): Promise<ProcessedImage> {
  const { file, maxLongEdge, quality } = params;
  const outputMimeType: OutputMimeType = params.outputMimeType ?? "image/jpeg";

  const decoded = await decodeImage(file);

  try {
    const srcW = decoded.width;
    const srcH = decoded.height;
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
    ctx.drawImage(decoded.source, 0, 0, dstW, dstH);

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
    decoded.cleanup();
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

/** OCR target: drives whether we attempt the smaller second pass. */
export const OCR_TARGET_MAX_BYTES = 2.5 * 1024 * 1024; // 2.5 MB

/** Hard ceiling for what we'll upload to the OCR Server Action. Must stay in
 *  sync with the server's MAX_FILE_SIZE_BYTES (5 MB) and under the Server
 *  Action bodySizeLimit (6 MB). Used for both optimized output and raw
 *  fallback acceptance. */
export const OCR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

// First pass keeps text readable; second pass trades a little quality for size.
const OCR_PASS_1 = { maxLongEdge: 1800, quality: 0.84 };
const OCR_PASS_2 = { maxLongEdge: 1400, quality: 0.78 };

/** Result of preparing an image for OCR upload. `optimized` is false when we
 *  could not preprocess and fell back to uploading the raw file. */
export type OcrImageResult = {
  file: File;
  optimized: boolean;
  sizeBytes: number;
};

type OcrImageKind = "supported" | "heic" | "other";

/** Classify by MIME type first, then filename extension. Phone/camera files
 *  often arrive with an empty or generic MIME type, so the extension matters. */
function classifyOcrImage(file: File): OcrImageKind {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (
    type === "image/heic" ||
    type === "image/heif" ||
    /\.(heic|heif)$/.test(name)
  ) {
    return "heic";
  }
  if (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp" ||
    /\.(jpe?g|png|webp)$/.test(name)
  ) {
    return "supported";
  }
  return "other";
}

/**
 * Prepare a phone photo / screenshot for the OCR Server Action.
 *
 * Resilience order:
 *   1. Optimize to a small JPEG (1800px → 1400px fallback). resizeImageFile has
 *      its own decode fallback, so most "valid file but createImageBitmap throws"
 *      cases already succeed here.
 *   2. If optimization still fails AND the file is a valid JPG/PNG/WebP within
 *      the server cap, upload the RAW file — a 2.8 MB phone JPG that previews
 *      fine must not be rejected just because preprocessing failed.
 *   3. HEIC that can't be decoded → friendly HEIC guidance.
 *   4. Anything else → friendly non-image / too-heavy message.
 */
export async function processImageForOcr(file: File): Promise<OcrImageResult> {
  const kind = classifyOcrImage(file);

  // Not a recognizable image at all (no image MIME, no image extension).
  if (kind === "other" && !file.type.startsWith("image/")) {
    throw new Error(ERR_OCR_NOT_IMAGE);
  }

  // Absurdly large selections: only the raw fallback could apply, and it caps
  // at the server limit, so reject early without doing expensive decode work.
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(ERR_OCR_TOO_HEAVY);
  }

  try {
    // Pass 1, then a smaller pass only if still above the soft target.
    let best = await resizeImageFile({
      file,
      maxLongEdge: OCR_PASS_1.maxLongEdge,
      quality: OCR_PASS_1.quality,
      outputMimeType: "image/jpeg",
    });

    if (best.sizeBytes > OCR_TARGET_MAX_BYTES) {
      const second = await resizeImageFile({
        file,
        maxLongEdge: OCR_PASS_2.maxLongEdge,
        quality: OCR_PASS_2.quality,
        outputMimeType: "image/jpeg",
      });
      if (second.sizeBytes < best.sizeBytes) best = second;
    }

    // Accept the optimized image as long as it fits under the server cap.
    if (best.sizeBytes <= OCR_MAX_UPLOAD_BYTES) {
      return { file: best.file, optimized: true, sizeBytes: best.sizeBytes };
    }

    // Optimized but still over the cap → the raw file is larger, so too heavy.
    throw new Error(ERR_OCR_TOO_HEAVY);
  } catch (err) {
    if (err instanceof Error && err.message === ERR_OCR_TOO_HEAVY) throw err;

    // Preprocessing failed to decode/encode this file.
    if (kind === "heic") {
      throw new Error(ERR_OCR_HEIC_UNSUPPORTED);
    }

    // Valid JPG/PNG/WebP we just couldn't preprocess in this browser:
    // fall back to uploading the raw file if it's within the server cap.
    if (kind === "supported") {
      if (file.size <= OCR_MAX_UPLOAD_BYTES) {
        return { file, optimized: false, sizeBytes: file.size };
      }
      throw new Error(ERR_OCR_TOO_HEAVY);
    }

    // An "image/*" MIME we don't explicitly support and couldn't decode.
    throw new Error(ERR_OCR_NOT_IMAGE);
  }
}
