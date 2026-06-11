"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

// ---------------------------------------------------------------------------
// Label maps — co-located so they stay in sync with the server page
// ---------------------------------------------------------------------------
export const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  zalo: "Zalo",
  tiktok: "TikTok",
};

export const TYPE_LABELS: Record<string, string> = {
  sales_post: "Bài đăng bán hàng",
  short_caption: "Caption ngắn",
  video_script: "Script video",
  follow_up_message: "Tin nhắn follow-up",
};

const PLATFORM_FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "facebook", label: "Facebook" },
  { value: "zalo", label: "Zalo" },
  { value: "tiktok", label: "TikTok" },
] as const;

// ---------------------------------------------------------------------------
// ContentFilters
// ---------------------------------------------------------------------------
export function ContentFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentPlatform = searchParams.get("platform") ?? "";
  const currentQ = searchParams.get("q") ?? "";

  function navigate(nextParams: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(nextParams)) {
      if (val) {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className={["flex flex-col gap-3", isPending ? "opacity-60" : ""].join(" ")}>
      {/* Search */}
      <input
        type="search"
        defaultValue={currentQ}
        placeholder="Tìm theo tiêu đề bất động sản…"
        onChange={(e) => navigate({ q: e.target.value, platform: currentPlatform })}
        className={[
          "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm",
          "placeholder:text-muted-foreground outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "transition-colors",
        ].join(" ")}
        aria-label="Tìm kiếm theo tiêu đề bất động sản"
      />

      {/* Platform pills */}
      <div role="group" aria-label="Lọc theo nền tảng" className="flex flex-wrap gap-2">
        {PLATFORM_FILTERS.map((f) => {
          const active = f.value === currentPlatform;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => navigate({ platform: f.value, q: currentQ })}
              aria-pressed={active}
              className={[
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
