import Link from "next/link";

import { cn } from "@/lib/utils";

type AppHeaderProps = {
  title: string;
  /** Optional one-line subtitle shown below the title */
  subtitle?: string;
  showBeta?: boolean;
  rightSlot?: React.ReactNode;
  className?: string;
};

export function AppHeader({ title, subtitle, showBeta, rightSlot, className }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        "pt-[env(safe-area-inset-top)]",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="flex flex-col gap-0">
            <span className="font-heading text-base font-semibold leading-tight">
              {title}
            </span>
            {subtitle && (
              <span className="text-[10px] text-muted-foreground leading-tight">
                {subtitle}
              </span>
            )}
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
        {rightSlot && (
          <div className="flex items-center gap-2">{rightSlot}</div>
        )}
      </div>
    </header>
  );
}
