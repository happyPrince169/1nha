import type { Metadata } from "next";
import Link from "next/link";

import { NewPropertyForm } from "./new-property-form";
import { tryGetRequestContext } from "@/lib/workspace/request-context";
import { buildAssigneeContext } from "@/lib/services/workspace";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Thêm bất động sản" };

export default async function NewPropertyPage() {
  const ctx = await tryGetRequestContext();
  const assignee = ctx ? await buildAssigneeContext(ctx) : undefined;

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

      <NewPropertyForm assignee={assignee} />
    </div>
  );
}
