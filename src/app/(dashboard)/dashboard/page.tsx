import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/stat-card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // MVP placeholders — wire to real Supabase queries in the next step.
  const totalProperties = 0;
  const contentCreated = 0;
  const quotaRemaining = 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Xin chào! 👋</h1>
        <p className="text-sm text-muted-foreground">
          {user?.email ?? "Môi giới bất động sản"}
        </p>
      </section>

      <section className="grid gap-3">
        <Link
          href="/dashboard/properties/new"
          className={cn(buttonVariants({ size: "lg" }), "h-11 w-full")}
        >
          Thêm căn mới
        </Link>
        <Button variant="outline" className="h-11 w-full" size="lg">
          Tạo content hôm nay
        </Button>
        <Link
          href="/dashboard/properties"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 w-full")}
        >
          Xem danh sách căn
        </Link>
      </section>

      <Separator />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Tổng số căn" value={totalProperties} />
        <StatCard label="Content đã tạo" value={contentCreated} />
        <StatCard label="Quota còn lại" value={quotaRemaining} />
      </section>
    </div>
  );
}
