// ---------------------------------------------------------------------------
// Workspace (organization) service layer  (SERVER ONLY)
//
// Phase 4A — Team UI MVP. Single source of workspace/membership/invite business
// logic, consumed by the web Server Actions + Server Components under
// /dashboard/account/workspace and the /invite/[token] accept flow.
//
// Organization-aware, like the other services: reads/writes are scoped by the
// caller's current organization_id with RLS as the backstop. Cross-user data
// that RLS normally hides (fellow members' email/phone, a single invite by
// token) is exposed ONLY through the gated SECURITY DEFINER RPCs added in
// 20240111000001_organization_invites.sql — never via the service-role key.
//
// Errors throw ApiError (Vietnamese messages) exactly like properties/style
// services so web actions can map them uniformly.
// ---------------------------------------------------------------------------
import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RequestContext } from "@/lib/workspace/request-context";
import type { AssigneeContext } from "@/lib/workspace/assignee";
import {
  validationError,
  forbidden,
  notFound,
  internalError,
} from "@/lib/api/errors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const MAX_WORKSPACE_NAME_LENGTH = 80;
const INVITE_TTL_DAYS = 7;
const MANAGER_ROLES = new Set(["owner", "admin"]);
const INVITABLE_ROLES = new Set(["admin", "member"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WorkspaceRole = "owner" | "admin" | "member";

// ---------------------------------------------------------------------------
// Public output shapes (never leak internal columns the client doesn't need)
// ---------------------------------------------------------------------------
export type WorkspaceDetails = {
  organizationId: string;
  name: string;
  type: string;
  role: WorkspaceRole;
  createdAt: string;
  memberCount: number;
  canManage: boolean;
};

export type WorkspaceMember = {
  id: string;
  userId: string;
  role: WorkspaceRole;
  status: string;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  createdAt: string;
  isSelf: boolean;
};

export type WorkspaceInvite = {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  token: string;
  expiresAt: string;
  createdAt: string;
};

export type InvitePreview = {
  organizationId: string;
  organizationName: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  expiresAt: string;
  isExpired: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isManager(ctx: RequestContext): boolean {
  return MANAGER_ROLES.has(ctx.role);
}

function requireManager(ctx: RequestContext): void {
  if (!isManager(ctx)) {
    throw forbidden("Chỉ chủ sở hữu hoặc quản trị viên mới có quyền này.");
  }
}

function requireOwner(ctx: RequestContext): void {
  if (ctx.role !== "owner") {
    throw forbidden("Bạn không có quyền thay đổi thành viên.");
  }
}

function normaliseRole(value: unknown): WorkspaceRole {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!INVITABLE_ROLES.has(role)) {
    throw validationError("Vai trò không hợp lệ. Chọn Quản trị hoặc Thành viên.");
  }
  return role as WorkspaceRole;
}

function validateEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email) throw validationError("Vui lòng nhập email người được mời.");
  if (!EMAIL_RE.test(email)) throw validationError("Email không hợp lệ.");
  return email;
}

function validateWorkspaceName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validationError("Tên không gian làm việc không được để trống.");
  }
  const name = value.trim();
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
    throw validationError(
      `Tên không gian làm việc tối đa ${MAX_WORKSPACE_NAME_LENGTH} ký tự.`
    );
  }
  return name;
}

function assertUuid(value: string, label: string): void {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    throw validationError(`${label} không hợp lệ.`);
  }
}

/** URL-safe, unguessable invite token (256 bits of entropy). */
function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

// ---------------------------------------------------------------------------
// getCurrentWorkspaceDetails — org info + member count for the current user
// ---------------------------------------------------------------------------
export async function getCurrentWorkspaceDetails(
  ctx: RequestContext
): Promise<WorkspaceDetails> {
  const { data: org, error } = await ctx.supabase
    .from("organizations")
    .select("id, name, type, created_at")
    .eq("id", ctx.organizationId)
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!org) throw notFound("Không tìm thấy không gian làm việc.");

  const { count, error: countError } = await ctx.supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId)
    .eq("status", "active");

  if (countError) throw internalError(countError.message);

  return {
    organizationId: org.id,
    name: org.name,
    type: org.type,
    role: ctx.role as WorkspaceRole,
    createdAt: org.created_at,
    memberCount: count ?? 0,
    canManage: isManager(ctx),
  };
}

// ---------------------------------------------------------------------------
// listOrganizationMembers — full roster (email/phone) via gated RPC
// ---------------------------------------------------------------------------
type MemberRpcRow = {
  member_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
};

