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

// --- User / Auth -----------------------------------------------------------

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
}

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
