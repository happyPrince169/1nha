// ---------------------------------------------------------------------------
// Prompt templates (Vietnamese) — plain strings, easy to iterate.
// ---------------------------------------------------------------------------

import type {
  ContentPlatform,
  ContentStyleRules,
  ContentTone,
  ContentType,
  Property,
} from "@/types";
import { formatVND } from "@/utils";

// Keep for backwards compat / ad-hoc use
export const DAILY_CONTENT_PROMPT = `
Bạn là trợ lý content cho môi giới bất động sản tại Việt Nam.
Hãy tạo 1 bài đăng ngắn (120–180 từ) theo giọng điệu chuyên nghiệp, dễ đọc trên mobile.
Kết thúc bằng 1 CTA nhẹ nhàng và 3 hashtags.
`;

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------
const TONE_LABELS: Record<ContentTone, string> = {
  professional: "chuyên nghiệp, rõ ràng, đáng tin cậy",
  urgent: "khẩn cấp, tạo cảm giác khan hiếm, thúc đẩy hành động ngay",
  luxury: "cao cấp, sang trọng, dành cho người thượng lưu",
  family: "gần gũi, ấm cúng, tập trung vào cuộc sống gia đình",
  investor: "đầu tư sinh lời, tập trung vào ROI, tăng trưởng tài sản",
};

const PLATFORM_LABELS: Record<ContentPlatform, string> = {
  facebook: "Facebook (bài viết dài, đệ xuất 180–250 từ, kèm 4–5 hashtags)",
  zalo: "Zalo (ngắn gọn, thân thiện, 100–150 từ, không hashtag)",
  tiktok: "TikTok (script video 30–60 giây, có mở đầu “hook” mạnh, bullet points ngắn)",
};

const TYPE_LABELS: Record<ContentType, string> = {
  sales_post: "bài đăng bán hàng",
  short_caption: "caption ngắn (dưới 80 từ)",
  video_script: "script video ngắn (bullet points, có hook mở đầu và CTA cuối)",
  follow_up_message: "tin nhắn follow-up gửi cho khách đã hỏi thăm trước",
};

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------
export type GenerateOptions = {
  platform: ContentPlatform;
  tone: ContentTone;
  contentType: ContentType;
  /** Optional saved writing-style rules to apply. Omit/null = default 1nha voice. */
  styleRules?: ContentStyleRules | null;
};

// ---------------------------------------------------------------------------
// Style-rules serializer
//
// style_rules is jsonb, so values may be partial or malformed — read every
// field defensively and skip anything missing/empty rather than trusting the
// ContentStyleRules type. Returns null when nothing usable is present.
// ---------------------------------------------------------------------------
function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}

export function buildStyleRulesSection(
  styleRules: ContentStyleRules | null | undefined
): string | null {
  if (!styleRules || typeof styleRules !== "object") return null;

  const r = styleRules as unknown as Record<string, unknown>;
  const lines: string[] = [];

  const field = (label: string, key: string) => {
    const text = asText(r[key]);
    if (text) lines.push(`- ${label}: ${text}`);
  };
  const listField = (label: string, key: string) => {
    const items = asList(r[key]);
    if (items.length) lines.push(`- ${label}: ${items.join("; ")}`);
  };

  field("Tóm tắt văn phong", "summary");
  field("Giọng văn", "tone");
  field("Độ dài", "length");
  field("Cấu trúc", "structure");
  field("Định dạng / cách trình bày", "formatting");
  field("Cách dùng emoji", "emoji_usage");
  field("Cách mở đầu", "opening_style");
  field("Cách kêu gọi hành động (CTA)", "cta_style");
  listField("Cụm từ / mẫu câu hay dùng", "phrase_patterns");
  listField("Cần tránh", "avoid");
  field("Hướng dẫn bổ sung", "generation_instructions");

  if (lines.length === 0) return null;

  return [
    "=== GIỌNG VĂN CẦN ÁP DỤNG ===",
    "Hãy viết theo giọng văn/văn phong đã học dưới đây.",
    "Chỉ học cách hành văn, cấu trúc, cách xuống dòng, cách CTA, cách dùng emoji và nhịp trình bày.",
    "Không sao chép nguyên văn câu chữ từ bài mẫu.",
    "Không bịa thông tin không có trong dữ liệu căn.",
    "Nếu dữ liệu căn thiếu pháp lý, hướng, số tầng, mặt tiền, ngõ, quy hoạch, số nhà, thông tin chủ nhà thì không được tự thêm.",
    "",
    ...lines,
  ].join("\n");
}

