"use client";

// ---------------------------------------------------------------------------
// ResetPasswordForm — set a new password after following the recovery link.
// A session is already established by the auth callback at this point.
// On success the action redirects to /sign-in?status=password_updated.
// ---------------------------------------------------------------------------
import { useActionState } from "react";

import { updatePassword, type AuthFormState } from "../actions";
import { authInputClass } from "../auth-styles";
import { Button } from "@/components/ui/button";

const INITIAL: AuthFormState = { error: null };

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    updatePassword,
    INITIAL
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium leading-none">
          Mật khẩu mới
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Ít nhất 8 ký tự"
          className={authInputClass}
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="confirm_password"
          className="text-sm font-medium leading-none"
        >
          Nhập lại mật khẩu mới
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
          className={authInputClass}
          disabled={isPending}
        />
      </div>

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Đang cập nhật…" : "Đặt lại mật khẩu"}
      </Button>
    </form>
  );
}
