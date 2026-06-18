// ---------------------------------------------------------------------------
// Current workspace resolution  (SERVER ONLY)
//
// Phase 2A: every user has exactly one personal organization. There is no
// workspace switcher UI yet — the "current" workspace is simply the user's
// personal organization (or their earliest active membership if that ever
// changes). Phase 4 will add multi-workspace switching on top of this helper.
//
// Server-only: it reads the authenticated session via the SSR Supabase client.
// Never import it from a Client Component. No service-role key is used — all
// access goes through the user's RLS-scoped anon session.
// ---------------------------------------------------------------------------
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type CurrentWorkspace = {
  organizationId: string;
  role: string;
};

type MembershipRow = {
  organization_id: string;
  role: string | null;
  organizations: { type: string | null; created_at: string } | null;
};

/**
 * Resolve the workspace for a known user id using an existing Supabase client.
 * Prefers the personal workspace, then the earliest active membership, and
 * bootstraps the personal workspace via the `ensure_personal_organization`
 * RPC (idempotent, SECURITY DEFINER) if the user has none yet. Returns null
 * only if no workspace could be resolved or created.
 *
 * Shared by `getCurrentWorkspace` (Server Components / Actions) and the API
 * request-context helper so the resolution logic lives in exactly one place.
 */
export async function resolveWorkspaceForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<CurrentWorkspace | null> {
  const { data: rows } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(type, created_at)")
    .eq("user_id", userId)
    .eq("status", "active")
    .returns<MembershipRow[]>();

  if (rows && rows.length > 0) {
    // Prefer the personal workspace, then the earliest-created membership.
    const sorted = [...rows].sort((a, b) => {
      const aPersonal = a.organizations?.type === "personal" ? 0 : 1;
      const bPersonal = b.organizations?.type === "personal" ? 0 : 1;
      if (aPersonal !== bPersonal) return aPersonal - bPersonal;
      const aCreated = a.organizations?.created_at ?? "";
      const bCreated = b.organizations?.created_at ?? "";
      return aCreated.localeCompare(bCreated);
    });
    const chosen = sorted[0];
    return { organizationId: chosen.organization_id, role: chosen.role ?? "owner" };
  }

  // No membership yet — ensure the personal workspace exists, then use it.
  const { data: orgId, error } = await supabase.rpc(
    "ensure_personal_organization"
  );
  if (error || !orgId) return null;
  return { organizationId: orgId as string, role: "owner" };
}

/**
 * Resolve the current user's workspace (organization). Returns null only when
 * there is no authenticated user, or no workspace could be resolved/created.
 */
export async function getCurrentWorkspace(): Promise<CurrentWorkspace | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return resolveWorkspaceForUser(supabase, user.id);
}

/**
 * Convenience wrapper when only the organization id is needed.
 */
export async function getCurrentOrganizationId(): Promise<string | null> {
  const workspace = await getCurrentWorkspace();
  return workspace?.organizationId ?? null;
}
