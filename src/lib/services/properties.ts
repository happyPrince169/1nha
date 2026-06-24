// ---------------------------------------------------------------------------
// Properties service layer  (SERVER ONLY)
//
// Single source of property business logic, shared by:
//   • web Server Actions / Server Components
//   • /api/properties route handlers (future Expo mobile app)
//
// Organization-aware (Phase 2A/3A): reads/writes are scoped by the caller's
// current organization_id, with RLS as the backstop. For a solo broker (one
// personal workspace) behaviour is identical to the previous user_id scoping.
// Inserts still set user_id (legacy) plus organization_id / created_by /
// assigned_to. Validation throws ApiError (VALIDATION_ERROR / NOT_FOUND) with
// the existing Vietnamese messages.
// ---------------------------------------------------------------------------
import "server-only";

import type { RequestContext } from "@/lib/workspace/request-context";
import {
  validationError,
  forbidden,
  notFound,
  internalError,
} from "@/lib/api/errors";
import type { LegalStatus, PropertyType, PropertyStatus } from "@/types";
import {
  parseLooseNumber,
  parsePriceToVnd,
  parseVietnamesePrice,
  hasVietnamesePriceUnit,
  roundToDecimalPlaces,
} from "@/lib/format/price";

/** Decimal places kept on save for decimal-capable property fields. */
const FIELD_DECIMALS = 5;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Scale guardrail (Phase 1): one page = 50 rows. */
export const PAGE_SIZE = 50;

