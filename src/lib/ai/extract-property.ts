// ---------------------------------------------------------------------------
// Property field extractor — parses messy Vietnamese real estate text into
// structured PropertyFormDefaults using OpenAI JSON mode.
// Falls back to a deterministic stub when OPENAI_API_KEY is not set.
// ---------------------------------------------------------------------------

import type { PropertyFormDefaults } from "@/app/(dashboard)/dashboard/properties/property-form";
import { parseVietnamesePrice, parseLocaleFloat } from "@/lib/format/price";

// Re-export so existing importers of these helpers from this module keep working.
export { parseVietnamesePrice, parseLocaleFloat };

// ---------------------------------------------------------------------------
// System prompt — tells the model exactly what JSON shape to return.
// Keeping it a plain template literal makes it easy to iterate.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `
Bạn là công cụ trích xuất thông tin bất động sản từ văn bản tiếng Việt lộn xộn.
Trả về JSON hợp lệ với các trường dưới đây. Bỏ qua trường nếu không tìm thấy thông tin.
Không thêm giải thích, chỉ trả về JSON.

Quy tắc bắt buộc:
- title: chuỗi tóm tắt ngắn gọn (tạo ra nếu chưa có, dựa vào loại + vị trí + diện tích)
- property_type: một trong [apartment, house, land, shophouse, villa, office, other]
- city: tên thành phố (mặc định "Hà Nội" nếu không rõ)
- district: tên quận/huyện
- ward: tên phường/xã
- street: tên đường/ngõ
- price: số nguyên VND. Quy đổi:
    "8 tỷ 650" = 8650000000 (phần sau tỷ là triệu nếu < 1000)
    "5 tỷ 2" = 5200000000
    "3,5 tỷ" hoặc "3.5 tỷ" = 3500000000
    "850tr" hoặc "850 triệu" = 850000000
    Chỉ điền price nếu chắc chắn là giá bán/cho thuê, không đoán mò.
- area: số thực m² (DT, diện tích, sử dụng)
- bedrooms: số phòng ngủ (PN, phòng ngủ). QUAN TRỌNG: số tầng (tầng, floors) KHÔNG được điền vào bedrooms.
- bathrooms: số WC, phòng tắm
- house_direction: một trong [east, west, south, north, southeast, southwest, northeast, northwest]
- frontage: số thực mét (mặt tiền, MT)
- alley_width: số thực mét (đường vào, ngõ, đường trước nhà)
- legal_status: một trong [red_book, pink_book, sale_contract, hand_written, other]
- description: tóm tắt mô tả chung
- strengths: điểm nổi bật, ưu điểm
- weaknesses: hạn chế, lưu ý
- owner_note: thông tin chủ nhà, tình trạng bán/cho thuê
- planning_note: thông tin quy hoạch, lộ giới
`.trim();

// ---------------------------------------------------------------------------
// Public type
// ---------------------------------------------------------------------------
export type ExtractPropertyResult = PropertyFormDefaults;

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------
export async function extractPropertyFromText(
  rawText: string
): Promise<ExtractPropertyResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return devStub(rawText);
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Trích xuất thông tin từ đoạn văn bản sau:\n\n${rawText}`,
        },
      ],
      // JSON mode — guaranteed parseable output, no markdown fences.
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.1, // Low temp for deterministic extraction
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("AI trả về JSON không hợp lệ.");
  }

  return sanitise(parsed);
}

// ---------------------------------------------------------------------------
// Sanitise — coerce AI output to safe types, strip unexpected keys.
// This runs even on real API responses so the form never gets garbage values.
// ---------------------------------------------------------------------------
const PROPERTY_TYPES = new Set([
  "apartment", "house", "land", "shophouse", "villa", "office", "other",
]);
const LEGAL_STATUSES = new Set([
  "red_book", "pink_book", "sale_contract", "hand_written", "other",
]);
const DIRECTIONS = new Set([
  "east", "west", "south", "north",
  "southeast", "southwest", "northeast", "northwest",
]);

