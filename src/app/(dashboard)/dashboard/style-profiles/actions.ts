"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getRequestContext } from "@/lib/workspace/request-context";
import { toApiError } from "@/lib/api/errors";
import * as styleProfiles from "@/lib/services/style-profiles";

// ---------------------------------------------------------------------------
// Web Server Actions for the "Văn phong" screens.
//
// These are thin adapters over the shared style-profiles service
// (src/lib/services/style-profiles.ts): they parse the form, keep the
// web-only concerns (ownership gate, revalidate, redirect) here, and delegate
// all business logic + validation to the service so the web app and the future
// mobile API behave identically. ApiError messages are already Vietnamese.
// ---------------------------------------------------------------------------

function revalidateProfilePaths(profileId?: string) {
  revalidatePath("/dashboard/style-profiles");
  if (profileId) {
    revalidatePath(`/dashboard/style-profiles/${profileId}`);
  }
}

// ---------------------------------------------------------------------------
// createStyleProfile
//
// Validates the ownership gate (web/legal concern), then the service validates
// inputs, runs the AI analyzer, and inserts the profile. Redirects to the new
// profile's detail page on success.
// ---------------------------------------------------------------------------
export type CreateProfileState = {
  error: string | null;
};

export async function createStyleProfile(
  _prev: CreateProfileState,
  formData: FormData
): Promise<CreateProfileState> {
  let newProfileId: string;
  try {
    const ctx = await getRequestContext();

    // Ownership confirmation is a web-form legal gate — keep it here, before
    // any AI analysis runs on the pasted samples.
    const confirmed = formData.get("ownership_confirmed") === "on";
    if (!confirmed) {
      return { error: "Vui lòng xác nhận quyền sở hữu nội dung mẫu." };
    }

    const profile = await styleProfiles.createStyleProfile(ctx, {
      name: (formData.get("name") as string | null) ?? "",
      platform: (formData.get("platform") as string | null) ?? null,
      sample_text: (formData.get("sample_text") as string | null) ?? "",
    });

    revalidateProfilePaths();
    newProfileId = profile.id;
  } catch (err) {
    return { error: toApiError(err).message };
  }

  // redirect() throws internally so it must be outside try/catch.
  redirect(`/dashboard/style-profiles/${newProfileId}`);
}

// ---------------------------------------------------------------------------
// updateStyleProfile — name, description, is_default
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
  try {
    const ctx = await getRequestContext();

    await styleProfiles.updateStyleProfile(ctx, profileId, {
      name: (formData.get("name") as string | null) ?? "",
      description: (formData.get("description") as string | null) ?? null,
      is_default: formData.get("is_default") === "on",
    });

    revalidateProfilePaths(profileId);
    return { error: null, success: true };
  } catch (err) {
    return { error: toApiError(err).message, success: false };
  }
}

// ---------------------------------------------------------------------------
// setDefaultProfile — fire-and-forget for the "Đặt làm mặc định" button
// ---------------------------------------------------------------------------
export async function setDefaultProfile(profileId: string): Promise<void> {
  try {
    const ctx = await getRequestContext();
    await styleProfiles.setDefaultStyleProfile(ctx, profileId);
    revalidateProfilePaths(profileId);
  } catch {
    // Swallow — UI revalidates; a failure leaves the default unchanged, which
    // is safe (matches the previous fire-and-forget behavior).
  }
}

// ---------------------------------------------------------------------------
// deleteStyleProfile — returns the result for the client to redirect after
// ---------------------------------------------------------------------------
export type DeleteProfileState = {
  error: string | null;
};

export async function deleteStyleProfile(
  profileId: string
): Promise<DeleteProfileState> {
  try {
    const ctx = await getRequestContext();
    await styleProfiles.deleteStyleProfile(ctx, profileId);
    revalidatePath("/dashboard/style-profiles");
    return { error: null };
  } catch (err) {
    return { error: toApiError(err).message };
  }
}
