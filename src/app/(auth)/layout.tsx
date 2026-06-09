import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto flex w-full max-w-md flex-col px-4 pt-10 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        {children}
      </main>
    </div>
  );
}