function sanitise(raw: Record<string, unknown>): ExtractPropertyResult {
  const str = (key: string): string | undefined => {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    return undefined;
  };

  const num = (key: string): number | undefined => {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    if (typeof v === "string" && v.trim()) {
      const vn = parseVietnamesePrice(v.trim());
      if (vn !== undefined) return vn;
      // Keep digits + both decimal separators, then locale-normalise so a
      // comma-decimal string (e.g. "32,8") is parsed as 32.8 — NOT stripped to
      // 328. parseLocaleFloat handles dot OR comma + thousands separators.
      const cleaned = v.replace(/[^0-9.,]/g, "").trim();
      if (cleaned) {
        const plain = parseLocaleFloat(cleaned);
        if (Number.isFinite(plain) && plain > 0) return plain;
      }
    }
    return undefined;
  };

  const enumVal = (key: string, allowed: Set<string>): string | undefined => {
    const v = str(key);
    return v && allowed.has(v) ? v : undefined;
  };

  return {
    title: str("title"),
    property_type: enumVal("property_type", PROPERTY_TYPES),
    city: str("city") ?? "Hà Nội",
    district: str("district"),
    ward: str("ward"),
    street: str("street"),
    price: num("price"),
    area: num("area"),
    bedrooms: num("bedrooms"),
    bathrooms: num("bathrooms"),
    house_direction: enumVal("house_direction", DIRECTIONS),
    frontage: num("frontage"),
    alley_width: num("alley_width"),
    legal_status: enumVal("legal_status", LEGAL_STATUSES),
    description: str("description"),
    strengths: str("strengths"),
    weaknesses: str("weaknesses"),
    owner_note: str("owner_note"),
    planning_note: str("planning_note"),
  };
}

