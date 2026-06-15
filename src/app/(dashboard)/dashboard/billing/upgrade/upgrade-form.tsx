"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import {
  submitUpgradeInterest,
  type UpgradeInterestState,
} from "./actions";

const PLAN_OPTIONS = [
  { value: "", label: "— Chọn gói —" },
  { value: "pro_personal", label: "Pro cá nhân" },
  { value: "team", label: "Team / Nhóm môi giới" },
  { value: "unsure", label: "Chưa chắc, cần tư vấn" },
] as const;

const SELECT_CLASS = [
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none",
  "ring-offset-background transition-colors appearance-none",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "disabled:opacity-50",
].join(" ");

const INITIAL_STATE: UpgradeInterestState = { error: null };

export function UpgradeInterestForm() {
  const [state, formAction, isPending] = useActionState(
    submitUpgradeInterest,
    INITIAL_STATE
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && <FormError>{state.error}</FormError>}

      {/* Plan selection */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="interested_plan">
          Gói bạn quan tâm <span className="text-destructive">*</span>
        </Label>
        <select
          id="interested_plan"
          name="interested_plan"
          required
          className={SELECT_CLASS}
          disabled={isPending}
          defaultValue=""
        >
          {PLAN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.value === ""}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Phone */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upgrade-phone">Số điện thoại (tuỳ chọn)</Label>
        <Input
          id="upgrade-phone"
          name="phone"
          type="tel"
          placeholder="VD: 0912 345 678"
          maxLength={20}
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          Để 1nha có thể liên hệ trực tiếp khi gói sẵn sàng.
        </p>
      </div>

      {/* Note */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upgrade-note">Ghi chú thêm (tuỳ chọn)</Label>
        <Textarea
          id="upgrade-note"
          name="note"
          rows={4}
          placeholder="Bạn đang có bao nhiêu căn, dùng một mình hay theo nhóm, nhu cầu chính là gì?"
          maxLength={1000}
          disabled={isPending}
          className="resize-y text-sm leading-relaxed"
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full text-base"
      >
        {isPending ? "Đang gửi…" : "Gửi đăng ký quan tâm"}
      </Button>
    </form>
  );
}
