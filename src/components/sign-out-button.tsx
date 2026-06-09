"use client";

// ---------------------------------------------------------------------------
// SignOutButton — Client Component
// Calls the signOut Server Action on click; shows a loading indicator
// while the redirect is in-flight so the user gets immediate feedback.
// ---------------------------------------------------------------------------
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/sign-in/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
    });
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
