"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, getActiveNavHref } from "@/lib/navigation";

// ---------------------------------------------------------------------------
// BottomNav
//
// Fixed bottom navigation bar — 5 items, mobile-first.
// Active item is derived from the current pathname via getActiveNavHref so the
// logic lives in one place (navigation.ts) and is testable independently.
// ---------------------------------------------------------------------------
export function BottomNav() {
  const pathname = usePathname();
  const activeHref = getActiveNavHref(pathname);

  return (
    <nav
      aria-label="Điều hướng chính"
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40",
        "border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        // Safe area inset for iOS home indicator
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <div className="mx-auto flex w-full max-w-md items-end justify-around px-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-center",
                "transition-colors outline-none",
                "focus-visible:bg-muted rounded-lg",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {/* Icon */}
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg text-lg leading-none transition-colors",
                  isActive ? "bg-foreground/10" : ""
                )}
                aria-hidden
              >
                {item.icon}
              </span>

              {/* Label */}
              <span
                className={cn(
                  "text-[10px] leading-none font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>

              {/* Active indicator dot */}
              <span
                className={cn(
                  "h-1 w-1 rounded-full transition-colors",
                  isActive ? "bg-foreground" : "bg-transparent"
                )}
                aria-hidden
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
