// ---------------------------------------------------------------------------
// extract-text-from-image.ts
//
// Uses OpenAI vision (gpt-4o) via the REST API to OCR / read a property
// listing screenshot and return the visible text as a plain string.
//
// No SDK dependency — plain fetch, same pattern as extract-property.ts.
// Falls back to a deterministic local stub when OPENAI_API_KEY is missing.
// ---------------------------------------------------------------------------

/** Supported MIME types for vision upload. */
export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";

const VISION_PROMPT = `
Bạn là công cụ OCR chuyên đọc ảnh chụp màn hình tin đăng bất động sản Việt Nam.
Hãy trích xuất TOÀN BỘ văn bản có thể đọc được trong ảnh và trả về dưới dạng văn bản thuần túy.
Giữ nguyên cấu trúc và xuống dòng tự nhiên của nội dung.
Không thêm bất kỳ giải thích hay nhận xét nào, chỉ trả về văn bản trích xuất.
Nếu ảnh không chứa thông tin bất động sản, vẫn trích xuất tất cả văn bản hiện có.
`.trim();

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------
export async function extractTextFromPropertyImage(
  imageBase64: string,
  mimeType: SupportedImageMime
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return imageStub();
  }

  // gpt-4o is required for vision; gpt-4o-mini also supports vision.
  // We prefer gpt-4o-mini for cost unless the env overrides to a bigger model.
  const model = process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: VISION_PROMPT,
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
                // "low" detail is cheaper and sufficient for text extraction.
                detail: "low",
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI Vision error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = json.choices?.[0]?.message?.content?.trim() ?? "";

  if (!text) {
    throw new Error("AI không trích xuất được văn bản từ ảnh.");
  }

  return text;
}

// ---------------------------------------------------------------------------
// Dev stub — returned when OPENAI_API_KEY is absent.
// Deterministic so tests/snapshots stay stable.
// ---------------------------------------------------------------------------
function imageStub(): string {
  return [
    "[DEV STUB — đặt OPENAI_API_KEY để trích xuất văn bản thật từ ảnh]",
    "",
    "Bán nhà phố Quận 2, đường Thảo Điền",
    "Diện tích: 72m2, 4 tầng, 4 phòng ngủ 4WC",
    "Hướng Đông Nam, mặt tiền 5m, đường trước nhà 8m",
    "Giá 12 tỷ thương lượng, sổ hồng chính chủ",
    "Nội thất đầy đủ, gần trường quốc tế",
    "LH: 0909 xxx xxx",
  ].join("\n");
}
