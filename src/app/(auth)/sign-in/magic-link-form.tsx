"use client";

// ---------------------------------------------------------------------------
// MagicLinkForm — Client Component
// Handles optimistic UI state while the Server Action is in-flight.
// ---------------------------------------------------------------------------
import { useActionState } from "react";
import { sendMagicLink } from "./actions";
import { Button } from "@/components/ui/button";

type Props = {
  serverError?: string;
};

// We drive the form with useActionState so the submit button can show a
// loading state without any extra client-side fetch boilerplate.
export function MagicLinkForm({ serverError }: Props) {
  const [, formAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      await sendMagicLink(formData);
    },
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Error banner — shown when Supabase returns an error */}
      {serverError && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {decodeErrorMessage(serverError)}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium leading-none"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="ban@example.com"
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isPending}
        />
      </div>

      <Button
        type="submit"
        className="h-11 w-full"
        disabled={isPending}
      >
        {isPending ? "Đang gửi…" : "Gửi magic link"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "Email không hợp lệ. Vui lòng kiểm tra lại.",
  auth_callback_failed: "Liên kết đăng nhập không hợp lệ hoặc đã hết hạn.",
  // Add more Supabase error codes as needed
};

function decodeErrorMessage(raw: string): string {
  return ERROR_MESSAGES[raw] ?? decodeURIComponent(raw);
}
