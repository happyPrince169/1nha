"use client";

// ---------------------------------------------------------------------------
// SignInForm — email + password login (primary method).
// ---------------------------------------------------------------------------
import Link from "next/link";
import { useActionState } from "react";

import { signInWithPassword, type AuthFormState } from "../actions";
import { authInputClass } from "../auth-styles";
import { Button } from "@/components/ui/button";

const INITIAL: AuthFormState = { error: null };

export function SignInForm() {
  const [state, formAction, isPending] = useActionState(
    signInWithPassword,
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
        <div className="flex items-center justify-between">
          <label
            htmlFor="password"
            className="text-sm font-medium leading-none"
          >
            Mật khẩu
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Quên mật khẩu?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className={authInputClass}
          disabled={isPending}
        />
      </div>

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          Tạo tài khoản mới
        </Link>
      </p>
    </form>
  );
}