// ---------------------------------------------------------------------------
// Development stub — deterministic parse without any API call.
// Extracts a handful of common patterns from the raw text so the UI is
// usable and testable locally without an API key.
// ---------------------------------------------------------------------------
function devStub(raw: string): ExtractPropertyResult {
  const text = raw.toLowerCase();

  // --- price ----------------------------------------------------------------
  // Tests: "12 ty" | "8 ty 650" | "850tr" | "3,5 ty" (all via parseVietnamesePrice)
  let price: number | undefined;
  const priceCandidate = raw.match(
    /(\d+(?:[.,]\d+)?)\s*t[\u1ef7y](?:\s+\d+(?:[.,]\d+)?(?:\s*(?:tri[e\u1ec7\u1ec5]u|tr))?)?|\d+(?:[.,]\d+)?\s*(?:tri[e\u1ec7\u1ec5]u|tr)/i
  );
  if (priceCandidate) price = parseVietnamesePrice(priceCandidate[0].trim());

  // --- area -----------------------------------------------------------------
  const areaRaw =
    raw.match(/(\d+(?:[.,]\d+)?)\s*m[\u00b22]/i) ??
    raw.match(/\bdt[:\s]+(\d+(?:[.,]\d+)?)/i);
  const area = areaRaw ? parseLocaleFloat(areaRaw[1]) : undefined;

  // --- bedrooms ONLY — floors (tang) must NOT match ----------------------------
  // Test: "4 tang, 3PN" -> bedrooms=3 | "4 tang" alone -> bedrooms=undefined
  const bedMatch = raw.match(/(\d+)\s*(?:ph[o\u00f2]ng\s*ng[u\u1ee7]|\bPN\b)/i);
  const bedrooms = bedMatch ? parseInt(bedMatch[1]) : undefined;

  const bathMatch = raw.match(/(\d+)\s*(?:ph[o\u00f2]ng\s*t[\u0103\u1eafm]|\bWC\b)/i);
  const bathrooms = bathMatch ? parseInt(bathMatch[1]) : undefined;

  // --- property_type (specific first to avoid over-matching) ----------------
  let property_type: string | undefined;
  if (/c\u0103n\s*h\u1ed9|chung\s*c[\u01b0u]/i.test(text)) property_type = "apartment";
  else if (/shophouse/i.test(text)) property_type = "shophouse";
  else if (/villa|bi[\u1ec7e]t\s*th[\u1ef1u]/i.test(text)) property_type = "villa";
  else if (/v[\u0103a]n\s*ph[\u00f2o]ng/i.test(text)) property_type = "office";
  else if (/\u0111[\u1ea5a]t\s*n\u1ec1n|l\u00f4\s*\u0111[\u1ea5a]t/i.test(text)) property_type = "land";
  else if (/nh[\u00e0a]\s*ph[\u1ed1o]|townhouse/i.test(text)) property_type = "house";
  else if (/\bnh[\u00e0a]\b/i.test(text)) property_type = "house";

  // --- legal_status ---------------------------------------------------------
  let legal_status: string | undefined;
  if (/s[\u1ed5o]\s*\u0111[\u1ecf\u1ecbo]/i.test(text)) legal_status = "red_book";
  else if (/s[\u1ed5o]\s*h[\u00f4o]ng/i.test(text)) legal_status = "pink_book";
  else if (/h[\u0111d]\s*mua\s*b[\u00e1a]n/i.test(text)) legal_status = "sale_contract";
  else if (/gi[\u1ea5a]y\s*tay/i.test(text)) legal_status = "hand_written";

  // --- house_direction ------------------------------------------------------
  // Test: "huong dong nam" -> southeast | "Huong: Tay Bac" -> northwest
  let house_direction: string | undefined;
  if (/h[\u01b0u][\w]*ng\s*:?\s*\u0111[\u00f4o]ng\s*nam/i.test(text)) house_direction = "southeast";
  else if (/h[\u01b0u][\w]*ng\s*:?\s*t[\u00e2a]y\s*nam/i.test(text)) house_direction = "southwest";
  else if (/h[\u01b0u][\w]*ng\s*:?\s*\u0111[\u00f4o]ng\s*b[\u1eafc\u0103]c/i.test(text)) house_direction = "northeast";
  else if (/h[\u01b0u][\w]*ng\s*:?\s*t[\u00e2a]y\s*b[\u1eafc\u0103]c/i.test(text)) house_direction = "northwest";
  else if (/h[\u01b0u][\w]*ng\s*:?\s*\u0111[\u00f4o]ng/i.test(text)) house_direction = "east";
  else if (/h[\u01b0u][\w]*ng\s*:?\s*t[\u00e2a]y/i.test(text)) house_direction = "west";
  else if (/h[\u01b0u][\w]*ng\s*:?\s*nam/i.test(text)) house_direction = "south";
  else if (/h[\u01b0u][\w]*ng\s*:?\s*b[\u1eafc\u0103]c/i.test(text)) house_direction = "north";

  // --- title ----------------------------------------------------------------
  // Assembled from whatever fields were detected above
  const typeLabel: Record<string, string> = {
    apartment: "C\u0103n h\u1ed9", house: "Nh\u00e0 ph\u1ed1", land: "\u0110\u1ea5t",
    shophouse: "Shophouse", villa: "Villa", office: "V\u0103n ph\u00f2ng",
  };
  const titleParts = [
    property_type ? typeLabel[property_type] : null,
    area ? `${area}m\u00b2` : null,
    bedrooms ? `${bedrooms}PN` : null,
  ].filter(Boolean);
  const title = titleParts.length
    ? `[DEV] ${titleParts.join(" \u00b7 ")}`
    : "[DEV] B\u1ea5t \u0111\u1ed9ng s\u1ea3n ch\u01b0a \u0111\u1eb7t t\u00ean";

  return {
    title,
    property_type,
    city: "H\u00e0 N\u1ed9i",
    price,
    area,
    bedrooms,
    bathrooms,
    legal_status,
    house_direction,
    description: `[DEV STUB \u2014 \u0111\u1eb7t OPENAI_API_KEY \u0111\u1ec3 tr\u00edch xu\u1ea5t th\u1ef1c]\n\n${raw.slice(0, 300)}`,
  };
}
