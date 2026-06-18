// ---------------------------------------------------------------------------
// Vietnamese phone normalization (pure, no I/O — unit-testable)
//
// MVP: Vietnam only (+84), mobile numbers only. Normalizes common broker input
// shapes to E.164. No country selector yet.
//
//   "0936389336"    -> "+84936389336"
//   "84936389336"   -> "+84936389336"
//   "+84936389336"  -> "+84936389336"
//   "0936 389 336"  -> "+84936389336"   (spaces / dots / hyphens stripped)
//   "936389336"     -> "+84936389336"   (bare 9-digit national number)
//
// Returns a discriminated result so callers branch without try/catch.
// ---------------------------------------------------------------------------

export type PhoneNormalizeResult =
  | { ok: true; e164: string }
  | { ok: false; error: string };

const INVALID_MESSAGE =
  "Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam.";
const EMPTY_MESSAGE = "Vui lòng nhập số điện thoại.";

/** Vietnamese mobile national number: 9 digits, leading digit 3/5/7/8/9. */
const VN_MOBILE_NATIONAL = /^[35789]\d{8}$/;

/**
 * Normalize a raw Vietnamese phone string to E.164 (+84XXXXXXXXX).
 * Rejects landlines and anything that is not a valid VN mobile number.
 */
export function normalizeVietnamesePhone(raw: string): PhoneNormalizeResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: EMPTY_MESSAGE };
  }

  // Strip spaces, dots, hyphens, and parentheses; keep a single leading '+'.
  const hadPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");

  let national: string | null = null;

  if ((hadPlus || digits.length === 11) && digits.startsWith("84") && digits.length === 11) {
    // +84 / 84 followed by the 9-digit national number.
    national = digits.slice(2);
  } else if (digits.length === 10 && digits.startsWith("0")) {
    // Local format with trunk prefix 0.
    national = digits.slice(1);
  } else if (digits.length === 9) {
    // Bare national number.
    national = digits;
  }

  if (!national || !VN_MOBILE_NATIONAL.test(national)) {
    return { ok: false, error: INVALID_MESSAGE };
  }

  return { ok: true, e164: `+84${national}` };
}

/**
 * Mask an E.164 VN number for display: "+84936389336" -> "+8493•••••336".
 * Falls back to the input unchanged if it does not look like our E.164 shape.
 */
export function maskVietnamesePhone(e164: string): string {
  const m = e164.match(/^\+84(\d{9})$/);
  if (!m) return e164;
  const n = m[1];
  return `+84${n.slice(0, 2)}•••••${n.slice(-3)}`;
}
