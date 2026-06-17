"use client";

// ---------------------------------------------------------------------------
// ForgotPasswordForm — request a password-reset email.
// Existing magic-link-only users use this to set their first password.
// ---------------------------------------------------------------------------
import Link from "next/link";
import { useActionState } from "react";

import { sendPasswordReset, type AuthFormState } from "../actions";
import { authInputClass } from "../auth-styles";
import { Button } from "@/components/ui/button";

const INITIAL: AuthFormState = { error: null };

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    sendPasswordReset,
    INITIAL
  );

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="text-4xl" role="img" aria-label="email">
          📬
        </span>
        <p className="text-sm text-muted-foreground">
          Nếu email tồn tại trong hệ thống, 1nha sẽ gửi link đặt lại mật khẩu.
        </p>
        <Link
          href="/sign-in"
          className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
        >
          Quay lại đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium leading-none">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="ban@example.com"
          className={authInputClass}
          disabled={isPending}
        />
      </div>

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Đang gửi…" : "Gửi link đặt lại mật khẩu"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/sign-in"
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          Quay lại đăng nhập
        </Link>
      </p>
    </form>
  );
}
