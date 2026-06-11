import Link from "next/link";

import { cn } from "@/lib/utils";

type AppHeaderProps = {
  title: string;
  showBeta?: boolean;
  rightSlot?: React.ReactNode;
  className?: string;
};

export function AppHeader({ title, showBeta, rightSlot, className }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        "pt-[env(safe-area-inset-top)]",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="font-heading text-base font-semibold">
            {title}
          </Link>
          {showBeta && (
            <span
              className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
              aria-label="Beta"
            >
              Beta
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">{rightSlot}</div>
      </div>
    </header>
  );
}
