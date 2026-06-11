import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatVND } from "@/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Bất động sản" };

type Props = {
  searchParams: Promise<{ archived?: string }>;
};

export default async function PropertiesPage({ searchParams }: Props) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // proxy.ts should prevent this, but keep render safe.
    return null;
  }

  const query = supabase
    .from("properties")
    .select("id,title,district,price,area,status,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Hide archived by default; show them when ?archived=1
  if (!showArchived) query.neq("status", "archived");

  const { data: properties, error } = await query;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Bất động sản</h1>
        <div className="flex gap-2">
          <Link
            href="/dashboard/properties/quick-add"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            ✨ Nhập nhanh
          </Link>
          <Link
            href="/dashboard/properties/new"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Thủ công
          </Link>
        </div>
      </div>

      <div className="flex gap-2 text-sm">
        <Link
          href="/dashboard/properties"
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            !showArchived
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Đang hoạt động
        </Link>
        <Link
          href="/dashboard/properties?archived=1"
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            showArchived
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Lưu trữ
        </Link>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}

      {!error && (!properties || properties.length === 0) && (
        showArchived ? (
          <Card>
            <CardHeader>
              <CardTitle>Không có căn nào được lưu trữ</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Các bất động sản được lưu trữ sẽ xuất hiện ở đây.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-3xl" aria-hidden>
              🏠
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-semibold">Chưa có căn nào</p>
              <p className="text-sm text-muted-foreground">
                Thêm căn đầu tiên để bắt đầu lưu nguồn hàng và tạo content.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              <Link
                href="/dashboard/properties/quick-add"
                className={cn(buttonVariants(), "w-full")}
              >
                ✨ Nhập nhanh bằng AI
              </Link>
              <Link
                href="/dashboard/properties/new"
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Thêm thủ công
              </Link>
            </div>
          </div>
        )
      )}

      <div className="flex flex-col gap-3">
        {properties?.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/properties/${p.id}`}
            className="block"
          >
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base leading-snug">
                    {p.title}
                  </CardTitle>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-sm text-muted-foreground">{p.district}</p>
              </CardHeader>

              <CardContent>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>
                    <span className="text-muted-foreground">Giá: </span>
                    {formatVND(Number(p.price ?? 0))}
                  </span>
                  <span>
                    <span className="text-muted-foreground">Diện tích: </span>
                    {p.area ?? 0} m²
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

