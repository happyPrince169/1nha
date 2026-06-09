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
        <Link
          href="/dashboard/properties/new"
          className={cn(buttonVariants({ size: "sm" }))}
        >
          Thêm căn
        </Link>
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
        <Card>
          <CardHeader>
            <CardTitle>
              {showArchived ? "Không có căn nào được lưu trữ" : "Chưa có căn nào"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {showArchived
              ? "Các bất động sản được lưu trữ sẽ xuất hiện ở đây."
              : "Tạo căn đầu tiên để bắt đầu quản lý danh sách."}
          </CardContent>
        </Card>
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

