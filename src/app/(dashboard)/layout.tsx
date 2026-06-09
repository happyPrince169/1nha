import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { SignOutButton } from "@/components/sign-out-button";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <AppHeader title="BrokerFlow AI" rightSlot={<SignOutButton />} />
      <main className="mx-auto w-full max-w-md px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        {children}
      </main>
    </div>
  );
}
