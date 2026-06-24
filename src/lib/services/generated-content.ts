// ---------------------------------------------------------------------------
// Generated Content service layer  (SERVER ONLY)
//
// Single source of generated-content + AI content-generation business logic,
// shared by:
//   • web Server Actions / Server Components
//   • /api/generated-contents + /api/properties/[id]/generated-contents routes
//     (future Expo mobile app)
//
// Organization-aware (Phase 2A/3A): reads/writes are scoped by the caller's
// current organization_id, with RLS (`generated_contents_member_all`) as the
// backstop. For a solo broker (one personal workspace) behaviour is identical
// to the previous user_id scoping. Inserts set user_id (legacy, kept for the
// existing own-RLS policies) + organization_id + created_by.
//
// Property access is verified through the Properties service (org-scoped), and
// a selected style profile is verified through the Style Profiles service —
// both return NOT_FOUND across orgs, so no cross-org property/content/profile
// can be reached. The AI prompt strategy (buildPropertyPrompt) is unchanged;
// `prompt_used` is stored but never returned to clients.
//
// Validation throws ApiError (VALIDATION_ERROR / NOT_FOUND / INTERNAL_ERROR)
// with the existing Vietnamese messages.
// ---------------------------------------------------------------------------
import "server-only";

import type { RequestContext } from "@/lib/workspace/request-context";
import {
  ApiError,
  validationError,
  notFound,
  internalError,
} from "@/lib/api/errors";
import { trackEvent } from "@/lib/usage";
import { generateContent } from "@/lib/ai";
import { buildPropertyPrompt } from "@/lib/prompts/content";
import { getPropertyById, getManageableProperty } from "@/lib/services/properties";
import { getStyleProfile } from "@/lib/services/style-profiles";
import type {
  ContentPlatform,
  ContentStyleRules,
  ContentTone,
  ContentType,
} from "@/types";

// ---------------------------------------------------------------------------
// Option whitelists (mirror the generate form + existing actions)
// ---------------------------------------------------------------------------
const PLATFORMS = new Set<string>(["facebook", "zalo", "tiktok"]);
const TONES = new Set<string>([
  "professional",
  "urgent",
  "luxury",
  "family",
  "investor",
]);
const CONTENT_TYPES = new Set<string>([
  "sales_post",
  "short_caption",
  "video_script",
  "follow_up_message",
]);
const STATUSES = new Set<string>(["draft", "scheduled", "posted", "archived"]);

/** Tone recorded when a saved style profile drives the voice (schema needs one). */
const STYLE_PROFILE_FALLBACK_TONE: ContentTone = "professional";

export const DEFAULT_LIST_LIMIT = 200;
export const MAX_LIST_LIMIT = 200;
export const DEFAULT_PROPERTY_LIST_LIMIT = 50;
export const MAX_CONTENT_LENGTH = 20_000;
export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTES_LENGTH = 5_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Detail columns — note prompt_used is deliberately NOT selected/exposed. */
const DETAIL_COLUMNS =
  "id, property_id, platform, tone, content_type, content, title, status, " +
  "style_profile_id, created_at, updated_at, edited_at, copied_at, " +
  "scheduled_at, posted_at, post_url, channel_name, notes";

/** List columns — lighter, joins the parent property title (as the web list does). */
const LIST_COLUMNS =
  "id, property_id, platform, content_type, content, status, created_at, " +
  "copied_at, properties(id, title)";

// ---------------------------------------------------------------------------
// Internal DB row shapes (Supabase type-gen predates these columns)
// ---------------------------------------------------------------------------
type DetailDbRow = {
  id: string;
  property_id: string;
  platform: string | null;
  tone: string | null;
  content_type: string | null;
  content: string;
  title: string | null;
  status: string | null;
  style_profile_id: string | null;
  created_at: string;
  updated_at: string | null;
  edited_at: string | null;
  copied_at: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  post_url: string | null;
  channel_name: string | null;
  notes: string | null;
};

type PropertyRelation = { id: string; title: string } | { id: string; title: string }[] | null;

type ListDbRow = {
  id: string;
  property_id: string;
  platform: string | null;
  content_type: string | null;
  content: string;
  status: string | null;
  created_at: string;
  copied_at: string | null;
  properties: PropertyRelation;
};

