import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Văn phong của tôi" };

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  zalo: "Zalo",
  tiktok: "TikTok",
  other: "Khác",
};

// ---------------------------------------------------------------------------
// Local row type — Supabase type-gen doesn't know this table yet
// ---------------------------------------------------------------------------
type ProfileRow = {
  id: string;
  name: string;
  description: string | null;
  platform: string | null;
  is_default: boolean;
  created_at: string;
  style_rules: { summary?: string } | null;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function StyleProfilesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profiles, error: profilesError } = (await supabase
    .from("content_style_profiles")
    .select("id,name,description,platform,is_default,created_at,style_rules")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })) as unknown as {
    data: ProfileRow[] | null;
    error: { message: string } | null;
  };

  const error = profilesError;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Văn phong của tôi
          </h1>
          <p className="text-sm text-muted-foreground leading-snug">
            Dán một số bài mẫu để 1nha học cách hành văn và trình bày của bạn.
          </p>
        </div>
        <Link
          href="/dashboard/style-profiles/new"
          className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
        >
          + Tạo mới
        </Link>
      </div>

      {/* Query error */}
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Không thể tải danh sách văn phong.
        </p>
      )}

      {/* Empty state */}
      {!error && (!profiles || profiles.length === 0) && (
        <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-3xl"
            aria-hidden
          >
            ✍️
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="font-semibold">Bạn chưa có văn phong riêng</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tạo văn phong từ các bài đăng mẫu để bài AI giống cách bạn
              thường viết hơn.
            </p>
          </div>
          <Link
            href="/dashboard/style-profiles/new"
            className={cn(buttonVariants(), "w-full")}
          >
            Tạo văn phong mới
          </Link>
        </div>
      )}

      {/* Profile list */}
      {profiles && profiles.length > 0 && (
        <div className="flex flex-col gap-3">
          {profiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/dashboard/style-profiles/${profile.id}`}
              className="block"
            >
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader className="gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">
                      {profile.name}
                    </CardTitle>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {profile.is_default && (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          Mặc định
                        </span>
                      )}
                      {profile.platform && (
                        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {PLATFORM_LABELS[profile.platform] ?? profile.platform}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* AI summary preview */}
                  {profile.style_rules?.summary && (
                    <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                      {profile.style_rules.summary}
                    </p>
                  )}
                </CardHeader>

                {profile.description && (
                  <CardContent>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {profile.description}
                    </p>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
