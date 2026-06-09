"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { LegalStatus, PropertyType } from "@/types";

export type CreatePropertyState = {
  error: string | null;
};

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

export async function createProperty(
  _prevState: CreatePropertyState,
  formData: FormData
): Promise<CreatePropertyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route is protected by proxy.ts, but never assume.
  if (!user) return { error: "Bạn cần đăng nhập để tạo bất động sản." };

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

  const legalStatusRaw = getOptionalString(formData, "legal_status");
  const legal_status = legalStatusRaw
    ? LEGAL_STATUSES.includes(legalStatusRaw as LegalStatus)
      ? (legalStatusRaw as LegalStatus)
      : null
    : null;

  const bathrooms = getOptionalNumber(formData, "bathrooms");
  const frontage = getOptionalNumber(formData, "frontage");
  const alley_width = getOptionalNumber(formData, "alley_width");

  const insertRow = {
    // Always set server-side
    user_id: user.id,

    // Core
    title,
    property_type,
    status: "available" as const,

    // Location
    city: getOptionalString(formData, "city") ?? "Hà Nội",
    district,
    ward: getOptionalString(formData, "ward"),
    street: getOptionalString(formData, "street"),

    // Specs
    price,
    area,
    bedrooms,
    bathrooms,
    house_direction: getOptionalString(formData, "house_direction"),
    frontage,
    alley_width,

    // Notes
    legal_status,
    description: getOptionalString(formData, "description"),
    strengths: getOptionalString(formData, "strengths"),
    weaknesses: getOptionalString(formData, "weaknesses"),
    owner_note: getOptionalString(formData, "owner_note"),
    planning_note: getOptionalString(formData, "planning_note"),
  };

  const { data, error } = await supabase
    .from("properties")
    .insert(insertRow)
    .select("id")
    .single();

  if (error || !data?.id) {
    return { error: error?.message ?? "Không thể tạo bất động sản." };
  }

  redirect(`/dashboard/properties/${data.id}`);
}

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
  if (!Number.isFinite(num)) return null;

  // Keep integers tidy for bedrooms, but allow decimals for other future fields.
  return Number.isInteger(num) ? num : num;
}
