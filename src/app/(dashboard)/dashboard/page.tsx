import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/stat-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

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
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Xin chào! 👋</h1>
        <p className="text-sm text-muted-foreground">
          {user?.email ?? "Môi giới bất động sản"}
        </p>
      </section>

      <section className="grid gap-3">
        <Link
          href="/dashboard/properties/quick-add"
          className={cn(buttonVariants({ size: "lg" }), "h-11 w-full")}
        >
          ✨ Nhập nhanh bằng AI
        </Link>
        <Link
          href="/dashboard/properties/new"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 w-full")}
        >
          Thêm căn thủ công
        </Link>
        <Link
          href="/dashboard/properties"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 w-full")}
        >
          Xem danh sách căn
        </Link>
      </section>

      <Separator />

      {/* Onboarding checklist — visible only when user has no properties yet */}
      {(activeProperties ?? 0) === 0 && <OnboardingChecklist />}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Căn đang hoạt động" value={activeProperties ?? 0} />
        <StatCard label="Content đã tạo" value={totalContents ?? 0} />
        <StatCard label="Content tuần này" value={contentsThisWeek ?? 0} />
      </section>

      <Link
        href="/dashboard/content"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full justify-center text-muted-foreground")}
      >
        Xem lịch sử content →
      </Link>
    </div>
  );
}
