"use client";

// ---------------------------------------------------------------------------
// SignUpForm — create account with email + password.
// On success shows the "check your email to confirm" message.
// ---------------------------------------------------------------------------
import Link from "next/link";
import { useActionState } from "react";

import { signUpWithPassword, type AuthFormState } from "../actions";
import { authInputClass } from "../auth-styles";
import { Button } from "@/components/ui/button";

const INITIAL: AuthFormState = { error: null };

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(
    signUpWithPassword,
    INITIAL
  );

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="text-4xl" role="img" aria-label="email">
          📬
        </span>
        <p className="text-sm text-muted-foreground">
          Tài khoản đã được tạo. Vui lòng kiểm tra email để xác nhận tài khoản
          trước khi đăng nhập.
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
        <label
          htmlFor="display_name"
          className="text-sm font-medium leading-none"
        >
          Tên hiển thị
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          autoComplete="name"
          placeholder="Nguyễn Văn A"
          className={authInputClass}
          disabled={isPending}
        />
      </div>

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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className="text-sm font-medium leading-none">
          Số điện thoại{" "}
          <span className="font-normal text-muted-foreground">(tuỳ chọn)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="0901234567"
          className={authInputClass}
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium leading-none">
          Mật khẩu
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
          Nhập lại mật khẩu
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
        {isPending ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Đã có tài khoản?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          Đăng nhập
        </Link>
      </p>
    </form>
  );
}
