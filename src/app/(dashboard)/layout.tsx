import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { SignOutButton } from "@/components/sign-out-button";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <AppHeader
        title="1nha"
        showBeta
        rightSlot={
          <div className="flex items-center gap-2">
            <a
              href="mailto:feedback@1nha.app"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Góp ý
            </a>
            <SignOutButton />
          </div>
        }
      />
      <main className="mx-auto w-full max-w-md px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        {children}
      </main>
    </div>
  );
}
