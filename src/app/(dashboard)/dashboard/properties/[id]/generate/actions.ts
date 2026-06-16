"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { generateContent } from "@/lib/ai";
import { buildPropertyPrompt } from "@/lib/prompts/content";
import { trackEvent } from "@/lib/usage";
import type {
  ContentPlatform,
  ContentStyleRules,
  ContentTone,
  ContentType,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type GenerateContentState = {
  error: string | null;
};

const PLATFORMS: ContentPlatform[] = ["facebook", "zalo", "tiktok"];
const TONES: ContentTone[] = [
  "professional",
  "urgent",
  "luxury",
  "family",
  "investor",
];
const CONTENT_TYPES: ContentType[] = [
  "sales_post",
  "short_caption",
  "video_script",
  "follow_up_message",
];

// ---------------------------------------------------------------------------
// generatePropertyContent
//
// Called from GenerateForm via useActionState.
// id is bound server-side (.bind(null, id)) — never read from the form body.
// ---------------------------------------------------------------------------
export async function generatePropertyContent(
  propertyId: string,
  _prevState: GenerateContentState,
  formData: FormData
): Promise<GenerateContentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bạn cần đăng nhập để tạo content." };

  // --- parse & validate options --------------------------------------------
  const platformRaw = formData.get("platform");
  const voiceRaw = formData.get("voice");
  const contentTypeRaw = formData.get("content_type");

  const platform = PLATFORMS.includes(platformRaw as ContentPlatform)
    ? (platformRaw as ContentPlatform)
    : null;
  const content_type = CONTENT_TYPES.includes(contentTypeRaw as ContentType)
    ? (contentTypeRaw as ContentType)
    : null;

  if (!platform) return { error: "Vui lòng chọn nền tảng." };
  if (!content_type) return { error: "Vui lòng chọn loại content." };

  // --- resolve the combined "Giọng văn" value ------------------------------
  // "tone:<id>"  → built-in tone, no style profile.
  // "style:<id>" → saved style profile (scoped to user); tone falls back to a
  //                schema-compatible default since the pipeline still stores tone.
  const voice = typeof voiceRaw === "string" ? voiceRaw : "";

  let tone: ContentTone | null = null;
  let styleProfileId: string | null = null;
  let styleRules: ContentStyleRules | null = null;

  if (voice.startsWith("tone:")) {
    const candidate = voice.slice("tone:".length) as ContentTone;
    tone = TONES.includes(candidate) ? candidate : null;
  } else if (voice.startsWith("style:")) {
    const candidateId = voice.slice("style:".length).trim();
    styleProfileId = candidateId.length > 0 ? candidateId : null;

    if (styleProfileId) {
      const { data: profile, error: profileError } = await supabase
        .from("content_style_profiles")
        .select("id,style_rules")
        .eq("id", styleProfileId)
        .eq("user_id", user.id) // never allow another user's profile
        .single();

      if (profileError || !profile) {
        return { error: "Không tìm thấy giọng văn đã chọn." };
      }

      styleRules = (profile.style_rules as ContentStyleRules | null) ?? null;
      tone = "professional"; // sensible default — pipeline still records a tone
    }
  }

  if (!tone) return { error: "Vui lòng chọn giọng văn." };

  // --- fetch property (scoped to authenticated user) -----------------------
  const { data: property, error: propError } = await supabase
    .from("properties")
    .select(
      "id,title,property_type,city,district,ward,street,price,area,bedrooms,bathrooms,house_direction,frontage,alley_width,legal_status,description,strengths,weaknesses,owner_note,planning_note"
    )
    .eq("id", propertyId)
    .eq("user_id", user.id)
    .single();

  if (propError || !property) {
    return { error: "Không tìm thấy bất động sản." };
  }

  // --- build prompt & call AI ---------------------------------------------
  const prompt = buildPropertyPrompt(property, {
    platform,
    tone,
    contentType: content_type,
    styleRules, // null = default 1nha voice (behaviour unchanged)
  });

  let generatedText: string;
  try {
    const result = await generateContent({ prompt });
    generatedText = result.text;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định.";
    return { error: `Không thể tạo content: ${message}` };
  }

  if (!generatedText.trim()) {
    return { error: "AI không trả về nội dung. Vui lòng thử lại." };
  }

  // --- persist result ------------------------------------------------------
  const { data: saved, error: insertError } = await supabase
    .from("generated_contents")
    .insert({
      user_id: user.id,          // always server-set
      property_id: propertyId,   // always server-set
      platform,
      tone,
      content_type,
      prompt_used: prompt,
      content: generatedText,
      style_profile_id: styleProfileId, // null when using default 1nha voice
    })
    .select("id")
    .single();

  if (insertError || !saved?.id) {
    return { error: insertError?.message ?? "Không thể lưu content." };
  }

  await trackEvent(supabase, user.id, "content_generated", {
    property_id: propertyId,
    content_id: saved.id,
    platform,
    content_type,
  });

  if (styleProfileId) {
    await trackEvent(supabase, user.id, "style_profile_used", {
      property_id: propertyId,
      style_profile_id: styleProfileId,
      platform,
      content_type,
    });
  }

  // --- redirect to output view ---------------------------------------------
  redirect(`/dashboard/properties/${propertyId}/content/${saved.id}`);
}
