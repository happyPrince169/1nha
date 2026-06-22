"use server";

import { createClient } from "@/lib/supabase/server";
import { extractPropertyFromText } from "@/lib/ai/extract-property";
import {
  extractTextFromPropertyImage,
  type SupportedImageMime,
} from "@/lib/ai/extract-text-from-image";
import { trackEvent } from "@/lib/usage";
import type { PropertyFormDefaults } from "../property-form";

// ---------------------------------------------------------------------------
// Allowed image MIME types and size cap
// ---------------------------------------------------------------------------
// The client preprocesses to a small JPEG (target ≤ 2.5 MB); this is a
// defense-in-depth cap kept under the Server Action body limit (6 MB).
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

type ImageMimeKind = SupportedImageMime | "image/heic" | "image/heif";

/**
 * Resolve the effective image MIME type from the upload. Browsers (and our
 * client raw-file fallback) sometimes send an empty or generic
 * "application/octet-stream" type for a real photo, so we infer from the
 * filename extension as a safe secondary signal. Only known image extensions
 * are accepted — arbitrary files still resolve to null.
 */
function resolveImageMime(file: File): ImageMimeKind | null {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp") {
    return type;
  }
  if (type === "image/heic" || type === "image/heif") {
    return type;
  }

  // type empty / octet-stream / generic → infer from a known extension only.
  const name = file.name.toLowerCase();
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  if (/\.png$/.test(name)) return "image/png";
  if (/\.webp$/.test(name)) return "image/webp";
  if (/\.(heic|heif)$/.test(name)) return "image/heic";
  return null;
}

/**
 * Safe server-side log for OCR upload diagnostics. Logs only file metadata and
 * a high-level code — never the image bytes / base64 or any user content.
 */
function logOcrIssue(
  code: string,
  meta: { name?: string; type?: string; inferred?: string; size?: number }
) {
  console.warn(
    `[quick-add-ocr] ${code}`,
    JSON.stringify({
      name: meta.name,
      type: meta.type,
      inferred: meta.inferred,
      sizeBytes: meta.size,
    })
  );
}

// ---------------------------------------------------------------------------
// State shapes
// ---------------------------------------------------------------------------
export type QuickAddState = {
  draft: PropertyFormDefaults | null;
  rawText: string | null;
  error: string | null;
};

export type ImageExtractState = {
  draft: PropertyFormDefaults | null;
  rawText: string | null;
  error: string | null;
};

// ---------------------------------------------------------------------------
// extractPropertyFromTextAction
//
// Receives raw_text from the textarea form, calls the AI extractor, and
// returns structured draft values. Does NOT write to the database.
// The user must review/edit the pre-filled PropertyForm and click Save.
// ---------------------------------------------------------------------------
export async function extractPropertyFromTextAction(
  _prevState: QuickAddState,
  formData: FormData
): Promise<QuickAddState> {
  // Auth gate — even though proxy.ts protects the route, we verify here so
  // the action is safe if called directly.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { draft: null, rawText: null, error: "Bạn cần đăng nhập." };
  }

  const rawText =
    typeof formData.get("raw_text") === "string"
      ? (formData.get("raw_text") as string).trim()
      : "";

  if (!rawText) {
    return {
      draft: null,
      rawText: null,
      error: "Vui lòng nhập văn bản bất động sản.",
    };
  }

  if (rawText.length < 20) {
    return {
      draft: null,
      rawText: null,
      error: "Văn bản quá ngắn. Vui lòng nhập ít nhất 20 ký tự.",
    };
  }

  if (rawText.length > 4000) {
    return {
      draft: null,
      rawText: null,
      error: "Văn bản quá dài (tối đa 4000 ký tự). Vui lòng rút gọn.",
    };
  }

  let draft: PropertyFormDefaults;
  try {
    draft = await extractPropertyFromText(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định.";
    return { draft: null, rawText: null, error: `Không thể trích xuất: ${message}` };
  }

  await trackEvent(supabase, user.id, "quick_add_text");

  return { draft, rawText, error: null };
}

// ---------------------------------------------------------------------------
// extractPropertyFromImageAction
//
// Receives an uploaded image file via FormData, uses AI vision to extract
// the raw text, then pipes that text through the existing text extractor.
// Does NOT write to the database — the user must click Save after review.
// ---------------------------------------------------------------------------
export async function extractPropertyFromImageAction(
  _prevState: ImageExtractState,
  formData: FormData
): Promise<ImageExtractState> {
  // Auth gate
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { draft: null, rawText: null, error: "Bạn cần đăng nhập." };
  }

  // Pull the file from formData
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return {
      draft: null,
      rawText: null,
      error: "Vui lòng chọn một ảnh để tải lên.",
    };
  }

  // Resolve the effective MIME type (handles empty/octet-stream from the raw
  // fallback by inferring from a known image extension).
  const resolvedMime = resolveImageMime(file);
  const fileMeta = {
    name: file.name,
    type: file.type,
    inferred: resolvedMime ?? undefined,
    size: file.size,
  };

  // HEIC/HEIF — should be converted client-side; reject explicitly if it reaches
  // the server so the user gets guidance instead of a vision-API failure.
  if (resolvedMime === "image/heic" || resolvedMime === "image/heif") {
    logOcrIssue("reject_heic", fileMeta);
    return {
      draft: null,
      rawText: null,
      error:
        "Ảnh HEIC chưa được hỗ trợ. Vui lòng dùng JPG/PNG hoặc ảnh chụp màn hình.",
    };
  }

  // Validate MIME type — must resolve to a known supported image type.
  if (resolvedMime === null) {
    logOcrIssue("reject_mime", fileMeta);
    return {
      draft: null,
      rawText: null,
      error: "Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP.",
    };
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    logOcrIssue("reject_size", fileMeta);
    return {
      draft: null,
      rawText: null,
      error:
        "Ảnh quá nặng để đọc tự động. Vui lòng chọn ảnh nhẹ hơn hoặc chụp lại rõ phần tin đăng.",
    };
  }

  // Convert to base64 on the server — never touches the client
  let imageBase64: string;
  try {
    const arrayBuffer = await file.arrayBuffer();
    imageBase64 = Buffer.from(arrayBuffer).toString("base64");
  } catch {
    logOcrIssue("read_failed", fileMeta);
    return {
      draft: null,
      rawText: null,
      error: "Không thể đọc file ảnh.",
    };
  }

  // Step 1 — extract raw text from the image via vision
  let rawText: string;
  try {
    rawText = await extractTextFromPropertyImage(imageBase64, resolvedMime);
  } catch (err) {
    logOcrIssue("vision_failed", {
      ...fileMeta,
      // include only the high-level error name/status, never the payload
      type: err instanceof Error ? err.message.slice(0, 120) : undefined,
    });
    return {
      draft: null,
      rawText: null,
      error:
        "Không thể đọc văn bản từ ảnh lúc này. Vui lòng thử lại hoặc chọn ảnh rõ hơn.",
    };
  }

  if (!rawText.trim()) {
    return {
      draft: null,
      rawText: null,
      error: "AI không tìm thấy văn bản nào trong ảnh.",
    };
  }

  // Step 2 — reuse existing text extraction pipeline
  let draft: PropertyFormDefaults;
  try {
    draft = await extractPropertyFromText(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định.";
    return {
      draft: null,
      rawText,
      error: `Đọc ảnh thành công nhưng không thể trích xuất thông tin: ${message}`,
    };
  }

  await trackEvent(supabase, user.id, "quick_add_image");

  return { draft, rawText, error: null };
}
