"use server";

import { redirect } from "next/navigation";

import { trackEvent } from "@/lib/usage";
import { getRequestContext } from "@/lib/workspace/request-context";
import {
  updateProperty as updatePropertyService,
  archiveProperty as archivePropertyService,
} from "@/lib/services/properties";
import { toApiError } from "@/lib/api/errors";
import { propertyFormToInput } from "../../property-form-input";
import type { CreatePropertyState } from "../../new/actions";

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
  try {
    const ctx = await getRequestContext();
    await updatePropertyService(ctx, id, propertyFormToInput(formData));
    await trackEvent(ctx.supabase, ctx.userId, "property_updated", {
      property_id: id,
    });
  } catch (err) {
    return { error: toApiError(err).message };
  }

  // redirect() throws NEXT_REDIRECT internally — keep it outside try/catch.
  redirect(`/dashboard/properties/${id}`);
}

// ---------------------------------------------------------------------------
// archiveProperty
// Sets status = 'archived'. Never deletes the row. Org-scoped via the service.
// ---------------------------------------------------------------------------
export async function archiveProperty(id: string): Promise<void> {
  try {
    const ctx = await getRequestContext();
    await archivePropertyService(ctx, id);
  } catch {
    // Preserve the prior silent behavior (the button has no error surface).
    return;
  }

  redirect("/dashboard/properties");
}
