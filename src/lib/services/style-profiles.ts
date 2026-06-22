// ---------------------------------------------------------------------------
// Style Profiles service layer  (SERVER ONLY)
//
// Single source of content-style-profile ("Văn phong") business logic, shared
// by:
//   • web Server Actions / Server Components
//   • /api/style-profiles route handlers (future Expo mobile app)
//
// Organization-aware (Phase 2A/3A): reads/writes are scoped by the caller's
// current organization_id, with RLS (`content_style_profiles_member_all`) as
// the backstop. For a solo broker (one personal workspace) behaviour is
// identical to the previous user_id scoping. Inserts set user_id (legacy, kept
// for the existing RLS own-policies) plus organization_id / created_by.
//
// `style_rules` is produced by the AI analyzer (analyzeContentStyle) and stored
// as JSONB — it is NOT user-editable, so no client JSON is trusted. Validation
// throws ApiError (VALIDATION_ERROR / NOT_FOUND / INTERNAL_ERROR) with the
// existing Vietnamese messages, consistent with the Properties / Images
// services.
// ---------------------------------------------------------------------------
import "server-only";

import type { RequestContext } from "@/lib/workspace/request-context";
import { validationError, notFound, internalError } from "@/lib/api/errors";
import { trackEvent } from "@/lib/usage";
import { analyzeContentStyle } from "@/lib/ai/analyze-content-style";
import type { ContentStyleRules } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VALID_PLATFORMS = new Set(["facebook", "zalo", "tiktok", "other"]);
export const MAX_SAMPLE_CHARS = 20_000;
export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 2_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** List/summary columns — omits the heavy raw sample_text. */
const SUMMARY_COLUMNS =
  "id, name, description, platform, is_default, style_rules, created_at, updated_at";
