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
