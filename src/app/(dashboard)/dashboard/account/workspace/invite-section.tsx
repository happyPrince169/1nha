"use client";

// ---------------------------------------------------------------------------
// InviteSection — owner/admin invite-by-link MVP (Phase 4A).
//
// No email is sent. Creating an invite returns an unguessable token; we build a
// /invite/<token> link the broker copies and forwards manually (Zalo/email).
// Pending invites can be copied again or revoked.
// ---------------------------------------------------------------------------
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form-error";
import { roleLabel } from "./labels";
import {
  createInviteAction,
  revokeInviteAction,
  type CreateInviteState,
  type RevokeInviteState,
} from "./actions";

export type InviteRow = {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
};

const CREATE_INITIAL: CreateInviteState = { error: null, invite: null };
const REVOKE_INITIAL: RevokeInviteState = { error: null };

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("vi-VN");
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Copyable invite link
// ---------------------------------------------------------------------------
function CopyLinkButton({ token, label }: { token: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — fall back to a prompt so the user can copy manually.
      window.prompt("Sao chép liên kết lời mời:", link);
    }
  }

  return (
    <Button type="button" variant="outline" className="h-9" onClick={copy}>
      {copied ? "✓ Đã sao chép" : (label ?? "Sao chép liên kết")}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Revoke pending invite
// ---------------------------------------------------------------------------
function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [state, formAction, isPending] = useActionState(
    revokeInviteAction,
    REVOKE_INITIAL
  );

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="invite_id" value={inviteId} />
      <Button
        type="submit"
        variant="ghost"
        className="h-9 text-destructive hover:text-destructive"
        disabled={isPending}
        title={state.error ?? undefined}
      >
        {isPending ? "Đang thu hồi…" : "Thu hồi"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// InviteSection
// ---------------------------------------------------------------------------
export function InviteSection({ invites }: { invites: InviteRow[] }) {
  const [state, formAction, isPending] = useActionState(
    createInviteAction,
    CREATE_INITIAL
  );

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        {state.error && <FormError>{state.error}</FormError>}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite_email">Email người được mời</Label>
          <Input
            id="invite_email"
            name="email"
            type="email"
            placeholder="vd: dongnghiep@example.com"
            disabled={isPending}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite_role">Vai trò</Label>
          <Select id="invite_role" name="role" defaultValue="member" disabled={isPending}>
            <option value="member">Thành viên</option>
            <option value="admin">Quản trị</option>
          </Select>
        </div>

        <Button type="submit" disabled={isPending} className="h-11 w-full">
          {isPending ? "Đang tạo lời mời…" : "Tạo liên kết mời"}
        </Button>
      </form>

      {/* Just-created invite link */}
      {state.invite && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            ✓ Đã tạo lời mời cho {state.invite.email}
          </p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
            Gửi liên kết này qua Zalo hoặc email. Liên kết có hiệu lực trong 7 ngày.
          </p>
          <div>
            <CopyLinkButton token={state.invite.token} label="Sao chép liên kết mời" />
          </div>
        </div>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
            Lời mời đang chờ ({invites.length})
          </p>
          <ul className="flex flex-col gap-2">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate min-w-0">
                    {invite.email}
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {roleLabel(invite.role)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Hết hạn: {formatDate(invite.expiresAt)}
                </p>
                <div className="flex items-center gap-2">
                  <CopyLinkButton token={invite.token} />
                  <RevokeInviteButton inviteId={invite.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
