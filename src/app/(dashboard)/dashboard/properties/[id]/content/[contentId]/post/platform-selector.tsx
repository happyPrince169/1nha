"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Platform options
// ---------------------------------------------------------------------------
export type PostPlatform =
  | "facebook_profile"
  | "facebook_group"
  | "zalo_profile"
  | "zalo_group"
  | "tiktok"
  | "other";

export const PLATFORM_OPTIONS: { value: PostPlatform; label: string; icon: string }[] = [
  { value: "facebook_profile", label: "Facebook cá nhân", icon: "👤" },
  { value: "facebook_group",   label: "Facebook group",   icon: "👥" },
  { value: "zalo_profile",     label: "Zalo cá nhân",     icon: "💬" },
  { value: "zalo_group",       label: "Zalo nhóm",        icon: "💬" },
  { value: "tiktok",           label: "TikTok caption",   icon: "🎵" },
  { value: "other",            label: "Khác",             icon: "📌" },
];

// ---------------------------------------------------------------------------
// PlatformSelector
// ---------------------------------------------------------------------------
type Props = {
  /** The AI-generated platform hint from the content row (may be null) */
  suggestedPlatform?: string | null;
};

export function PlatformSelector({ suggestedPlatform }: Props) {
  // Pre-select based on AI platform hint if it maps to an option
  const defaultValue = (() => {
    if (!suggestedPlatform) return "facebook_profile" as PostPlatform;
    if (suggestedPlatform === "facebook") return "facebook_profile" as PostPlatform;
    if (suggestedPlatform === "zalo") return "zalo_profile" as PostPlatform;
    if (suggestedPlatform === "tiktok") return "tiktok" as PostPlatform;
    return "facebook_profile" as PostPlatform;
  })();

  const [selected, setSelected] = useState<PostPlatform>(defaultValue);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        Chọn nơi bạn sẽ đăng bài
      </p>
      <div
        role="radiogroup"
        aria-label="Nền tảng đăng bài"
        className="grid grid-cols-2 gap-2"
      >
        {PLATFORM_OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(opt.value)}
              className={[
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm",
                "transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                isSelected
                  ? "border-foreground bg-foreground text-background font-medium"
                  : "border-border bg-background text-foreground hover:bg-muted/50",
              ].join(" ")}
            >
              <span aria-hidden className="shrink-0 text-base leading-none">
                {opt.icon}
              </span>
              <span className="leading-snug">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
