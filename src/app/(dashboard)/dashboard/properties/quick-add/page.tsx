import type { Metadata } from "next";
import Link from "next/link";

import { QuickAddClient } from "./quick-add-client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Nhập nhanh bằng AI" };

export default function QuickAddPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Nhập nhanh bằng AI
          </h1>
          <p className="text-sm text-muted-foreground">
            Dán văn bản hoặc tải ảnh, AI tự điền form
          </p>
        </div>
        <Link
          href="/dashboard/properties"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Danh sách
        </Link>
      </div>

      <QuickAddClient />
    </div>
  );
}
