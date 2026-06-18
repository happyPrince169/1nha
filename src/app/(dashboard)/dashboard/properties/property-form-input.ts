// Plain (non-"use server") helper shared by the create + edit property actions.
// Maps the property form's FormData into the service write input (raw strings;
// the properties service validates + normalises). Kept out of the action files
// because a "use server" module may only export async functions.
import type { PropertyWriteInput } from "@/lib/services/properties";

export function propertyFormToInput(formData: FormData): PropertyWriteInput {
  const s = (key: string): string | null => {
    const v = formData.get(key);
    return typeof v === "string" ? v : null;
  };
  return {
    title: s("title"),
    property_type: s("property_type"),
    city: s("city"),
    district: s("district"),
    ward: s("ward"),
    street: s("street"),
    price: s("price"),
    area: s("area"),
    bedrooms: s("bedrooms"),
    bathrooms: s("bathrooms"),
    house_direction: s("house_direction"),
    frontage: s("frontage"),
    alley_width: s("alley_width"),
    legal_status: s("legal_status"),
    description: s("description"),
    strengths: s("strengths"),
    weaknesses: s("weaknesses"),
    owner_note: s("owner_note"),
    planning_note: s("planning_note"),
  };
}
