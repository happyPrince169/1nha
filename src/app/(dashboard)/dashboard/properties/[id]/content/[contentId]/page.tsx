import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "../copy-button";
import { ContentStatusBadge } from "../content-status-badge";
import { ContentEditForm } from "../content-edit-form";
import { MarkPostedForm } from "../mark-posted-form";
import { NotesForm } from "../notes-form";
import { ArchiveContentButton } from "../archive-content-button";
import type { ContentStatus } from "@/types";

export const metadata: Metadata = { title: "Content đã tạo" };

type Props = {
  params: Promise<{ id: string; contentId: string }>;
};

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------
const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  zalo: "Zalo",
  tiktok: "TikTok",
};

const TONE_LABELS: Record<string, string> = {
  professional: "Chuyên nghiệp",
  urgent: "Khẩn cấp",
  luxury: "Cao cấp",
  family: "Gia đình",
  investor: "Đầu tư",
};

const TYPE_LABELS: Record<string, string> = {
  sales_post: "Bài đăng bán hàng",
  short_caption: "Caption ngắn",
  video_script: "Script video",
  follow_up_message: "Tin nhắn follow-up",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function ContentOutputPage({ params }: Props) {
  const { id, contentId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Supabase type-gen predates the workspace + edit migrations, so we
  // cast the result with a local type that includes all columns we select.
  type ContentRow = {
    id: string;
    platform: string | null;
    tone: string | null;
    content_type: string | null;
    content: string;
    created_at: string;
    updated_at: string | null;
    edited_at: string | null;
    property_id: string;
    status: string | null;
    copied_at: string | null;
    scheduled_at: string | null;
    posted_at: string | null;
    post_url: string | null;
    channel_name: string | null;
    notes: string | null;
    style_profile_id: string | null;
  };

  const { data: content, error } = await supabase
    .from("generated_contents")
    .select("id,platform,tone,content_type,content,created_at,updated_at,edited_at,property_id,status,copied_at,scheduled_at,posted_at,post_url,channel_name,notes,style_profile_id")
    .eq("id", contentId)
    .eq("user_id", user.id)
    .eq("property_id", id)
    .single() as unknown as { data: ContentRow | null; error: unknown };

  if (error || !content) notFound();

  // Resolve the style-profile name for display (scoped to user). Best-effort:
  // a deleted profile or null id simply shows nothing.
  let styleProfileName: string | null = null;
  if (content.style_profile_id) {
    const { data: profile } = await supabase
      .from("content_style_profiles")
      .select("name")
      .eq("id", content.style_profile_id)
      .eq("user_id", user.id)
      .single();
    styleProfileName = (profile?.name as string | null) ?? null;
  }

  // Fetch property for the header and content workspace link
  const { data: property } = await supabase
    .from("properties")
    .select("id,title")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const status = (content.status ?? "draft") as ContentStatus;
  const isArchived = status === "archived";

  return (
    <div className="flex flex-col gap-4">
      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Content AI</h1>
          {property?.title && (
            <p className="text-sm text-muted-foreground line-clamp-1">
              {property.title}
            </p>
          )}
        </div>
        <Link
          href={`/dashboard/properties/${id}/content`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Danh sách
        </Link>
      </div>

      {/* Meta badges + status */}
      <div className="flex flex-wrap items-center gap-2">
        {content.platform && (
          <Badge variant="secondary">
            {PLATFORM_LABELS[content.platform] ?? content.platform}
          </Badge>
        )}
        {/* Built-in tone badge — hidden when a saved style profile was used,
            since its stored tone is just a schema-compatible fallback. */}
        {content.tone && !styleProfileName && (
          <Badge variant="outline">
            {TONE_LABELS[content.tone] ?? content.tone}
          </Badge>
        )}
        {content.content_type && (
          <Badge variant="outline">
            {TYPE_LABELS[content.content_type] ?? content.content_type}
          </Badge>
        )}
        <ContentStatusBadge status={status} className="ml-auto" />
      </div>

      {/* Style profile used */}
      {styleProfileName && (
        <p className="text-xs text-muted-foreground">
          Giọng văn: {styleProfileName}
        </p>
      )}

      {/* Posted info banner */}
      {status === "posted" && (
        <div className="flex flex-col gap-1 rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-950/40">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            ✓ Đã đăng bài
          </p>
          {content.posted_at && (
            <p className="text-xs text-emerald-600/80 dark:text-emerald-500">
              {formatDate(content.posted_at)}
              {content.channel_name && ` · ${content.channel_name}`}
            </p>
          )}
          {content.post_url && (
            <a
              href={content.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 truncate text-xs text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
            >
              {content.post_url}
            </a>
          )}
        </div>
      )}

      {/* Copied indicator */}
      {content.copied_at && status !== "posted" && (
        <p className="text-xs text-muted-foreground">
          ✓ Đã sao chép lúc {formatDate(content.copied_at)}
        </p>
      )}

      {/* Generated content — editable when not archived */}
      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-base">Nội dung bài đăng</CardTitle>
          {content.edited_at && (
            <p className="text-xs text-muted-foreground">
              ✒ Đã chỉnh sửa lúc {formatDate(content.edited_at)}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {isArchived ? (
            // Archived: read-only view
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {content.content}
            </p>
          ) : (
            // Active: inline editable textarea
            <ContentEditForm
              contentId={contentId}
              initialText={content.content}
            />
          )}
        </CardContent>
      </Card>

      {/* Copy button — text prop is always the DB-current value (server render) */}
      {!isArchived && (
        <CopyButton text={content.content} contentId={contentId} />
      )}

      {/* Post assistant CTA */}
      {!isArchived && (
        <Link
          href={`/dashboard/properties/${id}/content/${contentId}/post`}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 w-full justify-center gap-2"
          )}
        >
          <span aria-hidden>📣</span>
          Trợ lý đăng bài
        </Link>
      )}

      {/* Mark as posted form */}
      {!isArchived && (
        <MarkPostedForm
          contentId={contentId}
          postedAt={content.posted_at ?? null}
          channelName={content.channel_name ?? null}
          postUrl={content.post_url ?? null}
          alreadyPosted={status === "posted"}
        />
      )}

      <Separator />

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ghi chú nội bộ</CardTitle>
        </CardHeader>
        <CardContent>
          <NotesForm
            contentId={contentId}
            initialNotes={content.notes ?? null}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Generate another */}
      <Link
        href={`/dashboard/properties/${id}/generate`}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-11 w-full justify-center"
        )}
      >
        ✨ Tạo content mới
      </Link>

      {/* Archive */}
      {!isArchived && (
        <ArchiveContentButton contentId={contentId} />
      )}
    </div>
  );
}
