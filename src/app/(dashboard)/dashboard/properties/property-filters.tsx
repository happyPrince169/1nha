"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Label maps (shared with server page for display)
// ---------------------------------------------------------------------------
export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "Căn hộ",
  house: "Nhà phố",
  land: "Đất",
  shophouse: "Shophouse",
  villa: "Villa",
  office: "Văn phòng",
  other: "Khác",
};

export const LEGAL_STATUS_LABELS: Record<string, string> = {
  red_book: "Sổ đỏ",
  pink_book: "Sổ hồng",
  sale_contract: "HĐ mua bán",
  hand_written: "Giấy tay",
  other: "Khác",
};

export const SORT_LABELS: Record<string, string> = {
  newest: "Mới nhất",
  price_asc: "Giá tăng dần",
  price_desc: "Giá giảm dần",
  area_asc: "DT tăng dần",
  area_desc: "DT giảm dần",
};

// ---------------------------------------------------------------------------
// Active filter pill — built server-side and passed as a prop
// ---------------------------------------------------------------------------
export type ActiveFilterPill = {
  key: string;   // the URL param key(s) to clear, e.g. "price_min,price_max"
  label: string; // e.g. "5–8 tỷ"
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
const FILTER_INPUT_CLASS = [
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none",
  "placeholder:text-muted-foreground ring-offset-background transition-colors",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "disabled:opacity-50",
].join(" ");

const FILTER_SELECT_CLASS = [
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none",
  "ring-offset-background transition-colors appearance-none",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "disabled:opacity-50",
].join(" ");

const FILTER_LABEL_CLASS = "text-xs font-medium text-muted-foreground";

// ---------------------------------------------------------------------------
// PropertyFilters
// ---------------------------------------------------------------------------
type Props = {
  activeFilters: ActiveFilterPill[];
  /** Base path to preserve archived tab state */
  basePath: string;
};

export function PropertyFilters({ activeFilters, basePath }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Debounce ref for search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Navigate — merges next params into the current URL, clearing empty values
  // ---------------------------------------------------------------------------
  const navigate = useCallback(
    (nextParams: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(nextParams)) {
        if (val.trim()) {
          params.set(key, val.trim());
        } else {
          params.delete(key);
        }
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams]
  );

  // ---------------------------------------------------------------------------
  // Clear one or more keys (used by pills and reset)
  // ---------------------------------------------------------------------------
  function clearKeys(keys: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    for (const k of keys) params.delete(k);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  function resetAllFilters() {
    // Keep only the archived param so the active tab is preserved
    const params = new URLSearchParams();
    const archived = searchParams.get("archived");
    if (archived) params.set("archived", archived);
    startTransition(() => {
      router.replace(`${basePath}?${params.toString()}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Debounced search
  // ---------------------------------------------------------------------------
  function handleSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate({ q: value });
    }, 300);
  }

  // Current values for controlled selects and seeded inputs
  const currentQ = searchParams.get("q") ?? "";
  const currentType = searchParams.get("property_type") ?? "";
  const currentCity = searchParams.get("city") ?? "";
  const currentDistrict = searchParams.get("district") ?? "";
  const currentPriceMin = searchParams.get("price_min") ?? "";
  const currentPriceMax = searchParams.get("price_max") ?? "";
  const currentAreaMin = searchParams.get("area_min") ?? "";
  const currentAreaMax = searchParams.get("area_max") ?? "";
  const currentBedrooms = searchParams.get("bedrooms") ?? "";
  const currentLegal = searchParams.get("legal_status") ?? "";
  const currentSort = searchParams.get("sort") ?? "newest";

  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className={cn("flex flex-col gap-2", isPending && "opacity-60 pointer-events-none")}>
      {/* ── Search bar ─────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <input
          type="search"
          key={currentQ} // re-seed when reset clears it
          defaultValue={currentQ}
          placeholder="Tìm theo tên căn, khu vực, mô tả..."
          onChange={(e) => handleSearch(e.target.value)}
          aria-label="Tìm kiếm bất động sản"
          className={cn(FILTER_INPUT_CLASS, "flex-1")}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="property-filter-panel"
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            open || hasActiveFilters
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          )}
        >
          <span aria-hidden>⚙</span>
          Lọc
          {hasActiveFilters && (
            <span className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground">
              {activeFilters.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Active filter pills ────────────────────────────────────── */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => clearKeys(pill.key.split(","))}
              className={[
                "inline-flex items-center gap-1 rounded-full border border-border",
                "bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground",
                "transition-colors hover:bg-muted/80 outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              ].join(" ")}
              aria-label={`Xoá lọc: ${pill.label}`}
            >
              {pill.label}
              <span aria-hidden className="ml-0.5 opacity-60">
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={resetAllFilters}
            className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Xoá tất cả
          </button>
        </div>
      )}

      {/* ── Collapsible filter panel ───────────────────────────────── */}
      {open && (
        <div
          id="property-filter-panel"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          {/* Sort */}
          <div className="flex flex-col gap-1">
            <label htmlFor="pf-sort" className={FILTER_LABEL_CLASS}>
              Sắp xếp
            </label>
            <select
              id="pf-sort"
              value={currentSort}
              onChange={(e) => navigate({ sort: e.target.value })}
              className={FILTER_SELECT_CLASS}
            >
              {Object.entries(SORT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Loại bất động sản */}
          <div className="flex flex-col gap-1">
            <label htmlFor="pf-type" className={FILTER_LABEL_CLASS}>
              Loại bất động sản
            </label>
            <select
              id="pf-type"
              value={currentType}
              onChange={(e) => navigate({ property_type: e.target.value })}
              className={FILTER_SELECT_CLASS}
            >
              <option value="">Tất cả</option>
              {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Pháp lý */}
          <div className="flex flex-col gap-1">
            <label htmlFor="pf-legal" className={FILTER_LABEL_CLASS}>
              Pháp lý
            </label>
            <select
              id="pf-legal"
              value={currentLegal}
              onChange={(e) => navigate({ legal_status: e.target.value })}
              className={FILTER_SELECT_CLASS}
            >
              <option value="">Tất cả</option>
              {Object.entries(LEGAL_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Thành phố + Quận */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="pf-city" className={FILTER_LABEL_CLASS}>
                Thành phố
              </label>
              <input
                id="pf-city"
                type="text"
                defaultValue={currentCity}
                placeholder="Hà Nội"
                onBlur={(e) => navigate({ city: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    navigate({ city: (e.target as HTMLInputElement).value });
                }}
                className={FILTER_INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="pf-district" className={FILTER_LABEL_CLASS}>
                Quận / Huyện
              </label>
              <input
                id="pf-district"
                type="text"
                defaultValue={currentDistrict}
                placeholder="Hà Đông"
                onBlur={(e) => navigate({ district: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    navigate({
                      district: (e.target as HTMLInputElement).value,
                    });
                }}
                className={FILTER_INPUT_CLASS}
              />
            </div>
          </div>

          {/* Giá */}
          <div className="flex flex-col gap-1">
            <span className={FILTER_LABEL_CLASS}>
              Giá (tỷ)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                step={0.1}
                defaultValue={currentPriceMin}
                placeholder="Từ"
                onBlur={(e) => navigate({ price_min: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    navigate({
                      price_min: (e.target as HTMLInputElement).value,
                    });
                }}
                aria-label="Giá tối thiểu (tỷ)"
                className={FILTER_INPUT_CLASS}
              />
              <input
                type="number"
                min={0}
                step={0.1}
                defaultValue={currentPriceMax}
                placeholder="Đến"
                onBlur={(e) => navigate({ price_max: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    navigate({
                      price_max: (e.target as HTMLInputElement).value,
                    });
                }}
                aria-label="Giá tối đa (tỷ)"
                className={FILTER_INPUT_CLASS}
              />
            </div>
          </div>

          {/* Diện tích */}
          <div className="flex flex-col gap-1">
            <span className={FILTER_LABEL_CLASS}>
              Diện tích (m²)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                step={1}
                defaultValue={currentAreaMin}
                placeholder="Từ"
                onBlur={(e) => navigate({ area_min: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    navigate({
                      area_min: (e.target as HTMLInputElement).value,
                    });
                }}
                aria-label="Diện tích tối thiểu (m²)"
                className={FILTER_INPUT_CLASS}
              />
              <input
                type="number"
                min={0}
                step={1}
                defaultValue={currentAreaMax}
                placeholder="Đến"
                onBlur={(e) => navigate({ area_max: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    navigate({
                      area_max: (e.target as HTMLInputElement).value,
                    });
                }}
                aria-label="Diện tích tối đa (m²)"
                className={FILTER_INPUT_CLASS}
              />
            </div>
          </div>

          {/* Phòng ngủ */}
          <div className="flex flex-col gap-1">
            <label htmlFor="pf-bedrooms" className={FILTER_LABEL_CLASS}>
              Số phòng ngủ (tối thiểu)
            </label>
            <select
              id="pf-bedrooms"
              value={currentBedrooms}
              onChange={(e) => navigate({ bedrooms: e.target.value })}
              className={FILTER_SELECT_CLASS}
            >
              <option value="">Tất cả</option>
              {["1", "2", "3", "4", "5"].map((n) => (
                <option key={n} value={n}>{n} phòng ngủ trở lên</option>
              ))}
            </select>
          </div>

          {/* Reset */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className={[
                "mt-1 h-9 w-full rounded-lg border border-border text-sm font-medium",
                "text-muted-foreground transition-colors hover:bg-muted outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              ].join(" ")}
            >
              Xoá tất cả bộ lọc
            </button>
          )}
        </div>
      )}
    </div>
  );
}