// ---------------------------------------------------------------------------
// Public output shapes
//
// Omits user_id / organization_id / created_by / prompt_used — clients never
// need internal ownership columns or the raw prompt.
// ---------------------------------------------------------------------------
export type GeneratedContentRecord = {
  id: string;
  property_id: string;
  platform: string | null;
  tone: string | null;
  content_type: string | null;
  content: string;
  title: string | null;
  status: string | null;
  style_profile_id: string | null;
  created_at: string;
  updated_at: string | null;
  edited_at: string | null;
  copied_at: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  post_url: string | null;
  channel_name: string | null;
  notes: string | null;
};

export type GeneratedContentListItem = {
  id: string;
  property_id: string;
  property_title: string | null;
  platform: string | null;
  content_type: string | null;
  content: string;
  status: string | null;
  created_at: string;
  copied_at: string | null;
};

export type ListGeneratedContentsResult = {
  contents: GeneratedContentListItem[];
  nextPage: number | null;
};

export type PropertyGeneratedContentsResult = {
  contents: GeneratedContentRecord[];
};

// ---------------------------------------------------------------------------
// Validation / normalisation helpers
// ---------------------------------------------------------------------------
function assertUuid(value: string, label: string): void {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    throw validationError(`${label} không hợp lệ.`);
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalisePlatform(value: unknown): string | null {
  const s = asString(value);
  return s && PLATFORMS.has(s) ? s : null;
}

function normaliseStatus(value: unknown): string | null {
  const s = asString(value);
  return s && STATUSES.has(s) ? s : null;
}

function clampLimit(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIST_LIMIT);
}

