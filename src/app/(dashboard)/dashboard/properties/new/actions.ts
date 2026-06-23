"use server";

import { redirect } from "next/navigation";

import { trackEvent } from "@/lib/usage";
import { getRequestContext } from "@/lib/workspace/request-context";
import { createProperty as createPropertyService } from "@/lib/services/properties";
import { toApiError } from "@/lib/api/errors";
import { propertyFormToInput } from "../property-form-input";

export type CreatePropertyState = {
  error: string | null;
};

export async function createProperty(
  _prevState: CreatePropertyState,
  formData: FormData
): Promise<CreatePropertyState> {
  let newId: string;
  try {
    const ctx = await getRequestContext();
    const { id } = await createPropertyService(ctx, propertyFormToInput(formData));
    await trackEvent(ctx.supabase, ctx.userId, "property_created", {
      property_id: id,
    });
    newId = id;
  } catch (err) {
    // ApiError carries a Vietnamese message; anything else maps to a generic one.
    return { error: toApiError(err).message };
  }

  // redirect() throws NEXT_REDIRECT internally, so it must run outside try/catch.
  redirect(`/dashboard/properties/${newId}`);
}

// ---------------------------------------------------------------------------
// createPropertyWithImages
//
// Same property creation as createProperty, but returns the new id INSTEAD of
// redirecting, so the enhanced create-with-images client flow can then upload
// the selected images directly to R2 and redirect itself. Image bytes never
// pass through this Server Action — only the property fields do.
// ---------------------------------------------------------------------------
export type CreateWithImagesResult =
  | { ok: true; propertyId: string }
  | { ok: false; error: string };

export async function createPropertyWithImages(
  formData: FormData
): Promise<CreateWithImagesResult> {
  try {
    const ctx = await getRequestContext();
    const { id } = await createPropertyService(ctx, propertyFormToInput(formData));
    await trackEvent(ctx.supabase, ctx.userId, "property_created", {
      property_id: id,
    });
    return { ok: true, propertyId: id };
  } catch (err) {
    // ApiError carries a Vietnamese message; anything else maps to a generic one.
    return { ok: false, error: toApiError(err).message };
  }
}
