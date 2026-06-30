// ---------------------------------------------------------------------------
// API response types — mirror the Next.js service-layer output shapes.
//
// Kept in sync with (web) src/lib/services/properties.ts + property-images.ts.
// Only the fields the mobile screens actually consume are typed; the API may
// return more. No internal-only columns are relied upon here.
// ---------------------------------------------------------------------------

// Standard envelope from src/lib/api/responses.ts.
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiErrorBody = {
  ok: false;
  error: { code: string; message: string };
};
export type ApiEnvelope<T> = ApiSuccess<T> | ApiErrorBody;

// GET /api/properties → PropertyListResult
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

// GET /api/properties/[id] → PropertyRecord (subset the detail screen renders)
export type PropertyRecord = {
  id: string;
  title: string;
  property_type: string | null;
  status: string | null;
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
  legal_status: string | null;
  description: string | null;
  strengths: string | null;
  weaknesses: string | null;
  owner_note: string | null;
  planning_note: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

// GET /api/properties/[id]/images → { images: PropertyImage[] }
export type PropertyImage = {
  id: string;
  property_id: string;
  caption: string | null;
  alt_text: string | null;
  is_cover: boolean;
  /** Signed thumbnail URL (short-lived); null if unresolved. */
  url: string | null;
};

export type PropertyImagesResult = { images: PropertyImage[] };
