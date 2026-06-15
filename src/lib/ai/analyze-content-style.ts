// ---------------------------------------------------------------------------
// Content style analyzer
//
// Takes a broker's sample social-media post(s) and a target platform, then
// asks the LLM to extract a structured ContentStyleRules object.
//
// Design constraints:
//   - response_format: json_object forces valid JSON output (same pattern as
//     extract-property.ts) — no markdown fence stripping needed.
//   - sanitizeStyleRules validates every key after parsing so no partial or
//     hallucinated output reaches the database.
//   - Falls back to a clearly-labelled dev stub when OPENAI_API_KEY is unset.
//   - Never throws on bad LLM output — returns { rules: null, error } instead
//     so callers decide whether to surface or retry.
// ---------------------------------------------------------------------------

import type { ContentStyleRules } from "@/types";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------
export type AnalyzeStyleInput = {
  /** One or more sample posts pasted by the broker (plain text, any length) */
  sample_text: string;
  /**
   * The platform these samples were written for.
   * Used to tailor the analysis instructions.
   * e.g. "facebook" | "zalo" | "tiktok" | "other" | null
   */
  platform: string | null;
};

export type AnalyzeStyleSuccess = {
  ok: true;
  rules: ContentStyleRules;
  /** Raw JSON string returned by the model — store for auditability */
  rawJson: string;
};

export type AnalyzeStyleError = {
  ok: false;
  error: string;
};

export type AnalyzeStyleResult = AnalyzeStyleSuccess | AnalyzeStyleError;

// ---------------------------------------------------------------------------
// Platform label (Vietnamese) injected into the prompt
// ---------------------------------------------------------------------------
function platformLabel(platform: string | null): string {
  switch (platform) {
    case "facebook": return "Facebook";
    case "zalo":     return "Zalo";
    case "tiktok":   return "TikTok";
    default:         return "mạng xã hội nói chung";
  }
}

// ---------------------------------------------------------------------------
// System prompt
//
// Key design choices:
//   1. Explicitly lists every key the JSON must contain — prevents omissions.
//   2. "ONLY a valid JSON object" + json_object response_format = double guard.
//   3. phrase_patterns and avoid are arrays so callers can iterate them.
//   4. generation_instructions is a free-form field the broker can later edit
//      and that gets injected verbatim into the content generation prompt.
// ---------------------------------------------------------------------------
function buildSystemPrompt(platform: string | null): string {
  return `
Bạn là chuyên gia phân tích văn phong viết content bất động sản tại Việt Nam.
Nhiệm vụ: phân tích đoạn văn mẫu của một môi giới và trả về đặc điểm văn phong của họ.
Nền tảng đăng bài: ${platformLabel(platform)}.

Trả về CHỈ một JSON object hợp lệ với đúng các trường sau. Không thêm bất kỳ văn bản nào khác.

{
  "summary": "Mô tả ngắn gọn 1–2 câu về phong cách viết tổng thể",
  "tone": "Mô tả giọng điệu: thân thiện / chuyên nghiệp / khẩn cấp / sang trọng...",
  "length": "Độ dài bài đăng điển hình, ví dụ: 150–200 từ",
  "structure": "Cách tổ chức bài: mở đầu bằng gì, thân bài ra sao, kết thúc thế nào",
  "formatting": "Quy tắc định dạng: xuống dòng, in hoa, gạch đầu dòng, v.v.",
  "emoji_usage": "Cách dùng emoji: có hay không, nhiều hay ít, ở vị trí nào",
  "opening_style": "Phong cách câu mở đầu: câu hỏi, câu cảm thán, khẳng định, hook...",
  "cta_style": "Phong cách kêu gọi hành động: cách mời gọi khách liên hệ",
  "phrase_patterns": ["Cụm từ / mẫu câu đặc trưng hay dùng", "..."],
  "avoid": ["Điều không nên làm khi viết theo phong cách này", "..."],
  "generation_instructions": "Hướng dẫn cụ thể cho AI khi tạo content theo phong cách này, ví dụ: 'Dùng giọng thân thiện, mở đầu bằng câu hỏi, thêm 2-3 emoji mỗi đoạn...'"
}

Quy tắc bắt buộc:
- phrase_patterns: mảng 3–6 chuỗi, mỗi chuỗi là một cụm từ hoặc mẫu câu cụ thể
- avoid: mảng 2–4 chuỗi, mỗi chuỗi mô tả điều cần tránh
- generation_instructions: đoạn văn đầy đủ giúp AI tái tạo đúng phong cách
- Tất cả giá trị phải bằng tiếng Việt
- Nếu mẫu văn quá ngắn để phân tích chắc chắn, hãy suy luận hợp lý từ những gì có
`.trim();
}

