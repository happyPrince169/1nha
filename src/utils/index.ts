// ---------------------------------------------------------------------------
// Shared utility helpers
// ---------------------------------------------------------------------------

/**
 * Format a number with up to `maxDecimals` decimal places, dropping trailing
 * zeros. Display-only — it never mutates the stored value.
 * e.g. trimDecimals(8.65, 2) → "8.65" · trimDecimals(12, 2) → "12"
 */
function trimDecimals(n: number, maxDecimals: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(parseFloat(n.toFixed(maxDecimals)));
}

/**
 * Format a VND price into a human-readable Vietnamese string. Preserves decimal
 * precision so brokers see real listing prices (display only; the stored value
 * is unchanged). Shows up to 5 decimals in the expressed unit, trailing zeros
 * dropped — matching the 5-decimal save rounding:
 *   8_650_000_000 → "8.65 tỷ"  |  8_123_460_000 → "8.12346 tỷ"
 *   850_123_460   → "850.12346 triệu"  |  750_000_000 → "750 triệu"
 */
export function formatVND(amount: number): string {
  if (!Number.isFinite(amount)) return "0 đ";
  if (amount >= 1_000_000_000) {
    return `${trimDecimals(amount / 1_000_000_000, 5)} tỷ`;
  }
  if (amount >= 1_000_000) {
    return `${trimDecimals(amount / 1_000_000, 5)} triệu`;
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
