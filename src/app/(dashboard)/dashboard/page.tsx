import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/stat-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "1nha — Kho nguồn & trợ lý đăng bài" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // --- Real Supabase counts -----------------------------------------------
  // All queries are scoped to the authenticated user and run in parallel.

  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const [
    { count: activeProperties },
    { count: totalContents },
    { count: contentsThisWeek },
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user?.id ?? "")
      .neq("status", "archived"),

    supabase
      .from("generated_contents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user?.id ?? ""),

    supabase
      .from("generated_contents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user?.id ?? "")
      .gte("created_at", startOfWeek.toISOString()),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting + main message */}
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Hôm nay bạn muốn xử lý nguồn nào?
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Quản lý nguồn nhà, tạo content, chuẩn bị bài đăng và lưu lịch sử làm việc trong một nơi.
        </p>
      </section>

      {/* Primary actions */}
      <section className="grid gap-2.5">
        <Link
          href="/dashboard/properties/quick-add"
          className={cn(buttonVariants({ size: "lg" }), "h-11 w-full")}
        >
          ✨ Nhập nhanh nguồn mới
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/dashboard/properties"
            className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full")}
          >
            🗂️ Xem kho nguồn
          </Link>
          <Link
            href="/dashboard/style-profiles"
            className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full")}
          >
            ✍️ Tạo văn phong
          </Link>
        </div>
        <Link
          href="/dashboard/content"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full justify-center text-muted-foreground")}
        >
          Xem nội dung đã tạo →
        </Link>
      </section>

      <Separator />

      {/* Onboarding checklist — only when user has no properties yet */}
      {(activeProperties ?? 0) === 0 && <OnboardingChecklist />}

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Căn đang quản lý" value={activeProperties ?? 0} />
        <StatCard label="Content đã tạo" value={totalContents ?? 0} />
        <StatCard label="Tuần này" value={contentsThisWeek ?? 0} />
      </section>
    </div>
  );
}
