import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { contactOptions, contactOptionOrder } from "@/lib/contact";
import type { BrokerProfile } from "@/types";
import { AccountForm } from "./account-form";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata: Metadata = { title: "Tài khoản" };

// ---------------------------------------------------------------------------
// Secondary action link card
// ---------------------------------------------------------------------------
function AccountLinkCard({
  icon,
  label,
  description,
  href,
}: {
  icon: string;
  label: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3",
        "transition-colors hover:bg-muted/40"
      )}
    >
      <span className="text-xl shrink-0" aria-hidden>{icon}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium leading-tight">{label}</span>
        <span className="text-xs text-muted-foreground leading-tight truncate">
          {description}
        </span>
      </div>
      <span className="ml-auto text-muted-foreground/50 shrink-0" aria-hidden>›</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Contact channel row (external <a>, not a Next route)
// ---------------------------------------------------------------------------
function ContactRow({
  icon,
  label,
  description,
  href,
  external,
}: {
  icon: string;
  label: string;
  description: string;
  href: string;
  external: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3",
        "transition-colors hover:bg-muted/40"
      )}
    >
      <span className="text-xl shrink-0" aria-hidden>{icon}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium leading-tight">{label}</span>
        <span className="text-xs text-muted-foreground leading-tight truncate">
          {description}
        </span>
      </div>
      <span className="ml-auto text-muted-foreground/50 shrink-0" aria-hidden>›</span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch broker profile — scoped strictly to user_id
  const { data: profile } = (await supabase
    .from("user_profiles")
    .select("user_id,display_name,phone,company_name,role,created_at,updated_at")
    .eq("user_id", user.id)
    .single()) as unknown as { data: BrokerProfile | null };

  const displayName = profile?.display_name ?? user.email ?? "Môi giới";

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-semibold tracking-tight">Tài khoản</h1>
        <p className="text-sm text-muted-foreground leading-snug">
          Quản lý hồ sơ, gói beta miễn phí, bảng giá và góp ý.
        </p>
      </div>

      {/* Identity card */}
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xl font-semibold uppercase"
            aria-hidden
          >
            {displayName.slice(0, 1)}
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="font-medium leading-tight truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </CardContent>
      </Card>

      {/* Profile form */}
      <AccountForm email={user.email ?? ""} profile={profile} />

      <Separator />

      {/* Liên hệ & góp ý */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5 px-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Liên hệ &amp; góp ý
          </p>
          <p className="text-xs text-muted-foreground leading-snug">
            Cần hỗ trợ hoặc muốn góp ý cho 1nha? Chọn kênh liên hệ phù hợp.
          </p>
        </div>
        {contactOptionOrder.map((key) => {
          const option = contactOptions[key];
          return (
            <ContactRow
              key={key}
              icon={option.icon}
              label={option.label}
              description={option.description}
              href={option.href}
              external={option.external}
            />
          );
        })}
      </div>

      <Separator />

      {/* Account & billing links */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
          Gói và bảng giá
        </p>
        <AccountLinkCard
          icon="💳"
          label="Gói sử dụng"
          description="Beta miễn phí • Xem tính năng hiện tại"
          href="/dashboard/billing"
        />
        <AccountLinkCard
          icon="📋"
          label="Bảng giá dự kiến"
          description="Xem định hướng các gói sắp ra mắt"
          href="/pricing"
        />
        <AccountLinkCard
          icon="🔔"
          label="Đăng ký quan tâm gói trả phí"
          description="Để lại nhu cầu, 1nha thông báo khi mở gói"
          href="/dashboard/billing/upgrade"
        />
      </div>

      <Separator />

      {/* Sign out */}
      <div className="flex flex-col gap-2 pb-2">
        <SignOutButton variant="outline" />
      </div>
    </div>
  );
}
