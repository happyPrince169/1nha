import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "../copy-button";

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

  // Fetch the generated content — scoped to both user_id and property_id
  // so a user cannot view another user's generated content by guessing the UUID.
  const { data: content, error } = await supabase
    .from("generated_contents")
    .select("id,platform,tone,content_type,content,created_at,property_id")
    .eq("id", contentId)
    .eq("user_id", user.id)
    .eq("property_id", id)
    .single();

  if (error || !content) notFound();

  // Fetch property title for the header
  const { data: property } = await supabase
    .from("properties")
    .select("id,title")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

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
          href={`/dashboard/properties/${id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Chi tiết
        </Link>
      </div>

      {/* Meta badges */}
      <div className="flex flex-wrap gap-2">
        {content.platform && (
          <Badge variant="secondary">
            {PLATFORM_LABELS[content.platform] ?? content.platform}
          </Badge>
        )}
        {content.tone && (
          <Badge variant="outline">
            {TONE_LABELS[content.tone] ?? content.tone}
          </Badge>
        )}
        {content.content_type && (
          <Badge variant="outline">
            {TYPE_LABELS[content.content_type] ?? content.content_type}
          </Badge>
        )}
      </div>

      {/* Generated content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nội dung đã tạo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {content.content}
          </p>
        </CardContent>
      </Card>

      {/* Large copy button */}
      <CopyButton text={content.content} />

      {/* Generate another */}
      <Link
        href={`/dashboard/properties/${id}/generate`}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-11 w-full justify-center"
        )}
      >
        ✨ Tạo lại content mới
      </Link>
    </div>
  );
}