function normaliseOptionalText(
  value: unknown,
  maxLength: number,
  label: string
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw validationError(`${label} không hợp lệ.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    throw validationError(`${label} quá dài (tối đa ${maxLength} ký tự).`);
  }
  return trimmed;
}

function propertyTitleFrom(rel: PropertyRelation): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0]?.title ?? null;
  return rel.title ?? null;
}

function toRecord(row: DetailDbRow): GeneratedContentRecord {
  return {
    id: row.id,
    property_id: row.property_id,
    platform: row.platform,
    tone: row.tone,
    content_type: row.content_type,
    content: row.content,
    title: row.title,
    status: row.status,
    style_profile_id: row.style_profile_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    edited_at: row.edited_at,
    copied_at: row.copied_at,
    scheduled_at: row.scheduled_at,
    posted_at: row.posted_at,
    post_url: row.post_url,
    channel_name: row.channel_name,
    notes: row.notes,
  };
}

function toListItem(row: ListDbRow): GeneratedContentListItem {
  return {
    id: row.id,
    property_id: row.property_id,
    property_title: propertyTitleFrom(row.properties),
    platform: row.platform,
    content_type: row.content_type,
    content: row.content,
    status: row.status,
    created_at: row.created_at,
    copied_at: row.copied_at,
  };
}

// ---------------------------------------------------------------------------
// Access guard — organization-scoped content lookup
// ---------------------------------------------------------------------------
async function requireContentInOrg(
  ctx: RequestContext,
  contentId: string,
  columns: string = DETAIL_COLUMNS
): Promise<DetailDbRow> {
  assertUuid(contentId, "Mã content");

  const { data, error } = await ctx.supabase
    .from("generated_contents")
    .select(columns)
    .eq("id", contentId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!data) throw notFound("Không tìm thấy content.");
  return data as unknown as DetailDbRow;
}

// ---------------------------------------------------------------------------
// Generation option resolution + shared generation runner
// ---------------------------------------------------------------------------
export type GenerateContentInput = {
  platform?: string | null;
  content_type?: string | null;
  /** Combined "Giọng văn" field from the web form: "tone:<id>" | "style:<id>". */
  voice?: string | null;
  /** Explicit alternatives (used by API clients / regenerate). */
  tone?: string | null;
  styleProfileId?: string | null;
};

type ResolvedVoice = {
  tone: ContentTone;
  styleProfileId: string | null;
  styleRules: ContentStyleRules | null;
};

function resolvePlatform(value: unknown): ContentPlatform {
  const platform = normalisePlatform(value);
  if (!platform) throw validationError("Vui lòng chọn nền tảng.");
  return platform as ContentPlatform;
}

function resolveContentType(value: unknown): ContentType {
  const s = asString(value);
  if (!s || !CONTENT_TYPES.has(s)) {
    throw validationError("Vui lòng chọn loại content.");
  }
  return s as ContentType;
}

/**
 * Resolve the "Giọng văn" selection into a tone + optional style profile.
 * Accepts either the combined `voice` field ("tone:x" / "style:id") or the
 * explicit `tone` / `styleProfileId` fields. A selected profile is verified to
 * belong to the caller's organization (NOT_FOUND otherwise) and its style_rules
 * are loaded for the prompt.
 */
async function resolveVoice(
  ctx: RequestContext,
  input: GenerateContentInput
): Promise<ResolvedVoice> {
  const voice = asString(input.voice);
  let toneCandidate = asString(input.tone);
  let styleProfileId = asString(input.styleProfileId);

  if (voice) {
    if (voice.startsWith("tone:")) {
      toneCandidate = voice.slice("tone:".length);
    } else if (voice.startsWith("style:")) {
      styleProfileId = voice.slice("style:".length) || null;
    }
  }

  if (styleProfileId) {
    assertUuid(styleProfileId, "Mã văn phong");
    let profile;
    try {
      profile = await getStyleProfile(ctx, styleProfileId);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_FOUND") {
        throw notFound("Không tìm thấy giọng văn đã chọn.");
      }
      throw err;
    }
    return {
      tone: STYLE_PROFILE_FALLBACK_TONE,
      styleProfileId,
      styleRules: profile.style_rules ?? null,
    };
  }

  if (!toneCandidate || !TONES.has(toneCandidate)) {
    throw validationError("Vui lòng chọn giọng văn.");
  }
  return {
    tone: toneCandidate as ContentTone,
    styleProfileId: null,
    styleRules: null,
  };
}

type GenerationOptions = {
  platform: ContentPlatform;
  contentType: ContentType;
  voice: ResolvedVoice;
};

/**
 * Build the prompt, call the AI, and persist a generated_contents row.
 * Shared by generate + regenerate. Property access is org-verified via the
 * Properties service. AI prompt strategy is unchanged.
 */
async function runGeneration(
  ctx: RequestContext,
  propertyId: string,
  options: GenerationOptions,
  parentContentId: string | null
): Promise<GeneratedContentRecord> {
  // Org-scoped property fetch + manage gate (Phase 4C): generating content is a
  // management action, so a Member must own/be assigned the parent property.
  // NOT_FOUND across orgs / missing; FORBIDDEN when unmanaged.
  const property = await getManageableProperty(ctx, propertyId);

  // PropertyRecord allows nulls on some fields; buildPropertyPrompt handles
  // missing values defensively (it omits absent facts), so the cast is safe and
  // the prompt behaviour is unchanged from the previous Server Action.
  const prompt = buildPropertyPrompt(
    property as Parameters<typeof buildPropertyPrompt>[0],
    {
      platform: options.platform,
      tone: options.voice.tone,
      contentType: options.contentType,
      styleRules: options.voice.styleRules, // null = default 1nha voice
    }
  );

  let generatedText: string;
  try {
    const result = await generateContent({ prompt });
    generatedText = result.text;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định.";
    throw internalError(`Không thể tạo content: ${message}`);
  }

  if (!generatedText.trim()) {
    throw internalError("AI không trả về nội dung. Vui lòng thử lại.");
  }

  const insertRow: Record<string, unknown> = {
    user_id: ctx.userId, // legacy ownership (kept for own-RLS + back-compat)
    property_id: propertyId,
    organization_id: ctx.organizationId,
    created_by: ctx.userId,
    platform: options.platform,
    tone: options.voice.tone,
    content_type: options.contentType,
    prompt_used: prompt,
    content: generatedText,
    style_profile_id: options.voice.styleProfileId,
  };
  if (parentContentId) insertRow.parent_content_id = parentContentId;

  const { data, error } = await ctx.supabase
    .from("generated_contents")
    .insert(insertRow)
    .select(DETAIL_COLUMNS)
    .single();

  if (error || !data) {
    throw internalError(error?.message ?? "Không thể lưu content.");
  }

  const record = toRecord(data as unknown as DetailDbRow);

  await trackEvent(ctx.supabase, ctx.userId, "content_generated", {
    property_id: propertyId,
    content_id: record.id,
    platform: options.platform,
    content_type: options.contentType,
  });
  if (options.voice.styleProfileId) {
    await trackEvent(ctx.supabase, ctx.userId, "style_profile_used", {
      property_id: propertyId,
      style_profile_id: options.voice.styleProfileId,
      platform: options.platform,
      content_type: options.contentType,
    });
  }

  return record;
}

// ---------------------------------------------------------------------------
// generateContentForProperty — generate + persist for a property
// ---------------------------------------------------------------------------
export async function generateContentForProperty(
  ctx: RequestContext,
  propertyId: string,
  input: GenerateContentInput
): Promise<GeneratedContentRecord> {
  assertUuid(propertyId, "Mã bất động sản");
  const platform = resolvePlatform(input?.platform);
  const contentType = resolveContentType(input?.content_type);
  const voice = await resolveVoice(ctx, input ?? {});

  return runGeneration(ctx, propertyId, { platform, contentType, voice }, null);
}

// ---------------------------------------------------------------------------
// regenerateGeneratedContent — produce a new variation of an existing content
//
// Reuses the source content's platform / content type / voice unless the caller
// overrides them. The new row links back via parent_content_id. (API-only —
// the web has no regenerate UI yet.)
// ---------------------------------------------------------------------------
export async function regenerateGeneratedContent(
  ctx: RequestContext,
  contentId: string,
  input: GenerateContentInput = {}
): Promise<GeneratedContentRecord> {
  const existing = await requireContentInOrg(
    ctx,
    contentId,
    "id, property_id, platform, tone, content_type, style_profile_id"
  );

  const platform = resolvePlatform(input?.platform ?? existing.platform);
  const contentType = resolveContentType(
    input?.content_type ?? existing.content_type
  );

  // Voice: prefer explicit override, else reuse the source content's voice.
  const hasVoiceOverride =
    asString(input?.voice) ||
    asString(input?.tone) ||
    asString(input?.styleProfileId);
  const voiceInput: GenerateContentInput = hasVoiceOverride
    ? input
    : existing.style_profile_id
      ? { styleProfileId: existing.style_profile_id }
      : { tone: existing.tone };
  const voice = await resolveVoice(ctx, voiceInput);

  return runGeneration(
    ctx,
    existing.property_id,
    { platform, contentType, voice },
    contentId
  );
}

// ---------------------------------------------------------------------------
// listGeneratedContents — org-scoped list (mirrors /dashboard/content)
//
// Server-side platform/status filters; q is matched in-memory against the
// property title + content body, exactly like the existing web page. No real
// pagination today (limit only), so nextPage is always null.
// ---------------------------------------------------------------------------
export type ListGeneratedContentsParams = {
  platform?: string | null;
  status?: string | null;
  q?: string | null;
  limit?: number;
};

export async function listGeneratedContents(
  ctx: RequestContext,
  params: ListGeneratedContentsParams = {}
): Promise<ListGeneratedContentsResult> {
  let query = ctx.supabase
    .from("generated_contents")
    .select(LIST_COLUMNS)
    .eq("organization_id", ctx.organizationId);

  const platform = normalisePlatform(params.platform);
  if (platform) query = query.eq("platform", platform);

  const status = normaliseStatus(params.status);
  if (status) query = query.eq("status", status);

  const limit = clampLimit(params.limit, DEFAULT_LIST_LIMIT);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw internalError(error.message);

  let contents = ((data ?? []) as unknown as ListDbRow[]).map(toListItem);

  const q = asString(params.q)?.toLowerCase();
  if (q) {
    contents = contents.filter(
      (c) =>
        (c.property_title?.toLowerCase().includes(q) ?? false) ||
        c.content.toLowerCase().includes(q)
    );
  }

  return { contents, nextPage: null };
}

// ---------------------------------------------------------------------------
// listPropertyGeneratedContents — content for one property (org-verified)
// ---------------------------------------------------------------------------
export type ListPropertyContentsParams = {
  status?: string | null;
  limit?: number;
};

export async function listPropertyGeneratedContents(
  ctx: RequestContext,
  propertyId: string,
  params: ListPropertyContentsParams = {}
): Promise<PropertyGeneratedContentsResult> {
  // Org-scoped property check (throws NOT_FOUND across orgs / missing).
  await getPropertyById(ctx, propertyId);

  let query = ctx.supabase
    .from("generated_contents")
    .select(DETAIL_COLUMNS)
    .eq("property_id", propertyId)
    .eq("organization_id", ctx.organizationId);

  const status = normaliseStatus(params.status);
  if (status) query = query.eq("status", status);

  const limit = clampLimit(params.limit, DEFAULT_PROPERTY_LIST_LIMIT);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw internalError(error.message);

  const contents = ((data ?? []) as unknown as DetailDbRow[]).map(toRecord);
  return { contents };
}

// ---------------------------------------------------------------------------
// getGeneratedContent — single resource (org-scoped)
// ---------------------------------------------------------------------------
export async function getGeneratedContent(
  ctx: RequestContext,
  contentId: string
): Promise<GeneratedContentRecord> {
  const row = await requireContentInOrg(ctx, contentId);
  return toRecord(row);
}

// ---------------------------------------------------------------------------
// getGeneratedContentForProperty — single resource scoped to a property
// ---------------------------------------------------------------------------
export async function getGeneratedContentForProperty(
  ctx: RequestContext,
  propertyId: string,
  contentId: string
): Promise<GeneratedContentRecord> {
  assertUuid(propertyId, "Mã bất động sản");
  assertUuid(contentId, "Mã content");

  await getPropertyById(ctx, propertyId);

  const { data, error } = await ctx.supabase
    .from("generated_contents")
    .select(DETAIL_COLUMNS)
    .eq("id", contentId)
    .eq("property_id", propertyId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (error) throw internalError(error.message);
  if (!data) throw notFound("Không tìm thấy content.");
  return toRecord(data as unknown as DetailDbRow);
}

// ---------------------------------------------------------------------------
// updateGeneratedContent — edit body / title / notes
//
// Editing the body sets edited_at + updated_at and tracks content_edited
// (mirrors the previous updateContentText). Notes-only edits touch nothing else
// (mirrors updateContentNotes). At least one editable field is required.
// ---------------------------------------------------------------------------
export type UpdateGeneratedContentInput = {
  content?: string;
  title?: string | null;
  notes?: string | null;
};

export async function updateGeneratedContent(
  ctx: RequestContext,
  contentId: string,
  input: UpdateGeneratedContentInput
): Promise<GeneratedContentRecord> {
  const existing = await requireContentInOrg(ctx, contentId, "id, property_id");
  // Editing content is a management action on the parent property (Phase 4C).
  await getManageableProperty(ctx, existing.property_id);

  const patch: Record<string, unknown> = {};
  let contentChanged = false;

  if (input && "content" in input) {
    if (typeof input.content !== "string" || !input.content.trim()) {
      throw validationError("Nội dung không được để trống.");
    }
    const body = input.content.trim();
    if (body.length > MAX_CONTENT_LENGTH) {
      throw validationError(
        `Nội dung quá dài (tối đa ${MAX_CONTENT_LENGTH.toLocaleString()} ký tự).`
      );
    }
    patch.content = body;
    contentChanged = true;
  }

  if (input && "title" in input) {
    patch.title = normaliseOptionalText(input.title, MAX_TITLE_LENGTH, "Tiêu đề");
  }

  if (input && "notes" in input) {
    patch.notes = normaliseOptionalText(input.notes, MAX_NOTES_LENGTH, "Ghi chú");
  }

  if (Object.keys(patch).length === 0) {
    throw validationError("Không có thay đổi nào để lưu.");
  }

  if (contentChanged) {
    const now = new Date().toISOString();
    patch.updated_at = now;
    patch.edited_at = now;
  }

  const { data, error } = await ctx.supabase
    .from("generated_contents")
    .update(patch)
    .eq("id", contentId)
    .eq("organization_id", ctx.organizationId)
    .select(DETAIL_COLUMNS)
    .single();

  if (error || !data) {
    throw internalError(error?.message ?? "Không thể cập nhật content.");
  }

  if (contentChanged) {
    await trackEvent(ctx.supabase, ctx.userId, "content_edited", {
      content_id: contentId,
      property_id: existing.property_id,
    });
  }

  return toRecord(data as unknown as DetailDbRow);
}

// ---------------------------------------------------------------------------
// archiveGeneratedContent — set status = 'archived' (never deletes the row)
// ---------------------------------------------------------------------------
export async function archiveGeneratedContent(
  ctx: RequestContext,
  contentId: string
): Promise<GeneratedContentRecord> {
  const existing = await requireContentInOrg(ctx, contentId, "id, property_id");
  // Archiving content is a management action on the parent property (Phase 4C).
  await getManageableProperty(ctx, existing.property_id);

  const { data, error } = await ctx.supabase
    .from("generated_contents")
    .update({ status: "archived" })
    .eq("id", contentId)
    .eq("organization_id", ctx.organizationId)
    .select(DETAIL_COLUMNS)
    .single();

  if (error || !data) {
    throw internalError(error?.message ?? "Không thể lưu trữ content.");
  }

  await trackEvent(ctx.supabase, ctx.userId, "content_archived", {
    content_id: contentId,
    property_id: existing.property_id,
  });

  return toRecord(data as unknown as DetailDbRow);
}
