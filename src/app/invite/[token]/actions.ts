"use server";

// ---------------------------------------------------------------------------
// Invite accept action — adds the signed-in user to the invited workspace via
// the controlled accept_organization_invite RPC, then sends them to the
// workspace page. Uses the cookie-session Supabase client directly: the invite
// targets a DIFFERENT org than the user's current workspace, so request-context
// org-scoping does not apply here.
// ---------------------------------------------------------------------------
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { acceptOrganizationInvite } from "@/lib/services/workspace";
import { toApiError } from "@/lib/api/errors";

export type AcceptInviteState = {
  error: string | null;
};

export async function acceptInviteAction(
  _prev: AcceptInviteState,
  formData: FormData
): Promise<AcceptInviteState> {
  const token = (formData.get("token") as string | null) ?? "";

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: "Bạn cần đăng nhập để chấp nhận lời mời." };
    }

    await acceptOrganizationInvite(supabase, token);
  } catch (err) {
    return { error: toApiError(err).message };
  }

  // Success — outside try so the redirect's control-flow throw isn't caught.
  redirect("/dashboard/account/workspace");
}
