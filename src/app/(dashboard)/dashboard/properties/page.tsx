import type { Metadata } from "next";
import Link from "next/link";

import {
  getPropertyImageSignedUrls,
  R2_PENDING_PATH,
} from "@/lib/storage/property-media";
import { tryGetRequestContext } from "@/lib/workspace/request-context";
import {
  listProperties,
  parsePropertyListParams,
  type PropertyListFilters,
  type PropertyListItem,
} from "@/lib/services/properties";
import {
  listAssignableMembers,
  memberDisplayLabel,
} from "@/lib/services/workspace";
import type { AssigneeOption } from "@/lib/workspace/assignee";
import { toApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { formatVND } from "@/utils";
import { buttonVariants } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";
import {
  PropertyFilters,
  PROPERTY_TYPE_LABELS,
  LEGAL_STATUS_LABELS,
  SORT_LABELS,
  type ActiveFilterPill,
} from "./property-filters";

export const metadata: Metadata = { title: "Kho nguồn" };

// Param parsing, the PAGE_SIZE guardrail, and the list query now live in the
// shared properties service (src/lib/services/properties.ts) so the web page
// and the /api/properties route stay in lockstep.

/**
 * Build a property-list href that preserves every active filter/search/sort
 * param and sets the target page. Keeps URLs shareable/bookmarkable. Page 1
 * omits the `page` param for clean canonical URLs.
 */
function buildPageHref(sp: RawParams, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "page") continue;
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/dashboard/properties?${qs}` : "/dashboard/properties";
}

// ---------------------------------------------------------------------------
// Build active filter pills for display
// ---------------------------------------------------------------------------
const SCOPE_PILL_LABELS: Record<string, string> = {
  created_by_me: "Nguồn tôi tạo",
  assigned_to_me: "Tôi phụ trách",
  unassigned: "Chưa phân công",
};

function buildActivePills(
  f: PropertyListFilters,
  assigneeLabel: (uid: string) => string
): ActiveFilterPill[] {
  const pills: ActiveFilterPill[] = [];

  if (f.q)
    pills.push({ key: "q", label: `"‘${f.q}‘"` });

  // Team assignment (Phase 4B). An explicit assignee filter supersedes scope.
  if (f.assigned_to)
    pills.push({ key: "assigned_to", label: `Phụ trách: ${assigneeLabel(f.assigned_to)}` });
  else if (f.scope && f.scope !== "all")
    pills.push({ key: "scope", label: SCOPE_PILL_LABELS[f.scope] ?? f.scope });
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
  page?: string;
  scope?: string;
  assigned_to?: string;
};

type Props = {
  searchParams: Promise<RawParams>;
};

export default async function PropertiesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = parsePropertyListParams(sp);
  const { filters, showArchived, page } = params;

  // Authenticated, workspace-scoped context (proxy already gates /dashboard).
  const ctx = await tryGetRequestContext();
  if (!ctx) return null;

  // Phase 4B: active workspace members → label map for assignment display +
  // the filter member select. A failure here must not break the list.
  let memberOptions: AssigneeOption[] = [];
  try {
    memberOptions = (await listAssignableMembers(ctx)).map((m) => ({
      userId: m.userId,
      label: memberDisplayLabel(m),
      role: m.role,
    }));
  } catch {
    memberOptions = [];
  }
  const memberLabelMap = new Map(memberOptions.map((m) => [m.userId, m.label]));
  const assigneeLabel = (uid: string | null): string => {
    if (!uid) return "Chưa phân công";
    if (uid === ctx.userId) return "Bạn";
    return memberLabelMap.get(uid) ?? "Không rõ";
  };

  const activePills = buildActivePills(filters, (uid) => assigneeLabel(uid));
  const hasActiveFilters = activePills.length > 0;

  // Property list comes from the shared service: organization-scoped, paginated
  // (PAGE_SIZE + 1 → hasNextPage), filters/search/sort preserved.
  let properties: PropertyListItem[] = [];
  let hasNextPage = false;
  let errorMsg: string | null = null;
  try {
    const result = await listProperties(ctx, params);
    properties = result.items;
    hasNextPage = result.hasNextPage;
  } catch (err) {
    errorMsg = toApiError(err).message;
  }
  const hasPrevPage = page > 1;

  // ---------------------------------------------------------------------------
  // Thumbnail pipeline — single batch, no N+1
  // ---------------------------------------------------------------------------
  const thumbnailMap = new Map<string, string>();

  if (properties && properties.length > 0) {
    const propertyIds = properties.map((p) => p.id);

    // Phase 3D: scoped by the already org-scoped propertyIds (from
    // listProperties) — RLS property_images_member_all backstops org access.
    // No user_id filter so team members see cover thumbnails for org properties.
    const { data: imageRows } = await ctx.supabase
      .from("property_images")
      .select(
        "id, property_id, storage_provider, storage_path, original_key, thumbnail_key, preview_key"
      )
      .in("property_id", propertyIds)
      .neq("storage_path", "__pending__")
      .neq("storage_path", R2_PENDING_PATH)
      .order("is_cover", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (imageRows && imageRows.length > 0) {
      // First image per property (cover/sort/created order already applied).
      type ImageRow = (typeof imageRows)[number];
      const firstByProperty = new Map<string, ImageRow>();
      for (const row of imageRows) {
        if (!firstByProperty.has(row.property_id)) {
          firstByProperty.set(row.property_id, row);
        }
      }

      // Batched per provider; prefer thumbnail keys for list thumbnails.
      const urlById = await getPropertyImageSignedUrls(
        Array.from(firstByProperty.values()),
        ctx.supabase,
        { variant: "thumbnail" }
      );

      for (const [propId, row] of firstByProperty) {
        const url = urlById.get(row.id);
        if (url) thumbnailMap.set(propId, url);
      }
    }
  }

  // basePath preserves the archived tab state for the reset-all action
  const basePath = "/dashboard/properties";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Kho nguồn</h1>
          <p className="text-sm text-muted-foreground leading-snug">
            Quản lý toàn bộ căn đang bán, đã lưu trữ và nguồn cần chăm lại.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <LinkButton href="/dashboard/properties/quick-add" size="sm">
            ✨ Nhập nhanh
          </LinkButton>
          <LinkButton
            href="/dashboard/properties/new"
            variant="outline"
            size="sm"
          >
            Thủ công
          </LinkButton>
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
      <PropertyFilters
        activeFilters={activePills}
        basePath={basePath}
        members={memberOptions}
      />

      {/* Query error */}
      {errorMsg && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMsg}
        </p>
      )}

      {/* Empty states — only on the first page (page 2+ empty is handled below) */}
      {!errorMsg && page === 1 && (!properties || properties.length === 0) && (
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
            <LinkButton
              href={showArchived ? `${basePath}?archived=1` : basePath}
              variant="outline"
              className="w-full"
            >
              Xóa bộ lọc
            </LinkButton>
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
              <p className="font-semibold">Bạn chưa có căn nào trong kho nguồn</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Nhập căn đầu tiên để 1nha giúp bạn tạo content, lưu ảnh và chuẩn bị bài đăng.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              <LinkButton href="/dashboard/properties/quick-add" className="w-full">
                ✨ Nhập nhanh nguồn mới
              </LinkButton>
              <LinkButton
                href="/dashboard/properties/new"
                variant="outline"
                className="w-full"
              >
                Thêm căn thủ công
              </LinkButton>
            </div>
          </div>
        )
      )}

      {/* Result count when filters are active */}
      {!errorMsg && properties && properties.length > 0 && hasActiveFilters && (
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
            assignedLabel={assigneeLabel(p.assigned_to)}
          />
        ))}
      </div>

      {/* Page 2+ with no rows: the user paged past the end */}
      {!errorMsg && page > 1 && properties && properties.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Không còn căn nào ở trang này.
        </p>
      )}

      {/* Pagination controls */}
      {!errorMsg && (hasPrevPage || hasNextPage) && (
        <nav
          aria-label="Phân trang"
          className="flex items-center justify-between gap-2 pt-1"
        >
          {hasPrevPage ? (
            <Link
              href={buildPageHref(sp, page - 1)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              ← Trang trước
            </Link>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-40")}>
              ← Trang trước
            </span>
          )}

          <span className="text-xs text-muted-foreground">Trang {page}</span>

          {hasNextPage ? (
            <Link
              href={buildPageHref(sp, page + 1)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Trang sau →
            </Link>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-40")}>
              Trang sau →
            </span>
          )}
        </nav>
      )}
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
  assignedLabel: string;
};

function PropertyCard({
  id,
  title,
  district,
  price,
  area,
  status,
  thumbnailUrl,
  assignedLabel,
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
              <p className="truncate text-xs text-muted-foreground">
                Phụ trách: <span className="font-medium text-foreground">{assignedLabel}</span>
              </p>
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

