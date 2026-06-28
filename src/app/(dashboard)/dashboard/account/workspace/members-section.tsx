"use client";

// ---------------------------------------------------------------------------
// MembersSection — workspace roster with owner-only management (Phase 4D).
//
// • Owner: change a member's role (Quản trị / Thành viên) and remove them.
//   Owner rows are protected (no role change / no remove) so the last owner can
//   never be demoted or removed — the RPC enforces the same server-side.
// • Admin / Member: read-only roster.
// Mobile-first: each member is a stacked card; controls wrap below the name.
// ---------------------------------------------------------------------------
import { useActionState, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { roleLabel } from "./labels";
import {
  updateMemberRoleAction,
  removeMemberAction,
  type MemberActionState,
} from "./actions";

export type MemberItem = {
  id: string;
  role: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  isSelf: boolean;
};

const INITIAL: MemberActionState = { error: null, success: null };

function MemberRow({
  member,
  canManage,
}: {
  member: MemberItem;
  canManage: boolean;
}) {
  const primary = member.displayName ?? member.email ?? "Thành viên";
  const secondary =
    member.displayName && member.email ? member.email : member.phone;
  const isOwner = member.role === "owner";
  const manageable = canManage && !isOwner;

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-sm font-semibold uppercase"
          aria-hidden
        >
          {primary.slice(0, 1)}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium leading-tight truncate">
            {primary}
            {member.isSelf && (
              <span className="ml-1 text-xs text-muted-foreground">(Bạn)</span>
            )}
          </span>
          {secondary && (
            <span className="text-xs text-muted-foreground truncate">
              {secondary}
            </span>
          )}
        </div>
        <Badge variant="outline" className="ml-auto shrink-0">
          {roleLabel(member.role)}
        </Badge>
      </div>

      {isOwner && canManage && (
        <p className="text-xs text-muted-foreground">
          Chủ sở hữu được bảo vệ — không thể đổi vai trò hoặc xoá.
        </p>
      )}

      {manageable && <MemberControls member={member} />}
    </li>
  );
}

function MemberControls({ member }: { member: MemberItem }) {
  const [roleState, roleAction, rolePending] = useActionState(
    updateMemberRoleAction,
    INITIAL
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeMemberAction,
    INITIAL
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Derive feedback from the action states (no effect needed). A remove error is
  // the most actionable, so it takes precedence over a role-change result.
  const roleMsg = roleState.success ?? roleState.error;
  const feedback = removeState.error ?? roleMsg;
  const feedbackIsSuccess = !removeState.error && !!roleState.success;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {/* Role change — auto-submits on change */}
        <form ref={formRef} action={roleAction} className="contents">
          <input type="hidden" name="member_id" value={member.id} />
          <Select
            name="role"
            defaultValue={member.role}
            disabled={rolePending}
            aria-label="Vai trò thành viên"
            className="h-9 flex-1"
            onChange={() => formRef.current?.requestSubmit()}
          >
            <option value="member">Thành viên</option>
            <option value="admin">Quản trị</option>
          </Select>
        </form>

        {/* Remove — soft remove with a confirm guard */}
        <form
          action={removeAction}
          onSubmit={(e) => {
            if (
              !window.confirm(
                "Xoá thành viên này khỏi không gian làm việc? Họ sẽ mất quyền truy cập."
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="member_id" value={member.id} />
          <Button
            type="submit"
            variant="ghost"
            className="h-9 text-destructive hover:text-destructive"
            disabled={removePending}
          >
            {removePending ? "Đang xoá…" : "Xoá"}
          </Button>
        </form>
      </div>

      {feedback && (
        <p
          className={
            feedbackIsSuccess
              ? "text-xs text-emerald-600 dark:text-emerald-400"
              : "text-xs text-destructive"
          }
        >
          {feedback}
        </p>
      )}
    </div>
  );
}

export function MembersSection({
  members,
  canManage,
}: {
  members: MemberItem[];
  canManage: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => (
        <MemberRow key={member.id} member={member} canManage={canManage} />
      ))}
    </ul>
  );
}
