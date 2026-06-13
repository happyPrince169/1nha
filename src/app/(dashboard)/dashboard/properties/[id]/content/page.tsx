import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ContentStatusBadge,
  CONTENT_STATUS_LABELS,
} from "./content-status-badge";
import type { ContentStatus } from "@/types";

export const metadata: Metadata = { title: "Content của căn" };

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------
const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  zalo: "Zalo",
  tiktok: "TikTok",
};

const TYPE_LABELS: Record<string, string> = {
  sales_post: "Bài đăng bán hàng",
  short_caption: "Caption ngắn",
  video_script: "Script video",
  follow_up_message: "Tin nhắn follow-up",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  return `${days} ngày trước`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
};

const VALID_STATUSES: ContentStatus[] = [
  "draft",
  "scheduled",
  "posted",
  "archived",
];

export default async function PropertyContentPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const { status: statusParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch property (ownership check)
  const { data: property } = await supabase
    .from("properties")
    .select("id, title, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!property) notFound();

  // Fetch all contents for this property (no limit — broker needs full picture)
  const { data: allContents, error } = await supabase
    .from("generated_contents")
    .select(
      "id, platform, content_type, content, status, created_at, copied_at, posted_at, channel_name"
    )
    .eq("property_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const contents = allContents ?? [];

  // Status summary counts
  const counts: Record<ContentStatus, number> = {
    draft: 0,
    scheduled: 0,
    posted: 0,
    archived: 0,
  };
  for (const c of contents) {
    const s = (c.status ?? "draft") as ContentStatus;
    if (s in counts) counts[s]++;
  }

  // Active filter
  const activeStatus = VALID_STATUSES.includes(statusParam as ContentStatus)
    ? (statusParam as ContentStatus)
    : null;

  const filtered = activeStatus
    ? contents.filter((c) => (c.status ?? "draft") === activeStatus)
    : contents.filter((c) => c.status !== "archived");

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Content của căn
          </h1>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {property.title}
          </p>
        </div>
        <Link
          href={`/dashboard/properties/${id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Chi tiết
        </Link>
      </div>

      {/* CTA — generate new content */}
      {property.status !== "archived" && (
        <Link
          href={`/dashboard/properties/${id}/generate`}
          className={cn(
            buttonVariants({ size: "lg" }),
            "h-11 w-full justify-center"
          )}
        >
          ✨ Tạo content mới
        </Link>
      )}

      {/* Status summary cards */}
      {contents.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {VALID_STATUSES.filter((s) => s !== "archived").map((s) => (
            <Link
              key={s}
              href={
                activeStatus === s
                  ? `/dashboard/properties/${id}/content`
                  : `/dashboard/properties/${id}/content?status=${s}`
              }
              className={cn(
                "flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 transition-colors",
                activeStatus === s
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card hover:bg-muted/40"
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium",
                  activeStatus === s
                    ? "text-background/70"
                    : "text-muted-foreground"
                )}
              >
                {CONTENT_STATUS_LABELS[s]}
              </span>
              <span className="text-xl font-bold tabular-nums">
                {counts[s]}
              </span>
            </Link>
          ))}
          <Link
            href={
              activeStatus === "archived"
                ? `/dashboard/properties/${id}/content`
                : `/dashboard/properties/${id}/content?status=archived`
            }
            className={cn(
              "flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 transition-colors",
              activeStatus === "archived"
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card hover:bg-muted/40"
            )}
          >
            <span
              className={cn(
                "text-xs font-medium",
                activeStatus === "archived"
                  ? "text-background/70"
                  : "text-muted-foreground"
              )}
            >
              {CONTENT_STATUS_LABELS.archived}
            </span>
            <span className="text-xl font-bold tabular-nums">
              {counts.archived}
            </span>
          </Link>
        </div>
      )}

      {/* Filter label */}
      {activeStatus && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Lọc: <strong>{CONTENT_STATUS_LABELS[activeStatus]}</strong>
          </p>
          <Link
            href={`/dashboard/properties/${id}/content`}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Xoá bộ lọc
          </Link>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}

      {/* Empty state */}
      {!error && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-2xl"
            aria-hidden
          >
            📝
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-sm">
              {activeStatus
                ? `Không có content nào ở trạng thái "${CONTENT_STATUS_LABELS[activeStatus]}"`
                : "Chưa có content nào"}
            </p>
            <p className="text-xs text-muted-foreground">
              {activeStatus
                ? "Thử chọn bộ lọc khác hoặc tạo content mới."
                : "Nhấn \"Tạo content mới\" để bắt đầu."}
            </p>
          </div>
        </div>
      )}

      {/* Content list */}
      <div className="flex flex-col gap-3">
        {filtered.map((c) => {
          const status = (c.status ?? "draft") as ContentStatus;
          const preview = c.content.slice(0, 100).trimEnd();

          return (
            <Link
              key={c.id}
              href={`/dashboard/properties/${id}/content/${c.id}`}
              className="block"
            >
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.platform && (
                      <Badge variant="secondary" className="text-xs">
                        {PLATFORM_LABELS[c.platform] ?? c.platform}
                      </Badge>
                    )}
                    {c.content_type && (
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABELS[c.content_type] ?? c.content_type}
                      </Badge>
                    )}
                    <ContentStatusBadge status={status} className="ml-auto" />
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-2">
                  <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                    {preview}
                    {c.content.length > 100 && "…"}
                  </p>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{timeAgo(c.created_at)}</span>
                    {c.copied_at && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        ✓ Đã sao chép
                      </span>
                    )}
                    {c.channel_name && (
                      <span className="truncate">📌 {c.channel_name}</span>
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
