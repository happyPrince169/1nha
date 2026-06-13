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

const STATUS_FILTERS = [
  { value: "", label: "Mọi trạng thái" },
  { value: "draft", label: "Bản nháp" },
  { value: "posted", label: "Đã đăng" },
  { value: "archived", label: "Lưu trữ" },
] as const;

// ---------------------------------------------------------------------------
// PillGroup — reusable pill filter row
// ---------------------------------------------------------------------------
function PillGroup({
  filters,
  current,
  onSelect,
  ariaLabel,
}: {
  filters: readonly { value: string; label: string }[];
  current: string;
  onSelect: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {filters.map((f) => {
        const active = f.value === current;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onSelect(f.value)}
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
  );
}

// ---------------------------------------------------------------------------
// ContentFilters
// ---------------------------------------------------------------------------
export function ContentFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentPlatform = searchParams.get("platform") ?? "";
  const currentStatus = searchParams.get("status") ?? "";
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
        placeholder="Tìm theo bất động sản hoặc nội dung…"
        onChange={(e) =>
          navigate({
            q: e.target.value,
            platform: currentPlatform,
            status: currentStatus,
          })
        }
        className={[
          "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm",
          "placeholder:text-muted-foreground outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "transition-colors",
        ].join(" ")}
        aria-label="Tìm kiếm"
      />

      {/* Status pills */}
      <PillGroup
        filters={STATUS_FILTERS}
        current={currentStatus}
        ariaLabel="Lọc theo trạng thái"
        onSelect={(v) =>
          navigate({ status: v, platform: currentPlatform, q: currentQ })
        }
      />

      {/* Platform pills */}
      <PillGroup
        filters={PLATFORM_FILTERS}
        current={currentPlatform}
        ariaLabel="Lọc theo nền tảng"
        onSelect={(v) =>
          navigate({ platform: v, status: currentStatus, q: currentQ })
        }
      />
    </div>
  );
}
