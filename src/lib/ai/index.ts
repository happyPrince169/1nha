// ---------------------------------------------------------------------------
// AI content generation — OpenAI chat completions
// Set OPENAI_API_KEY in .env.local to enable; omit for dev stub.
// ---------------------------------------------------------------------------

export type GenerateContentInput = {
  prompt: string;
  /** Max tokens to generate (default 600) */
  maxTokens?: number;
};

export type GenerateContentResult = {
  text: string;
};

/**
 * Call OpenAI chat completions via the REST API (no SDK dependency).
 * Falls back to a clearly-labelled stub when OPENAI_API_KEY is not set
 * so the rest of the app stays usable during local development.
 */
export async function generateContent(
  input: GenerateContentInput
): Promise<GenerateContentResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  // ----- development stub --------------------------------------------------
  if (!apiKey) {
    return {
      text: [
        "[DEV STUB — set OPENAI_API_KEY to get real output]",
        "",
        input.prompt.slice(0, 120) + "…",
      ].join("\n"),
    };
  }

  // ----- real call ---------------------------------------------------------
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
          content:
            "Bạn là chuyên gia viết content bất động sản cho thị trường Việt Nam. " +
            "Viết bằng tiếng Việt, gọn, hấp dẫn, phù hợp mobile.",
        },
        { role: "user", content: input.prompt },
      ],
      max_tokens: input.maxTokens ?? 600,
      temperature: 0.75,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  return { text };
}
