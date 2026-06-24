"use server";

// ---------------------------------------------------------------------------
// Workspace Server Actions — Phase 4A Team UI MVP.
//
// Thin wrappers: parse FormData, delegate to the workspace service (auth + org
// + ownership checks live there), map ApiError → Vietnamese state. No email is
// sent — createInvite returns the token so the client can build a shareable
// /invite/<token> link.
// ---------------------------------------------------------------------------
import { revalidatePath } from "next/cache";

import { getRequestContext } from "@/lib/workspace/request-context";
import { toApiError } from "@/lib/api/errors";
import * as workspace from "@/lib/services/workspace";

const WORKSPACE_PATH = "/dashboard/account/workspace";

// ---------------------------------------------------------------------------
// Rename workspace (owner/admin)
// ---------------------------------------------------------------------------
export type RenameWorkspaceState = {
  error: string | null;
  success: boolean;
};

export async function renameWorkspaceAction(
  _prev: RenameWorkspaceState,
  formData: FormData
): Promise<RenameWorkspaceState> {
  try {
    const ctx = await getRequestContext();
    await workspace.renameWorkspace(
      ctx,
      (formData.get("name") as string | null) ?? ""
    );
    revalidatePath(WORKSPACE_PATH);
    return { error: null, success: true };
  } catch (err) {
    return { error: toApiError(err).message, success: false };
  }
}

// ---------------------------------------------------------------------------
// Create invite (owner/admin) — returns the new invite token for link building
// ---------------------------------------------------------------------------
export type CreateInviteState = {
  error: string | null;
  invite: { token: string; email: string; role: string } | null;
};

export async function createInviteAction(
  _prev: CreateInviteState,
  formData: FormData
): Promise<CreateInviteState> {
  try {
    const ctx = await getRequestContext();
    const invite = await workspace.createOrganizationInvite(ctx, {
      email: (formData.get("email") as string | null) ?? "",
      role: (formData.get("role") as string | null) ?? "member",
    });
    revalidatePath(WORKSPACE_PATH);
    return {
      error: null,
      invite: { token: invite.token, email: invite.email, role: invite.role },
    };
  } catch (err) {
    return { error: toApiError(err).message, invite: null };
  }
}

// ---------------------------------------------------------------------------
// Revoke invite (owner/admin)
// ---------------------------------------------------------------------------
export type RevokeInviteState = {
  error: string | null;
};

export async function revokeInviteAction(
  _prev: RevokeInviteState,
  formData: FormData
): Promise<RevokeInviteState> {
  try {
    const ctx = await getRequestContext();
    await workspace.revokeOrganizationInvite(
      ctx,
      (formData.get("invite_id") as string | null) ?? ""
    );
    revalidatePath(WORKSPACE_PATH);
    return { error: null };
  } catch (err) {
    return { error: toApiError(err).message };
  }
}
