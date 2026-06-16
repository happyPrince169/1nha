// ---------------------------------------------------------------------------
// Domain types for BrokerFlow AI / 1nha
// ---------------------------------------------------------------------------

export type PropertyType =
  | "apartment"
  | "house"
  | "land"
  | "shophouse"
  | "villa"
  | "office"
  | "other";

export type PropertyStatus = "available" | "rented" | "sold" | "pending" | "archived";

export type LegalStatus =
  | "red_book"
  | "pink_book"
  | "sale_contract"
  | "hand_written"
  | "other";
export type ContentPlatform = "facebook" | "zalo" | "tiktok";

export type ContentTone =
  | "professional"
  | "urgent"
  | "luxury"
  | "family"
  | "investor";

export type ContentType =
  | "sales_post"
  | "short_caption"
  | "video_script"
  | "follow_up_message";

export type ContentStatus = "draft" | "scheduled" | "posted" | "archived";

// --- User / Auth -----------------------------------------------------------

/** Legacy shape used internally for auth-user display. */
export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  quota_limit: number;       // monthly AI content quota
  quota_used: number;        // consumed this month
  created_at: string;
}

export type BrokerRole =
  | "independent_broker"
  | "team_lead"
  | "agency"
  | "other";

/** Row in public.user_profiles — broker display / contact info. */
export interface BrokerProfile {
  user_id: string;              // PK + FK → auth.users.id
  display_name: string | null;
  phone: string | null;
  company_name: string | null;
  role: BrokerRole | null;
  created_at: string;
  updated_at: string | null;
}

export type UpgradeInterestPlan = "pro_personal" | "team" | "unsure";
export type UpgradeInterestStatus = "pending" | "contacted" | "cancelled";

/** Row in public.upgrade_interest_requests. */
export interface UpgradeInterestRequest {
  id: string;
  user_id: string;              // FK → auth.users.id
  interested_plan: UpgradeInterestPlan;
  phone: string | null;
  note: string | null;
  status: UpgradeInterestStatus;
  created_at: string;
  updated_at: string | null;
}

// --- Property (Căn hộ / Bất động sản) -------------------------------------

export interface Property {
  id: string;
  user_id: string;            // FK → auth.users.id (set server-side only)

  // Core identity
  title: string;
  property_type: PropertyType;
  status: PropertyStatus;

  // Location
  city: string;               // default 'Hà Nội'
  district: string;
  ward?: string;
  street?: string;

  // Specs
  price: number;              // VND
  area: number;               // m²
  bedrooms?: number;
  bathrooms?: number;
  house_direction?: string;   // hướng nhà
  alley_width?: number;       // đường vào (m)
  frontage?: number;          // mặt tiền (m)

  // Legal & notes
  legal_status?: LegalStatus;
  description?: string;
  strengths?: string;         // Điểm mạnh
  weaknesses?: string;        // Điểm yếu
  owner_note?: string;        // Ghi chú chủ nhà
  planning_note?: string;     // Ghi chú quy hoạch

  created_at: string;
  updated_at: string;
}

// Omit server-managed fields when creating a new property
export type PropertyInsert = Omit<Property, "id" | "user_id" | "created_at" | "updated_at"> & {
  status?: PropertyStatus;
};

// --- Content (AI-generated posts) -----------------------------------------

export interface GeneratedContent {
  id: string;
  user_id: string;              // FK → auth.users.id (set server-side only)
  property_id: string;          // FK → properties.id
  platform: ContentPlatform;
  tone: ContentTone;            // default 'professional' in DB
  content_type: ContentType;
  prompt_used: string | null;   // nullable — populated for all new rows
  prompt_version: string | null; // DB default 'v1', reserved for future use
  content: string;              // renamed from output_text via migration
  created_at: string;

  // Content Workspace v1 fields
  title: string | null;
  status: ContentStatus;        // default 'draft'
  copied_at: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  post_url: string | null;
  channel_name: string | null;
  notes: string | null;
  parent_content_id: string | null;
  updated_at: string | null;
  edited_at: string | null;   // set only on broker manual edits, not AI generation
  style_profile_id: string | null; // FK → content_style_profiles.id, null = default 1nha voice
}

// --- Property Images ------------------------------------------------------

/** Where a property image's bytes live. New uploads use Cloudflare R2; legacy
 *  rows remain on Supabase Storage. See src/lib/storage/property-media.ts. */
export type StorageProvider = "supabase" | "cloudflare_r2";

export interface PropertyImage {
  id: string;
  user_id: string;          // FK → auth.users.id (set server-side only)
  property_id: string;      // FK → properties.id
  storage_path: string;     // legacy Supabase path / mirror of original_key for R2 rows
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  caption: string | null;
  sort_order: number;       // default 0
  is_cover: boolean;        // default false
  created_at: string;

  // --- Storage provider (added 20240108000001) ---------------------------
  storage_provider: StorageProvider;   // default 'supabase'
  original_key: string | null;         // R2 object key for the full-size image
  thumbnail_key: string | null;        // R2 object key for the thumbnail (future)
  preview_key: string | null;          // R2 object key for the preview (future)
  original_mime_type: string | null;
  original_size_bytes: number | null;
  thumbnail_size_bytes: number | null;
}

// --- Content Style Profiles (Văn phong riêng) ----------------------------

/**
 * Structured writing-style rules produced by the AI analyzer.
 * Stored as JSONB in content_style_profiles.style_rules.
 * All fields are narrative strings / string arrays — no enums —
 * because the values are LLM-generated descriptions.
 */
export interface ContentStyleRules {
  /** One-sentence summary of the overall writing style */
  summary: string;
  /** Tone description, e.g. "thân thiện, gần gũi, dùng ngôn ngữ đời thường" */
  tone: string;
  /** Typical post length, e.g. "150–200 từ" */
  length: string;
  /** How the content is structured, e.g. "mở đầu bằng câu hỏi, liệt kê gạch đầu dòng" */
  structure: string;
  /** Formatting conventions, e.g. "dùng emoji thay gạch đầu dòng, in hoa tiêu đề" */
  formatting: string;
  /** Emoji usage pattern, e.g. "dùng nhiều, 1–2 emoji mỗi đoạn" */
  emoji_usage: string;
  /** How posts typically open, e.g. "câu hỏi khơi gợi nhu cầu" */
  opening_style: string;
  /** Call-to-action style, e.g. "nhắn tin trực tiếp, có số điện thoại" */
  cta_style: string;
  /** Recurring phrases or vocabulary patterns */
  phrase_patterns: string[];
  /** Things to avoid in generated content */
  avoid: string[];
  /** Free-form instructions injected verbatim into the generation prompt */
  generation_instructions: string;
}

export interface ContentStyleProfile {
  id: string;
  user_id: string;                    // FK → auth.users.id (set server-side only)
  name: string;
  description: string | null;
  platform: string | null;            // e.g. "facebook", "zalo", "tiktok", null = all
  sample_text: string | null;         // raw text the broker provided for analysis
  style_rules: ContentStyleRules | null; // null until analysis completes
  is_default: boolean;
  created_at: string;
  updated_at: string | null;
}

// Omit server-managed fields when creating a new profile
export type ContentStyleProfileInsert = Omit<
  ContentStyleProfile,
  "id" | "user_id" | "created_at" | "updated_at"
>;

// --- Dashboard stats (computed client-side / via RPC) ---------------------

export interface DashboardStats {
  totalProperties: number;
  contentCreated: number;
  quotaUsed: number;
  quotaLimit: number;
}

// --- API helpers ----------------------------------------------------------

export interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
}
