// ---------------------------------------------------------------------------
// Shared, PURE (isomorphic) price + number parsing for Vietnamese real estate.
//
// One source of truth reused by:
//   • manual create / edit form (price input + edit prefill)
//   • quick-add draft save (via the AI extractor)
//   • the Properties service (validatePropertyInput + list-filter parsing)
//   • the /api/properties create/update routes (through the service)
//
// No DOM, no server-only, no network — safe to import on client AND server.
// The stored price convention is RAW VND; these helpers normalise human input
// to that convention and NEVER mutate stored values (display lives elsewhere).
// ---------------------------------------------------------------------------

/**
 * Normalise a SINGLE locale decimal separator then parseFloat. Used for the
 * small tỷ/triệu captures inside parseVietnamesePrice ("8,5" / "8.65").
 */
export function parseLocaleFloat(s: string): number {
  const hasBoth = s.includes(".") && s.includes(",");
  if (hasBoth) return parseFloat(s.replace(".", "").replace(",", "."));
  return parseFloat(s.replace(",", "."));
}

/**
 * Robust decimal parser: accepts a dot OR a Vietnamese comma decimal and is
 * tolerant of thousands separators. Returns null for NaN/Infinity/empty.
 *   "32.8" → 32.8 · "32,8" → 32.8 · "1.234,5" → 1234.5 · "1,234,567" → 1234567
 */
export function parseLooseNumber(input: string): number | null {
  let s = input.trim();
  if (!s) return null;

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots > 0 && commas > 0) {
    // Both → "." is the thousands separator, "," the decimal.
    s = s.replace(/\./g, "").replace(/,/g, ".");
  } else if (commas > 1) {
    s = s.replace(/,/g, ""); // multiple commas, no dot → thousands
  } else if (commas === 1) {
    s = s.replace(",", "."); // single comma → decimal
  } else if (dots > 1) {
    s = s.replace(/\./g, ""); // multiple dots, no comma → thousands
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// parseVietnamesePrice — Vietnamese price shorthand → integer VND.
//
// Inline edge-case tests:
//   parseVietnamesePrice("8 ty 650")  === 8_650_000_000  // ty + trailing trieu
//   parseVietnamesePrice("5 ty 2")    === 5_200_000_000  // single digit x100 trieu
//   parseVietnamesePrice("3,5 ty")    === 3_500_000_000  // comma decimal
//   parseVietnamesePrice("850tr")     === 850_000_000    // trieu abbreviation
//   parseVietnamesePrice("1.2 ty")    === 1_200_000_000  // dot decimal
//   parseVietnamesePrice("4 tang")    === undefined       // floors, not a price
// ---------------------------------------------------------------------------
export function parseVietnamesePrice(text: string): number | undefined {
  const t = text.trim();

  // Pattern A: "X ty Y" where Y is trailing trieu amount.
  // Single-digit Y ("5 ty 2") treated as x100 trieu = 200 trieu.
  const tyRemainder = t.match(
    /^(\d+(?:[.,]\d+)?)\s*t[ỷy]\s+(\d+(?:[.,]\d+)?)(?:\s*(?:tri[eệễ]u|tr))?$/i
  );
  if (tyRemainder) {
    const billions = parseLocaleFloat(tyRemainder[1]);
    let rem = parseLocaleFloat(tyRemainder[2]);
    if (rem < 10) rem = rem * 100;
    return Math.round(billions * 1_000_000_000 + rem * 1_000_000);
  }

  // Pattern B: "X ty" plain ("3,5 ty" -> 3_500_000_000)
  const tyOnly = t.match(/^(\d+(?:[.,]\d+)?)\s*t[ỷy]$/i);
  if (tyOnly) return Math.round(parseLocaleFloat(tyOnly[1]) * 1_000_000_000);

  // Pattern C: "X trieu" / "Xtr" ("850tr" -> 850_000_000)
  const trieu = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:tri[eệễ]u|tr)$/i);
  if (trieu) return Math.round(parseLocaleFloat(trieu[1]) * 1_000_000);

  return undefined;
}

/** True when the text carries a Vietnamese price unit (tỷ / triệu / tr). */
export function hasVietnamesePriceUnit(text: string): boolean {
  return /t[ỷy]|tri[eệễ]u|tr\b/i.test(text);
}

/**
 * Parse a broker-typed price (Vietnamese expression OR raw VND) into an integer
 * VND amount. Returns null for empty/invalid — never NaN/Infinity.
 *   "8 tỷ 650" / "8.65 tỷ" / "8,65 tỷ" → 8_650_000_000
 *   "850 triệu" / "850tr"              → 850_000_000
 *   "8650000000" / 8650000000          → 8_650_000_000   (bare = raw VND)
 */
export function parsePriceToVnd(
  input: string | number | null | undefined
): number | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") {
    return Number.isFinite(input) && input > 0 ? Math.round(input) : null;
  }
  const t = String(input).trim();
  if (!t) return null;

  const vn = parseVietnamesePrice(t);
  if (vn !== undefined) return vn > 0 ? vn : null;

  // No VN unit → treat as a raw VND number (comma/dot/thousands tolerant).
  const cleaned = t.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  const n = parseLooseNumber(cleaned);
  return n !== null && n > 0 ? Math.round(n) : null;
}

/** Up to `maxDecimals` places, trailing zeros dropped (round-trip helper). */
function trimDecimals(n: number, maxDecimals: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(parseFloat(n.toFixed(maxDecimals)));
}

/**
 * Format a stored raw-VND price into a human-friendly, EDITABLE string for the
 * price input — but ONLY when that string round-trips back to the exact same
 * VND (no data loss). Odd amounts that would lose precision stay as raw VND.
 *   8_650_000_000 → "8.65 tỷ"  ·  850_000_000 → "850 triệu"
 *   8_651_230_000 → "8651230000" (would lose sub-million precision as tỷ)
 */
export function formatPriceForInput(vnd: number): string {
  if (!Number.isFinite(vnd) || vnd <= 0) return "";
  if (vnd >= 1_000_000_000) {
    const s = `${trimDecimals(vnd / 1_000_000_000, 3)} tỷ`;
    if (parsePriceToVnd(s) === vnd) return s;
  }
  if (vnd >= 1_000_000) {
    const s = `${trimDecimals(vnd / 1_000_000, 3)} triệu`;
    if (parsePriceToVnd(s) === vnd) return s;
  }
  return String(vnd);
}
