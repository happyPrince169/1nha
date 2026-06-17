"use client";

// ---------------------------------------------------------------------------
// SignOutButton — Client Component
//
// Two display modes:
//   variant="icon"    (default) — compact icon-only button for the header
//   variant="outline" — full-width labelled button for the account page
// ---------------------------------------------------------------------------
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

type Props = {
  /** "icon" renders a compact icon-only button; "outline" renders a full labelled button */
  variant?: "icon" | "outline";
};

export function SignOutButton({ variant = "icon" }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
    });
  }

  if (variant === "outline") {
    return (
      <Button
        variant="outline"
        className="w-full gap-2 text-destructive hover:text-destructive hover:border-destructive/50"
        onClick={handleSignOut}
        disabled={isPending}
      >
        <LogOut className="size-4" aria-hidden />
        {isPending ? "Đang đăng xuất…" : "Đăng xuất"}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleSignOut}
      disabled={isPending}
      aria-label="Đăng xuất"
      title="Đăng xuất"
    >
      <LogOut className="size-4" />
    </Button>
  );
}
