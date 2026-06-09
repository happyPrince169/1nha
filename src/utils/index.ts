// ---------------------------------------------------------------------------
// Shared utility helpers
// ---------------------------------------------------------------------------

/**
 * Format a VND price into a human-readable Vietnamese string.
 * e.g. 3_500_000_000 → "3,5 tỷ"  |  750_000_000 → "750 triệu"
 */
export function formatVND(amount: number): string {
  if (amount >= 1_000_000_000) {
    const ty = amount / 1_000_000_000;
    return `${ty % 1 === 0 ? ty : ty.toFixed(1)} tỷ`;
  }
  if (amount >= 1_000_000) {
    const trieu = amount / 1_000_000;
    return `${trieu % 1 === 0 ? trieu : trieu.toFixed(0)} triệu`;
  }
  return amount.toLocaleString("vi-VN") + " đ";
}

/**
 * Return the quota-remaining count, clamped to 0.
 */
export function quotaRemaining(used: number, limit: number): number {
  return Math.max(0, limit - used);
}

/**
 * Truncate a string to `maxLength` characters, appending "…".
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}

/**
 * Build a className string from an object map — lightweight alternative
 * to clsx for simple conditional classes inside components.
 */
export function cx(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}
