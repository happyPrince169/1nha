import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getInvitePreview } from "@/lib/services/workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AcceptInviteButton } from "./accept-button";

export const metadata: Metadata = { title: "Lời mời tham gia workspace" };

const ROLE_LABELS: Record<string, string> = {
  owner: "Chủ sở hữu",
  admin: "Quản trị",
  member: "Thành viên",
};

// Centered single-card shell (this route is outside the dashboard layout).
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in — the invite link stays valid; ask them to sign in first.
  if (!user) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Lời mời tham gia workspace</CardTitle>
            <CardDescription>
              Bạn cần đăng nhập để xem và chấp nhận lời mời này. Liên kết vẫn còn
              hiệu lực — hãy đăng nhập rồi mở lại liên kết.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/sign-in"
              className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Đăng nhập để tiếp tục
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const invite = await getInvitePreview(supabase, token);

  if (!invite) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Lời mời không hợp lệ</CardTitle>
            <CardDescription>
              Lời mời không tồn tại hoặc đã bị xoá. Hãy yêu cầu người quản lý gửi
              lại lời mời mới.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ‹ Về trang tổng quan
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const notPending = invite.status !== "pending";
  const expired = invite.isExpired;
  const emailMismatch =
    !!user.email &&
    user.email.toLowerCase() !== invite.email.toLowerCase();

  const blockedMessage = notPending
    ? "Lời mời này đã được sử dụng hoặc đã bị thu hồi."
    : expired
      ? "Lời mời đã hết hạn. Hãy yêu cầu người quản lý gửi lại lời mời mới."
      : null;

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle>Lời mời tham gia workspace</CardTitle>
          <CardDescription>
            Bạn được mời tham gia một không gian làm việc trên 1nha.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                🏢
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium leading-tight truncate">
                  {invite.organizationName}
                </span>
                <span className="text-xs text-muted-foreground">
                  Vai trò:{" "}
                  <Badge variant="outline">
                    {ROLE_LABELS[invite.role] ?? invite.role}
                  </Badge>
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Lời mời dành cho: {invite.email}
            </p>
          </div>

          {blockedMessage ? (
            <>
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {blockedMessage}
              </p>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ‹ Về trang tổng quan
              </Link>
            </>
          ) : emailMismatch ? (
            <>
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                Lời mời dành cho email khác ({invite.email}). Bạn đang đăng nhập
                bằng {user.email}. Hãy đăng nhập bằng đúng email được mời để tham
                gia.
              </p>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ‹ Về trang tổng quan
              </Link>
            </>
          ) : (
            <AcceptInviteButton token={token} />
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}