const PROPERTY_TYPES: PropertyType[] = [
  "apartment", "house", "land", "shophouse", "villa", "office", "other",
];
const LEGAL_STATUSES: LegalStatus[] = [
  "red_book", "pink_book", "sale_contract", "hand_written", "other",
];
const VALID_PROPERTY_TYPES = new Set<string>(PROPERTY_TYPES);
const VALID_LEGAL_STATUSES = new Set<string>(LEGAL_STATUSES);
const VALID_SORTS = new Set([
  "newest", "price_asc", "price_desc", "area_asc", "area_desc",
]);
/** Team assignment scopes (Phase 4B). */
const VALID_SCOPES = new Set([
  "all", "created_by_me", "assigned_to_me", "unassigned",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns returned for list rows (kept lightweight — no heavy text fields).
 *  assigned_to is included so the list can show "Phụ trách: …" (Phase 4B). */
const LIST_COLUMNS = "id,title,district,price,area,status,created_at,assigned_to";
/** Full column set for the detail view / API single resource. */
const DETAIL_COLUMNS =
  "id,user_id,organization_id,created_by,assigned_to,title,property_type,status," +
  "city,district,ward,street,price,area,bedrooms,bathrooms,house_direction," +
  "frontage,alley_width,legal_status,description,strengths,weaknesses," +
  "owner_note,planning_note,created_at,updated_at";

// ---------------------------------------------------------------------------
// List params + parsing
// ---------------------------------------------------------------------------
export type PropertyListFilters = {
  q: string | null;
  property_type: string | null;
  city: string | null;
  district: string | null;
  price_min: number | null; // in tỷ (billions)
  price_max: number | null;
  area_min: number | null; // m²
  area_max: number | null;
  bedrooms: number | null;
  legal_status: string | null;
  sort: string;
  /** Team assignment scope: all | created_by_me | assigned_to_me | unassigned. */
  scope: string;
  /** Explicit assignee user_id filter (takes precedence over scope). */
  assigned_to: string | null;
};

export type PropertyListParams = {
  filters: PropertyListFilters;
  showArchived: boolean;
  page: number;
};

export type PropertyListItem = {
  id: string;
  title: string;
  district: string | null;
  price: number | null;
  area: number | null;
  status: string | null;
  created_at: string;
  assigned_to: string | null;
};

export type PropertyListResult = {
  items: PropertyListItem[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
};

type RawListParams = Record<string, string | undefined>;

function parsePositiveNumber(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Decimal-capable positive filter value (comma/dot), rounded to 5 decimals,
 *  e.g. area "32,8123456789" → 32.81235. Invalid → null (filter ignored). */
function parsePositiveDecimal(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const n = parseLooseNumber(raw.trim());
  return n !== null && n > 0 ? roundToDecimalPlaces(n, FIELD_DECIMALS) : null;
}

/**
 * Price filter value, expressed in tỷ to match the existing "Giá (tỷ)" filter
 * UI + query math (price_min * 1e9). Accepts a Vietnamese price expression
 * (8 tỷ / 8.65 tỷ / 850 triệu → converted to tỷ, with the unit already rounded
 * to 5 decimals) OR a bare number (already tỷ, rounded to 5). Invalid → null
 * (filter ignored; never a NaN query).
 */
function parsePriceFilterTy(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const t = raw.trim();
  if (hasVietnamesePriceUnit(t)) {
    const vnd = parseVietnamesePrice(t); // unit already rounded to 5 decimals
    return vnd !== undefined && vnd > 0 ? vnd / 1_000_000_000 : null;
  }
  const n = parseLooseNumber(t);
  return n !== null && n > 0 ? roundToDecimalPlaces(n, FIELD_DECIMALS) : null;
}

function parseString(raw: string | undefined): string | null {
  const s = raw?.trim();
  return s && s.length > 0 ? s : null;
}

/** Accept a well-formed UUID only; anything else → null (filter ignored, and
 *  never passed to a uuid column query where it would raise a DB error). */
function parseUuid(raw: string | undefined): string | null {
  const s = raw?.trim();
  return s && UUID_RE.test(s) ? s : null;
}

/** Parse + sanitise URL/query params into typed list params. Shared by the web
 *  page and the API route so filter/sort/pagination semantics never drift. */
export function parsePropertyListParams(sp: RawListParams): PropertyListParams {
  const rawSort = sp.sort?.trim() ?? "";
  return {
    showArchived: sp.archived === "1",
    page: Math.max(1, Math.floor(parsePositiveNumber(sp.page) ?? 1)),
    filters: {
      q: parseString(sp.q),
      property_type: VALID_PROPERTY_TYPES.has(sp.property_type ?? "")
        ? (sp.property_type ?? null)
        : null,
      city: parseString(sp.city),
      district: parseString(sp.district),
      price_min: parsePriceFilterTy(sp.price_min),
      price_max: parsePriceFilterTy(sp.price_max),
      area_min: parsePositiveDecimal(sp.area_min),
      area_max: parsePositiveDecimal(sp.area_max),
      bedrooms: parsePositiveNumber(sp.bedrooms),
      legal_status: VALID_LEGAL_STATUSES.has(sp.legal_status ?? "")
        ? (sp.legal_status ?? null)
        : null,
      sort: VALID_SORTS.has(rawSort) ? rawSort : "newest",
      scope: VALID_SCOPES.has(sp.scope ?? "") ? (sp.scope as string) : "all",
      assigned_to: parseUuid(sp.assigned_to),
    },
  };
}

// ---------------------------------------------------------------------------
// listProperties — organization-scoped, paginated (PAGE_SIZE + 1 → hasNextPage)
// ---------------------------------------------------------------------------
export async function listProperties(
  ctx: RequestContext,
  params: PropertyListParams
): Promise<PropertyListResult> {
  const { filters, showArchived, page } = params;

  let query = ctx.supabase
    .from("properties")
    .select(LIST_COLUMNS)
    .eq("organization_id", ctx.organizationId);

  if (showArchived) {
    query = query.eq("status", "archived");
  } else {
    query = query.neq("status", "archived");
  }

  // Team assignment filters (Phase 4B). An explicit assignee id (already
  // org-scoped + UUID-validated) takes precedence over the coarse scope. All
  // clauses stay within organization_id, so cross-org ids simply match nothing.
  if (filters.assigned_to) {
    query = query.eq("assigned_to", filters.assigned_to);
  } else {
    switch (filters.scope) {
      case "created_by_me": query = query.eq("created_by", ctx.userId); break;
      case "assigned_to_me": query = query.eq("assigned_to", ctx.userId); break;
      case "unassigned": query = query.is("assigned_to", null); break;
      default: break; // "all" → no assignment filter
    }
  }

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

  if (filters.property_type) query = query.eq("property_type", filters.property_type);
  if (filters.legal_status) query = query.eq("legal_status", filters.legal_status);
  if (filters.city) query = query.ilike("city", `%${filters.city}%`);
  if (filters.district) query = query.ilike("district", `%${filters.district}%`);

  // Price params are in tỷ (billion VND); DB stores raw VND.
  if (filters.price_min !== null) query = query.gte("price", filters.price_min * 1_000_000_000);
  if (filters.price_max !== null) query = query.lte("price", filters.price_max * 1_000_000_000);
  if (filters.area_min !== null) query = query.gte("area", filters.area_min);
  if (filters.area_max !== null) query = query.lte("area", filters.area_max);
  if (filters.bedrooms !== null) query = query.gte("bedrooms", filters.bedrooms);

  switch (filters.sort) {
    case "price_asc": query = query.order("price", { ascending: true }); break;
    case "price_desc": query = query.order("price", { ascending: false }); break;
    case "area_asc": query = query.order("area", { ascending: true }); break;
    case "area_desc": query = query.order("area", { ascending: false }); break;
    default: query = query.order("created_at", { ascending: false });
  }

  // Fetch PAGE_SIZE + 1 to detect a next page without an expensive COUNT.
  const from = (page - 1) * PAGE_SIZE;
  const { data, error } = await query.range(from, from + PAGE_SIZE);

  if (error) throw internalError(error.message);

  const rows = (data ?? []) as PropertyListItem[];
  const hasNextPage = rows.length > PAGE_SIZE;
  return {
    items: hasNextPage ? rows.slice(0, PAGE_SIZE) : rows,
    page,
    pageSize: PAGE_SIZE,
    hasNextPage,
  };
}

// ---------------------------------------------------------------------------
// getPropertyById — organization-scoped; throws NOT_FOUND across orgs
// ---------------------------------------------------------------------------
/** Full property row as returned by the detail/single-resource read. */
export type PropertyRecord = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  title: string;
  property_type: PropertyType | null;
  status: PropertyStatus | null;
  city: string | null;
  district: string | null;
  ward: string | null;
  street: string | null;
  price: number | null;
  area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  house_direction: string | null;
  frontage: number | null;
  alley_width: number | null;
  legal_status: LegalStatus | null;
  description: string | null;
  strengths: string | null;
  weaknesses: string | null;
  owner_note: string | null;
  planning_note: string | null;
  created_at: string;
  updated_at: string | null;
};

export async function getPropertyById(
  ctx: RequestContext,
  propertyId: string
): Promise<PropertyRecord> {
  const { data, error } = await ctx.supabase
    .from("properties")
    .select(DETAIL_COLUMNS)
    .eq("id", propertyId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!data) throw notFound("Không tìm thấy bất động sản.");
  return data as unknown as PropertyRecord;
}

// ---------------------------------------------------------------------------
// Write input + validation
// ---------------------------------------------------------------------------
export type PropertyWriteInput = {
  title?: string | null;
  property_type?: string | null;
  city?: string | null;
  district?: string | null;
  ward?: string | null;
  street?: string | null;
  price?: number | string | null;
  area?: number | string | null;
  bedrooms?: number | string | null;
  bathrooms?: number | string | null;
  house_direction?: string | null;
  frontage?: number | string | null;
  alley_width?: number | string | null;
  legal_status?: string | null;
  description?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  owner_note?: string | null;
  planning_note?: string | null;
  /** Phase 4B assignee. Omit (undefined) → keep default/unchanged; "" / null →
   *  unassigned; a user_id → assign (validated as an active org member). */
  assigned_to?: string | null;
};

type ValidatedProperty = {
  title: string;
  property_type: PropertyType;
  city: string;
  district: string;
  ward: string | null;
  street: string | null;
  price: number;
  area: number;
  bedrooms: number | null;
  bathrooms: number | null;
  house_direction: string | null;
  frontage: number | null;
  alley_width: number | null;
  legal_status: LegalStatus | null;
  description: string | null;
  strengths: string | null;
  weaknesses: string | null;
  owner_note: string | null;
  planning_note: string | null;
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Decimal-safe numeric parser for property fields. Accepts JS numbers and
 * strings with either a dot OR a Vietnamese comma decimal separator, and is
 * tolerant of thousands separators:
 *   "32.8" → 32.8 · "32,8" → 32.8 · "1.234,5" → 1234.5 · "1,234,567" → 1234567
 * Rejects NaN / Infinity / non-finite → null (never trusts client formatting).
 * Does NOT round — precision capping happens per-field in validatePropertyInput.
 */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  // Shared decimal-safe parse (dot OR Vietnamese comma + thousands tolerant).
  return parseLooseNumber(v);
}

/** Decimal-capable dimension: > 0 → rounded to `places` (shared rule); else null. */
function decimalField(v: unknown, places: number): number | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  return roundToDecimalPlaces(n, places);
}

/** Integer count (bedrooms/bathrooms): >= 0 → rounded to a whole number. */
function integerCount(v: unknown): number | null {
  const n = num(v);
  if (n === null || n < 0) return null;
  return Math.round(n);
}

/** Validate + normalise a write payload. Throws VALIDATION_ERROR (Vietnamese). */
export function validatePropertyInput(input: PropertyWriteInput): ValidatedProperty {
  const title = str(input.title);
  const district = str(input.district);
  const propertyTypeRaw = str(input.property_type);
  const property_type =
    propertyTypeRaw && VALID_PROPERTY_TYPES.has(propertyTypeRaw)
      ? (propertyTypeRaw as PropertyType)
      : null;
  // price accepts Vietnamese expressions (8 tỷ 650, 850 triệu, 8,123456789 tỷ)
  // AND raw VND; the shared parser rounds the unit to 5 decimals, then stores
  // integer VND.
  const price = parsePriceToVnd(input.price ?? null);
  // area rounded to 5 decimals on save (e.g. 32,8123456789 → 32.81235).
  const area = decimalField(input.area, FIELD_DECIMALS);

  if (!title) throw validationError("Vui lòng nhập tiêu đề.");
  if (!property_type) throw validationError("Vui lòng chọn loại bất động sản.");
  if (!district) throw validationError("Vui lòng nhập quận/huyện.");
  if (price === null || price <= 0) throw validationError("Vui lòng nhập giá (VND) hợp lệ.");
  if (area === null || area <= 0) throw validationError("Vui lòng nhập diện tích (m²) hợp lệ.");

  const legalStatusRaw = str(input.legal_status);
  const legal_status =
    legalStatusRaw && VALID_LEGAL_STATUSES.has(legalStatusRaw)
      ? (legalStatusRaw as LegalStatus)
      : null;

  return {
    title,
    property_type,
    city: str(input.city) ?? "Hà Nội",
    district,
    ward: str(input.ward),
    street: str(input.street),
    price,
    area,
    bedrooms: integerCount(input.bedrooms),
    bathrooms: integerCount(input.bathrooms),
    house_direction: str(input.house_direction),
    frontage: decimalField(input.frontage, FIELD_DECIMALS),
    alley_width: decimalField(input.alley_width, FIELD_DECIMALS),
    legal_status,
    description: str(input.description),
    strengths: str(input.strengths),
    weaknesses: str(input.weaknesses),
    owner_note: str(input.owner_note),
    planning_note: str(input.planning_note),
  };
}

// ---------------------------------------------------------------------------
// Assignment resolution (Phase 4B)
//
// Permission model (MVP): Owner/Admin may assign to any active member or leave
// unassigned. A plain Member may only assign to themselves or keep the existing
// assignee unchanged — never reassign to someone else or unassign. The UI also
// enforces this, but the service is the real boundary (covers the API too).
// ---------------------------------------------------------------------------
async function isActiveMember(
  ctx: RequestContext,
  userId: string
): Promise<boolean> {
  if (!UUID_RE.test(userId)) return false;
  const { data, error } = await ctx.supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", ctx.organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw internalError(error.message);
  return !!data;
}

/**
 * Validate + authorise a requested assignee against the caller's role and the
 * property's current assignee. Returns the value to persist (a user_id or null).
 * `raw`: "" / null → unassign; a user_id → assign. Throws VALIDATION_ERROR for a
 * non-member, FORBIDDEN when a member oversteps the MVP rule.
 */
async function resolveAssignee(
  ctx: RequestContext,
  raw: string | null,
  current: string | null
): Promise<string | null> {
  const canManage = ctx.role === "owner" || ctx.role === "admin";
  const value = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

  if (value === null) {
    if (canManage || current === null) return null;
    throw forbidden("Chỉ chủ sở hữu hoặc quản trị viên mới có thể bỏ phân công.");
  }

  // Assigning to self is the common path — the authenticated caller already
  // resolved this workspace, so they are an active member (skip the DB check).
  if (value === ctx.userId) return value;

  if (!(await isActiveMember(ctx, value))) {
    throw validationError("Người phụ trách không thuộc nhóm làm việc này.");
  }
  // A plain member may keep an existing (other-person) assignee but not set a
  // new one; managers may assign to any active member.
  if (canManage || value === current) return value;
  throw forbidden("Bạn chỉ có thể nhận phụ trách nguồn cho chính mình.");
}

// ---------------------------------------------------------------------------
// createProperty — sets user_id + organization_id + created_by + assigned_to
// ---------------------------------------------------------------------------
export async function createProperty(
  ctx: RequestContext,
  input: PropertyWriteInput
): Promise<{ id: string }> {
  const v = validatePropertyInput(input);

  // Default the assignee to the creator when omitted; otherwise validate the
  // requested value (current assignee is null for a brand-new property).
  const assigned_to =
    input.assigned_to === undefined
      ? ctx.userId
      : await resolveAssignee(ctx, input.assigned_to, null);

  const insertRow = {
    user_id: ctx.userId, // legacy ownership (kept)
    organization_id: ctx.organizationId,
    created_by: ctx.userId,
    assigned_to,
    status: "available" as PropertyStatus,
    ...v,
  };

  const { data, error } = await ctx.supabase
    .from("properties")
    .insert(insertRow)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw internalError(error?.message ?? "Không thể tạo bất động sản.");
  }
  return { id: data.id as string };
}

// ---------------------------------------------------------------------------
// updateProperty — organization-scoped; NOT_FOUND prevents cross-org writes
// ---------------------------------------------------------------------------
export async function updateProperty(
  ctx: RequestContext,
  propertyId: string,
  input: PropertyWriteInput
): Promise<void> {
  const v = validatePropertyInput(input);

  // Resolve the assignee only when the caller supplied the field. This needs
  // the current assignee (so a Member may keep an existing assignment) and also
  // gives an org-scoped existence check before the update runs.
  const patch: ValidatedProperty & { assigned_to?: string | null } = { ...v };
  if (input.assigned_to !== undefined) {
    const { data: cur, error: curErr } = await ctx.supabase
      .from("properties")
      .select("assigned_to")
      .eq("id", propertyId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (curErr) throw internalError(curErr.message);
    if (!cur) throw notFound("Không tìm thấy bất động sản.");
    patch.assigned_to = await resolveAssignee(
      ctx,
      input.assigned_to,
      (cur as { assigned_to: string | null }).assigned_to
    );
  }

  const { data, error } = await ctx.supabase
    .from("properties")
    .update(patch)
    .eq("id", propertyId)
    .eq("organization_id", ctx.organizationId)
    .select("id");

  if (error) throw internalError(error.message);
  if (!data || data.length === 0) throw notFound("Không tìm thấy bất động sản.");
}

// ---------------------------------------------------------------------------
// archiveProperty — sets status = 'archived' (never deletes the row)
// ---------------------------------------------------------------------------
export async function archiveProperty(
  ctx: RequestContext,
  propertyId: string
): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("properties")
    .update({ status: "archived" })
    .eq("id", propertyId)
    .eq("organization_id", ctx.organizationId)
    .select("id");

  if (error) throw internalError(error.message);
  if (!data || data.length === 0) throw notFound("Không tìm thấy bất động sản.");
}
