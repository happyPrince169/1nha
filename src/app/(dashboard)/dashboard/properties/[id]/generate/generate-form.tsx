"use client";

import { useActionState } from "react";

import { type GenerateContentState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";

// ---------------------------------------------------------------------------
// Option configs — labels co-located with the form so they stay in sync
// ---------------------------------------------------------------------------
const PLATFORMS = [
  { value: "facebook", label: "Facebook" },
  { value: "zalo", label: "Zalo" },
  { value: "tiktok", label: "TikTok" },
] as const;

const TONES = [
  { value: "professional", label: "Chuyên nghiệp" },
  { value: "urgent", label: "Khẩn cấp" },
  { value: "luxury", label: "Cao cấp" },
  { value: "family", label: "Gia đình" },
  { value: "investor", label: "Đầu tư" },
] as const;

const CONTENT_TYPES = [
  { value: "sales_post", label: "Bài đăng bán hàng" },
  { value: "short_caption", label: "Caption ngắn" },
  { value: "video_script", label: "Script video" },
  { value: "follow_up_message", label: "Tin nhắn follow-up" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type Props = {
  /** Server-bound action — id already baked in, never passed through the form */
  action: (
    prevState: GenerateContentState,
    formData: FormData
  ) => Promise<GenerateContentState>;
};

const initialState: GenerateContentState = { error: null };

export function GenerateForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <FormError>{state.error}</FormError>}

      {/* Platform */}
      <Card>
        <CardHeader>
          <CardTitle>Nền tảng</CardTitle>
        </CardHeader>
        <CardContent>
          <OptionGroup
            name="platform"
            options={PLATFORMS}
            defaultValue="facebook"
            disabled={isPending}
          />
        </CardContent>
      </Card>

      {/* Tone */}
      <Card>
        <CardHeader>
          <CardTitle>Giọng văn</CardTitle>
        </CardHeader>
        <CardContent>
          <OptionGroup
            name="tone"
            options={TONES}
            defaultValue="professional"
            disabled={isPending}
          />
        </CardContent>
      </Card>

      {/* Content type */}
      <Card>
        <CardHeader>
          <CardTitle>Loại content</CardTitle>
        </CardHeader>
        <CardContent>
          <OptionGroup
            name="content_type"
            options={CONTENT_TYPES}
            defaultValue="sales_post"
            disabled={isPending}
          />
        </CardContent>
      </Card>

      <Button
        type="submit"
        className="h-12 w-full text-base"
        disabled={isPending}
      >
        {isPending ? "Đang tạo content…" : "✨ Tạo content AI"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Reusable pill-style radio group
// ---------------------------------------------------------------------------
type Option = { value: string; label: string };

function OptionGroup({
  name,
  options,
  defaultValue,
  disabled,
}: {
  name: string;
  options: readonly Option[];
  defaultValue: string;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="relative cursor-pointer"
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            defaultChecked={opt.value === defaultValue}
            disabled={disabled}
            className="peer sr-only"
          />
          <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-disabled:opacity-50">
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  );
}
