import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { NewProfileForm } from "./new-profile-form";

export const metadata: Metadata = { title: "Tạo văn phong mới" };

export default function NewStyleProfilePage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Tạo văn phong mới
          </h1>
          <p className="text-sm text-muted-foreground">
            Dán bài mẫu để AI học cách bạn viết.
          </p>
        </div>
        <Link
          href="/dashboard/style-profiles"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Quay lại
        </Link>
      </div>

      <NewProfileForm />
    </div>
  );
}
