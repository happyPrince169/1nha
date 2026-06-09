import Link from "next/link";

import { cn } from "@/lib/utils";

type AppHeaderProps = {
  title: string;
  rightSlot?: React.ReactNode;
  className?: string;
};

export function AppHeader({ title, rightSlot, className }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        "pt-[env(safe-area-inset-top)]",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="font-heading text-base font-semibold">
          {title}
        </Link>
        <div className="flex items-center gap-2">{rightSlot}</div>
      </div>
    </header>
  );
}
