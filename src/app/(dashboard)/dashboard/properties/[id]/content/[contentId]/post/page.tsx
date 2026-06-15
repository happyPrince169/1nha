import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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

const BUCKET = "property-images";
const SIGNED_URL_TTL = 3600;

type Props = {
  params: Promise<{ id: string; contentId: string }>;
};

// ---------------------------------------------------------------------------
// Local row types (Supabase type-gen predates recent migrations)
// ---------------------------------------------------------------------------
type ContentRow = {
  id: string;
  platform: string | null;
  content: string;
  status: string | null;
  posted_at: string | null;
  post_url: string | null;
  channel_name: string | null;
  property_id: string;
};

type PropertyRow = {
  id: string;
  title: string;
  city: string | null;
  district: string | null;
  ward: string | null;
  price: number | null;
  area: number | null;
  status: string | null;
};

type ImageRow = {
  id: string;
  storage_path: string;
  alt_text: string | null;
  caption: string | null;
  is_cover: boolean;
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch content — scoped to user + property
  const { data: content } = await supabase
    .from("generated_contents")
    .select(
      "id,platform,content,status,posted_at,post_url,channel_name,property_id"
    )
    .eq("id", contentId)
    .eq("user_id", user.id)
    .eq("property_id", id)
    .single() as unknown as { data: ContentRow | null };

  if (!content) notFound();

  // Do not show the post assistant for archived content
  if (content.status === "archived") notFound();

  // Fetch property — scoped to user. Deliberately exclude sensitive notes.
  const { data: property } = await supabase
    .from("properties")
    .select("id,title,city,district,ward,price,area,status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single() as unknown as { data: PropertyRow | null };

  if (!property) notFound();

  // ---------------------------------------------------------------------------
  // Fetch property images — batch signed URLs, no N+1
  // ---------------------------------------------------------------------------
  const { data: imageRows } = await supabase
    .from("property_images")
    .select("id,storage_path,alt_text,caption,is_cover")
    .eq("property_id", id)
    .eq("user_id", user.id)
    .neq("storage_path", "__pending__")
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true }) as unknown as {
      data: ImageRow[] | null;
    };

  let pickerImages: PickerImage[] = [];

  if (imageRows && imageRows.length > 0) {
    const paths = imageRows.map((r) => r.storage_path);
    const { data: signedData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);

    const urlByPath = new Map<string, string>();
    for (const item of signedData ?? []) {
      if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
    }

    pickerImages = imageRows
      .map((r) => ({
        id: r.id,
        signedUrl: urlByPath.get(r.storage_path) ?? "",
        altText: r.alt_text,
        caption: r.caption,
        isCover: r.is_cover,
      }))
      .filter((img) => img.signedUrl !== "");
  }

  // Track page open — fire-and-forget, never blocks render
  void trackEvent(supabase, user.id, "post_assistant_opened", {
    property_id: id,
    content_id: contentId,
  });

  const isPosted = content.status === "posted";
  const locationParts = [
    property.district,
    property.ward,
    property.city,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      {/* ── A. Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Trợ lý đăng bài
          </h1>
          <p className="text-sm text-muted-foreground">
            Chuẩn bị nội dung và ảnh để đăng lên mạng xã hội.
          </p>
        </div>
        <Link
          href={`/dashboard/properties/${id}/content/${contentId}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Quay lại
        </Link>
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

      {/* ── G. Mark posted ─────────────────────────────────────────── */}
      <MarkPostedForm
        contentId={contentId}
        postedAt={content.posted_at ?? null}
        channelName={content.channel_name ?? null}
        postUrl={content.post_url ?? null}
        alreadyPosted={isPosted}
      />

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
