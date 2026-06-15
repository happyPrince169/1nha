import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trackEvent } from "@/lib/usage";

export const metadata: Metadata = { title: "Gói sử dụng" };

type Props = {
  searchParams: Promise<{ interest?: string }>;
};

// ---------------------------------------------------------------------------
// Features included in the current beta plan
// ---------------------------------------------------------------------------
const BETA_FEATURES = [
  "Quản lý kho nguồn",
  "Nhập nhanh bằng AI",
  "Upload ảnh căn nhà",
  "Tạo content AI",
  "Chỉnh sửa content",
  "Văn phong riêng",
  "Trợ lý đăng bài",
  "Lưu lịch sử đã đăng",
] as const;

// ---------------------------------------------------------------------------
// Future plan tiers (preview only, no enforcement)
// ---------------------------------------------------------------------------
const PLAN_TIERS = [
  { name: "Free / Dùng thử", isCurrent: false },
  { name: "Beta", isCurrent: true },
  { name: "Pro", isCurrent: false },
  { name: "Team", isCurrent: false },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function BillingPage({ searchParams }: Props) {
  const { interest } = await searchParams;
  const showInterestSuccess = interest === "success";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Track billing page view — fire-and-forget
  void trackEvent(supabase, user.id, "billing_viewed", {});

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Gói sử dụng</h1>
          <p className="text-sm text-muted-foreground leading-snug">
            Bản beta hiện đang miễn phí. Các giới hạn và gói trả phí sẽ được
            cập nhật sau khi sản phẩm ổn định hơn.
          </p>
        </div>
      </div>

      {/* Interest success banner */}
      {showInterestSuccess && (
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 dark:bg-emerald-950/40">
          <span aria-hidden className="mt-px shrink-0">✓</span>
          <p className="text-sm text-emerald-700 dark:text-emerald-400 leading-relaxed">
            Đã ghi nhận nhu cầu của bạn. 1nha sẽ liên hệ hoặc thông báo khi
            có gói phù hợp.
          </p>
        </div>
      )}

      {/* Current plan card */}
      <Card>
        <CardHeader className="gap-1">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Gói hiện tại</CardTitle>
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              Đang hoạt động
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight">
              Beta miễn phí
            </span>
          </div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            0đ trong giai đoạn beta
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Bạn có thể sử dụng các tính năng hiện tại trong giai đoạn beta.
            1nha sẽ thông báo trước khi áp dụng gói trả phí.
          </p>
        </CardContent>
      </Card>

      {/* Plan tier preview */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {PLAN_TIERS.map((tier) => (
          <span
            key={tier.name}
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium",
              tier.isCurrent
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-muted/50 text-muted-foreground"
            )}
          >
            {tier.isCurrent && (
              <span aria-hidden className="mr-1">
                ✓
              </span>
            )}
            {tier.name}
          </span>
        ))}
      </div>

      {/* Included features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tính năng trong beta</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {BETA_FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2.5 text-sm">
                <span
                  aria-hidden
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                >
                  ✓
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Separator />

      {/* CTAs */}
      <div className="flex flex-col gap-2">
        <Link
          href="/pricing"
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          📋 Xem bảng giá dự kiến
        </Link>
        <Link
          href="/dashboard/billing/upgrade"
          className={cn(buttonVariants(), "w-full")}
        >
          🔔 Đăng ký quan tâm gói trả phí
        </Link>
      </div>
    </div>
  );
}