// ---------------------------------------------------------------------------
// Sanitize — validate and coerce every key after JSON.parse.
// Returns null if the object is structurally invalid.
// This is the defensive layer that prevents bad DB writes.
// ---------------------------------------------------------------------------
function sanitizeStyleRules(
  raw: unknown
): ContentStyleRules | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Helper: extract non-empty string
  function str(key: string): string {
    const v = obj[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    return "";
  }

  // Helper: extract array of non-empty strings
  function strArr(key: string): string[] {
    const v = obj[key];
    if (!Array.isArray(v)) return [];
    return v
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }

  const rules: ContentStyleRules = {
    summary:                  str("summary"),
    tone:                     str("tone"),
    length:                   str("length"),
    structure:                str("structure"),
    formatting:               str("formatting"),
    emoji_usage:              str("emoji_usage"),
    opening_style:            str("opening_style"),
    cta_style:                str("cta_style"),
    phrase_patterns:          strArr("phrase_patterns"),
    avoid:                    strArr("avoid"),
    generation_instructions:  str("generation_instructions"),
  };

  // Require the five most critical fields to be non-empty.
  // If the model hallucinated an entirely wrong shape, bail out.
  const required: (keyof ContentStyleRules)[] = [
    "summary",
    "tone",
    "opening_style",
    "generation_instructions",
  ];
  for (const key of required) {
    const val = rules[key];
    if (typeof val === "string" && val.length === 0) return null;
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------
export async function analyzeContentStyle(
  input: AnalyzeStyleInput
): Promise<AnalyzeStyleResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return devStub(input);
  }

  // Truncate extremely long samples to avoid blowing the context window.
  // 4 000 chars ≈ ~1 000 tokens — plenty for style analysis.
  const sampleTruncated =
    input.sample_text.length > 4_000
      ? input.sample_text.slice(0, 4_000) + "\n[... đã rút gọn]"
      : input.sample_text;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(input.platform),
          },
          {
            role: "user",
            content:
              `Phân tích văn phong của đoạn nội dung mẫu sau:\n\n${sampleTruncated}`,
          },
        ],
        // JSON mode guarantees the response is parseable JSON.
        // Combined with explicit key listing in the system prompt this gives
        // two layers of structural enforcement.
        response_format: { type: "json_object" },
        max_tokens: 1000,
        // Low temperature for deterministic, consistent analysis.
        // Style extraction is a classification task, not a creative one.
        temperature: 0.2,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi kết nối tới OpenAI.";
    return { ok: false, error: message };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    return {
      ok: false,
      error: `OpenAI trả về lỗi ${response.status}: ${body.slice(0, 200)}`,
    };
  }

  let json: { choices: Array<{ message: { content: string } }> };
  try {
    json = (await response.json()) as typeof json;
  } catch {
    return { ok: false, error: "Không thể đọc phản hồi từ OpenAI." };
  }

  const rawJson = json.choices?.[0]?.message?.content?.trim() ?? "";

  if (!rawJson) {
    return { ok: false, error: "OpenAI trả về nội dung rỗng." };
  }

  // Parse JSON — response_format: json_object makes this safe, but we still
  // guard with try/catch for defence in depth.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      ok: false,
      error:
        "AI trả về JSON không hợp lệ. Vui lòng thử lại hoặc rút ngắn văn bản mẫu.",
    };
  }

  const rules = sanitizeStyleRules(parsed);

  if (!rules) {
    return {
      ok: false,
      error:
        "AI trả về cấu trúc không đúng định dạng. Vui lòng thử lại.",
    };
  }

  return { ok: true, rules, rawJson };
}

// ---------------------------------------------------------------------------
// Development stub
//
// Returns a fully populated ContentStyleRules with placeholder text so the
// entire UI and database layer can be tested without an API key.
// Every field clearly marked [DEV STUB] so it is never mistaken for real data.
// ---------------------------------------------------------------------------
function devStub(input: AnalyzeStyleInput): AnalyzeStyleResult {
  const label = platformLabel(input.platform);
  const preview = input.sample_text.slice(0, 60).trimEnd();

  const rules: ContentStyleRules = {
    summary:
      `[DEV STUB] Văn phong thân thiện, gần gũi, phù hợp ${label}. Đặt OPENAI_API_KEY để phân tích thực.`,
    tone:
      "Thân thiện, nhiệt tình, tạo cảm giác tin cậy — [DEV STUB]",
    length:
      "150–200 từ mỗi bài — [DEV STUB]",
    structure:
      "Mở đầu bằng câu hỏi, liệt kê thông số, kết bằng CTA — [DEV STUB]",
    formatting:
      "Xuống dòng sau mỗi ý, dùng emoji thay gạch đầu dòng — [DEV STUB]",
    emoji_usage:
      "Dùng vừa phải, 1–2 emoji mỗi đoạn ở đầu dòng — [DEV STUB]",
    opening_style:
      `Câu hỏi khai mở nhu cầu hoặc highlight điểm độc đáo — [DEV STUB] (mẫu: "${preview}…")`,
    cta_style:
      "Mời khách nhắn tin hoặc gọi trực tiếp, kèm số điện thoại — [DEV STUB]",
    phrase_patterns: [
      "Cơ hội không thể bỏ lỡ — [DEV STUB]",
      "Liên hệ ngay hôm nay — [DEV STUB]",
      "Vị trí đắc địa — [DEV STUB]",
    ],
    avoid: [
      "Tránh dùng từ ngữ quá kỹ thuật — [DEV STUB]",
      "Không liệt kê quá nhiều số liệu liên tiếp — [DEV STUB]",
    ],
    generation_instructions:
      `[DEV STUB — đặt OPENAI_API_KEY để nhận hướng dẫn thực từ AI] ` +
      `Viết theo giọng thân thiện, mở đầu bằng câu hỏi, ` +
      `nền tảng: ${label}, thêm 1–2 emoji mỗi đoạn, kết bằng CTA rõ ràng.`,
  };

  const rawJson = JSON.stringify(rules);
  return { ok: true, rules, rawJson };
}