export async function listOrganizationMembers(
  ctx: RequestContext
): Promise<WorkspaceMember[]> {
  const { data, error } = await ctx.supabase.rpc("list_organization_members", {
    p_org_id: ctx.organizationId,
  });

  if (error) throw internalError(error.message);

  const rows = (data ?? []) as MemberRpcRow[];
  return rows.map((row) => ({
    id: row.member_id,
    userId: row.user_id,
    role: row.role as WorkspaceRole,
    status: row.status,
    email: row.email,
    displayName: row.display_name,
    phone: row.phone,
    createdAt: row.created_at,
    isSelf: row.user_id === ctx.userId,
  }));
}

// ---------------------------------------------------------------------------
// renameWorkspace — owner/admin only (RLS organizations_update_manager backstop)
// ---------------------------------------------------------------------------
export async function renameWorkspace(
  ctx: RequestContext,
  name: string
): Promise<{ name: string }> {
  requireManager(ctx);
  const nextName = validateWorkspaceName(name);

  const { data, error } = await ctx.supabase
    .from("organizations")
    .update({ name: nextName })
    .eq("id", ctx.organizationId)
    .select("name")
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!data) throw notFound("Không tìm thấy không gian làm việc.");

  return { name: data.name };
}

// ---------------------------------------------------------------------------
// listOrganizationInvites — pending invites (managers only; RLS-scoped)
// ---------------------------------------------------------------------------
type InviteDbRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
};

function toInvite(row: InviteDbRow): WorkspaceInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role as WorkspaceRole,
    status: row.status,
    token: row.token,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export async function listOrganizationInvites(
  ctx: RequestContext
): Promise<WorkspaceInvite[]> {
  if (!isManager(ctx)) return [];

  const { data, error } = await ctx.supabase
    .from("organization_invites")
    .select("id, email, role, status, token, expires_at, created_at")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw internalError(error.message);
  return ((data ?? []) as InviteDbRow[]).map(toInvite);
}

// ---------------------------------------------------------------------------
// createOrganizationInvite — managers create a link-based invite
//
// No email is sent in this phase. The action layer turns the returned token
// into a shareable /invite/<token> link the broker forwards via Zalo/email.
// ---------------------------------------------------------------------------
export type CreateInviteInput = {
  email: string;
  role?: string | null;
};

