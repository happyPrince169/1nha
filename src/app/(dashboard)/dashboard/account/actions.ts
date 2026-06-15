"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { trackEvent } from "@/lib/usage";

const VALID_ROLES = new Set([
  "independent_broker",
  "team_lead",
  "agency",
  "other",
]);

export type UpdateProfileState = {
  error: string | null;
  success: boolean;
};

// ---------------------------------------------------------------------------
// updateBrokerProfile
//
// Upserts the user_profiles row for the authenticated user.
// user_id is always taken from the server session — never from formData.
// ---------------------------------------------------------------------------
export async function updateBrokerProfile(
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bạn cần đăng nhập.", success: false };

  const getString = (key: string): string | null => {
    const v = formData.get(key);
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    return null;
  };

  const rawRole = getString("role");
  const role = rawRole && VALID_ROLES.has(rawRole) ? rawRole : null;

  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      display_name: getString("display_name"),
      phone: getString("phone"),
      company_name: getString("company_name"),
      role,
    },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message, success: false };

  await trackEvent(supabase, user.id, "account_profile_updated", {});

  revalidatePath("/dashboard/account");
  return { error: null, success: true };
}
