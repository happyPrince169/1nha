import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { tryGetRequestContext } from "@/lib/workspace/request-context";
import { toApiError } from "@/lib/api/errors";
import { getGeneratedContentForProperty } from "@/lib/services/generated-content";
import { getPropertyById } from "@/lib/services/properties";
import { canManageGeneratedContent } from "@/lib/workspace/permissions";
import { listPropertyImages } from "@/lib/services/property-images";
import { cn } from "@/lib/utils";
import { formatVND } from "@/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trackEvent } from "@/lib/usage";

import { StatusBadge } from "../../../../status-badge";
import { CopyButton } from "../../copy-button";
import { MarkPostedForm } from "../../mark-posted-form";
import { PlatformSelector } from "./platform-selector";
import { PostImagePicker, type PickerImage } from "./post-image-picker";

export const metadata: Metadata = { title: "Trợ lý đăng bài" };

type Props = {
  params: Promise<{ id: string; contentId: string }>;
};

// ---------------------------------------------------------------------------
// Checklist items
// ---------------------------------------------------------------------------
const CHECKLIST_ITEMS = [
  "Kiểm tra lại giá và trạng thái căn trước khi đăng",
  "Kiểm tra ảnh có đúng căn không",
  "Không đăng thông tin chủ nhà/số nhà nếu chưa được phép",
  "Sau khi đăng xong, đánh dấu đã đăng để lưu lịch sử",
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function PostAssistantPage({ params }: Props) {
  const { id, contentId } = await params;

  // Organization-scoped reads via the shared services (Phase 3D alignment).
  const ctx = await tryGetRequestContext();
  if (!ctx) return null;

  // Content scoped to the property + current workspace (NOT_FOUND across orgs).
  let content;
  try {
    content = await getGeneratedContentForProperty(ctx, id, contentId);
  } catch (err) {
    if (toApiError(err).code === "NOT_FOUND") notFound();
    throw err;
  }

  // Do not show the post assistant for archived content.
  if (content.status === "archived") notFound();

  // Property summary (sensitive notes are never rendered below).
  let property;
  try {
    property = await getPropertyById(ctx, id);
  } catch (err) {
    if (toApiError(err).code === "NOT_FOUND") notFound();
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Property images via the shared service. Thumbnails drive the preview grid;
  // originals back the download / copy / open actions. Two org-scoped batches —
  // no direct property_images query, no duplicated signing.
  // ---------------------------------------------------------------------------
  const [thumbItems, originalItems] = await Promise.all([
    listPropertyImages(ctx, id, { variant: "thumbnail" }),
    listPropertyImages(ctx, id, { variant: "original" }),
  ]);
  const originalUrlById = new Map(originalItems.map((i) => [i.id, i.url]));

  const pickerImages: PickerImage[] = thumbItems
    .map((i) => ({
      id: i.id,
      thumbnailUrl: i.url ?? originalUrlById.get(i.id) ?? "",
      originalUrl: originalUrlById.get(i.id) ?? "",
      altText: i.alt_text,
      caption: i.caption,
      isCover: i.is_cover,
    }))
    // Actions need a usable original; drop rows without one.
    .filter((img) => img.originalUrl !== "");

  // Track page open — fire-and-forget, never blocks render
  void trackEvent(ctx.supabase, ctx.userId, "post_assistant_opened", {
    property_id: id,
    content_id: contentId,
  });

  const isPosted = content.status === "posted";
  // Phase 4C: only managers may mark posting status. Reading/copying is open to
  // all active members.
  const canManage = canManageGeneratedContent(ctx, property);
  const locationParts = [
    property.district,
    property.ward,
    property.city,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      {/* ── A. Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Trợ lý đăng bài
          </h1>
          <p className="text-sm text-muted-foreground leading-snug">
            Chuẩn bị nội dung và ảnh để đăng lên Facebook, Zalo, TikTok.
          </p>
        </div>
        <Link
          href={`/dashboard/properties/${id}/content/${contentId}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
        >
          ← Quay lại
        </Link>
      </div>

      {/* No-auto-post disclaimer */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <span aria-hidden className="mt-px shrink-0 text-sm">ℹ️</span>
        <p className="text-xs text-muted-foreground leading-relaxed">
          1nha chưa tự đăng thay bạn. Bạn copy nội dung, tải ảnh rồi đăng thủ công trên nền tảng bạn chọn.
        </p>
      </div>

      {/* ── B. Property summary ────────────────────────────────────── */}
      <Card>
        <CardHeader className="gap-1">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">
              {property.title}
            </CardTitle>
            <StatusBadge status={property.status} />
          </div>
          {locationParts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {locationParts.join(" · ")}
            </p>
          )}
        </CardHeader>
        {(property.price != null || property.area != null) && (
          <CardContent>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {property.price != null && (
                <span>
                  <span className="text-muted-foreground">Giá: </span>
                  <span className="font-medium">
                    {formatVND(Number(property.price))}
                  </span>
                </span>
              )}
              {property.area != null && (
                <span>
                  <span className="text-muted-foreground">DT: </span>
                  <span className="font-medium">
                    {property.area}&nbsp;m²
                  </span>
                </span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── C. Platform selector ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nền tảng đăng bài</CardTitle>
        </CardHeader>
        <CardContent>
          <PlatformSelector suggestedPlatform={content.platform} />
        </CardContent>
      </Card>

      {/* ── D. Content text ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nội dung bài đăng</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {content.content}
          </p>
          <Separator />
          {/* Reuse CopyButton — tracks content_copied + shows ✓ feedback */}
          <CopyButton text={content.content} contentId={contentId} />
        </CardContent>
      </Card>

      {/* ── E. Image picker ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ảnh đăng kèm</CardTitle>
        </CardHeader>
        <CardContent>
          <PostImagePicker images={pickerImages} propertyId={id} />
        </CardContent>
      </Card>

      {/* ── F. Posting checklist ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kiểm tra trước khi đăng</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2.5">
            {CHECKLIST_ITEMS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-muted text-[10px] font-bold text-muted-foreground"
                >
                  ✓
                </span>
                <span className="leading-snug text-muted-foreground">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ── G. Mark posted (managers only) ─────────────────────────── */}
      {canManage && (
        <MarkPostedForm
          contentId={contentId}
          postedAt={content.posted_at ?? null}
          channelName={content.channel_name ?? null}
          postUrl={content.post_url ?? null}
          alreadyPosted={isPosted}
        />
      )}

      {/* Posted state — show link to content detail */}
      {isPosted && (
        <Link
          href={`/dashboard/properties/${id}/content/${contentId}`}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "w-full justify-center text-muted-foreground"
          )}
        >
          Xem chi tiết content →
        </Link>
      )}
    </div>
  );
}