export async function createOrganizationInvite(
  ctx: RequestContext,
  input: CreateInviteInput
): Promise<WorkspaceInvite> {
  requireManager(ctx);

  const email = validateEmail(input?.email);
  const role = input?.role ? normaliseRole(input.role) : "member";
  const token = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await ctx.supabase
    .from("organization_invites")
    .insert({
      organization_id: ctx.organizationId,
      email,
      role,
      token,
      invited_by: ctx.userId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id, email, role, status, token, expires_at, created_at")
    .single();

  if (error || !data) {
    throw internalError(error?.message ?? "Không thể tạo lời mời.");
  }

  return toInvite(data as InviteDbRow);
}

// ---------------------------------------------------------------------------
// revokeOrganizationInvite — managers cancel a pending invite
// ---------------------------------------------------------------------------
export async function revokeOrganizationInvite(
  ctx: RequestContext,
  inviteId: string
): Promise<{ id: string }> {
  requireManager(ctx);
  assertUuid(inviteId, "Mã lời mời");

  const { data, error } = await ctx.supabase
    .from("organization_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .eq("organization_id", ctx.organizationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!data) throw notFound("Không tìm thấy lời mời cần thu hồi.");

  return { id: data.id };
}

// ---------------------------------------------------------------------------
// Member management (Phase 4D) — owner-only role change + soft removal.
//
// The actual write happens in the owner-gated SECURITY DEFINER RPCs
// (update_organization_member_role / remove_organization_member). The service
// re-checks the caller is an Owner up front for a friendly error before the RPC
// round-trip, and maps the RPC's Postgres exceptions to ApiError.
// ---------------------------------------------------------------------------
/** Map the Postgres exceptions raised by the member-management RPCs to ApiError. */
function mapMemberError(message: string): never {
  const m = message.toLowerCase();
  if (m.includes("member_unauthenticated")) {
    throw forbidden("Bạn cần đăng nhập để thực hiện thao tác này.");
  }
  if (m.includes("member_forbidden")) {
    throw forbidden("Bạn không có quyền thay đổi thành viên.");
  }
  if (m.includes("member_role_invalid")) {
    throw validationError("Vai trò không hợp lệ. Chọn Quản trị hoặc Thành viên.");
  }
  if (m.includes("member_not_found")) {
    throw notFound("Không tìm thấy thành viên.");
  }
  if (m.includes("member_owner_protected")) {
    throw forbidden("Không thể thay đổi vai trò của chủ sở hữu.");
  }
  if (m.includes("member_last_owner")) {
    throw validationError("Không thể xoá chủ sở hữu cuối cùng.");
  }
  throw internalError(message);
}

export async function updateOrganizationMemberRole(
  ctx: RequestContext,
  memberId: string,
  role: string
): Promise<{ id: string; role: WorkspaceRole }> {
  requireOwner(ctx);
  assertUuid(memberId, "Mã thành viên");
  const nextRole = normaliseRole(role); // admin | member only

  const { error } = await ctx.supabase.rpc("update_organization_member_role", {
    p_member_id: memberId,
    p_role: nextRole,
  });

  if (error) mapMemberError(error.message);
  return { id: memberId, role: nextRole };
}

export async function removeOrganizationMember(
  ctx: RequestContext,
  memberId: string
): Promise<{ id: string }> {
  requireOwner(ctx);
  assertUuid(memberId, "Mã thành viên");

  const { error } = await ctx.supabase.rpc("remove_organization_member", {
    p_member_id: memberId,
  });

  if (error) mapMemberError(error.message);
  return { id: memberId };
}

// ---------------------------------------------------------------------------
// Accept flow — token-based, NOT scoped to the caller's current workspace.
// These take a raw authenticated Supabase client (the invite targets a
// DIFFERENT org than the user's current one) and lean on the SECURITY DEFINER
// RPCs for the controlled membership write.
// ---------------------------------------------------------------------------
type InvitePreviewRpcRow = {
  organization_id: string;
  organization_name: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  is_expired: boolean;
};

export async function getInvitePreview(
  supabase: SupabaseClient,
  token: string
): Promise<InvitePreview | null> {
  if (typeof token !== "string" || token.trim().length === 0) return null;

  const { data, error } = await supabase.rpc("get_organization_invite", {
    p_token: token,
  });

  if (error) throw internalError(error.message);
  const rows = (data ?? []) as InvitePreviewRpcRow[];
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    email: row.email,
    role: row.role as WorkspaceRole,
    status: row.status,
    expiresAt: row.expires_at,
    isExpired: row.is_expired,
  };
}

/** Map the Postgres exceptions raised by accept_organization_invite() to ApiError. */
function mapAcceptError(message: string): never {
  const m = message.toLowerCase();
  if (m.includes("invite_unauthenticated")) {
    throw forbidden("Bạn cần đăng nhập để chấp nhận lời mời.");
  }
  if (m.includes("invite_not_found")) {
    throw notFound("Lời mời không tồn tại.");
  }
  if (m.includes("invite_not_pending")) {
    throw validationError("Lời mời này đã được sử dụng hoặc đã bị thu hồi.");
  }
  if (m.includes("invite_expired")) {
    throw validationError("Lời mời đã hết hạn. Vui lòng yêu cầu lời mời mới.");
  }
  if (m.includes("invite_email_mismatch")) {
    throw forbidden(
      "Lời mời này dành cho một email khác. Hãy đăng nhập bằng đúng email được mời."
    );
  }
  throw internalError(message);
}

export async function acceptOrganizationInvite(
  supabase: SupabaseClient,
  token: string
): Promise<{ organizationId: string }> {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw validationError("Liên kết lời mời không hợp lệ.");
  }

  const { data, error } = await supabase.rpc("accept_organization_invite", {
    p_token: token,
  });

  if (error) mapAcceptError(error.message);
  if (!data) throw internalError("Không thể chấp nhận lời mời.");

  return { organizationId: data as string };
}

// ---------------------------------------------------------------------------
// Assignable members (Phase 4B) — active workspace members for property
// assignment. Reuses the gated list_organization_members RPC (active only).
// ---------------------------------------------------------------------------
export type AssignableMember = {
  userId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: WorkspaceRole;
};

/** Human label for a member: display name → email → phone → "Thành viên". */
export function memberDisplayLabel(m: {
  displayName: string | null;
  email: string | null;
  phone: string | null;
}): string {
  return m.displayName ?? m.email ?? m.phone ?? "Thành viên";
}

export async function listAssignableMembers(
  ctx: RequestContext
): Promise<AssignableMember[]> {
  const members = await listOrganizationMembers(ctx); // RPC already filters active
  return members.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    email: m.email,
    phone: m.phone,
    role: m.role,
  }));
}

/**
 * Build the serializable assignee context handed to the property form. Labels
 * are resolved here (server-side) so the client form needs no roster RPC.
 * Owner/Admin may assign to anyone; members are restricted to themselves
 * (enforced again in the properties service — UI is not the security boundary).
 */
export async function buildAssigneeContext(
  ctx: RequestContext
): Promise<AssigneeContext> {
  const members = await listAssignableMembers(ctx);
  return {
    currentUserId: ctx.userId,
    canAssignOthers: ctx.role === "owner" || ctx.role === "admin",
    members: members.map((m) => ({
      userId: m.userId,
      label: memberDisplayLabel(m),
      role: m.role,
    })),
  };
}
