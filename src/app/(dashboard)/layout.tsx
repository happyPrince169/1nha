import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/30">
      {/*
        Header shows app name + subtitle only.
        Sign-out and account links live in the Tài khoản tab (/dashboard/account).
        This keeps the header clean and the bottom nav the single navigation source.
      */}
      <AppHeader
        title="1nha"
        subtitle="Kho nguồn & trợ lý đăng bài"
        showBeta
      />
      {/*
        Bottom nav is fixed, height ≈ 64px (h-16) + safe-area inset.
        pb-[calc(env(safe-area-inset-bottom)+5rem)] ensures content
        is never hidden behind the nav on any device.
      */}
      <main className="mx-auto w-full max-w-md px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
