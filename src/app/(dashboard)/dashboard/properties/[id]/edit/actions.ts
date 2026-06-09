"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { LegalStatus, PropertyType } from "@/types";
import type { CreatePropertyState } from "../../new/actions";

// ---------------------------------------------------------------------------
// Shared look-up lists (same as create — kept co-located so they stay in sync)
// ---------------------------------------------------------------------------
const PROPERTY_TYPES: PropertyType[] = [
  "apartment",
  "house",
  "land",
  "shophouse",
  "villa",
  "office",
  "other",
];

const LEGAL_STATUSES: LegalStatus[] = [
  "red_book",
  "pink_book",
  "sale_contract",
  "hand_written",
  "other",
];

// ---------------------------------------------------------------------------
// updateProperty
// Called from PropertyForm on /dashboard/properties/[id]/edit.
// The id is bound into the action via .bind() inside the edit page so it is
// never read from the form body — the client cannot supply a different id.
// ---------------------------------------------------------------------------
export async function updateProperty(
  id: string,
  _prevState: CreatePropertyState,
  formData: FormData
): Promise<CreatePropertyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bạn cần đăng nhập để cập nhật bất động sản." };

  // --- validation -----------------------------------------------------------
  const title = getRequiredString(formData, "title");
  const district = getRequiredString(formData, "district");

  const propertyTypeRaw = getRequiredString(formData, "property_type");
  const property_type = PROPERTY_TYPES.includes(propertyTypeRaw as PropertyType)
    ? (propertyTypeRaw as PropertyType)
    : null;

  const price = getRequiredNumber(formData, "price");
  const area = getRequiredNumber(formData, "area");

  if (!title) return { error: "Vui lòng nhập tiêu đề." };
  if (!property_type) return { error: "Vui lòng chọn loại bất động sản." };
  if (!district) return { error: "Vui lòng nhập quận/huyện." };
  if (price === null || price <= 0)
    return { error: "Vui lòng nhập giá (VND) hợp lệ." };
  if (area === null || area <= 0)
    return { error: "Vui lòng nhập diện tích (m²) hợp lệ." };

  const bedrooms = getOptionalNumber(formData, "bedrooms");
  const bathrooms = getOptionalNumber(formData, "bathrooms");
  const frontage = getOptionalNumber(formData, "frontage");
  const alley_width = getOptionalNumber(formData, "alley_width");

  const legalStatusRaw = getOptionalString(formData, "legal_status");
  const legal_status = legalStatusRaw
    ? LEGAL_STATUSES.includes(legalStatusRaw as LegalStatus)
      ? (legalStatusRaw as LegalStatus)
      : null
    : null;

  // --- update (scoped to authenticated user) --------------------------------
  const { error } = await supabase
    .from("properties")
    .update({
      title,
      property_type,
      city: getOptionalString(formData, "city") ?? "Hà Nội",
      district,
      ward: getOptionalString(formData, "ward"),
      street: getOptionalString(formData, "street"),
      price,
      area,
      bedrooms,
      bathrooms,
      house_direction: getOptionalString(formData, "house_direction"),
      frontage,
      alley_width,
      legal_status,
      description: getOptionalString(formData, "description"),
      strengths: getOptionalString(formData, "strengths"),
      weaknesses: getOptionalString(formData, "weaknesses"),
      owner_note: getOptionalString(formData, "owner_note"),
      planning_note: getOptionalString(formData, "planning_note"),
    })
    // Double-scoped: both id AND user_id must match — prevents IDOR.
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  redirect(`/dashboard/properties/${id}`);
}

// ---------------------------------------------------------------------------
// archiveProperty
// Sets status = 'archived'. Never deletes the row.
// ---------------------------------------------------------------------------
export async function archiveProperty(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("properties")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("user_id", user.id);

  redirect("/dashboard/properties");
}

// ---------------------------------------------------------------------------
// Helpers (duplicated from create/actions.ts to keep each module self-contained
// and avoid creating a shared util that couples the two action files)
// ---------------------------------------------------------------------------
function getRequiredString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function getRequiredNumber(formData: FormData, key: string): number | null {
  const raw = getRequiredString(formData, key);
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function getOptionalNumber(formData: FormData, key: string): number | null {
  const raw = getRequiredString(formData, key);
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}
