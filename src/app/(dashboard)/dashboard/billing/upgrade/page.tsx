import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { UpgradeInterestForm } from "./upgrade-form";

export const metadata: Metadata = { title: "Đăng ký quan tâm gói trả phí" };

export default function UpgradeInterestPage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Đăng ký quan tâm gói trả phí
          </h1>
          <p className="text-sm text-muted-foreground leading-snug">
            Bản beta hiện vẫn miễn phí. Bạn có thể để lại nhu cầu để 1nha ưu
            tiên hỗ trợ và thông báo khi mở gói phù hợp.
          </p>
        </div>
        <Link
          href="/dashboard/billing"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0"
          )}
        >
          ← Quay lại
        </Link>
      </div>

      {/* No-payment disclaimer */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <span aria-hidden className="mt-px shrink-0 text-sm">ℹ️</span>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Đây không phải trang thanh toán. Bạn chỉ đăng ký quan tâm — 1nha sẽ
          liên hệ khi có gói phù hợp. Hiện tại vẫn dùng bình thường và miễn phí.
        </p>
      </div>

      <UpgradeInterestForm />
    </div>
  );
}
