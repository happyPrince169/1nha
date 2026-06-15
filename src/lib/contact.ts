// ---------------------------------------------------------------------------
// Central contact configuration for 1nha
// ---------------------------------------------------------------------------
// Replace the REPLACE_WITH_* placeholders below with the real contact details
// before going to production. Keep this file as the single source of truth so
// the UI never hardcodes contact info.

export type ContactOptionKey = "phone" | "messenger" | "zalo" | "email";

export interface ContactOption {
  /** Short action label, e.g. "Gọi điện" */
  label: string;
  /** Human-readable value shown under the label */
  value: string;
  /** Helper copy describing when to use this channel */
  description: string;
  /** Emoji used as a lightweight icon */
  icon: string;
  /** Destination for the row (tel:/mailto:/https:) */
  href: string;
  /** Whether the link should open in a new tab */
  external: boolean;
}

export const contactOptions: Record<ContactOptionKey, ContactOption> = {
  phone: {
    label: "Gọi điện",
    value: "REPLACE_WITH_PHONE_NUMBER",
    description: "Trao đổi nhanh khi cần hỗ trợ trực tiếp",
    icon: "📞",
    href: "tel:REPLACE_WITH_PHONE_NUMBER",
    external: false,
  },
  messenger: {
    label: "Facebook Messenger",
    value: "m.me/REPLACE_WITH_PAGE_USERNAME",
    description: "Nhắn tin qua fanpage 1nha",
    icon: "💬",
    href: "https://m.me/REPLACE_WITH_PAGE_USERNAME",
    external: true,
  },
  zalo: {
    label: "Zalo",
    value: "REPLACE_WITH_ZALO_PHONE_OR_LINK",
    description: "Phù hợp với môi giới quen dùng Zalo",
    icon: "🟦",
    href: "https://zalo.me/REPLACE_WITH_ZALO_PHONE",
    external: true,
  },
  email: {
    label: "Email",
    value: "REPLACE_WITH_EMAIL",
    description: "Gửi góp ý hoặc vấn đề cần xử lý chi tiết",
    icon: "✉️",
    href: "mailto:REPLACE_WITH_EMAIL?subject=Góp ý cho 1nha",
    external: false,
  },
};

/** Stable display order for the contact section. */
export const contactOptionOrder: ContactOptionKey[] = [
  "phone",
  "messenger",
  "zalo",
  "email",
];
