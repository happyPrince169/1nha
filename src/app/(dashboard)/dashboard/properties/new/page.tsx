import type { Metadata } from "next";
import Link from "next/link";

import { NewPropertyForm } from "./new-property-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Thêm bất động sản" };

export default async function NewPropertyPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Thêm căn mới</h1>
        <Link
          href="/dashboard/properties"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Danh sách
        </Link>
      </div>

      <NewPropertyForm />
    </div>
  );
}
