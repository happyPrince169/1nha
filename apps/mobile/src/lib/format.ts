// ---------------------------------------------------------------------------
// Vietnamese display formatting for property facts (read-only display helpers).
// Mirrors the web's "tỷ / triệu" price convention without importing server code.
// ---------------------------------------------------------------------------

/** Format raw VND into a compact Vietnamese price string (tỷ / triệu). */
export function formatPrice(vnd: number | null | undefined): string {
  if (vnd === null || vnd === undefined || !Number.isFinite(vnd) || vnd <= 0) {
    return "—";
  }
  if (vnd >= 1_000_000_000) {
    const ty = vnd / 1_000_000_000;
    return `${trimNumber(ty)} tỷ`;
  }
  if (vnd >= 1_000_000) {
    const trieu = vnd / 1_000_000;
    return `${trimNumber(trieu)} triệu`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(vnd)} đ`;
}

/** Format area in m² (decimal-tolerant). */
export function formatArea(area: number | null | undefined): string {
  if (area === null || area === undefined || !Number.isFinite(area) || area <= 0) {
    return "—";
  }
  return `${trimNumber(area)} m²`;
}

/** Drop trailing zeros: 8.50 → "8,5", 8.00 → "8" (Vietnamese comma decimal). */
function trimNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toString().replace(".", ",");
}

/** Generic text fallback for optional fields. */
export function orDash(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "—";
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "Căn hộ",
  house: "Nhà phố",
  land: "Đất",
  shophouse: "Shophouse",
  villa: "Biệt thự",
  office: "Văn phòng",
  other: "Khác",
};

const LEGAL_STATUS_LABELS: Record<string, string> = {
  red_book: "Sổ đỏ",
  pink_book: "Sổ hồng",
  sale_contract: "Hợp đồng mua bán",
  hand_written: "Giấy viết tay",
  other: "Khác",
};

const STATUS_LABELS: Record<string, string> = {
  available: "Đang bán",
  reserved: "Đã cọc",
  sold: "Đã bán",
  archived: "Lưu trữ",
};

export function propertyTypeLabel(value: string | null | undefined): string {
  return value ? PROPERTY_TYPE_LABELS[value] ?? value : "—";
}

export function legalStatusLabel(value: string | null | undefined): string {
  return value ? LEGAL_STATUS_LABELS[value] ?? value : "—";
}

export function statusLabel(value: string | null | undefined): string {
  return value ? STATUS_LABELS[value] ?? value : "—";
}