/** Single-resource columns — adds the raw sample text. */
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, sample_text`;

// ---------------------------------------------------------------------------
// Internal DB row shapes (Supabase type-gen predates these columns)
// ---------------------------------------------------------------------------
type SummaryDbRow = {
  id: string;
  name: string;
  description: string | null;
  platform: string | null;
  is_default: boolean;
  style_rules: ContentStyleRules | null;
  created_at: string;
  updated_at: string | null;
};

type DetailDbRow = SummaryDbRow & { sample_text: string | null };

// ---------------------------------------------------------------------------
// Public output shapes
//
// Deliberately omit user_id / organization_id / created_by — clients never need
// the internal ownership columns. No cross-org identifiers cross the wire.
// ---------------------------------------------------------------------------
export type StyleProfileSummary = {
  id: string;
  name: string;
  description: string | null;
  platform: string | null;
  is_default: boolean;
  style_rules: ContentStyleRules | null;
  created_at: string;
  updated_at: string | null;
};

export type StyleProfileDetail = StyleProfileSummary & {
  sample_text: string | null;
};

export type ListStyleProfilesResult = {
  profiles: StyleProfileSummary[];
  defaultProfileId: string | null;
};

// ---------------------------------------------------------------------------
// Validation helpers (Vietnamese messages, consistent with the web actions)
// ---------------------------------------------------------------------------
function assertUuid(value: string, label: string): void {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    throw validationError(`${label} không hợp lệ.`);
  }
}

function validateName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validationError("Tên văn phong không được để trống.");
  }
  const name = value.trim();
  if (name.length > MAX_NAME_LENGTH) {
    throw validationError(`Tên văn phong tối đa ${MAX_NAME_LENGTH} ký tự.`);
  }
  return name;
}

function normalisePlatform(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const platform = value.trim();
  return VALID_PLATFORMS.has(platform) ? platform : null;
}

function validateSampleText(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validationError("Vui lòng dán ít nhất một bài mẫu.");
  }
  const sample = value.trim();
  if (sample.length > MAX_SAMPLE_CHARS) {
    throw validationError(
      `Văn bản mẫu tối đa ${MAX_SAMPLE_CHARS.toLocaleString()} ký tự.`
    );
  }
  return sample;
}

function normaliseDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw validationError("Mô tả không hợp lệ.");
  }
  const description = value.trim();
  if (description.length === 0) return null;
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw validationError(`Mô tả tối đa ${MAX_DESCRIPTION_LENGTH} ký tự.`);
  }
  return description;
}

function toSummary(row: SummaryDbRow): StyleProfileSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    platform: row.platform,
    is_default: row.is_default,
    style_rules: row.style_rules,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toDetail(row: DetailDbRow): StyleProfileDetail {
  return { ...toSummary(row), sample_text: row.sample_text };
}

// ---------------------------------------------------------------------------
// Access guard — organization-scoped existence check
// ---------------------------------------------------------------------------
/**
 * Fetch a profile by id within the caller's organization, or throw. A guessed
 * cross-org id resolves to NOT_FOUND (never a leak). Throws VALIDATION_ERROR
 * for a malformed UUID.
 */
async function requireProfileInOrg(
  ctx: RequestContext,
  styleProfileId: string,
  columns: string = DETAIL_COLUMNS
): Promise<DetailDbRow> {
  assertUuid(styleProfileId, "Mã văn phong");

  const { data, error } = await ctx.supabase
    .from("content_style_profiles")
    .select(columns)
    .eq("id", styleProfileId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!data) throw notFound("Không tìm thấy văn phong.");
  return data as unknown as DetailDbRow;
}

/** Clear the current default across the organization (at most one per org). */
async function clearOrganizationDefault(ctx: RequestContext): Promise<void> {
  const { error } = await ctx.supabase
    .from("content_style_profiles")
    .update({ is_default: false })
    .eq("organization_id", ctx.organizationId)
    .eq("is_default", true);

  if (error) throw internalError(error.message);
}

// ---------------------------------------------------------------------------
// listStyleProfiles — org-scoped, default first then newest
// ---------------------------------------------------------------------------
export type ListStyleProfilesParams = {
  /** Optional platform filter; ignored if not a known platform. */
  platform?: string | null;
};

export async function listStyleProfiles(
  ctx: RequestContext,
  params: ListStyleProfilesParams = {}
): Promise<ListStyleProfilesResult> {
  let query = ctx.supabase
    .from("content_style_profiles")
    .select(SUMMARY_COLUMNS)
    .eq("organization_id", ctx.organizationId);

  const platform = normalisePlatform(params.platform);
  if (platform) query = query.eq("platform", platform);

  const { data, error } = await query
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw internalError(error.message);

  const rows = (data ?? []) as unknown as SummaryDbRow[];
  const profiles = rows.map(toSummary);
  const defaultProfileId = profiles.find((p) => p.is_default)?.id ?? null;
  return { profiles, defaultProfileId };
}

// ---------------------------------------------------------------------------
// getStyleProfile — single resource (org-scoped); NOT_FOUND across orgs
// ---------------------------------------------------------------------------
export async function getStyleProfile(
  ctx: RequestContext,
  styleProfileId: string
): Promise<StyleProfileDetail> {
  const row = await requireProfileInOrg(ctx, styleProfileId);
  return toDetail(row);
}

// ---------------------------------------------------------------------------
// getDefaultStyleProfile — the org's default profile, or null
// ---------------------------------------------------------------------------
export async function getDefaultStyleProfile(
  ctx: RequestContext
): Promise<StyleProfileDetail | null> {
  const { data, error } = await ctx.supabase
    .from("content_style_profiles")
    .select(DETAIL_COLUMNS)
    .eq("organization_id", ctx.organizationId)
    .eq("is_default", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw internalError(error.message);
  const rows = (data ?? []) as unknown as DetailDbRow[];
  return rows.length > 0 ? toDetail(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// createStyleProfile — validate → AI analyze sample → insert
//
// The ownership-confirmation checkbox is a web-form/legal gate enforced by the
// web action; the service only needs name + sample to analyze + persist.
// ---------------------------------------------------------------------------
export type CreateStyleProfileInput = {
  name: string;
  sample_text: string;
  platform?: string | null;
  description?: string | null;
};

export async function createStyleProfile(
  ctx: RequestContext,
  input: CreateStyleProfileInput
): Promise<StyleProfileDetail> {
  const name = validateName(input?.name);
  const sample = validateSampleText(input?.sample_text);
  const platform = normalisePlatform(input?.platform);
  const description = normaliseDescription(input?.description);

  const analysis = await analyzeContentStyle({
    sample_text: sample,
    platform,
  });
  if (!analysis.ok) {
    throw internalError(`Phân tích văn phong thất bại: ${analysis.error}`);
  }

  const { data, error } = await ctx.supabase
    .from("content_style_profiles")
    .insert({
      user_id: ctx.userId, // legacy ownership (kept for own-RLS + back-compat)
      organization_id: ctx.organizationId,
      created_by: ctx.userId,
      name,
      platform,
      description,
      sample_text: sample,
      style_rules: analysis.rules,
      is_default: false,
    })
    .select(DETAIL_COLUMNS)
    .single();

  if (error || !data) {
    throw internalError(error?.message ?? "Không thể lưu văn phong.");
  }

  const profile = toDetail(data as unknown as DetailDbRow);

  await trackEvent(ctx.supabase, ctx.userId, "style_profile_created", {
    profile_id: profile.id,
    platform: platform ?? "all",
  });

  return profile;
}

// ---------------------------------------------------------------------------
// updateStyleProfile — edit name / description / is_default
//
// Setting is_default clears the previous org default first so at most one
// default exists per organization.
// ---------------------------------------------------------------------------
export type UpdateStyleProfileInput = {
  name?: string;
  description?: string | null;
  is_default?: boolean;
};

export async function updateStyleProfile(
  ctx: RequestContext,
  styleProfileId: string,
  input: UpdateStyleProfileInput
): Promise<StyleProfileDetail> {
  await requireProfileInOrg(ctx, styleProfileId, "id");

  const patch: {
    name?: string;
    description?: string | null;
    is_default?: boolean;
  } = {};

  if (input && "name" in input) patch.name = validateName(input.name);
  if (input && "description" in input) {
    patch.description = normaliseDescription(input.description);
  }
  if (input && "is_default" in input) {
    patch.is_default = input.is_default === true;
  }

  if (Object.keys(patch).length === 0) {
    throw validationError("Không có thay đổi nào để lưu.");
  }

  if (patch.is_default === true) {
    await clearOrganizationDefault(ctx);
  }

  const { data, error } = await ctx.supabase
    .from("content_style_profiles")
    .update(patch)
    .eq("id", styleProfileId)
    .eq("organization_id", ctx.organizationId)
    .select(DETAIL_COLUMNS)
    .single();

  if (error || !data) {
    throw internalError(error?.message ?? "Không thể cập nhật văn phong.");
  }

  await trackEvent(ctx.supabase, ctx.userId, "style_profile_updated", {
    profile_id: styleProfileId,
  });

  return toDetail(data as unknown as DetailDbRow);
}

// ---------------------------------------------------------------------------
// setDefaultStyleProfile — clear org default then set this one
// ---------------------------------------------------------------------------
export async function setDefaultStyleProfile(
  ctx: RequestContext,
  styleProfileId: string
): Promise<StyleProfileDetail> {
  await requireProfileInOrg(ctx, styleProfileId, "id");

  await clearOrganizationDefault(ctx);

  const { data, error } = await ctx.supabase
    .from("content_style_profiles")
    .update({ is_default: true })
    .eq("id", styleProfileId)
    .eq("organization_id", ctx.organizationId)
    .select(DETAIL_COLUMNS)
    .single();

  if (error || !data) {
    throw internalError(error?.message ?? "Không thể đặt văn phong mặc định.");
  }

  await trackEvent(ctx.supabase, ctx.userId, "style_profile_updated", {
    profile_id: styleProfileId,
    action: "set_default",
  });

  return toDetail(data as unknown as DetailDbRow);
}

// ---------------------------------------------------------------------------
// deleteStyleProfile — org-scoped delete (NOT_FOUND if absent/cross-org)
// ---------------------------------------------------------------------------
export async function deleteStyleProfile(
  ctx: RequestContext,
  styleProfileId: string
): Promise<{ id: string }> {
  await requireProfileInOrg(ctx, styleProfileId, "id");

  const { error } = await ctx.supabase
    .from("content_style_profiles")
    .delete()
    .eq("id", styleProfileId)
    .eq("organization_id", ctx.organizationId);

  if (error) throw internalError(error.message);

  await trackEvent(ctx.supabase, ctx.userId, "style_profile_deleted", {
    profile_id: styleProfileId,
  });

  return { id: styleProfileId };
}
