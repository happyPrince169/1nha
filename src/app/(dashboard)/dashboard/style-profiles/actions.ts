"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { trackEvent } from "@/lib/usage";
import { analyzeContentStyle } from "@/lib/ai/analyze-content-style";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidateProfilePaths(profileId?: string) {
  revalidatePath("/dashboard/style-profiles");
  if (profileId) {
    revalidatePath(`/dashboard/style-profiles/${profileId}`);
  }
}

// ---------------------------------------------------------------------------
// createStyleProfile
//
// 1. Validates inputs server-side.
// 2. Calls the AI analyzer.
// 3. Inserts the profile row with the analyzed style_rules.
// 4. Redirects to the new profile's detail page.
// ---------------------------------------------------------------------------
export type CreateProfileState = {
  error: string | null;
};

const VALID_PLATFORMS = new Set(["facebook", "zalo", "tiktok", "other"]);
const MAX_SAMPLE_CHARS = 20_000;

export async function createStyleProfile(
  _prev: CreateProfileState,
  formData: FormData
): Promise<CreateProfileState> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  // --- Input extraction and validation -------------------------------------
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  if (!name) return { error: "Tên văn phong không được để trống." };
  if (name.length > 100) return { error: "Tên văn phong tối đa 100 ký tự." };

  const rawPlatform = (formData.get("platform") as string | null)?.trim() ?? "";
  const platform = VALID_PLATFORMS.has(rawPlatform) ? rawPlatform : null;

  const rawSample = (formData.get("sample_text") as string | null)?.trim() ?? "";
  if (!rawSample) return { error: "Vui lòng dán ít nhất một bài mẫu." };
  if (rawSample.length > MAX_SAMPLE_CHARS) {
    return { error: `Văn bản mẫu tối đa ${MAX_SAMPLE_CHARS.toLocaleString()} ký tự.` };
  }

  const confirmed = formData.get("ownership_confirmed") === "on";
  if (!confirmed) {
    return { error: "Vui lòng xác nhận quyền sở hữu nội dung mẫu." };
  }

  // --- AI analysis ---------------------------------------------------------
  const analysisResult = await analyzeContentStyle({
    sample_text: rawSample,
    platform,
  });

  if (!analysisResult.ok) {
    return { error: `Phân tích văn phong thất bại: ${analysisResult.error}` };
  }

  // --- DB insert -----------------------------------------------------------
  const { data: inserted, error: insertError } = await supabase
    .from("content_style_profiles")
    .insert({
      user_id: user.id,
      name,
      platform,
      sample_text: rawSample,
      style_rules: analysisResult.rules,
      is_default: false,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    return { error: insertError?.message ?? "Không thể lưu văn phong." };
  }

  await trackEvent(supabase, user.id, "style_profile_created", {
    profile_id: inserted.id,
    platform: platform ?? "all",
  });

  revalidateProfilePaths();
  // redirect() throws internally so it must be outside try/catch
  redirect(`/dashboard/style-profiles/${inserted.id}`);
}

// ---------------------------------------------------------------------------
// updateStyleProfile
//
// Updates name, description, and is_default.
// When is_default is set, first clears the previous default for this user.
// ---------------------------------------------------------------------------
export type UpdateProfileState = {
  error: string | null;
  success: boolean;
};

export async function updateStyleProfile(
  profileId: string,
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { error: "Bạn cần đăng nhập.", success: false };

  // Ownership check — never trust client-supplied IDs alone
  const { data: existing } = await supabase
    .from("content_style_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("user_id", user.id)
    .single();

  if (!existing) {
    return { error: "Không tìm thấy văn phong.", success: false };
  }

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  if (!name) return { error: "Tên văn phong không được để trống.", success: false };

  const description = (formData.get("description") as string | null)?.trim() || null;
  const makeDefault = formData.get("is_default") === "on";

  // If setting as default: clear the existing default first (scoped to user)
  if (makeDefault) {
    await supabase
      .from("content_style_profiles")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("is_default", true);
  }

  const { error } = await supabase
    .from("content_style_profiles")
    .update({ name, description, is_default: makeDefault })
    .eq("id", profileId)
    .eq("user_id", user.id);

  if (error) return { error: error.message, success: false };

  await trackEvent(supabase, user.id, "style_profile_updated", {
    profile_id: profileId,
  });

  revalidateProfilePaths(profileId);
  return { error: null, success: true };
}

// ---------------------------------------------------------------------------
// setDefaultProfile
//
// Convenience fire-and-forget action for the "Đặt làm mặc định" button.
// Clears previous default then sets the new one.
// ---------------------------------------------------------------------------
export async function setDefaultProfile(profileId: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("content_style_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("user_id", user.id)
    .single();

  if (!existing) return;

  // Clear previous default (scoped to user)
  await supabase
    .from("content_style_profiles")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("is_default", true);

  // Set new default
  await supabase
    .from("content_style_profiles")
    .update({ is_default: true })
    .eq("id", profileId)
    .eq("user_id", user.id);

  await trackEvent(supabase, user.id, "style_profile_updated", {
    profile_id: profileId,
    action: "set_default",
  });

  revalidateProfilePaths(profileId);
}

// ---------------------------------------------------------------------------
// deleteStyleProfile
//
// Deletes a profile row. Scoped by user_id.
// Returns the deleted profile ID for the client to redirect after.
// ---------------------------------------------------------------------------
export type DeleteProfileState = {
  error: string | null;
};

export async function deleteStyleProfile(
  profileId: string
): Promise<DeleteProfileState> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { error } = await supabase
    .from("content_style_profiles")
    .delete()
    .eq("id", profileId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  await trackEvent(supabase, user.id, "style_profile_deleted", {
    profile_id: profileId,
  });

  revalidatePath("/dashboard/style-profiles");
  return { error: null };
}
