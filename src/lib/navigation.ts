// ---------------------------------------------------------------------------
// Central navigation config for 1nha dashboard
//
// Single source of truth for the five bottom-nav tabs, active-state
// resolution, and secondary account/settings links.
// ---------------------------------------------------------------------------
import type { LucideIcon } from "lucide-react";
import { Home, Building2, Zap, FileText, User } from "lucide-react";

// ---------------------------------------------------------------------------
// Bottom nav item type
// ---------------------------------------------------------------------------
export type BottomNavItem = {
  /** Vietnamese display label */
  label: string;
  /** Route this tab navigates to */
  href: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /**
   * Whether this tab is the primary centre action.
   * Gets an accent circle/pill treatment in the nav.
   */
  isPrimary?: boolean;
  /**
   * All pathname prefixes that activate this tab.
   * Evaluated longest-first so more specific routes always win.
   */
  activePrefixes: readonly string[];
};

// ---------------------------------------------------------------------------
// The five bottom nav tabs — exactly five, ordered left → right
// ---------------------------------------------------------------------------
export const dashboardBottomNavItems: readonly BottomNavItem[] = [
  {
    label: "Tổng quan",
    href: "/dashboard",
    icon: Home,
    // /dashboard exact only — every other dashboard route is more specific
    activePrefixes: ["/dashboard"],
  },
  {
    label: "Kho nguồn",
    href: "/dashboard/properties",
    icon: Building2,
    // All /dashboard/properties/** except quick-add
    activePrefixes: ["/dashboard/properties"],
  },
  {
    label: "Nhập nhanh",
    href: "/dashboard/properties/quick-add",
    icon: Zap,
    isPrimary: true,
    activePrefixes: ["/dashboard/properties/quick-add"],
  },
  {
    label: "Nội dung",
    href: "/dashboard/content",
    icon: FileText,
    // Văn phong lives inside Nội dung, not its own tab
    activePrefixes: ["/dashboard/content", "/dashboard/style-profiles"],
  },
  {
    label: "Tài khoản",
    href: "/dashboard/account",
    icon: User,
    // Gói sử dụng lives inside Tài khoản, not its own tab
    activePrefixes: ["/dashboard/account", "/dashboard/billing"],
  },
] as const;

// ---------------------------------------------------------------------------
// Active-state resolver
//
// Returns the href of the tab that should be highlighted for a given pathname.
// Pairs are sorted by prefix length descending — longest (most specific) wins.
// /dashboard is exact-match only so it never beats /dashboard/properties etc.
// ---------------------------------------------------------------------------
export function getActiveTabHref(pathname: string): string {
  type Pair = { prefix: string; tabHref: string };
  const pairs: Pair[] = [];

  for (const item of dashboardBottomNavItems) {
    for (const prefix of item.activePrefixes) {
      pairs.push({ prefix, tabHref: item.href });
    }
  }
  pairs.sort((a, b) => b.prefix.length - a.prefix.length);

  for (const { prefix, tabHref } of pairs) {
    if (prefix === "/dashboard") {
      if (pathname === "/dashboard") return tabHref;
    } else if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return tabHref;
    }
  }
  return "/dashboard";
}

// ---------------------------------------------------------------------------
// Legacy aliases — keeps existing import sites compiling without changes
// ---------------------------------------------------------------------------

/** @deprecated Use dashboardBottomNavItems */
export const NAV_ITEMS = dashboardBottomNavItems;
/** @deprecated Use getActiveTabHref */
export const getActiveNavHref = getActiveTabHref;
