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
const ALLOWED_MIME_TYPES: SupportedImageMime[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

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

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type as SupportedImageMime)) {
    return {
      draft: null,
      rawText: null,
      error: "Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP.",
    };
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      draft: null,
      rawText: null,
      error: "Ảnh quá lớn. Vui lòng chọn ảnh dưới 5 MB.",
    };
  }

  // Convert to base64 on the server — never touches the client
  let imageBase64: string;
  try {
    const arrayBuffer = await file.arrayBuffer();
    imageBase64 = Buffer.from(arrayBuffer).toString("base64");
  } catch {
    return {
      draft: null,
      rawText: null,
      error: "Không thể đọc file ảnh.",
    };
  }

  // Step 1 — extract raw text from the image via vision
  let rawText: string;
  try {
    rawText = await extractTextFromPropertyImage(
      imageBase64,
      file.type as SupportedImageMime
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định.";
    return {
      draft: null,
      rawText: null,
      error: `Không thể đọc văn bản từ ảnh: ${message}`,
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
