"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { dashboardBottomNavItems, getActiveTabHref } from "@/lib/navigation";

// ---------------------------------------------------------------------------
// BottomNav
//
// Fixed 5-tab bottom navigation bar, mobile-first.
//
// Active state is resolved by getActiveTabHref which handles:
//   /dashboard/style-profiles  → Nội dung tab active
//   /dashboard/billing          → Tài khoản tab active
//   /dashboard/properties/**    → Kho nguồn tab active
//   /dashboard/properties/quick-add → Nhập nhanh tab active
//
// Centre tab ("Nhập nhanh") gets an elevated accent-circle treatment.
// ---------------------------------------------------------------------------
export function BottomNav() {
  const pathname = usePathname();
  const activeHref = getActiveTabHref(pathname);

  return (
    <nav
      aria-label="Điều hướng chính"
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40",
        "border-t border-border bg-background/95 backdrop-blur",
        "supports-[backdrop-filter]:bg-background/85",
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-md items-center justify-around px-2">
        {dashboardBottomNavItems.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;

          if (item.isPrimary) {
            // ── Centre "Nhập nhanh" tab — elevated accent treatment ────────
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
                )}
              >
                {/* Accent circle — always visible, brightens when active */}
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full",
                    "shadow-sm transition-all",
                    isActive
                      ? "bg-foreground text-background scale-105"
                      : "bg-foreground/10 text-foreground hover:bg-foreground/20"
                  )}
                  aria-hidden
                >
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </span>
                <span
                  className={cn(
                    "text-[10px] font-semibold leading-none",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          }

          // ── Regular tab ────────────────────────────────────────────────────
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-1 outline-none",
                "rounded-xl transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {/* Icon with subtle background when active */}
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  isActive ? "bg-foreground/8" : ""
                )}
                aria-hidden
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
              </span>

              {/* Label */}
              <span className="text-[10px] font-medium leading-none">
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
