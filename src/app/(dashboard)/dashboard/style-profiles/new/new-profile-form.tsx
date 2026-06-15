"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import { createStyleProfile, type CreateProfileState } from "../actions";

const PLATFORM_OPTIONS = [
  { value: "", label: "Tất cả nền tảng" },
  { value: "facebook", label: "Facebook" },
  { value: "zalo", label: "Zalo" },
  { value: "tiktok", label: "TikTok" },
  { value: "other", label: "Khác" },
] as const;

const INITIAL_STATE: CreateProfileState = { error: null };

const SELECT_CLASS = [
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none",
  "ring-offset-background transition-colors appearance-none",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "disabled:opacity-50",
].join(" ");

export function NewProfileForm() {
  const [state, formAction, isPending] = useActionState(
    createStyleProfile,
    INITIAL_STATE
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && <FormError>{state.error}</FormError>}

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">
          Tên văn phong <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          name="name"
          placeholder="VD: Phong cách Facebook của tôi"
          maxLength={100}
          required
          disabled={isPending}
        />
      </div>

      {/* Platform */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platform">Nền tảng</Label>
        <select id="platform" name="platform" className={SELECT_CLASS} disabled={isPending}>
          {PLATFORM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Chọn nền tảng các bài mẫu được viết cho để phân tích chính xác hơn.
        </p>
      </div>

      {/* Sample text */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sample_text">
          Bài mẫu <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="sample_text"
          name="sample_text"
          placeholder={
            "Dán 3–10 bài đăng mẫu của bạn vào đây.\n\nMỗi bài cách nhau bằng một dòng trống.\n\nCàng nhiều mẫu, phân tích càng chính xác."
          }
          rows={12}
          maxLength={20000}
          required
          disabled={isPending}
          className="resize-y text-sm leading-relaxed"
        />
        <p className="text-xs text-muted-foreground">
          Tối đa 20.000 ký tự · Nên có ít nhất 3 bài để AI phân tích chính xác.
        </p>
      </div>

      {/* Ownership confirmation */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <input
          id="ownership_confirmed"
          name="ownership_confirmed"
          type="checkbox"
          required
          disabled={isPending}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-foreground"
        />
        <Label
          htmlFor="ownership_confirmed"
          className="cursor-pointer text-sm font-normal leading-relaxed text-muted-foreground"
        >
          Tôi xác nhận các bài mẫu này do tôi sở hữu hoặc tôi có quyền sử
          dụng để 1nha phân tích văn phong cá nhân.
        </Label>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full text-base"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" aria-hidden />
            Đang phân tích văn phong…
          </span>
        ) : (
          "Phân tích và lưu văn phong"
        )}
      </Button>

      {isPending && (
        <p className="text-center text-xs text-muted-foreground">
          AI đang đọc và phân tích các bài mẫu của bạn. Quá trình này mất 5–15 giây.
        </p>
      )}
    </form>
  );
}
