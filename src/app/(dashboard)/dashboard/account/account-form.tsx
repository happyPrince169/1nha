"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import type { BrokerProfile } from "@/types";
import { updateBrokerProfile, type UpdateProfileState } from "./actions";

// ---------------------------------------------------------------------------
// Role options
// ---------------------------------------------------------------------------
const ROLE_OPTIONS = [
  { value: "", label: "— Chọn vai trò —" },
  { value: "independent_broker", label: "Môi giới độc lập" },
  { value: "team_lead", label: "Trưởng nhóm" },
  { value: "agency", label: "Công ty / sàn nhỏ" },
  { value: "other", label: "Khác" },
] as const;

const SELECT_CLASS = [
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none",
  "ring-offset-background transition-colors appearance-none",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "disabled:opacity-50",
].join(" ");

const INITIAL_STATE: UpdateProfileState = { error: null, success: false };

type Props = {
  email: string;
  profile: BrokerProfile | null;
};

// ---------------------------------------------------------------------------
// AccountForm
// ---------------------------------------------------------------------------
export function AccountForm({ email, profile }: Props) {
  const [state, formAction, isPending] = useActionState(
    updateBrokerProfile,
    INITIAL_STATE
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && <FormError>{state.error}</FormError>}

      {state.success && !isPending && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          ✓ Đã lưu thông tin tài khoản
        </p>
      )}

      {/* Email — read-only, from auth */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email-display">Email</Label>
        <Input
          id="email-display"
          value={email}
          readOnly
          disabled
          className="bg-muted/40 text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Email đăng nhập không thể thay đổi ở đây.
        </p>
      </div>

      {/* Display name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display_name">Tên hiển thị</Label>
        <Input
          id="display_name"
          name="display_name"
          key={state.success ? "saved" : "editing"}
          defaultValue={profile?.display_name ?? ""}
          placeholder="VD: Nguyễn Văn A"
          maxLength={100}
          disabled={isPending}
        />
      </div>

      {/* Phone */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Số điện thoại</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          key={state.success ? "saved" : "editing"}
          defaultValue={profile?.phone ?? ""}
          placeholder="VD: 0912 345 678"
          maxLength={20}
          disabled={isPending}
        />
      </div>

      {/* Company */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company_name">Tên công ty / nhóm</Label>
        <Input
          id="company_name"
          name="company_name"
          key={state.success ? "saved" : "editing"}
          defaultValue={profile?.company_name ?? ""}
          placeholder="VD: Sàn BĐS ABC, Nhóm môi giới Hà Nội"
          maxLength={100}
          disabled={isPending}
        />
      </div>

      {/* Role */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Vai trò</Label>
        <select
          id="role"
          name="role"
          key={state.success ? "saved" : "editing"}
          defaultValue={profile?.role ?? ""}
          className={SELECT_CLASS}
          disabled={isPending}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full"
      >
        {isPending ? "Đang lưu…" : "Lưu thông tin"}
      </Button>
    </form>
  );
}
