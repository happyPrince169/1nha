"use client";

// ---------------------------------------------------------------------------
// MagicLinkFallback — optional secondary login. Hidden behind a toggle so
// password login stays the primary method. Kept so users who prefer email
// links (or are mid-migration) still have a way in.
// ---------------------------------------------------------------------------
import { useActionState, useState } from "react";

import { sendMagicLink, type AuthFormState } from "../actions";
import { authInputClass } from "../auth-styles";
import { Button } from "@/components/ui/button";

const INITIAL: AuthFormState = { error: null };

export function MagicLinkFallback() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    sendMagicLink,
    INITIAL
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Đăng nhập bằng link email
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t pt-4">
      <p className="text-xs text-muted-foreground">
        Nhập email để nhận link đăng nhập một lần.
      </p>
      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="ban@example.com"
        className={authInputClass}
        disabled={isPending}
      />
      <Button
        type="submit"
        variant="outline"
        className="h-11 w-full"
        disabled={isPending}
      >
        {isPending ? "Đang gửi…" : "Gửi link đăng nhập"}
      </Button>
    </form>
  );
}
