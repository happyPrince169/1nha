import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatVND } from "@/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";
import {
  PropertyFilters,
  PROPERTY_TYPE_LABELS,
  LEGAL_STATUS_LABELS,
  SORT_LABELS,
  type ActiveFilterPill,
} from "./property-filters";

export const metadata: Metadata = { title: "Bất động sản" };

const BUCKET = "property-images";
const SIGNED_URL_TTL = 3600;

// ---------------------------------------------------------------------------
// Allowed value sets — used to sanitise URL params before using in queries
// ---------------------------------------------------------------------------
const VALID_PROPERTY_TYPES = new Set([
  "apartment", "house", "land", "shophouse", "villa", "office", "other",
]);
const VALID_LEGAL_STATUSES = new Set([
  "red_book", "pink_book", "sale_contract", "hand_written", "other",
]);
const VALID_SORTS = new Set([
  "newest", "price_asc", "price_desc", "area_asc", "area_desc",
]);

// ---------------------------------------------------------------------------
// Param parsing helpers
// ---------------------------------------------------------------------------

/** Returns a positive number or null. Rejects NaN, negative, zero. */
function parsePositiveNumber(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Returns a trimmed non-empty string or null. */
function parseString(raw: string | undefined): string | null {
  const s = raw?.trim();
  return s && s.length > 0 ? s : null;
}

// ---------------------------------------------------------------------------
// Parsed filter shape
// ---------------------------------------------------------------------------
type Filters = {
  q: string | null;
  property_type: string | null;
  city: string | null;
  district: string | null;
  price_min: number | null; // in tỷ (billions)
  price_max: number | null;
  area_min: number | null;  // in m²
  area_max: number | null;
  bedrooms: number | null;
  legal_status: string | null;
  sort: string;
};

function parseFilters(sp: Record<string, string | undefined>): Filters {
  const rawSort = sp.sort?.trim() ?? "";
  return {
    q:             parseString(sp.q),
    property_type: VALID_PROPERTY_TYPES.has(sp.property_type ?? "") ? (sp.property_type ?? null) : null,
    city:          parseString(sp.city),
    district:      parseString(sp.district),
    price_min:     parsePositiveNumber(sp.price_min),
    price_max:     parsePositiveNumber(sp.price_max),
    area_min:      parsePositiveNumber(sp.area_min),
    area_max:      parsePositiveNumber(sp.area_max),
    bedrooms:      parsePositiveNumber(sp.bedrooms),
    legal_status:  VALID_LEGAL_STATUSES.has(sp.legal_status ?? "") ? (sp.legal_status ?? null) : null,
    sort:          VALID_SORTS.has(rawSort) ? rawSort : "newest",
  };
}

// ---------------------------------------------------------------------------
// Build active filter pills for display
// ---------------------------------------------------------------------------
function buildActivePills(f: Filters): ActiveFilterPill[] {
  const pills: ActiveFilterPill[] = [];

  if (f.q)
    pills.push({ key: "q", label: `"‘${f.q}‘"` });
  if (f.property_type)
    pills.push({ key: "property_type", label: PROPERTY_TYPE_LABELS[f.property_type] ?? f.property_type });
  if (f.legal_status)
    pills.push({ key: "legal_status", label: LEGAL_STATUS_LABELS[f.legal_status] ?? f.legal_status });
  if (f.city)
    pills.push({ key: "city", label: f.city });
  if (f.district)
    pills.push({ key: "district", label: f.district });

  // Price range
  if (f.price_min !== null || f.price_max !== null) {
    const lo = f.price_min !== null ? `${f.price_min} tỷ` : null;
    const hi = f.price_max !== null ? `${f.price_max} tỷ` : null;
    const label = lo && hi ? `${lo}–${hi}` : lo ? `≥ ${lo}` : `≤ ${hi!}`;
    pills.push({ key: "price_min,price_max", label });
  }

  // Area range
  if (f.area_min !== null || f.area_max !== null) {
    const lo = f.area_min !== null ? `${f.area_min} m²` : null;
    const hi = f.area_max !== null ? `${f.area_max} m²` : null;
    const label = lo && hi ? `${lo}–${hi}` : lo ? `≥ ${lo}` : `≤ ${hi!}`;
    pills.push({ key: "area_min,area_max", label });
  }

  if (f.bedrooms !== null)
    pills.push({ key: "bedrooms", label: `${f.bedrooms} PN+` });

  if (f.sort !== "newest")
    pills.push({ key: "sort", label: SORT_LABELS[f.sort] ?? f.sort });

  return pills;
}

// ---------------------------------------------------------------------------
// searchParams shape (all keys optional strings)
// ---------------------------------------------------------------------------
type RawParams = {
  archived?: string;
  q?: string;
  property_type?: string;
  city?: string;
  district?: string;
  price_min?: string;
  price_max?: string;
  area_min?: string;
  area_max?: string;
  bedrooms?: string;
  legal_status?: string;
  sort?: string;
};

type Props = {
  searchParams: Promise<RawParams>;
};

export default async function PropertiesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const filters = parseFilters(sp);
  const activePills = buildActivePills(filters);
  const hasActiveFilters = activePills.length > 0;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // ---------------------------------------------------------------------------
  // Build Supabase query with all active filters
  // ---------------------------------------------------------------------------
  let query = supabase
    .from("properties")
    .select("id,title,district,price,area,status,created_at")
    .eq("user_id", user.id);

  // Archived tab
  if (showArchived) {
    query = query.eq("status", "archived");
  } else {
    query = query.neq("status", "archived");
  }

  // Free-text: ilike across multiple columns via .or()
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    query = query.or(
      [
        `title.ilike.${pattern}`,
        `district.ilike.${pattern}`,
        `ward.ilike.${pattern}`,
        `street.ilike.${pattern}`,
        `description.ilike.${pattern}`,
        `strengths.ilike.${pattern}`,
      ].join(",")
    );
  }

  if (filters.property_type)
    query = query.eq("property_type", filters.property_type);

  if (filters.legal_status)
    query = query.eq("legal_status", filters.legal_status);

  // City: case-insensitive substring match (brokers type inconsistently)
  if (filters.city)
    query = query.ilike("city", `%${filters.city}%`);

  if (filters.district)
    query = query.ilike("district", `%${filters.district}%`);

  // Price: params are in tỷ (billion VND), DB stores raw VND
  if (filters.price_min !== null)
    query = query.gte("price", filters.price_min * 1_000_000_000);
  if (filters.price_max !== null)
    query = query.lte("price", filters.price_max * 1_000_000_000);

  // Area in m² (DB stores m² directly)
  if (filters.area_min !== null)
    query = query.gte("area", filters.area_min);
  if (filters.area_max !== null)
    query = query.lte("area", filters.area_max);

  // Bedrooms: “minimum N bedrooms”
  if (filters.bedrooms !== null)
    query = query.gte("bedrooms", filters.bedrooms);

  // Sort
  switch (filters.sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "area_asc":
      query = query.order("area", { ascending: true });
      break;
    case "area_desc":
      query = query.order("area", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data: properties, error } = await query;

  // ---------------------------------------------------------------------------
  // Thumbnail pipeline — single batch, no N+1
  // ---------------------------------------------------------------------------
  const thumbnailMap = new Map<string, string>();

  if (properties && properties.length > 0) {
    const propertyIds = properties.map((p) => p.id);

    const { data: imageRows } = await supabase
      .from("property_images")
      .select("property_id, storage_path")
      .eq("user_id", user.id)
      .in("property_id", propertyIds)
      .neq("storage_path", "__pending__")
      .order("is_cover", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (imageRows && imageRows.length > 0) {
      const firstImagePerProperty = new Map<string, string>();
      for (const row of imageRows) {
        if (!firstImagePerProperty.has(row.property_id)) {
          firstImagePerProperty.set(row.property_id, row.storage_path);
        }
      }

      const paths = Array.from(firstImagePerProperty.values());
      const { data: signedData } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL);

      const urlByPath = new Map<string, string>();
      for (const item of signedData ?? []) {
        if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }

      for (const [propId, storagePath] of firstImagePerProperty) {
        const url = urlByPath.get(storagePath);
        if (url) thumbnailMap.set(propId, url);
      }
    }
  }

  // basePath preserves the archived tab state for the reset-all action
  const basePath = "/dashboard/properties";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Bất động sản</h1>
        <div className="flex gap-2">
          <Link
            href="/dashboard/properties/quick-add"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            ✨ Nhập nhanh
          </Link>
          <Link
            href="/dashboard/properties/new"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Thủ công
          </Link>
        </div>
      </div>

      {/* Archived tabs */}
      <div className="flex gap-2 text-sm">
        <Link
          href="/dashboard/properties"
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            !showArchived
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Đang hoạt động
        </Link>
        <Link
          href="/dashboard/properties?archived=1"
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            showArchived
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Lưu trữ
        </Link>
      </div>

      {/* Filters */}
      <PropertyFilters activeFilters={activePills} basePath={basePath} />

      {/* Query error */}
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}

      {/* Empty states */}
      {!error && (!properties || properties.length === 0) && (
        hasActiveFilters ? (
          // Filtered empty state
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-2xl"
              aria-hidden
            >
              🔍
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-semibold">Không tìm thấy căn phù hợp</p>
              <p className="text-sm text-muted-foreground">
                Thử xóa bớt bộ lọc hoặc nhập từ khóa khác.
              </p>
            </div>
            <Link
              href={showArchived ? `${basePath}?archived=1` : basePath}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Xóa bộ lọc
            </Link>
          </div>
        ) : showArchived ? (
          <Card>
            <CardHeader>
              <CardTitle>Không có căn nào được lưu trữ</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Các bất động sản được lưu trữ sẽ xuất hiện ở đây.
            </CardContent>
          </Card>
        ) : (
          // Zero properties empty state
          <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-3xl"
              aria-hidden
            >
              🏠
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-semibold">Chưa có căn nào</p>
              <p className="text-sm text-muted-foreground">
                Thêm căn đầu tiên để bắt đầu lưu nguồn hàng và tạo content.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              <Link
                href="/dashboard/properties/quick-add"
                className={cn(buttonVariants(), "w-full")}
              >
                ✨ Nhập nhanh bằng AI
              </Link>
              <Link
                href="/dashboard/properties/new"
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Thêm thủ công
              </Link>
            </div>
          </div>
        )
      )}

      {/* Result count when filters are active */}
      {!error && properties && properties.length > 0 && hasActiveFilters && (
        <p className="text-xs text-muted-foreground">
          {properties.length} căn phù hợp
        </p>
      )}

      {/* Property list */}
      <div className="flex flex-col gap-3">
        {properties?.map((p) => (
          <PropertyCard
            key={p.id}
            id={p.id}
            title={p.title}
            district={p.district}
            price={p.price}
            area={p.area}
            status={p.status}
            thumbnailUrl={thumbnailMap.get(p.id) ?? null}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PropertyCard
// ---------------------------------------------------------------------------
type PropertyCardProps = {
  id: string;
  title: string;
  district: string | null;
  price: number | null;
  area: number | null;
  status: string | null;
  thumbnailUrl: string | null;
};

function PropertyCard({
  id,
  title,
  district,
  price,
  area,
  status,
  thumbnailUrl,
}: PropertyCardProps) {
  return (
    <Link href={`/dashboard/properties/${id}`} className="block">
      <Card className="transition-colors hover:bg-muted/40">
        <div className="flex items-stretch gap-0">
          {/* Thumbnail — fixed 88×88 square, flush left */}
          <div className="relative m-3 mr-0 h-[88px] w-[88px] shrink-0 overflow-hidden rounded-lg bg-muted">
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailUrl}
                alt={title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground/50"
                aria-hidden
              >
                <span className="text-xl leading-none">🏠</span>
                <span className="text-[10px] font-medium">Chưa có ảnh</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-sm font-medium leading-snug">
                {title}
              </p>
              <StatusBadge status={status} />
            </div>

            <div className="mt-2 flex flex-col gap-0.5">
              {district && (
                <p className="truncate text-xs text-muted-foreground">
                  {district}
                </p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                <span>
                  <span className="text-muted-foreground">Giá: </span>
                  <span className="font-medium">
                    {formatVND(Number(price ?? 0))}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">DT: </span>
                  <span className="font-medium">{area ?? 0} m²</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

