import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { tryGetRequestContext } from "@/lib/workspace/request-context";
import {
  getCurrentWorkspaceDetails,
  listOrganizationMembers,
  listOrganizationInvites,
} from "@/lib/services/workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { roleLabel, workspaceTypeLabel } from "./labels";
import { WorkspaceNameForm } from "./workspace-name-form";
import { InviteSection, type InviteRow } from "./invite-section";
import { MembersSection, type MemberItem } from "./members-section";

export const metadata: Metadata = { title: "Không gian làm việc" };

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("vi-VN");
  } catch {
    return iso;
  }
}

export default async function WorkspacePage() {
  const ctx = await tryGetRequestContext();
  if (!ctx) redirect("/sign-in");

  const [details, members, invites] = await Promise.all([
    getCurrentWorkspaceDetails(ctx),
    listOrganizationMembers(ctx),
    listOrganizationInvites(ctx),
  ]);

  const canManage = details.canManage;
  // Member role change / removal is Owner-only (Phase 4D); the RPC enforces it
  // server-side too. Admins keep invite management but not member management.
  const canManageMembers = details.role === "owner";
  const inviteRows: InviteRow[] = invites.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    token: i.token,
    expiresAt: i.expiresAt,
  }));
  const memberItems: MemberItem[] = members.map((m) => ({
    id: m.id,
    role: m.role,
    displayName: m.displayName,
    email: m.email,
    phone: m.phone,
    isSelf: m.isSelf,
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard/account"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ‹ Tài khoản
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          Không gian làm việc
        </h1>
        <p className="text-sm text-muted-foreground leading-snug">
          Nguồn hàng, nội dung và ảnh được quản lý trong workspace này.
        </p>
      </div>

      {/* Overview card */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0" aria-hidden>
              🏢
            </span>
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="font-medium leading-tight truncate">{details.name}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">
                  {workspaceTypeLabel(details.type)}
                </Badge>
                <Badge variant="outline">{roleLabel(details.role)}</Badge>
              </div>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Thành viên</span>
              <span className="font-medium">{details.memberCount}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Ngày tạo</span>
              <span className="font-medium">{formatDate(details.createdAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workspace information / rename */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin workspace</CardTitle>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <WorkspaceNameForm name={details.name} />
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                Tên không gian làm việc
              </span>
              <span className="text-sm font-medium">{details.name}</span>
              <p className="text-xs text-muted-foreground">
                Chỉ chủ sở hữu hoặc quản trị viên mới có thể đổi tên.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Thành viên ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <MembersSection members={memberItems} canManage={canManageMembers} />
          {!canManageMembers && (
            <p className="px-1 text-xs text-muted-foreground leading-snug">
              Chỉ chủ sở hữu mới có thể đổi vai trò hoặc xoá thành viên.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Invite */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mời thành viên</CardTitle>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <InviteSection invites={inviteRows} />
          ) : (
            <p className="text-sm text-muted-foreground leading-snug">
              Chỉ chủ sở hữu hoặc quản trị viên mới có thể mời thành viên mới vào
              không gian làm việc này.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
