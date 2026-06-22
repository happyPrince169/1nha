"use server";

import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/workspace/request-context";
import { toApiError } from "@/lib/api/errors";
import { generateContentForProperty } from "@/lib/services/generated-content";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type GenerateContentState = {
  error: string | null;
};

// ---------------------------------------------------------------------------
// generatePropertyContent
//
// Thin adapter over the shared generated-content service. Parses the form,
// delegates validation + AI generation + persistence to the service, and keeps
// the web-only redirect here. id is bound server-side (.bind(null, id)) — never
// read from the form body. The "Giọng văn" value ("tone:<id>" / "style:<id>")
// and prompt behaviour are unchanged; the service resolves them identically.
// ---------------------------------------------------------------------------
export async function generatePropertyContent(
  propertyId: string,
  _prevState: GenerateContentState,
  formData: FormData
): Promise<GenerateContentState> {
  const str = (key: string): string | null => {
    const v = formData.get(key);
    return typeof v === "string" ? v : null;
  };

  let newContentId: string;
  try {
    const ctx = await getRequestContext();
    const content = await generateContentForProperty(ctx, propertyId, {
      platform: str("platform"),
      voice: str("voice"),
      content_type: str("content_type"),
    });
    newContentId = content.id;
  } catch (err) {
    return { error: toApiError(err).message };
  }

  // redirect() throws internally so it must be outside try/catch.
  redirect(`/dashboard/properties/${propertyId}/content/${newContentId}`);
}
