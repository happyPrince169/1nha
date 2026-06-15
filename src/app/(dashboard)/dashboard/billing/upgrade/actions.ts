"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { trackEvent } from "@/lib/usage";

const VALID_PLANS = new Set(["pro_personal", "team", "unsure"]);

export type UpgradeInterestState = {
  error: string | null;
};

// ---------------------------------------------------------------------------
// submitUpgradeInterest
//
// Inserts a row into upgrade_interest_requests.
// user_id is always pulled from the server session.
// On success, redirects to /dashboard/billing?interest=success.
// ---------------------------------------------------------------------------
export async function submitUpgradeInterest(
  _prev: UpgradeInterestState,
  formData: FormData
): Promise<UpgradeInterestState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bạn cần đăng nhập." };

  const rawPlan = (formData.get("interested_plan") as string | null)?.trim() ?? "";
  if (!VALID_PLANS.has(rawPlan)) {
    return { error: "Vui lòng chọn gói bạn quan tâm." };
  }

  const getString = (key: string): string | null => {
    const v = formData.get(key);
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    return null;
  };

  const { error } = await supabase.from("upgrade_interest_requests").insert({
    user_id: user.id,
    interested_plan: rawPlan,
    phone: getString("phone"),
    note: getString("note"),
    status: "pending",
  });

  if (error) return { error: error.message };

  await trackEvent(supabase, user.id, "upgrade_interest_submitted", {
    interested_plan: rawPlan,
  });

  // redirect() throws internally — must be outside try/catch
  redirect("/dashboard/billing?interest=success");
}
