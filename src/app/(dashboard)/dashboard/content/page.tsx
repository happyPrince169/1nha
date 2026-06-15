import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentFilters, PLATFORM_LABELS, TYPE_LABELS } from "./content-filters";
import { ContentStatusBadge } from "../properties/[id]/content/content-status-badge";
import type { ContentStatus } from "@/types";

export const metadata: Metadata = { title: "Nội dung" };

type Props = {
  searchParams: Promise<{ platform?: string; status?: string; q?: string }>;
};

const VALID_STATUSES = new Set(["draft", "scheduled", "posted", "archived"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  return `${days} ngày trước`;
}

function platformBadgeClass(platform: string): string {
  switch (platform) {
    case "facebook":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800";
    case "zalo":
      return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800";
    case "tiktok":
      return "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-400 dark:border-pink-800";
    default:
      return "";
  }
}

const VALID_PLATFORMS = new Set(["facebook", "zalo", "tiktok"]);

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------
export default async function ContentHistoryPage({ searchParams }: Props) {
  const { platform, status, q } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Build query — join to properties so we can show the title
  let query = supabase
    .from("generated_contents")
    .select(
      "id, platform, content_type, content, status, created_at, copied_at, property_id, properties(id, title)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  // Server-side platform filter
  if (platform && VALID_PLATFORMS.has(platform)) {
    query = query.eq("platform", platform);
  }

  // Server-side status filter
  if (status && VALID_STATUSES.has(status)) {
    query = query.eq("status", status);
  }

  const { data: contents, error } = await query;

  // Client-side search: match against property title OR content text.
  // Kept in JS to avoid PostgREST ilike-on-join limitations.
  const trimQ = q?.trim().toLowerCase() ?? "";
  const filtered = trimQ
    ? (contents ?? []).filter((c) => {
        const title =
          (c.properties as { title?: string } | null)?.title?.toLowerCase() ?? "";
        const body = c.content.toLowerCase();
        return title.includes(trimQ) || body.includes(trimQ);
      })
    : (contents ?? []);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Nội dung</h1>
          <p className="text-sm text-muted-foreground leading-snug">
            Quản lý các bài đã tạo, đã chỉnh sửa, đã copy và đã đăng.
            {filtered.length > 0 && (
              <span className="ml-1 text-muted-foreground/70">({filtered.length} mục)</span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <ContentFilters />

      {/* Error */}
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}

      {/* Empty state */}
      {!error && filtered.length === 0 && (
        q || platform ? (
          <Card>
            <CardHeader>
              <CardTitle>Không tìm thấy kết quả</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Không có content nào khớp với bộ lọc hiện tại. Thử xoá tìm kiếm hoặc chọn “Tất cả”.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-3xl" aria-hidden>
              📝
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-semibold">Chưa có nội dung nào</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tạo content từ một căn trong kho nguồn để bắt đầu.
              </p>
            </div>
            <Link
              href="/dashboard/properties"
              className={cn(buttonVariants(), "w-full")}
            >
              🗂️ Vào kho nguồn
            </Link>
          </div>
        )
      )}

      {/* List */}
      <div className="flex flex-col gap-3">
        {filtered.map((c) => {
          const propertyId = c.property_id;
          const propertyTitle =
            (c.properties as { id?: string; title?: string } | null)?.title ??
            "—";
          const preview = c.content.slice(0, 120).trimEnd();
          const hasMore = c.content.length > 120;
          const contentStatus = (c.status ?? "draft") as ContentStatus;

          return (
            <Link
              key={c.id}
              href={`/dashboard/properties/${propertyId}/content/${c.id}`}
              className="block"
            >
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader className="gap-2">
                  {/* Platform + type + status */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.platform && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          platformBadgeClass(c.platform)
                        )}
                      >
                        {PLATFORM_LABELS[c.platform] ?? c.platform}
                      </span>
                    )}
                    {c.content_type && (
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABELS[c.content_type] ?? c.content_type}
                      </Badge>
                    )}
                    <ContentStatusBadge
                      status={contentStatus}
                      className="ml-auto"
                    />
                  </div>

                  {/* Property title */}
                  <p className="text-sm font-medium leading-snug line-clamp-1">
                    {propertyTitle}
                  </p>
                </CardHeader>

                <CardContent className="flex flex-col gap-2">
                  {/* Preview text */}
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                    {preview}
                    {hasMore && "…"}
                  </p>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{timeAgo(c.created_at)}</span>
                    {c.copied_at && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        ✓ Sao chép
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
