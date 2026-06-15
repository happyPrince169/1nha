import type { Metadata } from "next";
import Link from "next/link";

import { QuickAddClient } from "./quick-add-client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Nhập nhanh nguồn hàng" };

export default function QuickAddPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Nhập nhanh nguồn hàng
          </h1>
          <p className="text-sm text-muted-foreground leading-snug">
            Dán tin nhắn, mô tả hoặc ảnh chụp nguồn hàng. 1nha sẽ giúp bạn bóc tách thông tin căn.
          </p>
        </div>
        <Link
          href="/dashboard/properties"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
        >
          ← Kho nguồn
        </Link>
      </div>

      <QuickAddClient />

      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
        📌 Vui lòng kiểm tra lại giá, diện tích, pháp lý và trạng thái căn trước khi lưu.
      </p>
    </div>
  );
}
