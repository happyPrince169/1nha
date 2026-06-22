import type { Metadata } from "next";
import Link from "next/link";

import { tryGetRequestContext } from "@/lib/workspace/request-context";
import { buttonVariants } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/stat-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "1nha — Kho nguồn & trợ lý đăng bài" };

export default async function DashboardPage() {
  // Organization-scoped counts via the request context (Phase 3D alignment).
  const ctx = await tryGetRequestContext();
  if (!ctx) return null;
  const { supabase, organizationId } = ctx;

  // --- Real Supabase counts -----------------------------------------------
  // All queries are scoped to the current workspace and run in parallel.

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
      .eq("organization_id", organizationId)
      .neq("status", "archived"),

    supabase
      .from("generated_contents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),

    supabase
      .from("generated_contents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
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
        <LinkButton
          href="/dashboard/properties/quick-add"
          size="lg"
          className="h-11 w-full"
        >
          ✨ Nhập nhanh nguồn mới
        </LinkButton>
        <div className="grid grid-cols-2 gap-2">
          <LinkButton
            href="/dashboard/properties"
            variant="outline"
            className="h-11 w-full"
          >
            🗂️ Xem kho nguồn
          </LinkButton>
          <LinkButton
            href="/dashboard/style-profiles"
            variant="outline"
            className="h-11 w-full"
          >
            ✍️ Tạo văn phong
          </LinkButton>
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
