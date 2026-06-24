// ---------------------------------------------------------------------------
// Team permission helpers  (SERVER ONLY) — Phase 4C
//
// One small, auditable place for the MVP permission model. Every service that
// mutates a property or a property-scoped asset (images, generated content,
// post-assistant status) runs the SAME check here, so web Server Actions and
// the JSON API can never diverge — the service layer is the permission
// boundary, RLS remains the organization boundary.
//
// Model:
//   • Visibility — all active members can READ the workspace inventory.
//   • Management — Owner/Admin manage everything in the workspace; a Member
//     manages a property only when they created it OR are assigned to it.
//   • Assignment — only Owner/Admin may assign to OTHER members; a Member may
//     assign to themselves or keep the existing assignee (enforced in the
//     properties service via resolveAssignee).
// ---------------------------------------------------------------------------
import "server-only";

import type { RequestContext } from "@/lib/workspace/request-context";
import { forbidden } from "@/lib/api/errors";

/** The two ownership columns every property-scoped permission check needs. */
export type PropertyOwnership = {
  created_by: string | null;
  assigned_to: string | null;
};

/** Owner/Admin → workspace-wide management. */
export function isWorkspaceManager(ctx: RequestContext): boolean {
  return ctx.role === "owner" || ctx.role === "admin";
}

/** Alias kept for readable call sites / API symmetry. */
export function canManageWorkspace(ctx: RequestContext): boolean {
  return isWorkspaceManager(ctx);
}

/**
 * Can the caller manage this property? True for Owner/Admin, or for a Member
 * who created it or is assigned to it. This single predicate backs editing,
 * archiving, image management, and content management so the rule never drifts.
 */
export function canManageProperty(
  ctx: RequestContext,
  property: PropertyOwnership
): boolean {
  if (isWorkspaceManager(ctx)) return true;
  return (
    property.created_by === ctx.userId || property.assigned_to === ctx.userId
  );
}

// Intent-named aliases (same rule) — clearer at each call site, easy to audit.
export const canEditProperty = canManageProperty;
export const canArchiveProperty = canManageProperty;
export const canManagePropertyImages = canManageProperty;
export const canManageGeneratedContent = canManageProperty;

/** Only Owner/Admin may assign a property to OTHER members. */
export function canAssignPropertyToOthers(ctx: RequestContext): boolean {
  return isWorkspaceManager(ctx);
}

/** Throw FORBIDDEN unless the caller can manage the property. */
export function assertCanManageProperty(
  ctx: RequestContext,
  property: PropertyOwnership
): void {
  if (!canManageProperty(ctx, property)) {
    throw forbidden(
      "Bạn không có quyền quản lý nguồn này. Chỉ người tạo, người phụ trách hoặc quản trị viên mới có thể thực hiện."
    );
  }
}