/**
 * Build the full user-facing prompt from a property + generation options.
 * The prompt is stored verbatim in generated_contents.prompt_used so we can
 * reproduce or audit any generation later.
 */
export function buildPropertyPrompt(
  property: Pick<
    Property,
    | "title"
    | "property_type"
    | "city"
    | "district"
    | "ward"
    | "street"
    | "price"
    | "area"
    | "bedrooms"
    | "bathrooms"
    | "house_direction"
    | "frontage"
    | "alley_width"
    | "legal_status"
    | "description"
    | "strengths"
    | "weaknesses"
    | "owner_note"
    | "planning_note"
  >,
  options: GenerateOptions
): string {
  const location = [
    property.city,
    property.district,
    property.ward,
    property.street,
  ]
    .filter(Boolean)
    .join(", ");

  const specs = [
    `Diện tích: ${property.area ?? "?"}m²`,
    property.bedrooms != null ? `${property.bedrooms} PN` : null,
    property.bathrooms != null ? `${property.bathrooms} WC` : null,
    property.house_direction ? `Hướng: ${directionLabelVi(property.house_direction)}` : null,
    property.frontage != null ? `Mặt tiền: ${property.frontage}m` : null,
    property.alley_width != null ? `Đường vào: ${property.alley_width}m` : null,
    `Giá: ${formatVND(Number(property.price ?? 0))}`,
    property.legal_status ? `Pháp lý: ${legalLabel(property.legal_status)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const extras: string[] = [];
  if (property.description) extras.push(`Mô tả: ${property.description}`);
  if (property.strengths) extras.push(`Điểm mạnh: ${property.strengths}`);
  if (property.weaknesses) extras.push(`Lưu ý: ${property.weaknesses}`);
  if (property.owner_note) extras.push(`Ghi chú chủ nhà: ${property.owner_note}`);

  const styleSection = buildStyleRulesSection(options.styleRules);

  return [
    `Tạo ${TYPE_LABELS[options.contentType]} cho bất động sản sau.`,
    `Nền tảng: ${PLATFORM_LABELS[options.platform]}.`,
    `Giọng văn: ${TONE_LABELS[options.tone]}.`,
    "",
    "=== THÔNG TIN BẤT ĐỔNG SẢN ===",
    `Tên: ${property.title}`,
    `Loại: ${propertyTypeLabel(property.property_type)}`,
    `Vị trí: ${location}`,
    `Thông số: ${specs}`,
    ...(extras.length ? ["", ...extras] : []),
    ...(styleSection ? ["", styleSection] : []),
    "",
    "=== YÊU CẦU ===",
    `Viết bằng tiếng Việt. Không dùng thông tin bị thiếu (để trống nếu không có).`,
    `Chỉ trả về nội dung, không giải thích hay thêm chú thích.`,
  ]
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Internal label helpers (only used inside prompts, not exported to UI)
// ---------------------------------------------------------------------------
function legalLabel(s: string | null | undefined): string {
  switch (s) {
    case "red_book": return "Sổ đỏ";
    case "pink_book": return "Sổ hồng";
    case "sale_contract": return "HĐ mua bán";
    case "hand_written": return "Giấy tay";
    default: return s ?? "";
  }
}

function directionLabelVi(d: string | null | undefined): string {
  switch (d) {
    case "east": return "Đông";
    case "west": return "Tây";
    case "south": return "Nam";
    case "north": return "Bắc";
    case "southeast": return "Đông Nam";
    case "southwest": return "Tây Nam";
    case "northeast": return "Đông Bắc";
    case "northwest": return "Tây Bắc";
    default: return d ?? "";
  }
}

function propertyTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case "apartment": return "Căn hộ";
    case "house": return "Nhà phố";
    case "land": return "Đất";
    case "shophouse": return "Shophouse";
    case "villa": return "Villa";
    case "office": return "Văn phòng";
    default: return t ?? "";
  }
}
