// ---------------------------------------------------------------------------
// Authenticated request / workspace context  (SERVER ONLY)
//
// Single entry point for Server Actions, Server Components, and /api route
// handlers to obtain the authenticated user + their current workspace, backed
// by one Supabase server client (the user's RLS-scoped anon session — NO
// service-role key). Services receive this context and never re-resolve auth.
//
// Throws ApiError so callers can map failures uniformly:
//   • no authenticated user  → UNAUTHORIZED
//   • no resolvable workspace → INTERNAL_ERROR (should not happen post-2A)
// ---------------------------------------------------------------------------
import "server-only";

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient, createBearerClient } from "@/lib/supabase/server";
import { resolveWorkspaceForUser } from "@/lib/workspace/current";
import { unauthorized, internalError } from "@/lib/api/errors";

export type RequestContext = {
  supabase: SupabaseClient;
  userId: string;
  organizationId: string;
  /** Membership role in the current workspace: 'owner' | 'admin' | 'member'. */
  role: string;
};

/**
 * Classify the Authorization header so the caller can apply STRICT precedence:
 *   - "absent"        → no header at all → cookie fallback allowed
 *   - { token }       → exactly `Bearer <non-empty token>` → use Bearer auth
 *   - "malformed"     → header present but not a valid Bearer format → reject
 * We never fall back to cookies once an Authorization header is present.
 */
type AuthHeader =
  | { kind: "absent" }
  | { kind: "bearer"; token: string }
  | { kind: "malformed" };

function classifyAuthHeader(headerValue: string | null): AuthHeader {
  if (headerValue === null) return { kind: "absent" };

  const trimmed = headerValue.trim();
  if (trimmed.length === 0) return { kind: "malformed" }; // present but empty

  const match = trimmed.match(/^Bearer[ \t]+(\S.*)$/i);
  const token = match?.[1]?.trim();
  if (!token) return { kind: "malformed" }; // wrong scheme or empty token
  return { kind: "bearer", token };
}

/**
 * Resolve the authenticated request context, or throw ApiError.
 * Use in route handlers (wrap in try/catch → jsonError) and Server Actions.
 *
 * STRICT Authorization precedence:
 *   • Header absent              → cookie/session auth (web app default).
 *   • `Bearer <access_token>`    → Bearer auth — non-browser clients (Expo).
 *   • Header present but not a
 *     valid Bearer format        → UNAUTHORIZED (NO cookie fallback).
 *   • Bearer token invalid/expired → UNAUTHORIZED (rejected by getUser()).
 *
 * Both auth sources are validated server-side via supabase.auth.getUser().
 * The Bearer client uses the ANON key with the token as a global header, so
 * its DB access is RLS-scoped exactly like the cookie session. Reading headers
 * via next/headers keeps this signature stable across route handlers, Server
 * Components, and Server Actions (no NextRequest threading needed).
 */
export async function getRequestContext(): Promise<RequestContext> {
  const auth = classifyAuthHeader((await headers()).get("authorization"));

  // A present-but-malformed Authorization header is rejected outright — we do
  // NOT silently fall back to cookies when the caller signalled Bearer intent.
  if (auth.kind === "malformed") throw unauthorized();

  const supabase: SupabaseClient =
    auth.kind === "bearer"
      ? createBearerClient(auth.token)
      : await createClient();

  // getUser() always validates against the Supabase auth server — it never
  // trusts a locally-decoded JWT (true for both the cookie and Bearer clients).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw unauthorized();

  const workspace = await resolveWorkspaceForUser(supabase, user.id);
  if (!workspace) {
    // Authenticated but no workspace could be resolved/created — treat as a
    // server fault rather than silently leaking an unscoped query.
    throw internalError("Không tìm thấy không gian làm việc.");
  }

  return {
    supabase,
    userId: user.id,
    organizationId: workspace.organizationId,
    role: workspace.role,
  };
}

/**
 * Non-throwing variant for Server Components that prefer to render a fallback
 * (e.g. `return null`) instead of surfacing an error. Returns null when there
 * is no authenticated user or workspace.
 */
export async function tryGetRequestContext(): Promise<RequestContext | null> {
  try {
    return await getRequestContext();
  } catch {
    return null;
  }
}
