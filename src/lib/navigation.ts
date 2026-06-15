// ---------------------------------------------------------------------------
// Central navigation config for 1nha dashboard
//
// Single source of truth for nav labels, hrefs, icons, and descriptions.
// Used by BottomNav and any future sidebar/drawer implementations.
// ---------------------------------------------------------------------------

export type NavItem = {
  label: string;
  href: string;
  /** Emoji used as the icon in the bottom nav */
  icon: string;
  /** Short description shown in tooltips or future onboarding hints */
  shortDescription: string;
  /**
   * Pathname prefix used to determine the active state.
   * A nav item is active when the current pathname starts with this prefix,
   * UNLESS the current pathname also matches a more specific item's prefix.
   * The array is ordered from most to least specific so the first match wins.
   */
  activePrefix: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: "Tổng quan",
    href: "/dashboard",
    icon: "🏡",
    shortDescription: "Xem tóm tắt và truy cập nhanh",
    // Exact match only — all other dashboard routes are more specific
    activePrefix: "/dashboard",
  },
  {
    label: "Kho nguồn",
    href: "/dashboard/properties",
    icon: "🗂️",
    shortDescription: "Quản lý toàn bộ căn đang bán",
    activePrefix: "/dashboard/properties",
  },
  {
    label: "Nhập nhanh",
    href: "/dashboard/properties/quick-add",
    icon: "✨",
    shortDescription: "Nhập nguồn hàng mới bằng AI",
    activePrefix: "/dashboard/properties/quick-add",
  },
  {
    label: "Nội dung",
    href: "/dashboard/content",
    icon: "📝",
    shortDescription: "Quản lý content đã tạo và đã đăng",
    activePrefix: "/dashboard/content",
  },
  {
    label: "Văn phong",
    href: "/dashboard/style-profiles",
    icon: "✍️",
    shortDescription: "Lưu phong cách viết riêng của bạn",
    activePrefix: "/dashboard/style-profiles",
  },
] as const;

/**
 * Determine the active nav item for a given pathname.
 *
 * Rules (applied in order of specificity, most specific first):
 * 1. /dashboard/properties/quick-add  → "Nhập nhanh"
 * 2. /dashboard/properties/…          → "Kho nguồn"
 * 3. /dashboard/content/…             → "Nội dung"
 * 4. /dashboard/style-profiles/…      → "Văn phong"
 * 5. /dashboard (exact)               → "Tổng quan"
 *
 * We sort items by prefix length descending so longer (more specific) prefixes
 * are tested first — avoiding /dashboard matching before /dashboard/properties.
 */
export function getActiveNavHref(pathname: string): string {
  const sorted = [...NAV_ITEMS].sort(
    (a, b) => b.activePrefix.length - a.activePrefix.length
  );
  for (const item of sorted) {
    if (pathname === item.activePrefix || pathname.startsWith(item.activePrefix + "/")) {
      return item.href;
    }
  }
  // Fallback: "Tổng quan" is always a reasonable active state
  return "/dashboard";
}
