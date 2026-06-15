import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ContentStyleProfile, ContentStyleRules } from "@/types";
import {
  EditProfileForm,
  SetDefaultButton,
  DeleteProfileButton,
} from "./profile-actions";

export const metadata: Metadata = { title: "Chi tiết văn phong" };

type Props = {
  params: Promise<{ profileId: string }>;
};

// ---------------------------------------------------------------------------
// Local row type — Supabase type-gen doesn't know this table yet
// ---------------------------------------------------------------------------
type ProfileRow = Pick<
  ContentStyleProfile,
  | "id"
  | "name"
  | "description"
  | "platform"
  | "sample_text"
  | "style_rules"
  | "is_default"
  | "created_at"
  | "updated_at"
>;

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------
const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  zalo: "Zalo",
  tiktok: "TikTok",
  other: "Khác",
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
// StyleRulesDisplay
//
// Renders the AI-analyzed style_rules JSONB as labelled sections.
// Collapsed behind a <details> for rarely-needed fields.
// ---------------------------------------------------------------------------
type RuleRowProps = { label: string; value: string };
function RuleRow({ label, value }: RuleRowProps) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <p className="text-sm leading-relaxed">{value}</p>
    </div>
  );
}

type TagListProps = { label: string; items: string[] };
function TagList({ label, items }: TagListProps) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span aria-hidden className="mt-1 shrink-0 text-muted-foreground">
              ·
            </span>
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StyleRulesDisplay({ rules }: { rules: ContentStyleRules }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Summary — most important, shown prominently */}
      {rules.summary && (
        <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm leading-relaxed italic">
          {rules.summary}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <RuleRow label="Giọng điệu" value={rules.tone} />
        <RuleRow label="Độ dài" value={rules.length} />
        <RuleRow label="Cấu trúc bài" value={rules.structure} />
        <RuleRow label="Định dạng" value={rules.formatting} />
        <RuleRow label="Emoji" value={rules.emoji_usage} />
        <RuleRow label="Mở đầu" value={rules.opening_style} />
        <RuleRow label="Kêu gọi hành động" value={rules.cta_style} />
      </div>

      <TagList label="Mẫu câu đặc trưng" items={rules.phrase_patterns} />
      <TagList label="Tránh" items={rules.avoid} />

      {/* Generation instructions — collapsible since it's technical */}
      {rules.generation_instructions && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide select-none">
            <span
              aria-hidden
              className="transition-transform group-open:rotate-90"
            >
              ›
            </span>
            Hướng dẫn cho AI
          </summary>
          <p className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {rules.generation_instructions}
          </p>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function StyleProfileDetailPage({ params }: Props) {
  const { profileId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("content_style_profiles")
    .select(
      "id,name,description,platform,sample_text,style_rules,is_default,created_at,updated_at"
    )
    .eq("id", profileId)
    .eq("user_id", user.id)
    .single() as unknown as { data: ProfileRow | null };

  if (!profile) notFound();

  const platformLabel = profile.platform
    ? (PLATFORM_LABELS[profile.platform] ?? profile.platform)
    : "Tất cả nền tảng";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight leading-snug">
            {profile.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            {profile.is_default && (
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Mặc định
              </span>
            )}
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {platformLabel}
            </span>
          </div>
        </div>
        <Link
          href="/dashboard/style-profiles"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
        >
          ← Danh sách
        </Link>
      </div>

      {/* Timestamps */}
      <p className="text-xs text-muted-foreground">
        Tạo lúc {formatDate(profile.created_at)}
        {profile.updated_at && ` · Cập nhật ${formatDate(profile.updated_at)}`}
      </p>

      {/* Set as default */}
      <SetDefaultButton
        profileId={profile.id}
        isDefault={profile.is_default}
      />

      {/* Style rules */}
      {profile.style_rules ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Phân tích văn phong</CardTitle>
          </CardHeader>
          <CardContent>
            <StyleRulesDisplay rules={profile.style_rules} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Chưa có kết quả phân tích. Tạo lại văn phong để chạy phân tích.
          </CardContent>
        </Card>
      )}

      {/* Sample text — collapsed by default */}
      {profile.sample_text && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm font-medium select-none">
            <span
              aria-hidden
              className="text-muted-foreground transition-transform group-open:rotate-90"
            >
              ›
            </span>
            Xem bài mẫu đã dán
          </summary>
          <div className="mt-2 rounded-lg border border-border bg-muted/20 px-3 py-3">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {profile.sample_text}
            </p>
          </div>
        </details>
      )}

      <Separator />

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chỉnh sửa thông tin</CardTitle>
        </CardHeader>
        <CardContent>
          <EditProfileForm
            profileId={profile.id}
            initialName={profile.name}
            initialDescription={profile.description}
            initialIsDefault={profile.is_default}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Delete */}
      <DeleteProfileButton
        profileId={profile.id}
        profileName={profile.name}
      />
    </div>
  );
}
